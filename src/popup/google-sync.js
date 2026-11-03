/* Google sync controls intentionally live only in the extension popup. */
(() => {
  const host = document.getElementById('google-sync-panel');
  if (!host) return;
  let state = null, busy = false, ticket = '', serial = 0, timer = null;
  const q = name => host.querySelector(`[data-sync-${name}]`);
  const request = (action, payload = {}) => new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ ...payload, type: 'ku:todo-sync', action }, response => {
        if (chrome.runtime.lastError || !response) { reject(new Error('无法连接同步服务，请重新加载扩展。')); return; }
        if (!response.ok) { reject(new Error(response.error || '同步失败，本地内容保留。')); return; }
        resolve(response.data);
      });
    } catch (_) { reject(new Error('同步服务不可用，请重新加载扩展。')); }
  });
  host.innerHTML = `<details class="google-sync"><summary>Google 同步 <span data-sync-badge>读取中</span></summary>
    <p class="google-sync-hint" data-sync-account></p><p data-sync-status role="status" aria-live="polite"></p>
    <p class="error" data-sync-capacity hidden></p><p class="google-sync-hint" data-sync-times></p><a data-sync-guide href="google-sync-setup.html" target="_blank" rel="noopener">首次配置指南</a>
    <div class="google-sync-actions"><button type="button" data-sync-connect>连接 Google 账号</button><button type="button" data-sync-now>立即同步</button><button type="button" data-sync-disconnect>断开连接</button></div>
    <section data-sync-preview hidden><p data-sync-preview-text></p><button type="button" data-sync-confirm>备份并合并，开启同步</button><button type="button" data-sync-cancel>取消</button></section>
    <div data-sync-conflicts></div></details>`;
  const message = (text, error = false) => { q('status').textContent = text; q('status').classList.toggle('error', error); };
  function showPreview(data) {
    if (ticket === data.ticket && !q('preview').hidden) return;
    ticket = data.ticket;
    q('preview-text').textContent = `账号：${data.account.email || data.account.name}。资料「${data.workspaceName}」TODO 本地 ${data.localCount} 条，合并后 ${data.mergedCount} 条；课题状态本地 ${data.localAssignments || 0} 条，合并后 ${data.mergedAssignments || 0} 条。${data.conflicts} 条冲突会保留版本供选择。课程目录、正式 TODO（含截止时间）、删除状态和课题完成状态会同步；草稿仅保存在本机。新版写入 TODO 后，旧版扩展将停止同步，请更新其他设备的扩展。`;
    q('preview').hidden = false;
  }
  function poll() {
    if (busy || state?.preparing || state?.running) {
      if (timer === null) timer = setTimeout(() => { timer = null; void refresh(); }, 1000);
    } else { clearTimeout(timer); timer = null; }
  }
  function progressText(progress) {
    if (!progress) return '';
    return { auth: '正在连接 Google…', list: '正在获取云端文件列表…',
      download: `正在读取云端历史：已下载 ${progress.done} / ${progress.total} 个批次`, merge: '正在计算合并预览…' }[progress.phase];
  }
  function render(data) {
    state = data;
    const keys = new Set(data.courseScope?.keys || []);
    const conflicts = data.workspaceId === data.activeWorkspaceId
      ? (data.conflicts || []).filter(conflict => conflict.entity === 'assignment' || conflict.versions.some(version => version.value && keys.has(version.value.courseKey))) : [];
    const label = !data.configured ? '尚未配置' : data.preparing ? '连接中' : data.running ? '同步中' : !data.enabled ? '未连接' : data.error ? '需要处理' : conflicts.length ? `${conflicts.length} 条冲突` : data.pending ? '待上传' : '已检查';
    q('badge').textContent = label;
    q('account').textContent = data.enabled ? `${data.account?.email || data.account?.name || 'Google 账号'} · ${data.workspaceName}` : `当前本地资料：${data.activeWorkspaceName}`;
    const activity = (data.preparing || data.running) && progressText(data.progress);
    message(activity || (data.preview ? '请确认账号和合并范围。尚未上传本地内容。' : '') || data.error || (!data.configured ? '先完成一次性 Google Cloud 配置。本地 TODO 和课题状态可正常使用。' : !data.enabled ? '一个 Google 账号对应一个云端资料库。连接前会预览合并结果。' : conflicts.length ? `有 ${conflicts.length} 条记录需要选择版本，所有分支已保留。` : data.pending ? `已保存到本机，${data.pending} 条变更待上传（课题状态 ${data.pendingAssignments || 0} 条）。` : '本机没有待上传变更；另一台电脑会在检查云端后更新。'), !!data.error && !activity && !data.preview);
    const format = value => value ? new Date(value).toLocaleString() : '尚无';
    q('times').textContent = data.enabled ? `上次检查：${format(data.lastCheck)}；上次上传：${format(data.lastUpload)}` : '';
    if (data.preview) showPreview(data.preview);
    else { ticket = ''; q('preview').hidden = true; }
    const ratio = data.storageBytes / data.storageLimit;
    q('capacity').hidden = !(ratio >= 0.8);
    q('capacity').textContent = ratio >= 0.8 ? `本地 TODO 数据已使用 ${Math.round(ratio * 100)}%（上限 4MB）。达到上限后将无法保存修改，请先导出备份。` : '';
    const locked = busy || data.preparing || data.running;
    q('confirm').disabled = q('cancel').disabled = !!locked;
    q('connect').disabled = locked || !data.configured;
    q('connect').textContent = data.enabled ? '重新授权 / 连接当前资料' : '连接 Google 账号';
    q('now').disabled = locked || !data.enabled;
    q('disconnect').disabled = locked || !data.enabled;
    q('conflicts').replaceChildren();
    for (const conflict of conflicts) {
      const section = document.createElement('section'); section.className = 'google-sync-conflict';
      const assignment = conflict.entity === 'assignment';
      const title = document.createElement('h3'); title.textContent = assignment ? '这项课题的完成状态有冲突' : '这条 TODO 有多个版本'; section.append(title);
      for (const version of conflict.versions) {
        const row = document.createElement('div'), text = document.createElement('p'), choose = document.createElement('button');
        text.textContent = version.value ? (assignment ? `${version.value.title}（${version.value.completed ? '已完成' : '未完成'}）` : `${version.value.text}（${version.value.deletedAt ? '已删除' : version.value.completedAt ? '已完成' : '未完成'}；${version.value.dueAt ? '截止：' + new Date(version.value.dueAt).toLocaleString(undefined, { timeZoneName: 'short' }) : '无截止时间'}）`) : '永久删除的版本';
        choose.type = 'button'; choose.textContent = '选择此版本'; choose.disabled = !!locked;
        choose.addEventListener('click', () => void execute('resolve', { entity: conflict.entity || 'todo', id: conflict.key, heads: conflict.heads, eventId: version.eventId }));
        row.append(text, choose); section.append(row);
      }
      q('conflicts').append(section);
    }
    poll();
  }
  async function refresh() {
    const token = ++serial;
    try { const data = await request('status'); if (token === serial) render(data); }
    catch (error) { if (token === serial) { q('badge').textContent = '不可用'; message(error.message, true); } }
    finally { if (token === serial) poll(); }
  }
  async function execute(action, payload = {}) {
    if (busy) return;
    let failure = null;
    busy = true; ++serial;
    if (state && action === 'prepare') state = { ...state, preparing: true, progress: { phase: 'auth', done: 0, total: 0 }, preview: null };
    if (state) render(state);
    message(action === 'prepare' ? '正在连接 Google…' : '处理中，本地 TODO 仍保留…');
    try {
      const data = await request(action, payload);
      state = action === 'prepare' ? { ...state, preparing: false, running: false, progress: null, preview: data } : data;
    } catch (error) {
      failure = error;
      if (state) state = { ...state, preparing: false, running: false, progress: null };
    } finally {
      busy = false; ++serial;
      if (state) render(state);
      if (failure) message(failure.message, true);
    }
  }
  q('connect').addEventListener('click', () => { if (state) void execute('prepare', { workspaceId: state.activeWorkspaceId }); });
  q('now').addEventListener('click', () => void execute('now'));
  q('confirm').addEventListener('click', () => { if (ticket) void execute('confirm', { ticket }); });
  q('cancel').addEventListener('click', () => void execute('cancel'));
  q('disconnect').addEventListener('click', () => { if (window.confirm('断开此设备的 Google 同步？本地及云端记录都会保留。')) void execute('disconnect'); });
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes.kuLmsGoogleSyncV1 || changes.kuLmsTodosV1)) void refresh(); });
  void refresh().then(() => { if (state?.enabled && !state.preparing && !state.running && !state.preview) void execute('tick'); });
})();
