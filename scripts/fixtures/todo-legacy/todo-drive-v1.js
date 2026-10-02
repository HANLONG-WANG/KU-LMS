/* Google Drive appDataFolder transport. Each uploaded batch is immutable. */
var KuTodoDrive = (() => {
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const TAG = 'ku-lms-todo-v1';
  const ASSIGNMENT_TAG = 'ku-lms-assignment-completion-v1';
  const MAX_BATCH_BYTES = 512 * 1024;
  function failure(code, message, retryable = false) { const e = new Error(message); e.code = code; e.retryable = retryable; return e; }
  function create({ getToken, removeToken, fetch: fetcher = globalThis.fetch, uuid = () => crypto.randomUUID() }) {
    let token = '';
    async function authorize(interactive = false) {
      try { token = await getToken(interactive); }
      catch (_) { throw failure('AUTH', '需要连接或重新授权 Google 账号。本地 TODO 已保留。'); }
      if (!token || typeof token !== 'string') throw failure('AUTH', '未取得 Google 授权。');
    }
    async function request(path, init = {}, maxBytes = 2 * 1024 * 1024) {
      if (!token) throw failure('AUTH', '请先连接 Google 账号。');
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetcher(`https://www.googleapis.com/${path}`, {
          ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` }, signal: controller.signal, credentials: 'omit', redirect: 'error'
        });
        if (response.status === 401) {
          const invalid = token; token = ''; await removeToken(invalid).catch(() => {});
          // Never refresh a token and resume an account-bound write without rechecking identity.
          throw failure('AUTH', 'Google 授权已失效，请重新连接。待上传记录仍保留。');
        }
        if (!response.ok) {
          let reason = ''; try { reason = (await response.json()).error?.errors?.[0]?.reason || ''; } catch (_) { /* No untrusted server message reaches UI. */ }
          const retryable = response.status === 429 || response.status >= 500 || ['rateLimitExceeded', 'userRateLimitExceeded'].includes(reason);
          if (reason === 'storageQuotaExceeded') throw failure('QUOTA', 'Google Drive 空间不足。请腾出空间后重试；本地数据未删除。');
          throw failure(retryable ? 'RETRY' : 'DRIVE', retryable ? 'Google Drive 暂时不可用，将自动重试。' : 'Google Drive 请求失败。请检查 API 配置和应用授权。', retryable);
        }
        const declared = Number(response.headers?.get?.('content-length') || 0);
        if (declared > maxBytes) throw failure('SYNC_DATA', '云端文件过大，未覆盖本地数据。');
        const body = await response.text();
        if (new TextEncoder().encode(body).length > maxBytes) throw failure('SYNC_DATA', '云端文件过大，未覆盖本地数据。');
        try { return JSON.parse(body); } catch (_) { throw failure('SYNC_DATA', '云端数据不是有效 JSON，未覆盖本地数据。'); }
      } catch (error) {
        if (typeof error.code === 'string') throw error;
        throw failure('NETWORK', '网络不可用或请求超时，修改已保存在本机。', true);
      } finally { clearTimeout(timeout); }
    }
    async function account() {
      const data = await request('drive/v3/about?fields=user(permissionId,emailAddress,displayName)');
      if (!data.user?.permissionId) throw failure('AUTH', '无法确认 Google 账号身份，未进行同步。');
      return { id: String(data.user.permissionId), email: String(data.user.emailAddress || ''), name: String(data.user.displayName || '') };
    }
    async function list() {
      const files = [], seen = new Set(), pages = new Set(); let pageToken = '';
      let pageCount = 0;
      do {
        if (pages.has(pageToken) || ++pageCount > 100) throw failure('DRIVE', '云端分页异常，未覆盖本地数据。', true);
        pages.add(pageToken);
        const params = new URLSearchParams({ spaces: 'appDataFolder', q: `trashed = false and (appProperties has { key='kuTodoFormat' and value='${TAG}' } or appProperties has { key='kuAssignmentFormat' and value='${ASSIGNMENT_TAG}' })`, fields: 'nextPageToken,incompleteSearch,files(id,name,size)', pageSize: '1000' });
        if (pageToken) params.set('pageToken', pageToken);
        const data = await request(`drive/v3/files?${params}`);
        if (data.incompleteSearch || !Array.isArray(data.files)) throw failure('DRIVE', '云端列表不完整，本地数据未覆盖。', true);
        for (const f of data.files) {
          if (typeof f.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(f.id) || Number(f.size) > MAX_BATCH_BYTES) throw failure('SYNC_DATA', '云端文件信息无效。');
          if (!seen.has(f.id)) { files.push(f); seen.add(f.id); }
        }
        pageToken = data.nextPageToken || '';
        if (files.length > 20000) throw failure('QUOTA', '同步历史过多，请先导出备份。');
      } while (pageToken);
      return files;
    }
    async function download(fileId, accountId) {
      const data = await request(`drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {}, MAX_BATCH_BYTES);
      if (![TAG, ASSIGNMENT_TAG].includes(data.format) || data.schemaVersion !== 1 || data.accountId !== accountId || !Array.isArray(data.events) || data.events.length > 2000
        || data.events.some(e => !e || !(data.format === ASSIGNMENT_TAG ? e.entity === 'assignment' : ['course', 'todo'].includes(e.entity)))) throw failure('SYNC_DATA', '云端同步格式或账号不匹配，未覆盖本地数据。');
      return data.events;
    }
    async function upload(events, accountId) {
      const assignments = events.length > 0 && events.every(e => e?.entity === 'assignment');
      if (events.some(e => !e || !(assignments ? e.entity === 'assignment' : ['course', 'todo'].includes(e.entity)))) throw failure('SYNC_DATA', '不同同步格式不能混入同一批次。');
      const format = assignments ? ASSIGNMENT_TAG : TAG;
      const data = JSON.stringify({ format, schemaVersion: 1, accountId, events });
      if (!events.length || new TextEncoder().encode(data).length > MAX_BATCH_BYTES) throw failure('QUOTA', '本次同步批次过大。');
      const boundary = `ku_${uuid()}`, metadata = { name: `${assignments ? 'completion' : 'todo'}-${uuid()}.json`, mimeType: 'application/json', parents: ['appDataFolder'], appProperties: assignments ? { kuAssignmentFormat: format } : { kuTodoFormat: format } };
      const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${data}\r\n--${boundary}--\r\n`;
      const result = await request('upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
      if (typeof result.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(result.id)) throw failure('DRIVE', '未确认上传结果，将安全重试。', true);
      return result.id;
    }
    return { authorize, account, list, download, upload };
  }
  return { create, SCOPE, TAG, ASSIGNMENT_TAG };
})();
