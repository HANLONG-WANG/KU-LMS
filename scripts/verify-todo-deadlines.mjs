import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

// Frozen transport from b24788d: tests must exercise what shipped, not a
// reconstructed version check that could accidentally track the new protocol.
const legacyDrive = fs.readFileSync('scripts/fixtures/todo-legacy/todo-drive-v1.js', 'utf8');
const source = name => fs.readFileSync(`src/background/${name}.js`, 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const course = 'https://kulms.tl.kansai-u.ac.jp/webclass/course.php/deadlines/';
const first = '2030-10-02T09:30:00.000Z', second = '2030-10-03T12:00:00.000Z';
const cloud = new Map(); let sequence = 0;
function device(oldTransport = false) {
  const context = vm.createContext({ URL, URLSearchParams, TextEncoder, AbortController, setTimeout, clearTimeout, crypto: webcrypto });
  for (const name of ['todo-replica', 'todo-sync', 'todo-store']) vm.runInContext(source(name), context);
  vm.runInContext(oldTransport ? legacyDrive : source('todo-drive'), context);
  const state = { data: {}, uploads: 0, failWrite: false, offline: false };
  const storage = {
    async get(key) { return copy(key in state.data ? { [key]: state.data[key] } : {}); },
    async set(value) { if (state.failWrite) throw Error('disk full'); Object.assign(state.data, copy(value)); }
  };
  const drive = context.KuTodoDrive.create({ getToken: async () => 'test', removeToken: async () => {}, fetch: async (url, init = {}) => {
    if (state.offline) throw Error('offline');
    if (url.includes('/about?')) return new Response(JSON.stringify({ user: { permissionId: 'account' } }));
    if (init.method === 'POST') {
      const parts = init.body.split('Content-Type: application/json\r\n\r\n');
      const metadata = JSON.parse(parts[0].split('\r\n\r\n')[1].split('\r\n--')[0]);
      const payload = JSON.parse(parts[1].split('\r\n--')[0]);
      const id = `file_${++sequence}`; cloud.set(id, { metadata, payload }); state.uploads++;
      return new Response(JSON.stringify({ id }));
    }
    if (url.includes('/files?')) {
      const query = new URL(url).searchParams.get('q');
      const files = [...cloud].filter(([, file]) => Object.entries(file.metadata.appProperties).some(([key, value]) => query.includes(`key='${key}'`) && query.includes(`value='${value}'`))).map(([id]) => ({ id, size: '100' }));
      return new Response(JSON.stringify({ files }));
    }
    return new Response(JSON.stringify(cloud.get(url.match(/files\/([^?]+)/)[1]).payload));
  } });
  let store, service;
  const boot = () => { store = context.KuTodoStore.create(storage); service = context.KuTodoSync.create({ store, storage, drive }); };
  boot();
  return { state, context, boot,
    local: (action, payload = {}) => store.dispatch({ action, workspaceId: 'local', operationId: webcrypto.randomUUID(), ...payload }),
    sync: (action, payload) => service.handle(action, payload),
    status: () => service.status()
  };
}
async function connect(d) { const preview = await d.sync('prepare', { workspaceId: 'local' }); return d.sync('confirm', { ticket: preview.ticket }); }
const todos = async d => (await d.local('read')).workspaces[0].todos;
async function update(d, patch) { const t = (await todos(d))[0]; return d.local('update', { id: t.id, expectedRevision: t.revision, ...patch }); }

const a = device();
await a.local('catalog', { courses: [{ key: course, title: 'Deadlines' }] });
await a.local('add', { operationId: 'todo', courseKey: course, text: 'same text', dueAt: first });
assert.equal((await todos(a))[0].dueAt, first);
for (const dueAt of ['', false, 0, {}, 'bad', '2030-02-30T12:00:00.000Z', '2030-10-02T09:30', '2030-10-02T18:30:00+09:00']) {
  const before = copy(a.state.data);
  await assert.rejects(update(a, { dueAt }), { code: 'INVALID' });
  assert.deepEqual(a.state.data, before, 'invalid deadlines cannot partially write');
}
await update(a, { text: 'same text', completed: true });
assert.equal((await todos(a))[0].dueAt, first, 'completion and text-only updates preserve deadline');
await update(a, { completed: false });
let t = (await todos(a))[0]; await a.local('delete', { id: t.id, expectedRevision: t.revision });
t = (await todos(a))[0]; await a.local('restore', { id: t.id, expectedRevision: t.revision });
assert.equal((await todos(a))[0].dueAt, first);
await a.local('draft', { id: 'draft', courseKey: course, text: 'draft', dueAt: second, baseRevision: 0 });
a.boot(); assert.equal((await a.local('read')).workspaces[0].drafts[0].dueAt, second);
const backup = await a.local('export'); assert.equal(backup.schemaVersion, 3); assert.equal(backup.todos[0].dueAt, first);
const imported = device();
await imported.local('import', { data: backup, expectedRevision: 0 });
assert.equal((await todos(imported))[0].dueAt, first);
const legacyBackup = copy(backup); legacyBackup.schemaVersion = 2; delete legacyBackup.todos[0].dueAt;
const oldImport = device(); await oldImport.local('import', { data: legacyBackup, expectedRevision: 0 });
assert.equal((await todos(oldImport))[0].dueAt, null);

// A v3 database upgrades only on a successful write, preserving an exact backup.
const oldDb = copy(a.state.data.kuLmsTodosV1); oldDb.schemaVersion = 3;
oldDb.workspaces[0].todos.forEach(t => delete t.dueAt); oldDb.workspaces[0].drafts.forEach(d => delete d.dueAt);
const migration = device(); migration.state.data.kuLmsTodosV1 = copy(oldDb);
assert.equal((await todos(migration))[0].dueAt, null);
assert.deepEqual(migration.state.data.kuLmsTodosV1, oldDb);
migration.state.failWrite = true; await assert.rejects(update(migration, { dueAt: first }));
assert.deepEqual(migration.state.data, { kuLmsTodosV1: oldDb });
migration.state.failWrite = false; await update(migration, { dueAt: first });
assert.deepEqual(migration.state.data.kuLmsTodosBeforeDeadlineV4, oldDb);
assert.equal(migration.state.data.kuLmsTodosV1.schemaVersion, 4);
await update(migration, { dueAt: second });
assert.deepEqual(migration.state.data.kuLmsTodosBeforeDeadlineV4, oldDb, 'migration backup is not replaced by later edits');

// Seed real v1 wire data using the frozen transport; new clients must read it.
const old = device(true); await old.local('import', { data: legacyBackup, expectedRevision: 0 }); await connect(old);
assert.ok([...cloud.values()].every(f => f.payload.schemaVersion === 1));
const b = device(); await connect(b); assert.equal((await todos(b))[0].dueAt, null);
await update(b, { dueAt: first }); await b.sync('now');
const v2 = [...cloud.values()].find(f => f.payload.schemaVersion === 2);
assert.equal(v2.metadata.appProperties.kuTodoFormat, 'ku-lms-todo-v1', 'v2 remains discoverable to legacy clients');
assert.equal(v2.payload.events.find(e => e.entity === 'todo').value.dueAt, first);
await update(old, { text: 'old pending edit' });
const oldBefore = copy(old.state.data.kuLmsTodosV1), uploadsBefore = old.state.uploads;
await old.sync('now');
assert.equal((await old.status()).errorCode, 'SYNC_DATA', 'shipped client refuses v2');
assert.equal(old.state.uploads, uploadsBefore, 'pull failure prevents pending uploads');
assert.deepEqual(old.state.data.kuLmsTodosV1, oldBefore, 'refusal preserves local TODO and outbox');

const c = device(); await connect(c); assert.equal((await todos(c))[0].dueAt, first);
b.state.offline = true; c.state.offline = true;
await update(b, { dueAt: second }); await update(c, { dueAt: null });
await b.sync('now'); assert.ok((await b.status()).pending > 0); b.boot();
b.state.offline = false; c.state.offline = false;
await b.sync('now'); await c.sync('now'); await b.sync('now');
const conflict = (await b.status()).conflicts[0];
assert.deepEqual(new Set(conflict.versions.map(v => v.value.dueAt)), new Set([second, null]), 'deadline-only conflicts remain visible');
assert.deepEqual(new Set((await b.local('export')).todos.map(t => t.dueAt)), new Set([second, null]), 'backup preserves both deadline versions');
const clear = conflict.versions.find(v => v.value.dueAt === null);
await b.sync('resolve', { id: conflict.key, heads: conflict.heads, eventId: clear.eventId });
await b.sync('now'); await c.sync('now');
assert.equal((await todos(c))[0].dueAt, null); assert.equal((await c.status()).conflicts.length, 0);
await update(b, { dueAt: first }); await b.sync('now'); await c.sync('now');
assert.equal((await todos(c))[0].dueAt, first);

// Unsupported future versions stop the entire sync before merging or uploading.
cloud.set('future', { metadata: copy(v2.metadata), payload: { ...copy(v2.payload), schemaVersion: 99 } });
await update(c, { text: 'pending future format' });
const beforeFuture = copy(c.state.data.kuLmsTodosV1), uploadsFuture = c.state.uploads;
await c.sync('now'); assert.equal((await c.status()).errorCode, 'VERSION');
assert.equal(c.state.uploads, uploadsFuture); assert.deepEqual(c.state.data.kuLmsTodosV1, beforeFuture);
console.log('PASS: deadlines validate, persist, migrate, export/import, sync offline, resolve conflicts and clear; shipped v1 transport rejects v2 without writing or uploading');

const restoreMigration = device();
restoreMigration.state.data = { kuLmsTodosV1: copy(oldDb), kuLmsTodosBeforeImportV1: copy(oldDb) };
await restoreMigration.local('restoreBackup', { expectedRevision: oldDb.revision });
assert.deepEqual(restoreMigration.state.data.kuLmsTodosBeforeDeadlineV4, oldDb);
assert.equal((await restoreMigration.local('read')).schemaVersion, 4);
console.log('PASS: restoring an old snapshot also preserves the pre-upgrade database');
