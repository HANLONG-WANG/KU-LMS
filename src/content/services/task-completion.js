/* Manual assignment state is durable workspace data, never an LMS submission or a cache flag. */
var kuTaskCompletion = { db: null, phase: 'loading', error: '', records: new Map(), heads: new Map(), conflicts: new Set(),
  root: null, route: null, view: null, request: 0, unsubscribe: null, click: null, dialog: null, homeNode: null, homeHtml: '' };

function kuAssignmentType(item) {
  const raw = String(item?.rawType || item?.type || item?.assignmentType || '').trim();
  if (/^(試験|小テスト|テスト)$/.test(raw)) return '試験';
  if (/^(レポート|課題)$/.test(raw)) return 'レポート';
  if (raw === 'アンケート' || raw === '自習') return raw;
  if (raw) return ''; // An explicit 資料/LTI category must not be overridden by its title.
  const title = String(item?.title || '');
  if (/アンケート/.test(title)) return 'アンケート';
  if (/自習/.test(title)) return '自習';
  if (/試験|小テスト|テスト/.test(title)) return '試験';
  if (/レポート|課題|提出/.test(title)) return 'レポート';
  return '';
}

function kuAssignmentIdentity(item, courseHref = '') {
  const type = kuAssignmentType(item);
  if (!type || typeof KuTodoClient === 'undefined') return null;
  const expected = KuTodoClient.courseKey(courseHref || item?.courseHref || item?.assignmentCourseKey || '');
  const origin = 'https://kulms.tl.kansai-u.ac.jp';
  let courseKey = '', contentId = '';
  for (const href of [item?.detailHref, item?.historyHref, item?.href, item?.assignmentKey]) {
    if (!href) continue;
    try {
      const url = new URL(href, origin);
      const match = url.pathname.match(/^\/webclass\/course\.php\/([a-zA-Z0-9_-]+)\/contents\/([a-zA-Z0-9_-]{1,100})(?:\/history)?\/?$/);
      if (url.origin !== origin || !match) continue;
      courseKey = `${origin}/webclass/course.php/${match[1]}/`; contentId = match[2];
      if (expected && expected !== courseKey) return null;
      break;
    } catch (_) { /* A malformed link cannot become a persistent identity. */ }
  }
  if (!contentId && expected) {
    for (const href of [item?.titleLaunchHref, item?.href]) {
      if (!href) continue;
      try {
        const url = new URL(href, origin), value = url.searchParams.get('set_contents_id');
        if (url.origin === origin && url.pathname === '/webclass/do_contents.php' && /^[a-zA-Z0-9_-]{1,100}$/.test(value || '')) {
          courseKey = expected; contentId = value; break;
        }
      } catch (_) { /* Keep an unidentified assignment read-only. */ }
    }
  }
  if (!courseKey || !contentId) return null;
  return { key: `${courseKey}contents/${contentId}/`, courseKey, contentId, type, title: String(item.title || '課題').trim().slice(0, 500) };
}

function kuAssignmentFields(item, courseHref = '') {
  const assignment = kuAssignmentIdentity(item, courseHref);
  return assignment ? { assignmentKey: assignment.key, assignmentCourseKey: assignment.courseKey, contentId: assignment.contentId, assignmentType: assignment.type } : {};
}

function kuAcceptCompletionData(db) {
  const s = kuTaskCompletion;
  if (s.db && db.revision < s.db.revision) return;
  const w = db.workspaces.find(w => w.id === db.activeId);
  if (!w) throw new Error('現在の資料を読み込めませんでした。');
  s.db = db; s.phase = 'ready'; s.error = '';
  s.records = new Map((w.assignmentCompletions || []).map(t => [t.key, t]));
  s.heads = new Map(); s.conflicts = new Set();
  const events = (w.replica?.events || []).filter(e => e.entity === 'assignment');
  const superseded = new Set(events.flatMap(e => e.parents));
  const states = new Map();
  for (const event of events) {
    if (superseded.has(event.id)) continue;
    if (!s.heads.has(event.key)) { s.heads.set(event.key, []); states.set(event.key, new Set()); }
    s.heads.get(event.key).push(event.id); states.get(event.key).add(event.value.completed);
  }
  for (const [key, heads] of s.heads) { heads.sort(); if (states.get(key).size > 1) s.conflicts.add(key); }
}

function kuIsAssignmentCompleted(item, courseHref = '') {
  const s = kuTaskCompletion, assignment = kuAssignmentIdentity(item, courseHref);
  return s.phase === 'ready' && !!assignment && !s.conflicts.has(assignment.key) && s.records.get(assignment.key)?.completed === true;
}

function kuRenderAssignmentBadge(item, courseHref = '', courseTitle = '') {
  if (!kuAssignmentType(item)) return '';
  const assignment = kuAssignmentIdentity(item, courseHref);
  if (!assignment) return '<button type="button" class="ku-chip neutral ku-completion-chip" disabled title="課題情報を更新してから状態を設定してください。">状態未取得</button>';
  const s = kuTaskCompletion, completed = kuIsAssignmentCompleted(item, courseHref), conflict = s.conflicts.has(assignment.key);
  const label = s.phase === 'loading' ? '読み込み中…' : s.phase === 'error' ? '取得失敗' : completed ? '完了' : '未完了';
  const meta = { ...assignment, course: { key: assignment.courseKey, title: String(courseTitle || item.courseTitle || assignment.courseKey.match(/course\.php\/([^/]+)/)?.[1] || 'コース').slice(0, 500) } };
  return `<button type="button" class="ku-chip neutral ku-completion-chip${completed ? ' is-completed' : ''}${conflict ? ' is-conflicted' : ''}" data-assignment-key="${escapeAttr(assignment.key)}" data-assignment="${escapeAttr(JSON.stringify(meta))}" aria-label="${escapeAttr(`${assignment.title}: ${label}${conflict ? '（同期の競合あり）' : ''}`)}" title="${escapeAttr(conflict ? '別の端末で異なる状態が設定されています。クリックして確認してください。' : 'クリックして完了状態を変更')}" ${s.phase === 'loading' ? 'disabled' : ''}>${label}${conflict && s.phase === 'ready' ? ' !' : ''}</button>`;
}

function kuBindTaskCompletions(root, route, view) {
  const s = kuTaskCompletion;
  if (!['home', 'home-all-upcoming', 'course-materials'].includes(route.name)) { kuCleanupTaskCompletions(); return; }
  if (s.root && s.click) s.root.removeEventListener('click', s.click);
  s.root = root; s.route = route.name; s.view = view;
  s.click = event => {
    if (event.target.closest?.('[data-completion-retry]')) { event.preventDefault(); void kuLoadTaskCompletions(); return; }
    const button = event.target.closest?.('[data-assignment-key]');
    if (!button) return;
    event.preventDefault(); event.stopPropagation();
    if (s.phase === 'error') { void kuLoadTaskCompletions(); return; }
    if (s.phase !== 'ready') return;
    try { kuOpenCompletionDialog(JSON.parse(button.dataset.assignment), button); } catch (_) { /* Ignore malformed or stale controls. */ }
  };
  root.addEventListener('click', s.click);
  if (!s.unsubscribe) s.unsubscribe = KuTodoClient.subscribe(() => void kuLoadTaskCompletions());
  if (s.dialog) { root.append(s.dialog.node); root.querySelector('.ku-app')?.setAttribute('inert', ''); }
  kuPaintTaskCompletions();
  void kuLoadTaskCompletions();
}

async function kuLoadTaskCompletions() {
  const s = kuTaskCompletion, root = s.root, token = ++s.request;
  if (!root) return;
  try {
    const db = await KuTodoClient.request('read');
    if (token !== s.request || root !== s.root) return;
    kuAcceptCompletionData(db);
  } catch (error) {
    if (token !== s.request || root !== s.root) return;
    s.phase = 'error'; s.error = error.message || '完了状態を読み込めませんでした。';
  }
  kuPaintTaskCompletions();
}

function kuPaintTaskCompletions() {
  const s = kuTaskCompletion, root = s.root;
  if (!root) return;
  const home = root.querySelector('[data-completion-upcoming]');
  const focused = document.activeElement, focusedKey = home?.contains(focused) ? focused?.dataset?.assignmentKey : '';
  if (home && s.route === 'home') {
    const html = renderHomeUpcoming(s.view);
    if (s.homeNode !== home || s.homeHtml !== html) { home.innerHTML = html; s.homeNode = home; s.homeHtml = html; }
  }
  root.querySelectorAll('[data-assignment-key]').forEach(button => {
    const key = button.dataset.assignmentKey, conflict = s.conflicts.has(key);
    const completed = s.phase === 'ready' && !conflict && s.records.get(key)?.completed === true;
    const label = s.phase === 'loading' ? '読み込み中…' : s.phase === 'error' ? '取得失敗' : completed ? '完了' : '未完了';
    button.textContent = label + (conflict && s.phase === 'ready' ? ' !' : '');
    button.disabled = s.phase === 'loading';
    button.classList.toggle('is-completed', completed); button.classList.toggle('is-conflicted', conflict);
    const title = JSON.parse(button.dataset.assignment || '{}').title || '課題';
    button.setAttribute('aria-label', `${title}: ${label}${conflict ? '（同期の競合あり）' : ''}`);
    button.title = s.phase === 'error' ? 'クリックして再読み込み' : conflict ? '別の端末と状態が異なります。クリックして確認してください。' : 'クリックして完了状態を変更';
  });
  if (focusedKey && !s.dialog) kuFocusCompletionControl(focusedKey);
}

function kuFocusCompletionControl(key) {
  const root = kuTaskCompletion.root;
  if (!root) return;
  const same = [...root.querySelectorAll('[data-assignment-key]')].find(n => n.dataset.assignmentKey === key);
  (same || root.querySelector('[data-completion-upcoming] [data-assignment-key]') || root.querySelector('[data-action="refresh-upcoming"]'))?.focus?.({ preventScroll: true });
}

function kuOpenCompletionDialog(meta, trigger) {
  const s = kuTaskCompletion;
  if (s.dialog || s.phase !== 'ready' || !s.root) return;
  const identity = kuAssignmentIdentity({ type: meta.type, title: meta.title, assignmentKey: meta.key }, meta.courseKey);
  if (!identity || identity.key !== meta.key) return;
  const current = s.records.get(meta.key), conflict = s.conflicts.has(meta.key);
  const completed = !conflict && current?.completed === true;
  const node = document.createElement('div'); node.className = 'ku-completion-overlay';
  node.innerHTML = '<section class="ku-completion-dialog" role="dialog" aria-modal="true" aria-labelledby="ku-completion-title"><h2 id="ku-completion-title">完了状態の確認</h2><p data-completion-name></p><p data-completion-question></p><p class="ku-completion-progress" data-completion-note></p><p class="ku-completion-error" role="alert" data-completion-error></p><div class="ku-completion-dialog-actions"><button type="button" class="ku-button ghost" data-completion-cancel>キャンセル</button><button type="button" class="ku-button" data-completion-review hidden>最新の状態を確認</button><button type="button" class="ku-button primary" data-completion-confirm>確認</button></div></section>';
  const q = name => node.querySelector(`[data-completion-${name}]`);
  q('name').textContent = meta.title;
  q('question').textContent = `${completed ? '完了' : '未完了'} → ${completed ? '未完了' : '完了'} に変更しますか？`;
  q('note').textContent = conflict ? '別の端末と状態が異なります。確認すると、この状態に統一します。' : '手動の記録です。LMSへの提出操作は行いません。';
  const dialog = { node, meta, trigger, busy: false, invalid: false, inertBefore: s.root.querySelector('.ku-app')?.hasAttribute('inert'),
    payload: { workspaceId: s.db.activeId, operationId: KuTodoClient.uuid(), course: meta.course, contentId: identity.contentId, title: meta.title,
      assignmentType: identity.type, completed: !completed, expectedRevision: current?.revision || 0, expectedHeads: [...(s.heads.get(meta.key) || [])] } };
  s.dialog = dialog; s.root.append(node); s.root.querySelector('.ku-app')?.setAttribute('inert', '');
  const close = () => { if (!dialog.busy) kuCloseCompletionDialog(); };
  q('cancel').addEventListener('click', close);
  node.addEventListener('click', event => { if (event.target === node) close(); });
  node.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === 'Tab') {
      const controls = [...node.querySelectorAll('button')].filter(n => !n.disabled && !n.hidden);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  q('review').addEventListener('click', async () => {
    q('review').disabled = true;
    await kuLoadTaskCompletions();
    if (s.dialog !== dialog) return;
    q('review').disabled = false;
    if (s.phase !== 'ready') { q('error').textContent = s.error; return; }
    kuCloseCompletionDialog(); kuOpenCompletionDialog(meta, trigger);
  });
  q('confirm').addEventListener('click', async () => {
    if (dialog.busy || dialog.invalid) return;
    if (s.phase !== 'ready' || s.db.activeId !== dialog.payload.workspaceId) {
      dialog.invalid = true; q('confirm').disabled = true; q('review').hidden = false;
      q('error').textContent = '資料または状態が変わりました。最新の状態を確認してください。'; return;
    }
    dialog.busy = true; q('confirm').disabled = true; q('cancel').disabled = true;
    q('error').textContent = ''; q('note').textContent = '保存中…';
    try {
      const db = await KuTodoClient.request('setAssignment', dialog.payload);
      if (s.dialog !== dialog) return;
      kuAcceptCompletionData(db); kuPaintTaskCompletions();
      dialog.busy = false; kuCloseCompletionDialog();
    } catch (error) {
      if (s.dialog !== dialog) return;
      q('error').textContent = error.message || '保存できませんでした。もう一度お試しください。';
      q('note').textContent = '保存を確認できていません。';
      if (error.code === 'CONFLICT') { dialog.invalid = true; q('review').hidden = false; }
    } finally {
      dialog.busy = false;
      if (s.dialog === dialog) { q('confirm').disabled = dialog.invalid; q('cancel').disabled = false; }
    }
  });
  q('cancel').focus();
}

function kuCloseCompletionDialog(restoreFocus = true) {
  const s = kuTaskCompletion, dialog = s.dialog;
  if (!dialog) return;
  dialog.node.remove(); s.dialog = null;
  if (!dialog.inertBefore) s.root?.querySelector('.ku-app')?.removeAttribute('inert');
  if (restoreFocus) {
    if (dialog.trigger?.isConnected) dialog.trigger.focus?.({ preventScroll: true });
    else kuFocusCompletionControl(dialog.meta.key);
  }
}

function kuCleanupTaskCompletions() {
  const s = kuTaskCompletion;
  kuCloseCompletionDialog(false); s.request += 1;
  s.unsubscribe?.(); s.unsubscribe = null;
  if (s.root && s.click) s.root.removeEventListener('click', s.click);
  s.root = null; s.route = null; s.view = null; s.click = null; s.homeNode = null; s.homeHtml = '';
}
