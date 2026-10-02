/* Course-local, always-expanded editor. The home drawer and durable store remain shared. */
var kuCourseTodoPanel = { root: null, host: null, editor: null, course: null, db: null, generation: 0,
  loading: false, error: '', scrollTop: 0, scroll: null };

function kuCourseTodoIsCurrent(generation, key) {
  return kuCourseTodoPanel.generation === generation && kuCourseTodoPanel.course?.key === key && !!kuCourseTodoPanel.root;
}

function kuCourseTodoNeedsCatalog(db) {
  const course = kuCourseTodoPanel.course, w = db?.workspaces.find(w => w.id === db.activeId);
  if (!course || !w) return true;
  // Existing metadata may come from a newer page or sync; do not write it back.
  return !w.courses.some(c => c.key === course.key);
}

function kuPaintCourseTodoCount() {
  const s = kuCourseTodoPanel, badge = s.root?.querySelector('[data-course-todo-count]');
  if (!badge) return;
  const w = s.db?.workspaces.find(w => w.id === s.db.activeId);
  if (!w || !w.courses.some(c => c.key === s.course?.key)) {
    badge.textContent = s.error ? '!' : '…'; badge.setAttribute('aria-label', s.error ? 'TODO 读取失败' : 'TODO 读取中'); return;
  }
  const count = w.todos.filter(t => t.courseKey === s.course.key && !t.completedAt && !t.deletedAt).length;
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.setAttribute('aria-label', `未完成 TODO：${count}`);
}

function kuCourseTodoNotice(message = '', error = false) {
  const s = kuCourseTodoPanel, box = s.root?.querySelector('[data-course-todo-notice]');
  if (!box) return;
  box.hidden = !message; box.classList.toggle('is-error', error); box.replaceChildren();
  if (!message) return;
  const text = document.createElement('p'); text.textContent = message; box.append(text);
  if (error) {
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'ku-button ghost'; retry.textContent = '重试';
    retry.setAttribute('data-course-todo-retry', '');
    retry.addEventListener('click', () => void kuLoadCourseTodos()); box.append(retry);
  }
}

function kuBindCourseTodos(root, route, view) {
  if (route.name !== 'course-materials') { kuCleanupCourseTodos(); return; }
  let slot = root.querySelector('[data-course-todo-host]');
  if (!slot) { kuCleanupCourseTodos(); return; }
  const course = view?.course?.course;
  const key = KuTodoClient.courseKey(course?.links?.materials || course?.links?.info || window.location.href);
  const s = kuCourseTodoPanel;
  if (!key) {
    kuCleanupCourseTodos();
    slot.textContent = '无法识别当前课程，未打开其他课程的 TODO。'; return;
  }
  if (s.course?.key !== key) {
    if (slot === s.host) { const replacement = slot.cloneNode(false); slot.replaceWith(replacement); slot = replacement; }
    kuCleanupCourseTodos();
    s.host = slot;
    s.scroll = () => { if (s.host?.isConnected) s.scrollTop = s.host.scrollTop; };
    slot.addEventListener('scroll', s.scroll, { passive: true });
  } else if (slot !== s.host) {
    slot.replaceWith(s.host);
    s.host.scrollTop = s.scrollTop;
  }
  s.root = root;
  s.course = { key, title: course?.title ? shortenCourseTitle(course.title).slice(0, 500) : '',
    term: [course?.meta?.year, course?.meta?.semester].filter(Boolean).join(' ').slice(0, 100) };
  kuPaintCourseTodoCount();
  kuCourseTodoNotice(s.error, !!s.error);
  if (!s.editor || kuCourseTodoNeedsCatalog(s.db)) void kuLoadCourseTodos();
}

async function kuLoadCourseTodos() {
  const s = kuCourseTodoPanel;
  if (s.loading || !s.root || !s.course) return;
  const generation = s.generation, key = s.course.key;
  s.loading = true; s.error = '';
  if (!s.editor) kuCourseTodoNotice('读取当前课程 TODO…');
  let succeeded = false;
  try {
    let db;
    for (let attempt = 0; attempt < 3; attempt++) {
      db = await KuTodoClient.request('read');
      if (!kuCourseTodoIsCurrent(generation, key)) return;
      if (!kuCourseTodoNeedsCatalog(db)) break;
      const w = db.workspaces.find(w => w.id === db.activeId);
      if (!w) throw new Error('无法读取当前资料。');
      const old = w.courses.find(c => c.key === key);
      db = await KuTodoClient.request('catalog', { workspaceId: w.id, operationId: KuTodoClient.uuid(), setScope: false,
        courses: [{ key, title: s.course.title || old?.title || '当前课程', term: s.course.term || old?.term || '' }] });
      if (!kuCourseTodoIsCurrent(generation, key)) return;
      if (db.activeId === w.id && !kuCourseTodoNeedsCatalog(db)) break;
    }
    if (kuCourseTodoNeedsCatalog(db)) throw new Error('资料正在切换，请稍后重试。');
    s.db = db;
    if (!s.editor) {
      s.editor = KuTodoUI.mount(s.host, { fixedCourseKey: key, onUpdate(data) {
        if (!kuCourseTodoIsCurrent(generation, key)) return;
        if (!s.db || data.revision >= s.db.revision) s.db = data;
        kuPaintCourseTodoCount();
        if (!s.loading && kuCourseTodoNeedsCatalog(s.db)) void kuLoadCourseTodos();
      } });
      await s.editor.ready;
    } else await s.editor.refresh();
    if (!kuCourseTodoIsCurrent(generation, key)) return;
    succeeded = true; kuCourseTodoNotice(); kuPaintCourseTodoCount();
  } catch (error) {
    if (!kuCourseTodoIsCurrent(generation, key)) return;
    s.error = error.message || '当前课程 TODO 读取失败。';
    kuCourseTodoNotice(s.error, true); kuPaintCourseTodoCount();
  } finally {
    if (kuCourseTodoIsCurrent(generation, key)) {
      s.loading = false;
      if (succeeded && kuCourseTodoNeedsCatalog(s.db)) void kuLoadCourseTodos();
    }
  }
}

function kuCleanupCourseTodos() {
  const s = kuCourseTodoPanel;
  s.generation += 1;
  s.editor?.destroy();
  if (s.host && s.scroll) s.host.removeEventListener('scroll', s.scroll);
  s.host?.remove();
  s.root = null; s.host = null; s.editor = null; s.course = null; s.db = null;
  s.loading = false; s.error = ''; s.scrollTop = 0; s.scroll = null;
}
