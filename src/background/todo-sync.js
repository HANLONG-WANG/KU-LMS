/* Network/config queue. The atomic durable outbox stays inside the TODO store. */
var KuTodoSync = (() => {
  const KEY = 'kuLmsGoogleSyncV1', ALARM = 'ku-lms-todo-sync';
  function fail(code, message) { const e = new Error(message); e.code = code; throw e; }
  function create({ store, storage, drive, configured = () => true, uuid = () => crypto.randomUUID(), now = () => Date.now() }) {
    let queue = Promise.resolve(), preview = null, running = false;
    const getConfig = async () => (await storage.get(KEY))[KEY] || { enabled: false };
    const saveConfig = config => storage.set({ [KEY]: config });
    const workspace = async workspaceId => store.dispatch({ action: '__syncRead', workspaceId });
    const local = (action, workspaceId, payload = {}) => store.dispatch({ action, workspaceId, operationId: uuid(), ...payload });
    async function status() {
      const config = await getConfig(), db = await store.dispatch({ action: 'read' });
      const active = db.workspaces.find(w => w.id === db.activeId), linked = db.workspaces.find(w => w.id === config.workspaceId);
      return {
        configured: configured(), enabled: config.enabled === true, running,
        account: config.account || null, workspaceId: config.workspaceId || '', workspaceName: linked?.name || '',
        activeWorkspaceId: active.id, activeWorkspaceName: active.name,
        boundAccount: active.replica?.accountId || '', pending: linked?.replica?.outbox.length || 0,
        conflicts: linked?.replica ? KuTodoReplica.conflicts(linked.replica) : [],
        lastCheck: config.lastCheck || null, lastUpload: config.lastUpload || null,
        error: config.error || '', errorCode: config.errorCode || '', retryAt: config.retryAt || 0
      };
    }
    async function pull(account, w) {
      const files = await drive.list(), known = new Set(w.replica?.files || []), events = [], downloaded = [];
      let size = 0;
      for (const file of files) {
        if (known.has(file.id)) continue;
        const batch = await drive.download(file.id, account.id);
        size += new TextEncoder().encode(JSON.stringify(batch)).length;
        if (size > 4 * 1024 * 1024) fail('QUOTA', '首次同步数据超过本地安全容量。请保留现有数据并导出备份。');
        events.push(...batch); downloaded.push(file.id);
      }
      return { events, files: downloaded };
    }
    async function synchronize(manual = false) {
      const config = await getConfig();
      if (!config.enabled) return status();
      if (!configured()) fail('CONFIG', 'Google 同步尚未配置。');
      if (!manual && config.retryAt > now()) return status();
      if (!manual && Date.parse(config.lastCheck || '') > now() - 30000) {
        const recent = await workspace(config.workspaceId);
        if (!recent.replica?.outbox.length) return status();
      }
      running = true;
      try {
        await drive.authorize(false);
        const account = await drive.account();
        if (account.id !== config.account?.id) fail('ACCOUNT', '当前 Google 账号与绑定账号不同，已暂停上传。请切回原账号或在新的本地资料中连接。');
        let w = await workspace(config.workspaceId);
        if (w.replica?.accountId !== account.id) fail('ACCOUNT', '资料与 Google 账号不匹配，未上传。');
        const incoming = await pull(account, w);
        if (incoming.files.length) await local('__syncMerge', w.id, { accountId: account.id, ...incoming });
        w = await workspace(w.id);
        const pending = new Set(w.replica.outbox), events = w.replica.events.filter(e => pending.has(e.id));
        let offset = 0;
        while (offset < events.length) {
          const batch = []; let bytes = 0;
          while (offset < events.length) {
            const e = events[offset], length = new TextEncoder().encode(JSON.stringify(e)).length;
            if (batch.length && bytes + length > 384 * 1024) break;
            batch.push(e); bytes += length; offset++;
          }
          const fileId = await drive.upload(batch, account.id);
          await local('__syncAck', w.id, { accountId: account.id, ids: batch.map(e => e.id), files: [fileId] });
          config.lastUpload = new Date(now()).toISOString();
        }
        config.lastCheck = new Date(now()).toISOString(); config.error = ''; config.errorCode = ''; config.failures = 0; config.retryAt = 0;
        await saveConfig(config);
      } catch (error) {
        config.error = error.message || '同步失败，本地记录保留。'; config.errorCode = error.code || 'STORAGE';
        config.failures = Math.min((config.failures || 0) + 1, 8);
        config.retryAt = now() + Math.min(60 * 60 * 1000, 60000 * 2 ** (config.failures - 1));
        await saveConfig(config);
      } finally { running = false; }
      return status();
    }
    async function perform(action, payload = {}) {
      if (action === 'now') return synchronize(true);
      if (action === 'tick') return synchronize(false);
      if (action === 'prepare') {
        if (!configured()) fail('CONFIG', '请先按配置指南设置 Google OAuth 客户端。');
        const db = await store.dispatch({ action: 'read' }), w = db.workspaces.find(w => w.id === payload.workspaceId);
        if (!w) fail('INVALID', '请选择要同步的本地资料。');
        await drive.authorize(true);
        const account = await drive.account();
        if (w.replica && w.replica.accountId !== account.id) fail('ACCOUNT', '此资料绑定了另一个 Google 账号。请新建本地资料后连接。');
        const incoming = await pull(account, w), candidate = JSON.parse(JSON.stringify(w));
        KuTodoReplica.attach(candidate, account.id, uuid); KuTodoReplica.merge(candidate, incoming.events, incoming.files);
        preview = { ticket: uuid(), account, workspaceId: w.id, fingerprint: JSON.stringify([w.courses, w.todos]), incoming, expires: now() + 5 * 60 * 1000 };
        return { ticket: preview.ticket, account, workspaceName: w.name, localCount: w.todos.length, mergedCount: candidate.todos.length, conflicts: KuTodoReplica.conflicts(candidate.replica).length };
      }
      if (action === 'confirm') {
        if (!preview || preview.ticket !== payload.ticket || preview.expires < now()) fail('PREVIEW', '连接预览已过期，请重新连接。');
        const selected = preview, w = await workspace(selected.workspaceId);
        if (JSON.stringify([w.courses, w.todos]) !== selected.fingerprint) fail('PREVIEW', '本地内容在预览后发生变化，请重新预览。');
        await drive.authorize(false);
        if ((await drive.account()).id !== selected.account.id) fail('ACCOUNT', 'Google 账号在预览后改变，请重新连接。');
        await local('__syncAttach', w.id, { accountId: selected.account.id });
        await local('__syncMerge', w.id, { accountId: selected.account.id, ...selected.incoming });
        await saveConfig({ enabled: true, account: selected.account, workspaceId: w.id, error: '', retryAt: 0 });
        preview = null;
        return synchronize(true);
      }
      if (action === 'disconnect') {
        const config = await getConfig(); config.enabled = false; config.error = ''; config.errorCode = ''; preview = null;
        await saveConfig(config);
        return status();
      }
      if (action === 'resolve') {
        const config = await getConfig();
        if (!config.workspaceId || !config.account) fail('ACCOUNT', '此设备还没有绑定同步资料。');
        await local('__syncResolve', config.workspaceId, { accountId: config.account.id, id: payload.id, heads: payload.heads, eventId: payload.eventId });
        return status();
      }
      fail('INVALID', '未知的同步操作。');
    }
    return {
      status,
      handle(action, payload) {
        const result = queue.then(() => perform(action, payload)); queue = result.catch(() => {}); return result;
      }
    };
  }
  function install({ chrome, store }) {
    const storage = {
      get(key) { return new Promise((resolve, reject) => chrome.storage.local.get(key, data => chrome.runtime.lastError ? reject(new Error('无法读取同步设置。')) : resolve(data))); },
      set(value) { return new Promise((resolve, reject) => chrome.storage.local.set(value, () => chrome.runtime.lastError ? reject(new Error('无法保存同步设置，本地 TODO 保留。')) : resolve())); }
    };
    const configured = () => {
      const manifest = chrome.runtime.getManifest();
      return !!manifest.key && /^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(manifest.oauth2?.client_id || '') && manifest.oauth2?.scopes?.includes(KuTodoDrive.SCOPE);
    };
    const drive = KuTodoDrive.create({
      getToken(interactive) {
        return new Promise((resolve, reject) => chrome.identity.getAuthToken({ interactive, scopes: [KuTodoDrive.SCOPE] }, token => {
          if (chrome.runtime.lastError || !token) reject(new Error('需要 Google 授权。')); else resolve(typeof token === 'string' ? token : token.token);
        }));
      },
      removeToken(token) { return new Promise(resolve => chrome.identity.removeCachedAuthToken({ token }, () => resolve())); }
    });
    const service = create({ store, storage, drive, configured });
    let timer = null;
    const run = manual => service.handle(manual ? 'now' : 'tick').catch(() => {});
    chrome.runtime.onMessage.addListener((message, sender, respond) => {
      if (message?.type === 'ku:todo' && message.action === 'read' && sender?.id === chrome.runtime.id
        && /^https:\/\/kulms\.tl\.kansai-u\.ac\.jp\/webclass\//.test(sender.url || '')) {
        void run(false);
        return undefined;
      }
      if (message?.type !== 'ku:todo-sync') return undefined;
      // OAuth controls only exist in extension pages, never in a host website.
      if (sender?.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) { respond({ ok: false, error: '请在扩展弹窗中管理 Google 同步。' }); return false; }
      const result = message.action === 'status' ? service.status() : service.handle(message.action, message);
      result.then(data => respond({ ok: true, data })).catch(error => respond({ ok: false, code: error.code || 'SYNC', error: error.code ? error.message : '同步失败，本地记录仍保留。' }));
      return true;
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[KuTodoStore.KEY]) return;
      const before = changes[KuTodoStore.KEY].oldValue?.workspaces || [], after = changes[KuTodoStore.KEY].newValue?.workspaces || [];
      const increased = after.some(w => (w.replica?.outbox.length || 0) > (before.find(v => v.id === w.id)?.replica?.outbox.length || 0));
      if (!increased || timer) return;
      timer = setTimeout(() => { timer = null; void run(false); }, 3000);
    });
    chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM) void run(false); });
    const schedule = () => { chrome.alarms.create(ALARM, { periodInMinutes: 1 }); void run(false); };
    chrome.runtime.onStartup?.addListener(schedule);
    chrome.runtime.onInstalled.addListener(schedule);
    chrome.alarms.get(ALARM, alarm => { if (!alarm) chrome.alarms.create(ALARM, { periodInMinutes: 1 }); });
    return service;
  }
  return { KEY, create, install };
})();
