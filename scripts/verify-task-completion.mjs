import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { parseHTML } from 'linkedom';
import { getKulmsScript, readOrderedSource } from './lib/content-source.mjs';

const source = readOrderedSource(getKulmsScript().js.filter(f => f !== 'src/content/main.js'));
const model = vm.createContext({ URL, TextEncoder, crypto: webcrypto });
vm.runInContext(fs.readFileSync('src/background/todo-store.js', 'utf8'), model);
let saved = {}, failWrite = false, failRead = false, loseAck = false, pauseRead = null;
const observers = new Set(), writes = [];
const storage = {
  async get(key) { if (failRead) throw Error('read failed'); return structuredClone(key in saved ? { [key]: saved[key] } : {}); },
  async set(values) {
    if (failWrite) throw Error('save failed');
    Object.assign(saved, structuredClone(values));
    queueMicrotask(() => observers.forEach(fn => fn()));
  }
};
let store = model.KuTodoStore.create(storage);
const request = async (action, payload = {}) => {
  if (action === 'setAssignment') writes.push(structuredClone(payload));
  const result = await store.dispatch({ action, ...payload });
  if (action === 'read' && pauseRead) { const delay = pauseRead; pauseRead = null; return new Promise(resolve => delay(() => resolve(result))); }
  if (action === 'setAssignment' && loseAck) { loseAck = false; throw Error('response lost'); }
  return result;
};
const client = { courseKey: model.KuTodoStore.courseKey, uuid: () => webcrypto.randomUUID(), request,
  subscribe(fn) { observers.add(fn); return () => observers.delete(fn); } };
const tick = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };
const course = 'https://kulms.tl.kansai-u.ac.jp/webclass/course.php/123/';
const now = Date.now(), format = time => { const d = new Date(time); return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
const entry = { href: course, title: 'テスト科目', note: '締切が近い課題があります。' };
const item = (id, type = '試験', title = '課題 '+id) => ({ title, type, rawType: type, courseHref: course, courseTitle: entry.title,
  detailHref: `${course}contents/${id}/?acs_=session`, href: `${course}contents/${id}/?acs_=session`,
  historyHref: `${course}contents/${id}/history?acs_=other`, historyLabel: '利用回数 1',
  dueDate: new Date(now + 86400000), availability: `${format(now-3600000)} - ${format(now+86400000)}`,
  hasUsage: true, usageKnown: true, usageCount: 1, usageText: '利用回数 1', daysLeft: 1 });
const exam = item('exam'), survey = item('survey','アンケート'), report = item('report','レポート'), study = item('study','自習');
const items = [exam, survey, report, study];
const homeView = { upcoming: { loading: false, items: [exam] }, schedule: { entries: [entry] }, otherCourses: [] };

function page(route, pageItems = items, suppliedView = null) {
  const { document, window: domWindow } = parseHTML('<html><body><div id="host"></div></body></html>');
  Object.defineProperty(document, 'activeElement', { configurable: true, get() { return document.__focused || document.body; } });
  domWindow.HTMLElement.prototype.focus = function () { this.ownerDocument.__focused = this; };
  const session = new Map();
  const window = { document, location: new URL(course), addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout,
    performance: { getEntriesByType: () => [] }, sessionStorage: { getItem: k => session.get(k) || null, setItem: (k,v) => session.set(k,String(v)), removeItem: k => session.delete(k) } };
  const ctx = vm.createContext({ document, window, URL, URLSearchParams, TextEncoder, Date, AbortController, DOMException, crypto: webcrypto,
    console, setTimeout, clearTimeout, fetch() { throw Error('No LMS/Google requests permitted in this offline test'); },
    chrome: { runtime: { lastError: null, sendMessage() { throw Error('Unexpected runtime call'); }, onMessage: { addListener() {} }, onInstalled: { addListener() {} } } } });
  vm.runInContext(source, ctx);
  ctx.KuTodoClient = client;
  ctx.icon = () => '';
  ctx.renderCourseHeader = () => '';
  const view = suppliedView || (route === 'home' ? homeView : route === 'home-all-upcoming'
    ? { items: pageItems, courseCount: 1, subtitle: '', homeHref: '/webclass/', emptyMessage: 'なし' }
    : { course: { course: { title: entry.title, links: { materials: course } }, sections: [{ id: 'section', title: '課題', items: pageItems }], timeline: { items: [], error: false }, anchors: [] }, currentTab: 'materials' });
  const root = document.getElementById('host');
  const markup = () => route === 'home' ? `<div class="ku-app"><button data-action="refresh-upcoming">更新</button><div data-completion-upcoming>${ctx.renderHomeUpcoming(view)}</div></div>`
    : `<div class="ku-app">${route === 'course-materials' ? ctx.renderCourseMaterials(view) : ctx.renderAllUpcoming(view)}</div>`;
  root.innerHTML = markup();
  ctx.kuBindTaskCompletions(root, { name: route }, view);
  const badge = id => [...root.querySelectorAll('[data-assignment-key]')].find(n => n.dataset.assignmentKey === `${course}contents/${id}/`);
  const click = node => { assert.ok(node, 'click target exists'); node.dispatchEvent(new domWindow.Event('click', { bubbles: true, cancelable: true })); };
  return { root, document, ctx, window, domWindow, session, view, badge, click, q: name => root.querySelector(`[data-completion-${name}]`),
    rerender() { root.innerHTML = markup(); ctx.kuBindTaskCompletions(root, {name: route}, view); }, destroy() { ctx.kuCleanupTaskCompletions(); } };
}
const db = () => request('read');
const workspace = async () => (await db()).workspaces.find(w => w.id === (saved.kuLmsTodosV1?.activeId || 'local'));
async function set(id, completed) {
  const w = await workspace(), old = w.assignmentCompletions.find(v => v.key === `${course}contents/${id}/`);
  return request('setAssignment', { workspaceId: w.id, operationId: webcrypto.randomUUID(), course: { key: course, title: entry.title },
    contentId: id, title: '課題 '+id, assignmentType: '試験', completed, expectedRevision: old?.revision || 0, expectedHeads: [] });
}

const coursePage = page('course-materials', [...items, item('material','資料','レポートについて'), item('lti','LTIツール','試験へのリンク')]);
assert.match(coursePage.root.textContent, /読み込み中/);
await tick();
assert.equal(coursePage.root.querySelectorAll('[data-assignment-key]').length, 4);
assert.equal(writes.length, 0, 'rendering unmarked assignments never writes completion records');
for (const v of items) assert.equal(coursePage.ctx.kuAssignmentIdentity(v).type, v.type);
const stable = coursePage.ctx.kuAssignmentIdentity(exam).key;
assert.equal(stable, `${course}contents/exam/`);
assert.equal(coursePage.ctx.kuAssignmentIdentity({ ...exam, title:'改名', dueDate:new Date(now+2000) }).key, stable);
assert.equal(coursePage.ctx.kuAssignmentIdentity({ ...exam, detailHref:'', href:'', historyHref:`${course}contents/exam/history?acs_=different` }).key, stable);
assert.equal(coursePage.ctx.kuAssignmentIdentity({ type:'試験', title:'起動のみ', href:'/webclass/do_contents.php?set_contents_id=exam' }, course).key, stable);
assert.equal(coursePage.ctx.kuAssignmentIdentity({ type:'試験', href:'/webclass/do_contents.php?set_contents_id=exam' }), null);
assert.equal(coursePage.ctx.kuAssignmentIdentity(exam, '/webclass/course.php/other/'), null);
assert.equal(coursePage.ctx.kuAssignmentIdentity({ type:'試験', href:'https://evil.test/webclass/course.php/123/contents/exam/' }), null);
assert.equal(coursePage.ctx.kuAssignmentIdentity({ ...exam, rawType:'資料', title:'試験 課題' }), null);
assert.match(coursePage.ctx.kuRenderAssignmentBadge({ type:'試験', title:'リンクなし' }), /disabled/);
const escaped = coursePage.ctx.kuRenderAssignmentBadge({ ...exam, title:'<img src=x onerror=alert(1)>' });
assert.ok(!escaped.includes('<img'));

const home = page('home'), all = page('home-all-upcoming');
await tick();
assert.ok(home.badge('exam'), 'used but unmarked assignment is visible');
assert.equal(home.badge('exam').textContent, '未完了');
coursePage.click(coursePage.badge('exam'));
assert.ok(coursePage.q('confirm'));
assert.match(coursePage.q('question').textContent, /未完了 → 完了/);
assert.ok(coursePage.root.querySelector('.ku-app').hasAttribute('inert'));
coursePage.click(coursePage.q('cancel')); await tick();
assert.equal(writes.length, 0);
assert.equal(coursePage.root.querySelector('.ku-app').hasAttribute('inert'), false);
assert.equal(coursePage.document.activeElement, coursePage.badge('exam'));
coursePage.click(coursePage.badge('exam'));
const escapeEvent = new coursePage.domWindow.Event('keydown', {bubbles:true,cancelable:true}); escapeEvent.key='Escape';
coursePage.q('cancel').dispatchEvent(escapeEvent);
assert.equal(coursePage.q('confirm'), null); assert.equal(writes.length, 0);
coursePage.click(coursePage.badge('exam'));
const modal = coursePage.root.querySelector('.ku-completion-overlay');
coursePage.rerender(); await tick();
assert.equal(coursePage.root.querySelector('.ku-completion-overlay'), modal, 'unrelated rerender keeps the confirmation');
coursePage.click(coursePage.q('confirm')); coursePage.click(coursePage.q('confirm')); await tick();
assert.equal((await workspace()).assignmentCompletions.length, 1);
assert.equal(writes.length, 1, 'double click cannot submit twice');
assert.equal(coursePage.badge('exam').textContent, '完了');
assert.equal(home.badge('exam'), undefined, 'completed assignment disappears only from home');
assert.equal(all.badge('exam').textContent, '完了');
assert.match(home.root.textContent, /未完了の課題はありません/);
assert.doesNotMatch(home.root.textContent, /課題情報が未取得/);
all.click(all.badge('exam')); all.click(all.q('confirm')); await tick();
assert.equal(home.badge('exam').textContent, '未完了', 'undo restores a used assignment without fetching LMS');
store = model.KuTodoStore.create(storage);
const reopened = page('course-materials'); await tick();
assert.equal(reopened.badge('exam').textContent, '未完了', 'worker/page restart retains explicit undone state');
reopened.destroy();

// A failed write stays unfinished; a lost ACK retries the same idempotent operation.
failWrite = true; coursePage.click(coursePage.badge('exam')); coursePage.click(coursePage.q('confirm')); await tick();
assert.match(coursePage.q('error').textContent, /save failed/);
assert.equal(coursePage.badge('exam').textContent, '未完了');
assert.equal((await workspace()).assignmentCompletions[0].completed, false);
failWrite = false; loseAck = true; coursePage.click(coursePage.q('confirm')); await tick();
assert.match(coursePage.q('error').textContent, /response lost/);
const afterLostAck = (await workspace()).assignmentCompletions[0].revision;
coursePage.click(coursePage.q('confirm')); await tick();
assert.equal((await workspace()).assignmentCompletions[0].revision, afterLostAck);
assert.equal(coursePage.q('confirm'), null);

// A stale confirmation must require another review, including across workspace switches.
all.click(all.badge('exam')); await set('exam', false); await tick();
all.click(all.q('confirm')); await tick();
assert.match(all.q('error').textContent, /修改|変わ/);
assert.equal(all.q('confirm').disabled, true); assert.equal(all.q('review').hidden, false);
all.click(all.q('review')); await tick();
assert.match(all.q('question').textContent, /未完了 → 完了/); all.click(all.q('cancel'));
all.click(all.badge('exam'));
await request('createWorkspace',{ workspaceId:'local', operationId:'second_workspace', name:'Other' }); await tick();
const beforeWorkspaceConfirm = writes.length;
all.click(all.q('confirm')); await tick();
assert.equal(writes.length,beforeWorkspaceConfirm);
assert.match(all.q('error').textContent,/資料/); all.click(all.q('cancel'));
await request('selectWorkspace',{workspaceId:'local',operationId:webcrypto.randomUUID()}); await tick();

failRead = true; await home.ctx.kuLoadTaskCompletions();
assert.match(home.root.textContent, /read failed/); assert.ok(home.q('retry'));
assert.doesNotMatch(home.root.textContent, /未完了の課題はありません/);
failRead = false; home.click(home.q('retry')); await tick();
assert.ok(home.badge('exam'));

// Keep every candidate until completion filtering, then choose the first five.
const candidates = Array.from({length:7},(_,i)=>item('candidate_'+i, '試験', '候補'+i));
for (let i=0;i<5;i++) await set('candidate_'+i,true);
const many = page('home', candidates, { ...homeView, upcoming:{loading:false,items:candidates} }); await tick();
assert.equal(many.root.querySelectorAll('[data-assignment-key]').length,2);
assert.ok(many.badge('candidate_5')); assert.ok(many.badge('candidate_6'));
await set('candidate_0',false); await tick(); assert.ok(many.badge('candidate_0'));
for(let i=0;i<7;i++) await set('candidate_'+i,true);
await tick(); assert.match(many.root.textContent,/未完了の課題はありません/);
many.ctx.syncCourseUpcomingCacheIdentity('fixture student');
many.ctx.rememberCourseUpcoming(course,candidates);
assert.equal(many.ctx.readCourseUpcomingCache()[course].length,7,'completion never prunes candidate storage');
const cached = many.ctx.serializeCourseUpcomingItem(exam);
assert.equal(cached.assignmentKey,stable);
assert.equal(many.ctx.hydrateCourseUpcomingItem(cached,entry,course).assignmentKey,stable);
assert.equal(many.ctx.serializeAllUpcomingItem(exam).assignmentKey,stable);
assert.equal(many.ctx.buildUpcomingIdentityKey(exam),many.ctx.buildAllUpcomingIdentityKey(exam));
assert.notEqual(many.ctx.buildUpcomingIdentityKey(exam),many.ctx.buildUpcomingIdentityKey({...exam,detailHref:`${course}contents/other/`,href:'',historyHref:''}));
many.window.sessionStorage.setItem(many.ctx.COURSE_UPCOMING_CACHE_KEY,JSON.stringify({version:2,identity:'fixture student',entries:{[course]:{collectedAt:new Date().toISOString(),items:[cached]}}}));
assert.equal(Object.keys(many.ctx.readCourseUpcomingCache()).length,0,'v2 incomplete caches must be recollected');
many.ctx.rememberCourseUpcoming(course,[exam]);
assert.equal(JSON.parse(many.window.sessionStorage.getItem(many.ctx.COURSE_UPCOMING_CACHE_KEY)).version,3);
assert.equal((await workspace()).assignmentCompletions.find(t=>t.key.endsWith('/candidate_0/')).completed,true);

let releaseRead; pauseRead = release => { releaseRead = release; };
const closing = page('course-materials'); await tick(); assert.ok(releaseRead);
closing.destroy(); const closingPhase = closing.ctx.kuTaskCompletion.phase; releaseRead(); await tick();
assert.equal(closing.ctx.kuTaskCompletion.phase,closingPhase,'late read cannot reactivate a disposed page');
assert.equal(closing.ctx.kuTaskCompletion.root,null);
coursePage.destroy(); home.destroy(); all.destroy(); many.destroy();
assert.equal(observers.size,0,'page cleanup removes every subscription');
console.log('PASS: four assignment types, stable identity, safe rendering, confirmation/cancel, multi-page updates, undo, restart, save failures, conflicts, workspace changes, candidate refill and lifecycle cleanup');
