/* Shared editor; user-provided content is always rendered as text. */
var KuTodoUI = {
  mount(host, options = {}) {
    const api = options.client || KuTodoClient;
    const fixedCourseKey = options.fixedCourseKey === undefined ? '' : (api.courseKey?.(options.fixedCourseKey) || '');
    if (options.fixedCourseKey !== undefined && !fixedCourseKey) throw new Error('无法识别固定课程。');
    let db, editor, imported, disposed = false, loading = 0, busy = false, readOnly = false;
    let selected = fixedCourseKey || options.courseKey || '', filter = 'active';
    let pageScope = options.courseScope || null;
    let draftQueue = Promise.resolve();
    const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
    const button = (text, fn, cls = '') => { const n = el('button', `ku-todo-button ${cls}`, text); n.type = 'button'; n.addEventListener('click', fn); return n; };
    host.classList.add('ku-todo-ui');
    host.innerHTML = `<div class="ku-todo-workspace"><label>本地资料<select data-workspace aria-label="本地资料"></select></label><button type="button" class="ku-todo-button" data-new-workspace>新建资料</button></div>
      <form data-workspace-form class="ku-todo-inline" hidden><input aria-label="资料名称" placeholder="资料名称" maxlength="60" required><button class="ku-todo-button">创建</button></form>
      <p class="ku-todo-hint">保存在此浏览器，不会自动跟随 LMS 账号切换。</p>
      <p class="ku-todo-hint" data-course-scope></p>
      <label class="ku-todo-field">课程<select data-course aria-label="筛选课程"></select></label><input class="ku-todo-search" data-search type="search" aria-label="搜索课程或待办" placeholder="搜索课程或待办…">
      <div class="ku-todo-toolbar"><div class="ku-todo-filters" role="group" aria-label="待办状态"><button type="button" class="ku-todo-button" data-filter="active">未完成</button><button type="button" class="ku-todo-button" data-filter="done">已完成</button><button type="button" class="ku-todo-button" data-filter="trash">回收站</button></div><button class="ku-todo-button ku-todo-primary" type="button" data-add>＋ 新增</button></div>
      <div class="ku-todo-status" data-status role="status" aria-live="polite">读取中…</div><button type="button" class="ku-todo-button" data-retry hidden>重新读取</button>
      <form class="ku-todo-editor" data-editor hidden><h3 data-editor-title>新增 TODO</h3><label class="ku-todo-field">课程<select data-editor-course required></select></label><label class="ku-todo-field">内容<textarea id="ku-todo-editor-text" data-editor-text aria-label="TODO 内容" maxlength="2000" rows="4" required></textarea></label><p class="ku-todo-hint" data-draft-status aria-live="polite"></p><div class="ku-todo-conflict" data-conflict hidden><p data-conflict-text></p><button type="button" class="ku-todo-button" data-conflict-save>确认以我的内容保存</button></div><div class="ku-todo-inline"><button class="ku-todo-button ku-todo-primary" data-save>保存</button><button class="ku-todo-button" type="button" data-cancel>收起（保留草稿）</button></div></form>
      <div data-list class="ku-todo-list"></div><details class="ku-todo-drafts"><summary>未提交的草稿 <span data-draft-count></span></summary><div data-drafts></div></details>
      <details class="ku-todo-backup"><summary>备份与恢复</summary><p class="ku-todo-hint">卸载扩展会清除本地数据。备份包含课程、待办和课题完成状态。TODO 冲突另存副本；课题状态冲突需先统一状态再导入。</p><div class="ku-todo-inline"><button type="button" class="ku-todo-button" data-export>导出当前资料</button><label class="ku-todo-file">导入 JSON<input data-file type="file" accept=".json,application/json"></label></div><div class="ku-todo-import" data-preview hidden><p data-preview-text></p><button type="button" class="ku-todo-button" data-import>确认合并导入</button><button type="button" class="ku-todo-button" data-import-cancel>取消</button></div><button type="button" class="ku-todo-button" data-restore>恢复导入前快照</button></details>`;
    const q = name => host.querySelector(`[data-${name}]`);
    if (fixedCourseKey) {
      host.classList.add('ku-todo-fixed');
      host.querySelector('.ku-todo-workspace').remove();
      q('workspace-form').remove();
      host.querySelector('.ku-todo-hint').remove();
      q('course').closest('label').remove();
      q('editor-course').closest('label').remove();
      host.querySelector('.ku-todo-backup').remove();
      q('search').placeholder = '搜索当前课程待办…';
      q('search').setAttribute('aria-label', '搜索当前课程待办');
    }
    const on = (name, event, fn) => q(name)?.addEventListener(event, fn);
    const current = () => db?.workspaces.find(w => w.id === db.activeId);
    const scopeFor = w => pageScope || w?.courseScope;
    const scopedCourses = w => {
      const keys = fixedCourseKey ? new Set([fixedCourseKey]) : new Set(scopeFor(w)?.keys || []);
      return (w?.courses || []).filter(course => keys.has(course.key));
    };
    const status = (text, error = false) => { q('status').textContent = text; q('status').classList.toggle('is-error', error); };
    function select(node, values, value, all = false) {
      node.replaceChildren();
      if (all) { const n = el('option', '', '当前范围的全部课程'); n.value = ''; node.append(n); }
      values.forEach(v => { const n = el('option', '', v.title || v.name); n.value = v.key || v.id; node.append(n); }); node.value = value;
    }
    function accept(data) {
      if (disposed || (db && data.revision < db.revision)) return;
      if (db && db.activeId !== data.activeId) { selected = fixedCourseKey || ''; if (editor) status('资料已切换，原资料的编辑内容仍保留。', true); }
      db = data; readOnly = false; render();
    }
    async function refresh() {
      const token = ++loading;
      try { const data = await api.request('read'); if (!disposed && token === loading) { accept(data); q('retry').hidden = true; } }
      catch (error) { if (!disposed && token === loading) { readOnly = true; status(error.message, true); q('retry').hidden = false; render(); } }
    }
    async function action(name, payload = {}, success = '已保存。') {
      if (busy) return false;
      busy = true; status('保存中…');
      try {
        if (readOnly || !db) throw new Error('请先成功读取 TODO。');
        const data = await api.request(name, { workspaceId: db.activeId, operationId: api.uuid(), ...payload }); accept(data); status(success); return true;
      } catch (error) { status(error.message, true); await refresh(); return false; }
      finally { busy = false; }
    }
    function render() {
      if (disposed) return; const w = current();
      const courses = scopedCourses(w), courseKeys = new Set(courses.map(c => c.key));
      q('add').disabled = readOnly || !courses.length;
      if (!fixedCourseKey) q('workspace').disabled = readOnly;
      if (!w) return;
      if (fixedCourseKey) q('course-scope').textContent = `${courses[0]?.title || '当前课程'} · ${w.name}`;
      else {
        select(q('workspace'), db.workspaces, w.id);
        q('course-scope').textContent = scopeFor(w) ? `课程范围：${scopeFor(w).label || '当前 LMS 页面'}（${courses.length} 门）` : '请先打开 LMS 主页选择学期；历史 TODO 仍然保留。';
      }
      if (editor) {
        const visible = editor.workspaceId === w.id && courseKeys.has(editor.courseKey);
        q('editor').hidden = !visible;
        if (visible && !fixedCourseKey) select(q('editor-course'), courses, editor.courseKey);
      }
      if (selected && !courseKeys.has(selected)) selected = fixedCourseKey || '';
      if (!fixedCourseKey) select(q('course'), [...courses].sort((a,b) => a.title.localeCompare(b.title)), selected, true);
      host.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(filter === b.dataset.filter)));
      const search = q('search').value.trim().toLocaleLowerCase();
      const list = q('list'); list.replaceChildren();
      const entries = w.todos.filter(t => courseKeys.has(t.courseKey) && (!selected || t.courseKey === selected) && (filter === 'trash' ? t.deletedAt : !t.deletedAt && (filter === 'done' ? t.completedAt : !t.completedAt)) && (!search || `${t.text} ${w.courses.find(c => c.key === t.courseKey)?.title}`.toLocaleLowerCase().includes(search)));
      entries.sort((a,b) => b.createdAt.localeCompare(a.createdAt)).forEach(t => {
        const row = el('div', 'ku-todo-row'); row.dataset.todoId = t.id;
        if (!t.deletedAt) { const c = el('input'); c.type = 'checkbox'; c.checked = !!t.completedAt; c.disabled = readOnly; c.setAttribute('aria-label', `完成：${t.text}`); c.addEventListener('change', () => void action('update', { id:t.id, expectedRevision:t.revision, completed:c.checked })); row.append(c); }
        const content = el('div', 'ku-todo-row-content'); const title = button(t.text, () => start(t), `ku-todo-text${t.completedAt ? ' is-done' : ''}`); title.disabled = !!t.deletedAt || readOnly; content.append(title);
        if (!fixedCourseKey) content.append(button(w.courses.find(c => c.key === t.courseKey)?.title || '课程', () => { selected = t.courseKey; render(); }, 'ku-todo-course-link'));
        row.append(content);
        const buttons = el('div', 'ku-todo-row-actions');
        if (t.deletedAt) {
          buttons.append(button('恢复', () => void action('restore', { id:t.id, expectedRevision:t.revision })));
          buttons.append(button('永久删除', () => { if (window.confirm('永久删除此待办？无法撤销，请先导出备份。')) void action('purge', { id:t.id, expectedRevision:t.revision }); }, 'ku-todo-danger'));
        } else buttons.append(button('删除', () => void action('delete', { id:t.id, expectedRevision:t.revision }, '已移入回收站，可随时恢复。'), 'ku-todo-quiet'));
        row.append(buttons); list.append(row);
      });
      if (!entries.length) list.append(el('p','ku-todo-empty',!courses.length ? (fixedCourseKey ? '正在准备当前课程，请稍候或重试读取。' : '当前范围没有课程，请在 LMS 主页选择学期。') : search ? '没有匹配的 TODO。' : filter === 'active' ? '没有未完成的 TODO。' : filter === 'done' ? '还没有已完成的 TODO。' : '回收站为空。'));
      q('drafts').replaceChildren(); const drafts = w.drafts.filter(d => courseKeys.has(d.courseKey) && d.text.trim()); q('draft-count').textContent = String(drafts.length);
      drafts.forEach(d => { const row = el('div','ku-todo-draft-row'); row.append(button(`${w.courses.find(c=>c.key===d.courseKey)?.title || '课程'} · ${d.text.slice(0,70)}`,()=>start(null,d),'ku-todo-draft-title')); row.append(button('丢弃',()=>{if(window.confirm('丢弃这份草稿？')) void action('dropDraft',{id:d.id});},'ku-todo-quiet')); q('drafts').append(row); });
      options.onUpdate?.(db);
    }
    function start(t = null, draft = null) {
      const w = current();
      const courses = scopedCourses(w);
      if (readOnly || !courses.length || busy) return;
      if (fixedCourseKey && ((draft && draft.courseKey !== fixedCourseKey) || (t && t.courseKey !== fixedCourseKey))) return;
      const targetKey = fixedCourseKey || draft?.courseKey || t?.courseKey || selected || courses[0].key;
      if (!courses.some(c => c.key === targetKey)) { status('请切回该课程所在的学期后编辑。', true); return; }
      const draftId = draft?.id || api.uuid();
      const todoId = draft?.todoId || t?.id || null;
      editor = {
        id: draftId, workspaceId: w.id, todoId,
        courseKey: targetKey,
        baseRevision: draft?.baseRevision ?? t?.revision ?? 0,
        // Survives closing the popup between a successful write and its response.
        operationId: todoId ? api.uuid() : draftId
      };
      q('editor').hidden = false;
      q('conflict').hidden = true;
      q('editor-title').textContent = todoId ? '编辑 TODO' : '新增 TODO';
      if (!fixedCourseKey) {
        select(q('editor-course'), courses, editor.courseKey);
        q('editor-course').disabled = !!todoId;
      }
      q('editor-text').value = draft?.text ?? t?.text ?? '';
      q('draft-status').textContent = draft ? '已恢复保存的草稿。' : '输入后保存草稿；点击保存提交为 TODO。';
      q('editor-text').focus();
    }
    function saveDraft() {
      if (!editor) return;
      editor.courseKey = fixedCourseKey || q('editor-course').value;
      const captured = { ...editor }, value = q('editor-text').value;
      q('draft-status').textContent = '草稿保存中…';
      // Dispatch immediately; the popup may disappear before a local queue drains.
      const writing = api.request('draft', {
        id: captured.id, workspaceId: captured.workspaceId, todoId: captured.todoId,
        courseKey: captured.courseKey, baseRevision: captured.baseRevision,
        operationId: api.uuid(), text: value
      });
      draftQueue = Promise.all([draftQueue.catch(() => {}), writing]).then(([, data]) => {
        accept(data);
        if (editor?.id === captured.id && q('editor-text').value === value) q('draft-status').textContent = '草稿已保存。';
      }).catch(error => {
        if (editor?.id === captured.id) q('draft-status').textContent = `草稿保存失败：${error.message} 请保留输入并重试。`;
        throw error;
      });
      void draftQueue.catch(() => {});
    }
    async function submit(event) {
      event?.preventDefault();
      if (!editor || busy) return;
      if (editor.workspaceId !== current()?.id || !scopedCourses(current()).some(c => c.key === editor.courseKey)) {
        status('请切回该课程所在的学期后保存，编辑内容仍保留。', true); return;
      }
      const value = q('editor-text').value.trim();
      if (!value) { status('请输入内容。', true); return; }
      // A lost response is retried with the exact original command.
      if (!editor.submission) editor.submission = {
        workspaceId: editor.workspaceId, operationId: editor.operationId,
        id: editor.todoId, courseKey: editor.courseKey,
        expectedRevision: editor.baseRevision, text: value
      };
      const captured = { ...editor }, payload = captured.submission;
      busy = true;
      q('save').disabled = true;
      q('editor-text').readOnly = true;
      if (!fixedCourseKey) q('editor-course').disabled = true;
      status('保存中…');
      try {
        await draftQueue.catch(() => {});
        const data = await api.request(payload.id ? 'update' : 'add', payload);
        accept(data);
        const saved = data.workspaces.find(w => w.id === payload.workspaceId)?.todos.find(t => t.id === (payload.id || payload.operationId));
        if (q('editor-text').value.trim() !== payload.text || (!payload.id && saved && saved.text !== payload.text)) {
          editor.todoId = saved?.id || payload.id || payload.operationId;
          editor.baseRevision = saved?.revision || payload.expectedRevision + 1;
          editor.operationId = api.uuid();
          editor.submission = null;
          q('editor-title').textContent = '编辑 TODO';
          saveDraft();
          status('此前提交已保存。后续输入仍在编辑框中，请再次保存。');
          return;
        }
        await api.request('dropDraft', { workspaceId: captured.workspaceId, operationId: api.uuid(), id: captured.id }).then(accept);
        editor = null;
        q('editor').hidden = true;
        status('已保存。');
      } catch (error) {
        status(error.message, true);
        if (error.code === 'CONFLICT' && editor) {
          editor.submission = null;
          await refresh();
          const latest = db.workspaces.find(w => w.id === captured.workspaceId)?.todos.find(t => t.id === captured.todoId);
          q('conflict').hidden = false;
          q('conflict-text').textContent = latest ? `最新内容：${latest.text}${latest.deletedAt ? '（已删除，请先恢复）' : ''}` : '原记录已不存在，请复制输入后新建。';
          q('conflict-save').disabled = !latest || !!latest.deletedAt;
        }
      } finally {
        busy = false;
        q('save').disabled = false;
        q('editor-text').readOnly = false;
        if (!fixedCourseKey) q('editor-course').disabled = !!editor?.todoId;
      }
    }
    on('conflict-save','click',()=>{if(!editor)return;const t=db.workspaces.find(w=>w.id===editor.workspaceId)?.todos.find(t=>t.id===editor.todoId);if(!t||t.deletedAt)return;editor.baseRevision=t.revision;editor.operationId=api.uuid();void submit();});
    on('editor-text','input',saveDraft);on('editor-course','change',saveDraft);on('editor','submit',submit);
    on('cancel','click',()=>{if(busy)return;editor=null;q('editor').hidden=true;});on('add','click',()=>start());on('search','input',render);on('course','change',e=>{selected=e.target.value;render();});
    host.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;render();}));
    on('retry','click',()=>{status('读取中…');void refresh().then(()=>{if(!readOnly)status('已重新读取。');});});
    on('workspace','change',e=>void action('selectWorkspace',{workspaceId:e.target.value},'已切换资料。'));
    on('new-workspace','click',()=>{q('workspace-form').hidden=!q('workspace-form').hidden;});
    on('workspace-form','submit',async e=>{e.preventDefault();const input=e.currentTarget.querySelector('input');if(input.value.trim() && await action('createWorkspace',{name:input.value.trim()},'已创建资料，访问主页可登记课程。')){input.value='';q('workspace-form').hidden=true;}});
    on('export','click',async()=>{try{const data=await api.request('export',{workspaceId:db.activeId});const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=`ku-lms-todo-${new Date().toISOString().slice(0,10)}.json`;host.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);status('已生成备份文件。');}catch(e){status(e.message,true);}});
    on('file','change',async e=>{imported=null;q('preview').hidden=true;try{const file=e.target.files?.[0];if(!file)return;if(file.size>4*1024*1024)throw new Error('备份不能超过 4 MB。');const value=JSON.parse(await file.text()),workspaceId=db.activeId;const p=await api.request('previewImport',{workspaceId,data:value});imported={value,workspaceId,revision:p.revision};q('preview-text').textContent=`${p.courses} 门课程，新增 ${p.added} 条 TODO，${p.conflicts} 条 TODO 冲突将另存副本；${p.assignmentCount || 0} 项课题状态。${p.assignmentConflicts ? `${p.assignmentConflicts} 项课题状态冲突，请先在课题页统一状态后重新导入。` : '导入前保存快照。'}`;q('import').disabled=!!p.assignmentConflicts;q('preview').hidden=false;}catch(error){status(error.message,true);}e.target.value='';});
    on('import-cancel','click',()=>{imported=null;q('preview').hidden=true;});
    on('import','click',async()=>{if(!imported)return;const data=imported;if(await action('import',{workspaceId:data.workspaceId,data:data.value,expectedRevision:data.revision},'已合并导入，原有内容保留。')){imported=null;q('preview').hidden=true;}});
    on('restore','click',()=>{if(db && window.confirm('将所有本地资料恢复到导入前？当前数据会保留为可再次恢复的快照。建议先导出。'))void action('restoreBackup',{expectedRevision:db.revision},'已恢复快照。');});
    const unsubscribe=api.subscribe(()=>void refresh()); const ready=refresh().then(()=>{if(!readOnly)status('已读取本地 TODO。');});
    return {ready,refresh,selectCourse(key){selected=fixedCourseKey||key;render();},setScope(scope){if(!fixedCourseKey)pageScope=scope;render();},destroy(){disposed=true;loading++;unsubscribe();}};
  }
};
