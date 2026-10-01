/* Home integration. Retain the editor DOM across unrelated home rerenders. */
var kuTodoHome = { db: null, root: null, view: null, unsubscribe: null, dialog: null, editor: null, trigger: null, catalogSignature: '', request: 0, click: null };

function kuRenderTodoChip(entry) {
  const key = KuTodoClient.courseKey(entry.href);
  if (!key) return '';
  const w = kuTodoHome.db?.workspaces.find(w => w.id === kuTodoHome.db.activeId);
  const count = w?.todos.filter(t => t.courseKey === key && !t.completedAt && !t.deletedAt).length;
  return `<button type="button" class="ku-chip blue ku-todo-chip" data-todo-open="${escapeAttr(key)}" title="TODO" aria-label="${escapeAttr(shortenCourseTitle(entry.title))} のTODO"><span aria-hidden="true">☑</span> <span data-todo-count>${count === undefined ? '…' : count ? Math.min(count, 99) + (count > 99 ? '+' : '') : '+'}</span></button>`;
}

function kuBindTodos(root, route, view) {
  if (route.name !== 'home' || !view.schedule) { kuCleanupTodos(); return; }
  if (kuTodoHome.root && kuTodoHome.click) kuTodoHome.root.removeEventListener('click', kuTodoHome.click);
  kuTodoHome.root = root; kuTodoHome.view = view;
  kuTodoHome.click = event => {
    const target = event.target.closest?.('[data-todo-open]');
    if (!target) return;
    event.preventDefault(); event.stopPropagation();
    kuOpenTodoDialog(target.dataset.todoOpen || '', target);
  };
  root.addEventListener('click', kuTodoHome.click);
  if (kuTodoHome.dialog) { root.append(kuTodoHome.dialog); root.querySelector('.ku-app')?.setAttribute('inert', ''); }
  if (!kuTodoHome.unsubscribe) kuTodoHome.unsubscribe = KuTodoClient.subscribe(() => void kuLoadHomeTodos());
  kuPaintHomeTodos();
  void kuLoadHomeTodos();
}

async function kuLoadHomeTodos() {
  const token = ++kuTodoHome.request, root = kuTodoHome.root;
  if (!root) return;
  try {
    let db = await KuTodoClient.request('read');
    if (token !== kuTodoHome.request || root !== kuTodoHome.root) return;
    const view = kuTodoHome.view, seen = new Set();
    const courses = [...view.schedule.entries, ...view.otherCourses.flatMap(g => g.items)].flatMap(entry => {
      const key = KuTodoClient.courseKey(entry.href);
      if (!key || seen.has(key)) return [];
      seen.add(key); return [{ key, title: shortenCourseTitle(entry.title), term: view.filters.label }];
    });
    const signature = JSON.stringify([db.activeId, courses]);
    if (signature !== kuTodoHome.catalogSignature) {
      kuTodoHome.catalogSignature = signature;
      try { db = await KuTodoClient.request('catalog', { workspaceId: db.activeId, courses, operationId: KuTodoClient.uuid() }); }
      catch (error) { kuTodoHome.catalogSignature = ''; throw error; }
    }
    if (token !== kuTodoHome.request || root !== kuTodoHome.root) return;
    kuTodoHome.db = db; kuPaintHomeTodos();
  } catch (error) {
    if (token !== kuTodoHome.request || root !== kuTodoHome.root) return;
    const body = root.querySelector('[data-todo-summary-body]');
    if (body) { body.replaceChildren(); const p = document.createElement('p'); p.textContent = error.message; body.append(p); const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'ku-button ghost'; retry.textContent = '重试'; retry.addEventListener('click', () => void kuLoadHomeTodos()); body.append(retry); }
  }
}

function kuPaintHomeTodos() {
  const { root, db, view } = kuTodoHome;
  const w = db?.workspaces.find(w => w.id === db.activeId);
  if (!root || !w) return;
  root.querySelectorAll('.ku-todo-chip').forEach(button => {
    const count = w.todos.filter(t => t.courseKey === button.dataset.todoOpen && !t.completedAt && !t.deletedAt).length;
    const badge = button.querySelector('[data-todo-count]');
    if (badge) badge.textContent = count ? (count > 99 ? '99+' : String(count)) : '+';
    button.title = `TODO · ${count} 件未完了`;
  });
  const body = root.querySelector('[data-todo-summary-body]'); if (!body) return;
  body.className = 'ku-todo-home-list'; body.replaceChildren();
  const visible = new Set([...view.schedule.entries, ...view.otherCourses.flatMap(g => g.items)].map(c => KuTodoClient.courseKey(c.href)));
  const todos = w.todos.filter(t => !t.deletedAt && !t.completedAt), scoped = todos.filter(t => visible.has(t.courseKey));
  const meta = document.createElement('p'); meta.className = 'ku-todo-home-meta'; meta.textContent = `${w.name} · 表示中 ${scoped.length} 件 / 全 ${todos.length} 件`; body.append(meta);
  scoped.slice(0, 5).forEach(t => {
    const row = document.createElement('div'); row.className = 'ku-todo-home-row';
    const check = document.createElement('input'); check.type = 'checkbox'; check.setAttribute('aria-label', `完了：${t.text}`);
    check.addEventListener('change', async () => {
      check.disabled = true;
      try { await KuTodoClient.request('update', { workspaceId: w.id, operationId: KuTodoClient.uuid(), id: t.id, expectedRevision: t.revision, completed: check.checked }); await kuLoadHomeTodos(); }
      catch (error) { check.checked = false; check.disabled = false; meta.textContent = error.message; }
    });
    const button = document.createElement('button'); button.type = 'button'; button.dataset.todoOpen = t.courseKey; button.className = 'ku-todo-home-item';
    const title = document.createElement('span'); title.textContent = t.text;
    const course = document.createElement('small'); course.textContent = w.courses.find(c => c.key === t.courseKey)?.title || '';
    button.append(title, course); row.append(check, button); body.append(row);
  });
  if (!scoped.length) { const empty = document.createElement('p'); empty.className = 'ku-todo-home-meta'; empty.textContent = todos.length ? 'ほかの学期のTODOは「すべて見る」で確認できます。' : 'TODOはありません。カードの ☑ から追加できます。'; body.append(empty); }
  if (scoped.length > 5) { const more = document.createElement('button'); more.type = 'button'; more.className = 'ku-button ghost'; more.dataset.todoOpen = ''; more.textContent = `残り ${scoped.length - 5} 件を見る`; body.append(more); }
}

function kuOpenTodoDialog(key = '', trigger = null) {
  if (kuTodoHome.dialog) { kuTodoHome.editor.selectCourse(key); return; }
  const root = kuTodoHome.root; if (!root) return;
  const overlay = document.createElement('div'); overlay.className = 'ku-todo-overlay';
  overlay.innerHTML = '<section class="ku-todo-dialog" role="dialog" aria-modal="true" aria-labelledby="ku-todo-dialog-title"><header class="ku-todo-dialog-header"><h2 id="ku-todo-dialog-title">TODO</h2><button type="button" class="ku-button ghost" data-todo-close aria-label="TODOを閉じる">閉じる</button></header><div class="ku-todo-dialog-body"></div></section>';
  root.append(overlay); root.querySelector('.ku-app')?.setAttribute('inert', '');
  kuTodoHome.dialog = overlay; kuTodoHome.trigger = trigger;
  kuTodoHome.editor = KuTodoUI.mount(overlay.querySelector('.ku-todo-dialog-body'), { courseKey: key, onUpdate(db) { kuTodoHome.db = db; kuPaintHomeTodos(); } });
  const close = () => kuCloseTodoDialog();
  overlay.querySelector('[data-todo-close]').addEventListener('click', close);
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === 'Tab') {
      const nodes = [...overlay.querySelectorAll('button, input, select, textarea, summary')].filter(n => !n.disabled && !n.closest('[hidden]') && n.getClientRects().length);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  overlay.querySelector('[data-todo-close]').focus();
}

function kuCloseTodoDialog() {
  kuTodoHome.editor?.destroy(); kuTodoHome.editor = null;
  kuTodoHome.dialog?.remove(); kuTodoHome.dialog = null;
  kuTodoHome.root?.querySelector('.ku-app')?.removeAttribute('inert');
  if (kuTodoHome.trigger?.isConnected) kuTodoHome.trigger.focus();
  else kuTodoHome.root?.querySelector('[data-todo-open]')?.focus();
  kuTodoHome.trigger = null;
}

function kuCleanupTodos() {
  kuCloseTodoDialog(); kuTodoHome.request += 1;
  kuTodoHome.unsubscribe?.(); kuTodoHome.unsubscribe = null;
  if (kuTodoHome.root && kuTodoHome.click) kuTodoHome.root.removeEventListener('click', kuTodoHome.click);
  kuTodoHome.root = null; kuTodoHome.view = null; kuTodoHome.click = null; kuTodoHome.catalogSignature = '';
}
