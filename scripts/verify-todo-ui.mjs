import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { parseHTML } from 'linkedom';
const read = path => fs.readFileSync(path,'utf8');
const model = vm.createContext({ URL, TextEncoder }); vm.runInContext(read('src/background/todo-store.js'),model);
const observers=new Set(); let saved={}, fail=false;
const store=model.KuTodoStore.create({async get(k){return structuredClone(k in saved?{[k]:saved[k]}:{});},async set(v){if(fail)throw Error('保存失败');Object.assign(saved,structuredClone(v));queueMicrotask(()=>observers.forEach(fn=>fn()));}});
const key='https://kulms.tl.kansai-u.ac.jp/webclass/course.php/26170478/';
const request=(action,payload={})=>store.dispatch({action,...payload});
await request('catalog',{workspaceId:'local',operationId:'catalog',courses:[{key,title:'サウンド知覚情報処理'}]});
const client={uuid:()=>webcrypto.randomUUID(),request,subscribe(fn){observers.add(fn);return()=>observers.delete(fn);},courseKey:model.KuTodoStore.courseKey};
const tick=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
function ui(){
  const {document,window}=parseHTML('<html><body><div id="host"></div></body></html>');
  // linkedom exposes a getter-only select.value, unlike a browser.
  const proto=Object.getPrototypeOf(document.createElement('select'));
  Object.defineProperty(proto,'value',{configurable:true,get(){return [...this.options].find(o=>o.selected)?.value??this.options[0]?.value??'';},set(v){for(const o of this.options)o.selected=o.value===v;}});
  const ctx=vm.createContext({document,window:{confirm:()=>true},URL,Blob,setTimeout,KuTodoClient:client,console});
  vm.runInContext(read('src/shared/todo-ui.js'),ctx);
  const host=document.querySelector('#host');const instance=ctx.KuTodoUI.mount(host,{client});
  return {document,window,ctx,host,instance,q:n=>host.querySelector(`[data-${n}]`),click:n=>host.querySelector(`[data-${n}]`).click(),input(n,value){const e=this.q(n);e.value=value;e.dispatchEvent(new window.Event('input'));},submit(){this.q('editor').dispatchEvent(new window.Event('submit',{cancelable:true}));}};
}
const a=ui(),b=ui();await Promise.all([a.instance.ready,b.instance.ready]);
a.click('add');a.input('editor-text','<img src=x onerror=alert(1)>课程复习');await tick();
assert.equal((await request('read')).workspaces[0].drafts.length,1);
a.submit();await tick();assert.equal(a.host.querySelectorAll('.ku-todo-row').length,1);assert.equal(b.host.querySelectorAll('.ku-todo-row').length,1,'both entry points update');
assert.equal(a.host.querySelector('img'),null,'TODO text cannot create HTML');
assert.equal((await request('read')).workspaces[0].drafts.length,0);
a.host.querySelector('.ku-todo-text').click();b.host.querySelector('.ku-todo-text').click();
a.input('editor-text','first writer');b.input('editor-text','second writer');await tick();a.submit();await tick();b.submit();await tick();
assert.equal(b.q('editor-text').value,'second writer');assert.equal(b.q('conflict').hidden,false);assert.match(b.q('conflict-text').textContent,/first writer/);
b.click('conflict-save');await tick();assert.equal((await request('read')).workspaces[0].todos[0].text,'second writer');
b.click('add');b.input('editor-text','关闭后恢复的草稿');await tick();b.instance.destroy();
const reopened=ui();await reopened.instance.ready;reopened.host.querySelector('.ku-todo-draft-title').click();assert.equal(reopened.q('editor-text').value,'关闭后恢复的草稿');
fail=true;reopened.submit();await tick();assert.match(reopened.q('status').textContent,/失败/);assert.equal(reopened.q('editor-text').value,'关闭后恢复的草稿');fail=false;
reopened.submit();await tick();assert.equal((await request('read')).workspaces[0].todos.length,2);
const check=a.host.querySelector('.ku-todo-row input');check.checked=true;check.dispatchEvent(new a.window.Event('change'));await tick();assert.equal(a.host.querySelectorAll('.ku-todo-row').length,1);assert.equal(reopened.host.querySelectorAll('.ku-todo-row').length,1);
a.host.querySelector('.ku-todo-row-actions button').click();await tick();a.host.querySelector('[data-filter="trash"]').click();assert.equal(a.host.querySelectorAll('.ku-todo-row').length,1);a.host.querySelector('.ku-todo-row-actions button').click();await tick();assert.equal((await request('read')).workspaces[0].todos.filter(t=>t.deletedAt).length,0);
// Home consumes the same store, and its open drawer survives a replacement of page markup.
const home=ui();await home.instance.ready;home.instance.destroy();
Object.assign(home.ctx,{escapeAttr:s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),shortenCourseTitle:s=>s});
vm.runInContext(read('src/content/services/todo.js'),home.ctx);
const root=home.host;const view={schedule:{entries:[{href:key+'login?acs_=one',title:'サウンド'}]},otherCourses:[],filters:{label:'2026 秋'}};
const markup='<div class="ku-app"><button data-todo-open="">全部</button><div data-todo-summary-body></div></div>';
root.innerHTML=markup+home.ctx.kuRenderTodoChip(view.schedule.entries[0]);
home.ctx.kuBindTodos(root,{name:'home'},view);await tick();assert.match(root.querySelector('[data-todo-summary-body]').textContent,/second writer|关闭后/);
home.ctx.kuOpenTodoDialog(key,root.querySelector('[data-todo-open]'));await tick();
const overlay=root.querySelector('.ku-todo-overlay');assert.ok(overlay);assert.ok(root.querySelector('.ku-app').hasAttribute('inert'));
root.innerHTML=markup;home.ctx.kuBindTodos(root,{name:'home'},view);await tick();assert.equal(root.querySelector('.ku-todo-overlay'),overlay,'unrelated rerender retains editor DOM');
home.ctx.kuCleanupTodos();assert.equal(root.querySelector('.ku-todo-overlay'),null);assert.equal(root.querySelector('.ku-app').hasAttribute('inert'),false);
// Popup settings remain available even if TODO initialization throws.
const pop=parseHTML(read('src/popup/popup.html'));const popContext=vm.createContext({document:pop.document,KuTodoUI:{mount(){throw Error('unavailable');}}});
vm.runInContext(read('src/popup/todo-popup.js'),popContext);pop.document.querySelector('#settings-tab').click();assert.equal(pop.document.querySelector('#settings-form').hidden,false);assert.equal(pop.document.querySelector('#todo-page').hidden,true);
a.instance.destroy();reopened.instance.destroy();
console.log('PASS: TODO shared views, XSS, conflicting edits, draft reopen, storage failure, completion, recovery, home lifecycle and popup settings');
// A lost response must not let a retry discard subsequently edited text.
const originalRequest = client.request;
let loseAddAck = true;
client.request = async (name, payload) => {
  const result = await originalRequest(name, payload);
  if (name === 'add' && loseAddAck) { loseAddAck = false; throw Error('response lost'); }
  return result;
};
const retry = ui(); await retry.instance.ready;
retry.click('add'); retry.input('editor-text', 'submitted before response loss'); await tick(); retry.submit(); await tick();
const countBeforeRetry = (await request('read')).workspaces[0].todos.length;
retry.input('editor-text', 'new text after response loss'); await tick(); retry.submit(); await tick();
assert.equal(retry.q('editor').hidden, false, 'retry must keep newer input visible rather than silently discard it');
assert.equal(retry.q('editor-text').value, 'new text after response loss');
retry.submit(); await tick();
const afterRetry = (await request('read')).workspaces[0];
assert.equal(afterRetry.todos.length, countBeforeRetry, 'ambiguous successful add must not duplicate');
assert.ok(afterRetry.todos.some(t => t.text === 'new text after response loss'));
retry.instance.destroy(); client.request = originalRequest;
console.log('PASS: lost-response retry preserves new edits without duplicate records');
// The latest keystrokes are dispatched even while an earlier draft response is pending.
let releaseDraft, draftCalls=0;
client.request=(name,payload)=>{
  if(name!=='draft')return originalRequest(name,payload);
  draftCalls++;
  const result=originalRequest(name,payload);
  if(draftCalls===1)return result.then(value=>new Promise(resolve=>{releaseDraft=()=>resolve(value);}));
  return result;
};
const immediate=ui();await immediate.instance.ready;immediate.click('add');immediate.input('editor-text','first key');await tick();immediate.input('editor-text','last key before closing');
assert.equal(draftCalls,2,'do not queue unsent keystrokes inside an ephemeral popup');
immediate.instance.destroy();releaseDraft();await tick();assert.ok((await request('read')).workspaces[0].drafts.some(d=>d.text==='last key before closing'));
client.request=originalRequest;
// A response lost just before closing must not turn its saved draft into a duplicate add.
let closeAck=true;
client.request=async(name,payload)=>{const result=await originalRequest(name,payload);if(name==='add'&&closeAck){closeAck=false;throw Error('lost before close');}return result;};
const closing=ui();await closing.instance.ready;closing.click('add');closing.input('editor-text','save before close');await tick();closing.submit();await tick();closing.instance.destroy();
client.request=originalRequest;
const recover=ui();await recover.instance.ready;
[...recover.host.querySelectorAll('.ku-todo-draft-title')].find(n=>n.textContent.includes('save before close')).click();
const priorCount=(await request('read')).workspaces[0].todos.length;recover.input('editor-text','changed after reopening');await tick();recover.submit();await tick();
assert.equal((await request('read')).workspaces[0].todos.length,priorCount,'recovered ambiguous save must use the original record identity');
assert.equal(recover.q('editor').hidden,false);recover.submit();await tick();assert.ok((await request('read')).workspaces[0].todos.some(t=>t.text==='changed after reopening'));recover.instance.destroy();
console.log('PASS: immediate draft dispatch and lost-response recovery across popup reopen');
