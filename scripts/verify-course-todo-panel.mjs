import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { parseHTML } from 'linkedom';
import { getKulmsScript, readOrderedSource } from './lib/content-source.mjs';

const read = file => fs.readFileSync(file, 'utf8');
const model = vm.createContext({ URL, TextEncoder, crypto: webcrypto });
vm.runInContext(read('src/background/todo-replica.js') + '\n' + read('src/background/todo-store.js'), model);
const observers = new Set(), calls = [];
let saved = {}, failRead = false, failWrite = false, delayRead = null, lostAddResponse = false;
const store = model.KuTodoStore.create({
  async get(key) { if (failRead) throw Error('read unavailable'); return structuredClone(key in saved ? { [key]: saved[key] } : {}); },
  async set(values) { if (failWrite) throw Error('save unavailable'); Object.assign(saved, structuredClone(values)); queueMicrotask(() => observers.forEach(fn => fn())); }
});
const request = async (action, payload = {}) => {
  calls.push({ action, ...structuredClone(payload) });
  const result = await store.dispatch({ action, ...payload });
  if (action === 'read' && delayRead) { const capture = delayRead; delayRead = null; return new Promise(resolve => capture(() => resolve(result))); }
  if (action === 'add' && lostAddResponse) { lostAddResponse = false; throw Error('response lost'); }
  return result;
};
const client = { request, courseKey: model.KuTodoStore.courseKey, uuid: () => webcrypto.randomUUID(),
  subscribe(fn) { observers.add(fn); return () => observers.delete(fn); } };
const run = (action, payload = {}) => request(action, { workspaceId: 'local', operationId: webcrypto.randomUUID(), ...payload });
const tick = async () => { for (let i = 0; i < 15; i++) await new Promise(resolve => setImmediate(resolve)); };
const aKey = 'https://kulms.tl.kansai-u.ac.jp/webclass/course.php/course_a/';
const bKey = 'https://kulms.tl.kansai-u.ac.jp/webclass/course.php/course_b/';
await run('catalog', { courses: [{ key: bKey, title: 'B course' }], scopeLabel: 'home B' });
await run('add', { courseKey: bKey, text: 'B private task' });
const initialScope = structuredClone((await run('read')).workspaces[0].courseScope);
const source = readOrderedSource(getKulmsScript().js.filter(f => f !== 'src/content/main.js'));

function page(key, title = 'Course A') {
  const { document, window: dom } = parseHTML('<html><body><div id="ku-redesign-root"></div></body></html>');
  Object.defineProperty(document, 'activeElement', { configurable: true, get() { return document.__focused || document.body; } });
  dom.HTMLElement.prototype.focus = function () { this.ownerDocument.__focused = this; };
  dom.HTMLTextAreaElement.prototype.setSelectionRange = function (start, end, direction) { this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction; };
  const session = new Map();
  const window = { document, location: new URL(key), addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout,
    performance: { getEntriesByType: () => [] }, sessionStorage: { getItem: k => session.get(k) || null, setItem: (k,v) => session.set(k,String(v)), removeItem: k => session.delete(k) } };
  const ctx = vm.createContext({ document, window, URL, URLSearchParams, Date, TextEncoder, crypto: webcrypto, console, setTimeout, clearTimeout,
    AbortController, DOMException, fetch() { throw Error('No network allowed in panel verification'); },
    chrome: { runtime: { sendMessage() { throw Error('Unexpected runtime message'); }, onMessage: { addListener() {} }, onInstalled: { addListener() {} } } } });
  vm.runInContext(source, ctx);
  ctx.KuTodoClient = client; ctx.icon = () => ''; ctx.renderCourseHeader = () => '';
  ctx.renderShell = (_route, _context, body) => `<main class="ku-app">${body}</main>`;
  ctx.hydrateRouteDom = () => {}; ctx.hideNativePageForExtension = () => {};
  const view = { currentTab: 'materials', course: { course: { title, links: { materials: `${key}?acs_=changing` }, meta: { year: '2026', semester: '秋' } },
    sections: [], anchors: [], timeline: { error: false, items: Array.from({length:8},(_,i)=>({ title:`Activity ${i}`,subtitle:'資料',bodyText:`Full activity ${i}`,label:'New',recency:'today' })) } } };
  ctx.state.currentRoute = { name: 'course-materials' }; ctx.state.currentContext = { links: { home:'/webclass/' } }; ctx.state.currentView = view;
  ctx.rerender();
  const root = document.getElementById('ku-redesign-root');
  const q = name => root.querySelector(`[data-${name}]`);
  const click = name => { assert.ok(q(name), `control ${name} exists`); q(name).dispatchEvent(new dom.Event('click', { bubbles:true, cancelable:true })); };
  const input = value => { q('editor-text').value = value; q('editor-text').dispatchEvent(new dom.Event('input', { bubbles:true })); };
  const submit = () => q('editor').dispatchEvent(new dom.Event('submit', { bubbles:true, cancelable:true }));
  return {ctx,root,document,dom,view,q,click,input,submit,
    rerender() { ctx.rerender(); },
    changeCourse(next, name) { view.course.course = { ...view.course.course, title:name,links:{materials:next} };ctx.rerender(); },
    destroy() { ctx.cleanupRouteHydration(); }
  };
}

const a = page(aKey); await tick();
let w = (await run('read')).workspaces[0];
assert.ok(w.courses.some(c=>c.key===aKey), 'direct course navigation registers the current course');
assert.deepEqual(structuredClone(w.courseScope), initialScope, 'course registration must not replace the home scope');
assert.equal(calls.filter(c=>c.action==='catalog' && c.courses?.some(v=>v.key===aKey)).length,1);
assert.equal(a.q('course-todo-count').textContent,'0');
assert.ok(!a.q('course') && !a.q('editor-course') && !a.q('workspace'));
assert.ok(!a.root.querySelector('.ku-todo-overlay'));
assert.equal(a.root.querySelectorAll('.ku-timeline-item').length,8,'compressing timeline must not discard activity');
assert.equal(a.root.querySelector('.ku-course-left-column').firstElementChild.classList.contains('ku-course-todo-card'),true);
assert.doesNotMatch(a.q('list').textContent,/B private task/);
a.click('add'); a.input('A draft waiting to save'); await tick();
const field = a.q('editor-text'), host = a.q('course-todo-host'), instance = a.ctx.kuCourseTodoPanel.editor;
field.focus(); field.setSelectionRange(3,7,'forward'); host.scrollTop=35;host.dispatchEvent(new a.dom.Event('scroll'));
const subscribed = observers.size;
a.rerender(); await tick();
assert.ok(a.q('editor-text')===field && a.q('course-todo-host')===host && a.ctx.kuCourseTodoPanel.editor===instance,'same course rerender reuses the editor DOM');
assert.equal(field.value,'A draft waiting to save');assert.equal(field.selectionStart,3);assert.equal(host.scrollTop,35);
assert.ok(a.document.activeElement===field);assert.equal(observers.size,subscribed,'rerender never adds subscriptions');
field.dispatchEvent(new a.dom.Event('compositionstart',{bubbles:true})); a.rerender();
assert.equal(a.ctx.state.renderDeferred,true,'IME composition defers whole-page redraw');
field.dispatchEvent(new a.dom.Event('compositionend',{bubbles:true})); await new Promise(resolve=>setTimeout(resolve,5));await tick();
assert.ok(a.q('editor-text')===field); assert.equal(field.value,'A draft waiting to save');
a.submit(); await tick();w=(await run('read')).workspaces[0];
const savedA=w.todos.find(t=>t.text==='A draft waiting to save');assert.equal(savedA.courseKey,aKey);
assert.equal(a.q('course-todo-count').textContent,'1');
await run('update',{id:savedA.id,expectedRevision:savedA.revision,text:'A external update'}); await tick();
assert.match(a.q('list').textContent,/A external update/);
const a2=page(aKey);await tick();
assert.match(a2.q('list').textContent,/A external update/);
a.root.querySelector('.ku-todo-text').click();a.input('A editor still typing');await tick();
await run('setAssignment',{course:{key:aKey,title:'Course A'},contentId:'native_assignment',title:'課題',assignmentType:'試験',completed:true,expectedRevision:0,expectedHeads:[]});await tick();
assert.equal(a.q('editor-text').value,'A editor still typing');assert.equal(a.q('course-todo-count').textContent,'1','assignment completion is not a TODO count');

failWrite=true;a.submit();await tick();assert.match(a.q('status').textContent,/save unavailable/);assert.equal(a.q('editor-text').value,'A editor still typing');failWrite=false;
a.submit();await tick();assert.match(a2.q('list').textContent,/A editor still typing/);
a.click('add');a.input('Exactly one task after lost response');await tick();lostAddResponse=true;a.submit();await tick();
assert.match(a.q('status').textContent,/response lost/);a.submit();await tick();
assert.equal((await run('read')).workspaces[0].todos.filter(t=>t.text==='Exactly one task after lost response').length,1);
a.click('add');a.input('Keep A draft when navigating');
a.changeCourse(bKey,'B course');await tick();
assert.match(a.q('list').textContent,/B private task/);assert.doesNotMatch(a.q('list').textContent,/A editor still typing/);
assert.doesNotMatch(a.q('drafts').textContent,/Keep A draft/);
assert.ok((await run('read')).workspaces[0].drafts.some(d=>d.courseKey===aKey&&d.text==='Keep A draft when navigating'));
a.changeCourse(aKey,'Course A');await tick();assert.match(a.q('drafts').textContent,/Keep A draft/);

await run('createWorkspace',{operationId:'course_other_profile',name:'Other profile'});await tick();
const allDb=await run('read'),other=allDb.workspaces.find(v=>v.id==='course_other_profile');
assert.ok(other.courses.some(c=>c.key===aKey),'an external profile change registers the fixed course there');
assert.equal(other.courseScope,undefined,'course registration still does not create a global term scope');
assert.equal(a.q('course-todo-count').textContent,'0');assert.doesNotMatch(a.q('drafts').textContent,/Keep A draft/);
await run('selectWorkspace',{workspaceId:'local'});await tick();assert.match(a.q('drafts').textContent,/Keep A draft/);

failRead=true;const failed=page('https://kulms.tl.kansai-u.ac.jp/webclass/course.php/failure/','Failure course');await tick();
assert.ok(failed.q('course-todo-retry'));assert.equal(failed.q('course-todo-count').textContent,'!');assert.ok(!failed.ctx.kuCourseTodoPanel.editor);
failRead=false;failed.click('course-todo-retry');await tick();assert.equal(failed.q('course-todo-count').textContent,'0');
assert.ok(failed.q('add')&&!failed.q('add').disabled);

let release;delayRead=fn=>{release=fn;};
const late=page('https://kulms.tl.kansai-u.ac.jp/webclass/course.php/late_a/','Late A');await tick();assert.ok(release);
late.changeCourse('https://kulms.tl.kansai-u.ac.jp/webclass/course.php/late_b/','Late B');await tick();
const lateEditor=late.ctx.kuCourseTodoPanel.editor;release();await tick();
assert.ok(late.ctx.kuCourseTodoPanel.editor===lateEditor);assert.match(late.q('course-scope').textContent,/Late B/);
assert.ok(!(await run('read')).workspaces[0].courses.some(c=>c.key.endsWith('/late_a/')),'late results cannot register a course after leaving it');
for(const p of [a,a2,failed,late])p.destroy();
assert.equal(observers.size,0,'route cleanup removes course and assignment subscriptions');
const catalogBefore = calls.filter(c => c.action === 'catalog').length;
const stale = page(aKey, 'Old course title'); await tick();
assert.equal(calls.filter(c => c.action === 'catalog').length, catalogBefore,
  'opening an existing course with stale metadata must not rewrite its catalog');
const renamed = page(aKey, 'Another course title'); await tick();
await run('catalog', { courses: [{ key: aKey, title: 'Authoritative title', term: '2027 春' }], setScope: false });
await tick();
assert.equal(calls.filter(c => c.action === 'catalog').length, catalogBefore + 1,
  'pages with different metadata must not write back after an external catalog update');
assert.equal((await run('read')).workspaces[0].courses.find(c => c.key === aKey).title, 'Authoritative title');
assert.ok(stale.q('add') && renamed.q('add'), 'both course editors remain usable');
stale.destroy(); renamed.destroy();
assert.equal(observers.size, 0);
console.log('PASS: inline current-course TODO, compact complete timeline, direct registration, scope isolation, DOM/IME preservation, retries, multi-page updates and late-response cleanup');
