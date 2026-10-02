import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
const sources = ['todo-replica.js', 'todo-sync.js', 'todo-store.js'].map(f => fs.readFileSync(`src/background/${f}`, 'utf8')).join('\n');
const copy = value => JSON.parse(JSON.stringify(value));
const cloud = new Map(); let fileSequence = 0;
const course = 'https://kulms.tl.kansai-u.ac.jp/webclass/course.php/26170478/';
function device(name) {
  const context = vm.createContext({ URL, TextEncoder, crypto: webcrypto, console }); vm.runInContext(sources, context);
  const state = { data: {}, account: 'account_a', offline: false, failWrite: false, loseResponse: false, network: 0 };
  const storage = {
    async get(k) { return copy(k in state.data ? { [k]: state.data[k] } : {}); },
    async set(v) { if (state.failWrite) throw Error('disk full'); Object.assign(state.data, copy(v)); }
  };
  const drive = {
    async authorize() { state.network++; if (state.offline) throw Object.assign(Error('offline'), { code: 'NETWORK' }); },
    async account() { return { id: state.account, email: `${state.account}@example.test`, name }; },
    async list() { return [...cloud].filter(([,f]) => f.account === state.account).map(([id]) => ({ id })); },
    async download(id, account) { assert.equal(cloud.get(id).account, account); return copy(cloud.get(id).events); },
    async upload(events, account) { assert.equal(account, state.account); const id = `file_${++fileSequence}`; cloud.set(id, { account, events: copy(events) }); if (state.loseResponse) { state.loseResponse = false; throw Error('response lost'); } return id; }
  };
  let store = context.KuTodoStore.create(storage), service;
  const boot = () => { store = context.KuTodoStore.create(storage); service = context.KuTodoSync.create({ store, storage, drive }); };
  boot();
  return { state, context, storage, drive, boot, local(action, payload = {}) { return store.dispatch({ action, workspaceId: 'local', operationId: webcrypto.randomUUID(), ...payload }); }, sync(action, payload) { return service.handle(action, payload); }, status() { return service.status(); } };
}
async function connect(d) { const p = await d.sync('prepare', { workspaceId: 'local' }); return d.sync('confirm', { ticket: p.ticket }); }
const a = device('A'), b = device('B');
await a.local('catalog', { courses: [{ key: course, title: 'サウンド', term: '2026 秋' }] });
await a.local('add', { operationId: 'shared_todo', courseKey: course, text: '初始内容' });
assert.equal(cloud.size, 0, 'local work never uploads without consent');
await connect(a); await connect(b);
assert.equal((await b.local('read')).workspaces[0].todos[0].text, '初始内容');
assert.equal((await b.local('read')).workspaces[0].courses[0].key, course, 'second device gets course catalog');
const edit = async (d, text) => { const t=(await d.local('read')).workspaces[0].todos.find(t=>t.id==='shared_todo'); await d.local('update',{id:t.id,expectedRevision:t.revision,text}); };
a.state.offline = true; b.state.offline = true;
await edit(a, '电脑 A 离线编辑'); await edit(b, '电脑 B 离线编辑');
await a.sync('now'); assert.ok((await a.status()).pending > 0); assert.equal((await a.status()).errorCode, 'NETWORK');
a.boot(); assert.ok((await a.status()).pending > 0, 'outbox survives worker restart');
a.state.offline=false;b.state.offline=false;
await a.sync('now');await b.sync('now');await a.sync('now');
let conflicts=(await a.status()).conflicts;assert.equal(conflicts.length,1);assert.deepEqual(new Set(conflicts[0].versions.map(v=>v.value.text)),new Set(['电脑 A 离线编辑','电脑 B 离线编辑']));
assert.equal((await b.status()).conflicts.length,1);
const chosen=conflicts[0].versions.find(v=>v.value.text==='电脑 B 离线编辑');
await a.sync('resolve',{id:conflicts[0].key,heads:conflicts[0].heads,eventId:chosen.eventId});await a.sync('now');await b.sync('now');
assert.equal((await b.status()).conflicts.length,0);assert.equal((await b.local('read')).workspaces[0].todos[0].text,'电脑 B 离线编辑');
// Delete vs offline edit retains both alternatives, rather than silently losing either.
const t=(await a.local('read')).workspaces[0].todos[0];await a.local('delete',{id:t.id,expectedRevision:t.revision});await edit(b,'删除时的离线编辑');
await a.sync('now');await b.sync('now');await a.sync('now');conflicts=(await a.status()).conflicts;
assert.equal(conflicts.length,1);assert.ok(conflicts[0].versions.some(v=>v.value.deletedAt));assert.ok(conflicts[0].versions.some(v=>!v.value.deletedAt));
const deletion=conflicts[0].versions.find(v=>v.value.deletedAt);await a.sync('resolve',{id:t.id,heads:conflicts[0].heads,eventId:deletion.eventId});await a.sync('now');await b.sync('now');
assert.ok((await b.local('read')).workspaces[0].todos[0].deletedAt);
// Ambiguous successful upload is pulled/deduplicated after a restart.
await a.local('add',{operationId:'lost_ack_todo',courseKey:course,text:'重试不得重复'});a.state.loseResponse=true;await a.sync('now');assert.ok((await a.status()).pending>0);
a.boot();await a.sync('now');await b.sync('now');assert.equal((await b.local('read')).workspaces[0].todos.filter(t=>t.id==='lost_ack_todo').length,1);assert.equal((await a.status()).pending,0);
// Wrong account cannot pull or upload the bound user's data.
a.state.account='account_b';await a.local('add',{courseKey:course,text:'不得传入另一账号'});const cloudBefore=cloud.size;await a.sync('now');assert.equal((await a.status()).errorCode,'ACCOUNT');assert.equal(cloud.size,cloudBefore);await assert.rejects(a.sync('prepare',{workspaceId:'local'}),{code:'ACCOUNT'});a.state.account='account_a';
await a.sync('disconnect');const net=a.state.network;await a.sync('tick');assert.equal(a.state.network,net,'disconnect disables network sync');
// Atomic local records and outbox: failed save changes neither.
const before=copy(a.state.data);a.state.failWrite=true;await assert.rejects(a.local('add',{courseKey:course,text:'failed write'}));a.state.failWrite=false;assert.deepEqual(a.state.data,before);
// First connect preview must be reconfirmed after intervening local edits.
const c=device('C');const preview=await c.sync('prepare',{workspaceId:'local'});await c.local('catalog',{courses:[{key:course,title:'新内容'}]});await assert.rejects(c.sync('confirm',{ticket:preview.ticket}),{code:'PREVIEW'});
// Invalid remote event with missing parent cannot replace the local dataset.
const localBefore=JSON.stringify((await b.local('read')).workspaces[0].todos);cloud.set('corrupt',{account:'account_a',events:[{id:'bad',device:'remote',entity:'todo',key:'shared_todo',parents:['missing'],value:null}]});await b.sync('now');assert.equal((await b.status()).errorCode,'SYNC_DATA');assert.equal(JSON.stringify((await b.local('read')).workspaces[0].todos),localBefore);cloud.delete('corrupt');
// Content-script messages cannot invoke internal replication writes.
const source=fs.readFileSync('src/background/todo-store.js','utf8'),listeners=[];
const chrome={runtime:{id:'extension',getURL:p=>`chrome-extension://extension/${p}`,onMessage:{addListener:f=>listeners.push(f)}},storage:{local:{get:(k,cb)=>cb({}),set:(_v,cb)=>cb()}}};
vm.runInNewContext(source,{chrome,URL,TextEncoder});const denied=await new Promise(resolve=>listeners[0]({type:'ku:todo',action:'__syncAttach',workspaceId:'local'},{id:'extension',url:'https://kulms.tl.kansai-u.ac.jp/webclass/'},resolve));assert.equal(denied.ok,false);
console.log('PASS: two-device offline merge, causal conflicts, delete/edit, restart/outbox, lost upload ACK, account isolation, consent preview and internal message boundary');
// Two PCs can start with the same exported backup. Equal heads are not a conflict,
// and editing after the merge must advance both identical ancestors.
const d=device('D'),e=device('E');d.state.account='account_c';e.state.account='account_c';
const backup=await b.local('export');
for(const dev of [d,e]) {const p=await dev.local('previewImport',{data:backup});await dev.local('import',{data:backup,expectedRevision:p.revision});}
await connect(d);await connect(e);await d.sync('now');
const shared=(await e.local('read')).workspaces[0].todos.find(t=>!t.deletedAt);
await e.local('update',{id:shared.id,expectedRevision:shared.revision,text:'相同初始备份之后编辑'});await e.sync('now');await d.sync('now');
assert.equal((await d.status()).conflicts.length,0,'identical prior heads should be advanced together');
console.log('PASS: identical backup migration does not create false concurrent conflicts');
// Export must retain text from every unresolved branch, not only the displayed winner.
const f=device('F'),g=device('G');f.state.account='export_account';g.state.account='export_account';
await f.local('catalog',{courses:[{key:course,title:'Course'}]});await f.local('add',{operationId:'shared_todo',courseKey:course,text:'base'});await connect(f);await connect(g);
await edit(f,'新的 F 分支');await edit(g,'新的 G 分支');await f.sync('now');await g.sync('now');await f.sync('now');
const versions=(await f.status()).conflicts.flatMap(c=>c.versions.map(v=>v.value?.text).filter(Boolean));
const allExported=(await f.local('export')).todos.map(t=>t.text);
assert.ok(versions.every(text=>allExported.includes(text)),'external backup must not omit an unresolved text version');
console.log('PASS: external export preserves unresolved text versions');
assert.equal((await f.local('read')).schemaVersion,3,'completion-aware replication protects history from old schema-1/2 writers');
assert.equal((await device('unused').local('read')).schemaVersion,1,'legacy local-only stores remain readable without migration');
console.log('PASS: schema migration protects replication metadata from accidental downgrade');

const ca = device('completion A'), cb = device('completion B');
ca.state.account = cb.state.account = 'completion_account';
const assignmentKey = `${course}contents/completion_1/`;
const completionPayload = async (dev, completed) => {
  const w = (await dev.local('read')).workspaces[0], t = w.assignmentCompletions.find(t => t.key === assignmentKey);
  return { course: { key: course, title: 'Completion course' }, contentId: 'completion_1', title: '課題', assignmentType: '試験', completed,
    expectedRevision: t?.revision || 0, expectedHeads: w.replica ? [...dev.context.KuTodoReplica.headsFor(w.replica, 'assignment', assignmentKey)] : [] };
};
await ca.local('setAssignment', await completionPayload(ca, false));
await connect(ca); await connect(cb);
assert.equal((await cb.local('read')).workspaces[0].assignmentCompletions[0].completed, false);
const legacyCloudBatches = [...cloud.values()].filter(f => f.account === 'completion_account');
assert.ok(legacyCloudBatches.every(f => f.events.every(e => e.entity === 'assignment') || f.events.every(e => e.entity !== 'assignment')), 'completion events never share a TODO batch');
// Same-state concurrent writes converge without inventing a conflict from timestamps.
ca.state.offline = cb.state.offline = true;
await ca.local('setAssignment', await completionPayload(ca, true));
await cb.local('setAssignment', await completionPayload(cb, true));
await ca.sync('now'); assert.ok((await ca.status()).pendingAssignments > 0);
ca.boot(); assert.ok((await ca.status()).pendingAssignments > 0);
ca.state.offline = cb.state.offline = false;
await ca.sync('now'); await cb.sync('now'); await ca.sync('now');
assert.equal((await ca.status()).conflicts.length, 0);
assert.equal((await ca.local('read')).workspaces[0].assignmentCompletions[0].completed, true);
// Opposite branches stay visible as unfinished until explicitly confirmed.
await ca.local('setAssignment', await completionPayload(ca, false));
const staleCompletion = await completionPayload(cb, true);
await cb.local('setAssignment', staleCompletion);
await ca.sync('now'); await cb.sync('now'); await ca.sync('now');
const completionConflict = (await ca.status()).conflicts.find(c => c.entity === 'assignment');
assert.equal(completionConflict.versions.length, 2);
assert.equal((await ca.local('read')).workspaces[0].assignmentCompletions[0].completed, false);
const conflictBackup = await ca.local('export');
assert.equal(conflictBackup.todos.length, 0, 'completion conflicts never become TODO backup copies');
assert.equal(conflictBackup.assignmentConflicts[0].versions.length, 2, 'external backup retains every completion alternative');
await assert.rejects(cb.local('setAssignment', staleCompletion), { code: 'CONFLICT' });
await ca.local('setAssignment', await completionPayload(ca, true));
await ca.sync('now'); await cb.sync('now');
assert.equal((await cb.status()).conflicts.length, 0);
assert.equal((await cb.local('read')).workspaces[0].assignmentCompletions[0].completed, true);
// Undo, lost upload acknowledgement and account mismatch retain the explicit false event.
await cb.local('setAssignment', await completionPayload(cb, false)); cb.state.loseResponse = true;
await cb.sync('now'); assert.ok((await cb.status()).pendingAssignments > 0);
cb.boot(); await cb.sync('now'); await ca.sync('now');
assert.equal((await ca.local('read')).workspaces[0].assignmentCompletions[0].completed, false);
assert.equal((await cb.status()).pending, 0);
const completionEvents = (await ca.local('read')).workspaces[0].replica.events.filter(e => e.entity === 'assignment');
assert.equal(new Set(completionEvents.map(e => e.id)).size, completionEvents.length);
await cb.local('setAssignment', await completionPayload(cb, true));
cb.state.account = 'wrong_completion_account'; const beforeWrongAccount = cloud.size;
await cb.sync('now'); assert.equal((await cb.status()).errorCode, 'ACCOUNT'); assert.equal(cloud.size, beforeWrongAccount);
cb.state.account = 'completion_account';
const changedPreviewDevice = device('completion preview'); changedPreviewDevice.state.account = 'preview_completion';
const completionPreview = await changedPreviewDevice.sync('prepare', { workspaceId: 'local' });
await changedPreviewDevice.local('setAssignment', await completionPayload(changedPreviewDevice, true));
await assert.rejects(changedPreviewDevice.sync('confirm', { ticket: completionPreview.ticket }), { code: 'PREVIEW' });
// Existing v2 replicas migrate without losing their event graph or pending uploads.
const oldSyncDb = copy(ca.state.data.kuLmsTodosV1);
oldSyncDb.schemaVersion = 2;
for (const w of oldSyncDb.workspaces) { delete w.assignmentCompletions; w.replica.schemaVersion = 1; w.replica.events = w.replica.events.filter(e => e.entity !== 'assignment'); w.replica.outbox = []; }
const migratedDevice = device('v2 migration'); migratedDevice.state.data.kuLmsTodosV1 = copy(oldSyncDb); migratedDevice.boot();
await migratedDevice.local('setAssignment', await completionPayload(migratedDevice, true));
assert.deepEqual(migratedDevice.state.data.kuLmsTodosBeforeCompletionV3, oldSyncDb);
assert.ok(oldSyncDb.workspaces[0].replica.events.every(e => migratedDevice.state.data.kuLmsTodosV1.workspaces[0].replica.events.some(v => v.id === e.id)));
console.log('PASS: completion batch isolation, offline/restart convergence, causal conflict confirmation, undo, lost ACK, account isolation and v2 migration');
