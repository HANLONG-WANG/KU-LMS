import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
const read = path => fs.readFileSync(path, 'utf8');
const source = read('src/shared/todo-deadline.js');
const now = Date.parse('2026-10-27T00:00:00Z'), hour = 3600000;
let clock = now;
class Clock extends Date { static now() { return clock; } }
const rules = vm.createContext({ Date: Clock }); vm.runInContext(source, rules);
const deadline = rules.KuTodoDeadline;
const todo = (id, hours, extra = {}) => ({ id, courseKey: 'course', text: id, createdAt: '2026-10-01T00:00:00Z', dueAt: hours === null ? null : new Date(now + hours * hour).toISOString(), ...extra });
for (const [hours, state] of [[null, 'none'], [-1, 'overdue'], [0, 'overdue'], [24, 'soon'], [25, 'near'], [72, 'near'], [73, 'normal']]) assert.equal(deadline.urgency(todo('a', hours), now), state);
assert.equal(deadline.urgency(todo('a', -1, { completedAt: 'done' }), now), 'none');
assert.equal(deadline.urgency(todo('a', -1, { deletedAt: 'deleted' }), now), 'none');
assert.equal(deadline.remaining(todo('a', -1), now), '期限切れ');
assert.equal(deadline.remaining(todo('a', 0.5), now), 'あと 30分');
assert.equal(deadline.remaining(todo('a', 1.5), now), 'あと 2時間');
assert.equal(deadline.remaining(todo('a', 25), now), 'あと 2日');
const sorted = [todo('undated', null), todo('late', 50), todo('old', 2), todo('new', 2, { createdAt: '2026-10-02T00:00:00Z' }), todo('overdue', -2)].sort(deadline.compare);
assert.deepEqual(sorted.map(t => t.id), ['overdue', 'new', 'old', 'late', 'undated']);
const workspace = { id: 'local', name: 'Local', courseScope: { keys: ['course'] }, courses: [{ key: 'course', title: '课程' }], todos: [todo('30min', .5), todo('stale', -25), todo('outside', 1, { courseKey: 'other' }), todo('done', -1, { completedAt: 'done' })] };
assert.equal(deadline.reminders(workspace, now).length, 2);
assert.equal(deadline.reminders({ ...workspace, courseScope: { keys: [] } }, now).length, 0);
assert.equal(deadline.reminders({ ...workspace, courseScope: undefined }, now).length, 3);

// Real home/card and course badge rendering, with an accelerated minute clock.
const { document } = parseHTML('<html><body><main><section data-todo-summary><h2 class="ku-card-title">TODO</h2><div data-todo-summary-body></div></section><span class="ku-chip blue" data-course-todo-count></span></main></body></html>');
const homeW = { ...workspace, todos: [...Array.from({ length: 6 }, (_, i) => todo('undated' + i, null)), todo('<img src=x> urgent', -1), todo('soon', .5), todo('near', 48), todo('outside', -3, { courseKey: 'other' })] };
const db = { activeId: 'local', workspaces: [homeW] }, timers = new Map(); let timerId = 0;
const context = vm.createContext({ document, Date: Clock, window: { confirm: () => true },
  escapeAttr: String, shortenCourseTitle: String,
  setInterval(fn, ms) { assert.equal(ms, 60000); timers.set(++timerId, fn); return timerId; }, clearInterval(id) { timers.delete(id); },
  KuTodoClient: { courseKey: href => href, subscribe: () => () => {}, request: async () => db, uuid: () => 'op' } });
vm.runInContext(source + '\n' + read('src/content/services/todo.js') + '\n' + read('src/content/services/course-todo.js'), context);
const root = document.querySelector('main'), view = { schedule: { entries: [{ href: 'course', title: '课程' }] }, otherCourses: [], filters: { label: 'term' } };
context.kuTodoHome.db = db;
root.insertAdjacentHTML('beforeend', context.kuRenderTodoChip(view.schedule.entries[0]));
const chip = root.querySelector('.ku-todo-chip'), initialTitle = chip.title;
context.kuBindTodos(root, { name: 'home' }, view);
await new Promise(resolve => setImmediate(resolve));
assert.equal(timers.size, 1);
assert.equal(root.querySelectorAll('.ku-todo-home-row').length, 5);
assert.equal(root.querySelector('.ku-todo-home-item span').textContent, '<img src=x> urgent');
assert.equal(root.querySelector('img'), null);
assert.match(root.querySelector('.ku-todo-home-item time').textContent, /期限切れ/);
assert.match(root.querySelectorAll('.ku-todo-home-item time')[1].textContent, /あと 30分/);
assert.match(root.querySelector('h2').textContent, /期限切れ 1.*24時間以内 1/);
assert.equal(chip.title, initialTitle); assert.ok(chip.classList.contains('red'));
assert.match(chip.title, /TODO · 9 件未完了 · 最近截止 \d{2}\/\d{2} \d{2}:\d{2}/);
context.kuCourseTodoPanel.root = root; context.kuCourseTodoPanel.db = db; context.kuCourseTodoPanel.course = { key: 'course' };
context.kuPaintCourseTodoCount(); assert.ok(root.querySelector('[data-course-todo-count]').classList.contains('red'));
homeW.todos.find(t => t.id.includes('urgent')).completedAt = 'done';
context.kuPaintHomeTodos(); context.kuPaintCourseTodoCount();
assert.ok(chip.classList.contains('orange')); assert.ok(!chip.classList.contains('red'));
assert.ok(root.querySelector('[data-course-todo-count]').classList.contains('orange'));
clock += hour;
for (const fn of timers.values()) fn();
assert.match(root.querySelector('.ku-todo-home-item time').textContent, /期限切れ/);
context.kuCleanupTodos(); assert.equal(timers.size, 0); clock = now;

// Worker APIs and persistent metadata, without touching a browser or network.
const event = () => ({ listeners: [], addListener(fn) { this.listeners.push(fn); }, async fire(...args) { for (const fn of this.listeners) await fn(...args); } });
const saved = { kuLmsTodosV1: { activeId: 'local', workspaces: [structuredClone(workspace)] } };
const notifications = [], badge = {}, alarms = new Map(), tabs = [], operations = [];
const chrome = {
  storage: { local: { async get(keys) { return structuredClone(Object.fromEntries(keys.filter(k => k in saved).map(k => [k, saved[k]]))); }, async set(values) { assert.deepEqual(Object.keys(values), ['kuLmsTodoRemindersV1']); Object.assign(saved, structuredClone(values)); } }, onChanged: event() },
  action: { async setBadgeText(v) { badge.text = v.text; operations.push('badge'); }, async setBadgeBackgroundColor(v) { badge.color = v.color; } },
  alarms: { create(name, config) { alarms.set(name, config); }, get(name, cb) { cb(alarms.get(name)); }, onAlarm: event() },
  runtime: { getURL: path => 'extension://' + path, onStartup: event(), onInstalled: event() },
  notifications: { async create(id, options) { notifications.push({ id, ...options }); }, async clear(id) { operations.push(['clear', id]); }, onClicked: event() },
  tabs: { async query(query) { assert.equal(query.url, 'https://kulms.tl.kansai-u.ac.jp/webclass/*'); return tabs; }, async update(id, options) { operations.push(['tab', id, options]); }, async create(options) { operations.push(['create', options.url]); } },
  windows: { async update(id, options) { operations.push(['window', id, options]); } }
};
const worker = vm.createContext({ chrome, Date: Clock, console });
vm.runInContext(source + '\n' + read('src/background/todo-reminders.js'), worker);
const run = notify => worker.KuTodoReminders.run(notify, now);
await run(false);
assert.equal(alarms.get('ku-todo-reminders').periodInMinutes, 1);
assert.equal(badge.text, '2'); assert.equal(badge.color, '#a6243b');
await run(true); assert.equal(notifications.length, 1, '30 minute creation emits only the tightest reminder; stale/out-of-scope/done are excluded');
assert.match(notifications[0].title, /1 小时/); assert.match(notifications[0].message, /30min\n课程 · 截止/);
assert.equal(notifications[0].iconUrl, 'extension://assets/icons/icon128.png');
await Promise.all([run(true), run(true)]); assert.equal(notifications.length, 1, 'concurrent ticks serialize deduplication');
const w = saved.kuLmsTodosV1.workspaces[0], task = w.todos[0];
task.dueAt = new Date(now + .25 * hour).toISOString();
await run(true); assert.equal(notifications.length, 2, 'deadline edit starts new reminders');
assert.equal(Object.keys(saved.kuLmsTodoRemindersV1).length, 2, 'old dueAt marks are removed');
await worker.KuTodoReminders.run(true, now + .25 * hour); assert.equal(notifications.length, 3); assert.match(notifications[2].title, /已到截止时间/);
await run(true); assert.equal(notifications.length, 3, 'a tighter notified threshold suppresses looser ones');
task.completedAt = 'done'; await run(true); assert.equal(Object.keys(saved.kuLmsTodoRemindersV1).length, 0);
w.todos = [todo('orange', 2)]; await run(false); assert.equal(badge.text, '1'); assert.equal(badge.color, '#c2410c');
w.todos = Array.from({ length: 101 }, (_, i) => todo(String(i), 2)); await run(false); assert.equal(badge.text, '99+');
w.courseScope.keys = []; await run(true); assert.equal(badge.text, '');
w.todos = [todo('24hour', 12)]; w.courseScope.keys = ['course'];
await chrome.alarms.onAlarm.fire({ name: 'ku-todo-reminders' }); await run(false);
assert.match(notifications.at(-1).title, /24 小时/);
clock = now + 11 * hour;
await chrome.alarms.onAlarm.fire({ name: 'ku-todo-reminders' }); await run(false);
assert.match(notifications.at(-1).title, /1 小时/);
clock = now + 12 * hour;
await chrome.alarms.onAlarm.fire({ name: 'ku-todo-reminders' }); await run(false);
assert.match(notifications.at(-1).title, /已到截止时间/);
clock = now;
const notificationCount = notifications.length;
await chrome.runtime.onStartup.fire(); await chrome.runtime.onInstalled.fire(); await run(true);
assert.equal(notifications.length, notificationCount, 'persisted tightest mark survives lifecycle refresh');
const before = operations.length;
await chrome.storage.onChanged.fire({ kuLmsTodoRemindersV1: {} }, 'local');
await new Promise(resolve => setImmediate(resolve)); assert.equal(operations.length, before, 'reminder metadata does not trigger badge/storage loops');
let clientListener;
// Subscribe through the actual client, rather than a permissive storage stub.
const clientContext = vm.createContext({ chrome: { storage: { onChanged: { addListener(fn) { clientListener = fn; } } } } });
vm.runInContext(read('src/shared/todo-client.js'), clientContext);
let clientChanges = 0; clientContext.KuTodoClient.subscribe(() => clientChanges++);
clientListener({ kuLmsTodoRemindersV1: {} }, 'local'); assert.equal(clientChanges, 0);
clientListener({ kuLmsTodosV1: {} }, 'local'); assert.equal(clientChanges, 1);
await chrome.notifications.onClicked.fire(notifications[0].id);
assert.ok(operations.some(op => op[0] === 'create' && op[1] === 'https://kulms.tl.kansai-u.ac.jp/webclass/'));
tabs.push({ id: 7, windowId: 8 }); await chrome.notifications.onClicked.fire(notifications[0].id);
assert.ok(operations.some(op => op[0] === 'tab' && op[1] === 7)); assert.ok(operations.some(op => op[0] === 'window' && op[1] === 8));
assert.equal(operations.at(-1)[0], 'clear');
const manifest = JSON.parse(read('manifest.json')), files = manifest.content_scripts[0].js;
assert.ok(manifest.permissions.includes('notifications')); assert.ok(!manifest.permissions.includes('tabs'));
assert.ok(files.indexOf('src/shared/todo-client.js') < files.indexOf('src/shared/todo-deadline.js'));
assert.ok(files.indexOf('src/shared/todo-deadline.js') < files.indexOf('src/shared/todo-ui.js'));
assert.ok(read('src/popup/popup.html').indexOf('todo-deadline.js') < read('src/popup/popup.html').indexOf('todo-ui.js'));
console.log('PASS: shared deadline rules, home priority/deadlines/timer, chip parity, course badge, worker badge, notification deduplication/cleanup and navigation');
