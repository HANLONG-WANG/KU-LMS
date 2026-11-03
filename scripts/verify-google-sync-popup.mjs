import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
const source = fs.readFileSync('src/popup/google-sync.js', 'utf8');
const tick = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r)); };
const preview = ticket => ({ ticket, account: { email: 'me@example.test' }, workspaceName: '本地待办', localCount: 1, mergedCount: 2, conflicts: 0 });
function popup(initial = {}) {
  const { document } = parseHTML('<html><body><section id="google-sync-panel"></section></body></html>');
  const backend = { configured: false, enabled: false, running: false, preparing: false, progress: null, preview: null,
    activeWorkspaceId: 'local', activeWorkspaceName: '本地待办', conflicts: [], pending: 0, storageBytes: 10, storageLimit: 100, ...initial };
  const calls = [], timers = new Map(); let timerId = 0, pendingPrepare = null, delayPrepare = false, confirmFails = true;
  const chrome = { runtime: { sendMessage(message, reply) {
    calls.push(message);
    if (message.action === 'prepare') {
      if (delayPrepare) { pendingPrepare = reply; backend.preparing = true; backend.progress = { phase: 'auth', done: 0, total: 0 }; return; }
      backend.preview = preview('prepared'); reply({ ok: true, data: backend.preview }); return;
    }
    if (message.action === 'confirm' && confirmFails) { reply({ ok: false, error: '确认时账号已改变，请重新连接。' }); return; }
    if (message.action === 'cancel' || message.action === 'confirm') backend.preview = null;
    reply({ ok: true, data: structuredClone(backend) });
  } }, storage: { onChanged: { addListener(fn) { chrome.change = fn; } } } };
  vm.runInNewContext(source, { document, window: { confirm: () => true }, chrome, Date,
    setTimeout(fn, ms) { assert.equal(ms, 1000); timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); } });
  return { backend, calls, timers, q: name => document.querySelector(`[data-sync-${name}]`),
    change() { chrome.change({ kuLmsGoogleSyncV1: {} }, 'local'); },
    async poll() { assert.equal(timers.size, 1, 'only one polling timer'); const [id, callback] = [...timers][0]; timers.delete(id); callback(); await tick(); },
    delay() { delayPrepare = true; },
    finishPrepare() { pendingPrepare({ ok: true, data: backend.preview }); },
    allowConfirm() { confirmFails = false; }
  };
}
const first = popup(); await tick();
assert.equal(first.q('connect').disabled, true); assert.match(first.q('badge').textContent, /尚未配置/);
assert.equal(first.calls.filter(c => c.action === 'prepare').length, 0, 'no surprise OAuth on load');
assert.equal(first.q('capacity').hidden, true); assert.equal(first.timers.size, 0);
first.backend.configured = true; first.change(); await tick();
first.q('connect').click(); await tick();
assert.equal(first.q('preview').hidden, false); assert.match(first.q('preview-text').textContent, /me@example.test/);
assert.equal(first.calls.filter(c => c.action === 'confirm').length, 0, 'preview does not confirm itself');
first.q('confirm').click(); await tick();
assert.equal(first.calls.find(c => c.action === 'confirm').ticket, 'prepared');
assert.match(first.q('status').textContent, /确认时账号已改变/, 'refresh must not hide a failed confirmation');
first.q('cancel').click(); await tick();
assert.equal(first.calls.at(-1).action, 'cancel'); assert.equal(first.q('preview').hidden, true);

// A newly opened popup sees ongoing prepare without having clicked Connect.
const reopened = popup({ configured: true, preparing: true, progress: { phase: 'download', done: 3, total: 20 }, storageBytes: 80 });
await tick();
assert.equal(reopened.q('badge').textContent, '连接中');
assert.match(reopened.q('status').textContent, /已下载 3 \/ 20 个批次/);
for (const name of ['connect', 'now', 'disconnect']) assert.equal(reopened.q(name).disabled, true);
assert.equal(reopened.q('capacity').hidden, false); assert.match(reopened.q('capacity').textContent, /80%.*4MB/);
reopened.change(); reopened.change(); await tick(); assert.equal(reopened.timers.size, 1);
Object.assign(reopened.backend, { preparing: false, progress: null, preview: preview('restored-ticket') });
await reopened.poll();
assert.equal(reopened.timers.size, 0, 'polling stops when prepare finishes');
assert.equal(reopened.q('preview').hidden, false);
assert.equal(reopened.calls.filter(c => c.action === 'prepare').length, 0);
reopened.allowConfirm(); reopened.q('confirm').click(); await tick();
assert.equal(reopened.calls.find(c => c.action === 'confirm').ticket, 'restored-ticket');
assert.equal(reopened.q('preview').hidden, true);
Object.assign(reopened.backend, { enabled: true, running: true, progress: { phase: 'download', done: 5, total: 9 }, storageBytes: 79 });
reopened.change(); await tick();
assert.equal(reopened.q('badge').textContent, '同步中'); assert.match(reopened.q('status').textContent, /已下载 5 \/ 9 个批次/);
assert.equal(reopened.q('capacity').hidden, true);
Object.assign(reopened.backend, { running: false, progress: null }); await reopened.poll();
assert.equal(reopened.timers.size, 0);

// Polling stays active while this popup awaits prepare; both preview paths agree.
const active = popup({ configured: true }); await tick(); active.delay();
active.q('connect').click(); await tick(); await active.poll();
assert.match(active.q('status').textContent, /正在连接 Google/);
Object.assign(active.backend, { progress: { phase: 'download', done: 4, total: 8 } }); await active.poll();
assert.match(active.q('status').textContent, /已下载 4 \/ 8 个批次/);
Object.assign(active.backend, { preparing: false, progress: null, preview: preview('same-ticket') }); await active.poll();
assert.equal(active.q('preview').hidden, false);
const previewText = active.q('preview-text').textContent;
active.finishPrepare(); await tick();
assert.equal(active.q('preview-text').textContent, previewText); assert.equal(active.timers.size, 0);
active.allowConfirm(); active.q('confirm').click(); await tick();
assert.equal(active.calls.find(c => c.action === 'confirm').ticket, 'same-ticket');
console.log('PASS: OAuth consent, persistent failure UI, prepare/sync polling, restored preview tickets, cancellation and capacity warning');
