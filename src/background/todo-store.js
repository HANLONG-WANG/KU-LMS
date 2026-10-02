/* Durable TODO store. Only the service worker writes this key. No LMS cache or credentials. */
var KuTodoStore = (() => {
  const KEY = 'kuLmsTodosV1';
  const BACKUP_KEY = 'kuLmsTodosBeforeImportV1';
  const MIGRATION_KEY = 'kuLmsTodosBeforeCompletionV3';
  const ORIGIN = 'https://kulms.tl.kansai-u.ac.jp';
  const MAX_BYTES = 4 * 1024 * 1024;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const fail = (code, message) => { const error = new Error(message); error.code = code; throw error; };
  const text = (value, max = 2000) => {
    if (typeof value !== 'string' || !value.trim() || value.length > max) fail('INVALID', '内容为空或过长。');
    return value.trim();
  };
  const id = (value) => {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) fail('INVALID', '无效的记录标识。');
    return value;
  };
  const date = (value, nullable = false) => {
    if (nullable && value === null) return null;
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail('INVALID', '无效的日期。');
    return value;
  };
  const revision = (value) => {
    if (!Number.isSafeInteger(value) || value < 0) fail('INVALID', '无效的数据版本。');
    return value;
  };
  function courseKey(href) {
    try {
      const url = new URL(href, ORIGIN);
      const match = url.pathname.match(/^\/webclass\/course\.php\/([a-zA-Z0-9_-]+)(?:\/|$)/);
      return url.origin === ORIGIN && match ? `${ORIGIN}/webclass/course.php/${match[1]}/` : '';
    } catch (_) { return ''; }
  }
  function course(value) {
    const key = courseKey(value?.key || value?.href);
    if (!key) fail('INVALID', '无法识别课程。');
    return { key, title: text(value.title, 500), term: String(value.term || '').slice(0, 100) };
  }
  function todo(value, keys) {
    if (!value || !keys.has(value.courseKey)) fail('INVALID', '待办缺少对应课程。');
    return { id: id(value.id), courseKey: value.courseKey, text: text(value.text), revision: revision(value.revision),
      createdAt: date(value.createdAt), updatedAt: date(value.updatedAt), completedAt: date(value.completedAt, true), deletedAt: date(value.deletedAt, true) };
  }
  function assignment(value, keys) {
    if (!value || !keys.has(value.courseKey) || courseKey(value.courseKey) !== value.courseKey
      || typeof value.contentId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.contentId)
      || value.key !== `${value.courseKey}contents/${value.contentId}/`
      || !['試験', 'アンケート', 'レポート', '自習'].includes(value.type)
      || typeof value.completed !== 'boolean') fail('INVALID', '课题完成记录或课程标识无效。');
    return { key: value.key, courseKey: value.courseKey, contentId: value.contentId, title: text(value.title, 500), type: value.type,
      completed: value.completed, updatedAt: date(value.updatedAt), revision: revision(value.revision) };
  }
  function unique(values, key) {
    if (new Set(values.map(value => value[key])).size !== values.length) fail('INVALID', '数据包含重复标识。');
  }
  function workspace(value) {
    if (!value || !Array.isArray(value.courses) || !Array.isArray(value.todos) || !Array.isArray(value.drafts) || !Array.isArray(value.operations)) fail('INVALID', 'TODO 数据格式异常，未覆盖原数据。');
    const courses = value.courses.map(course);
    unique(courses, 'key');
    const keys = new Set(courses.map(value => value.key));
    const todos = value.todos.map(value => todo(value, keys));
    unique(todos, 'id');
    const drafts = value.drafts.map(d => {
      if (!keys.has(d.courseKey) || typeof d.text !== 'string' || d.text.length > 2000) fail('INVALID', '草稿格式异常。');
      return { id: id(d.id), courseKey: d.courseKey, todoId: d.todoId ? id(d.todoId) : null, text: d.text, updatedAt: date(d.updatedAt), baseRevision: revision(d.baseRevision) };
    });
    unique(drafts, 'id');
    if (value.assignmentCompletions !== undefined && !Array.isArray(value.assignmentCompletions)) fail('INVALID', '课题完成记录格式异常，原数据未改动。');
    const assignmentCompletions = (value.assignmentCompletions || []).map(v => assignment(v, keys));
    unique(assignmentCompletions, 'key');
    const result = { id: id(value.id), name: text(value.name, 60), courses, todos, assignmentCompletions, drafts, operations: value.operations.map(id).slice(-512) };
    if (value.courseScope) {
      const scope = value.courseScope;
      if (!Array.isArray(scope.keys) || scope.keys.length > 1000 || scope.keys.some(key => !keys.has(key))
        || typeof scope.label !== 'string' || scope.label.length > 100) fail('INVALID', '课程显示范围无效，历史 TODO 未改动。');
      result.courseScope = { keys: [...new Set(scope.keys)].sort(), label: scope.label };
    }
    if (value.replica) {
      if (typeof KuTodoReplica === 'undefined') fail('VERSION', '同步模块不可用，原数据未改动。');
      result.replica = KuTodoReplica.validate(value.replica);
    }
    return result;
  }
  function database(value) {
    if (![1, 2, 3].includes(value?.schemaVersion)) fail('VERSION', '无法读取此版本的 TODO；原数据已保留。请更新扩展或恢复备份。');
    if (!Array.isArray(value.workspaces) || !value.workspaces.length) fail('INVALID', 'TODO 资料格式异常，未覆盖原数据。');
    if (value.schemaVersion === 3 && value.workspaces.some(w => !Array.isArray(w.assignmentCompletions))) fail('INVALID', '课题完成记录缺失，未覆盖原数据。');
    const workspaces = value.workspaces.map(workspace);
    unique(workspaces, 'id');
    if (!workspaces.some(w => w.id === value.activeId)) fail('INVALID', '当前资料不存在。');
    return { schemaVersion: value.schemaVersion, revision: revision(value.revision), activeId: value.activeId, workspaces };
  }
  const blankWorkspace = (value = 'local', name = '本地待办') => ({ id: value, name, courses: [], todos: [], assignmentCompletions: [], drafts: [], operations: [] });
  const empty = () => ({ schemaVersion: 1, revision: 0, activeId: 'local', workspaces: [blankWorkspace()] });
  function imported(value) {
    if (value?.format !== 'ku-lms-todo' || ![1, 2].includes(value.schemaVersion) || !Array.isArray(value.courses) || !Array.isArray(value.todos)) fail('INVALID', '请选择有效的 KU-LMS TODO 备份。');
    if (value.assignmentConflicts !== undefined && (!Array.isArray(value.assignmentConflicts) || value.assignmentConflicts.length)) {
      fail('CONFLICT', '此备份包含未解决的课题完成冲突。所有版本仍在备份中，请先在来源设备解决冲突后重新导出。');
    }
    return workspace({ id: 'import', name: 'import', courses: value.courses, todos: value.todos, assignmentCompletions: value.assignmentCompletions, drafts: [], operations: [] });
  }
  function size(value) {
    if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_BYTES) fail('QUOTA', 'TODO 数据过大。请先导出备份，再整理回收站。');
  }
  function create(storage) {
    let queue = Promise.resolve();
    async function read() {
      const data = await storage.get(KEY);
      return Object.prototype.hasOwnProperty.call(data, KEY) ? database(data[KEY]) : empty();
    }
    async function perform(message) {
      const db = await read();
      if (message.action === 'read') return db;
      const w = db.workspaces.find(w => w.id === message.workspaceId);
      if (!w && !['createWorkspace', 'selectWorkspace', 'restoreBackup'].includes(message.action)) fail('INVALID', '请选择本地资料。');
      if (message.action === 'export') return { format: 'ku-lms-todo', schemaVersion: 2, exportedAt: new Date().toISOString(), courses: w.courses,
        todos: w.replica ? KuTodoReplica.exportTodos(w) : w.todos, assignmentCompletions: w.assignmentCompletions,
        assignmentConflicts: w.replica ? KuTodoReplica.conflicts(w.replica).filter(c => c.entity === 'assignment') : [] };
      if (message.action === 'previewImport') {
        size(message.data);
        const incoming = imported(message.data);
        return { courses: incoming.courses.length, added: incoming.todos.filter(t => !w.todos.some(old => old.id === t.id)).length,
          conflicts: incoming.todos.filter(t => w.todos.some(old => old.id === t.id && JSON.stringify(old) !== JSON.stringify(t))).length,
          assignmentCount: incoming.assignmentCompletions.length,
          assignmentConflicts: incoming.assignmentCompletions.filter(t => w.assignmentCompletions.some(old => old.key === t.key && old.completed !== t.completed)).length,
          revision: db.revision };
      }
      if (message.action === '__syncRead') return clone(w);
      const beforeSync = w?.replica ? { courses: clone(w.courses), todos: clone(w.todos), assignmentCompletions: clone(w.assignmentCompletions) } : null;
      const beforeMigration = db.schemaVersion < 3 ? ((await storage.get(KEY))[KEY] || clone(db)) : null;
      const operationId = id(message.operationId);
      if (w?.operations.includes(operationId)) return db;
      const now = new Date().toISOString();
      let changed = true;
      switch (message.action) {
        case '__syncAttach':
          await storage.set({ [BACKUP_KEY]: db });
          KuTodoReplica.attach(w, text(message.accountId, 100), () => crypto.randomUUID());
          db.schemaVersion = 3; // Older extensions must not strip completion data or replication history.
          break;
        case '__syncMerge':
        case '__syncAck':
        case '__syncResolve': {
          if (!w.replica || w.replica.accountId !== message.accountId) fail('ACCOUNT', '同步账号与此资料不匹配。');
          if (message.action === '__syncMerge') KuTodoReplica.merge(w, message.events, message.files);
          if (message.action === '__syncAck') {
            const acknowledged = new Set(message.ids);
            w.replica.outbox = w.replica.outbox.filter(id => !acknowledged.has(id));
            w.replica.files = [...new Set([...w.replica.files, ...message.files])];
          }
          if (message.action === '__syncResolve') KuTodoReplica.resolve(w, message.id, message.heads, message.eventId, () => crypto.randomUUID(), message.entity || 'todo');
          break;
        }
        case 'createWorkspace':
          if (db.workspaces.some(w => w.id === operationId)) return db;
          db.workspaces.push(blankWorkspace(operationId, text(message.name, 60))); db.activeId = operationId; break;
        case 'selectWorkspace':
          if (!w) fail('INVALID', '资料不存在。');
          db.activeId = w.id; break;
        case 'catalog':
          if (!Array.isArray(message.courses) || message.courses.length > 1000) fail('INVALID', '课程目录无效。');
          changed = false;
          for (const raw of message.courses) {
            const c = course(raw); const old = w.courses.find(v => v.key === c.key);
            if (!old) { w.courses.push(c); changed = true; }
            else if (old.title !== c.title || (c.term && old.term !== c.term)) { Object.assign(old, c); changed = true; }
          }
          // The durable directory accumulates history; this device's UI scope is a replacement snapshot.
          if (message.setScope !== false) {
            const scope = { keys: [...new Set(message.courses.map(raw => course(raw).key))].sort(), label: String(message.scopeLabel || message.courses[0]?.term || '').slice(0, 100) };
            if (JSON.stringify(w.courseScope) !== JSON.stringify(scope)) { w.courseScope = scope; changed = true; }
          }
          break;
        case 'add': {
          const key = courseKey(message.courseKey);
          if (!w.courses.some(c => c.key === key)) fail('INVALID', '课程不存在，请重新打开主页。');
          if (w.todos.some(t => t.id === operationId)) return db;
          w.todos.push({ id: operationId, courseKey: key, text: text(message.text), revision: 1, createdAt: now, updatedAt: now, completedAt: null, deletedAt: null });
          break;
        }
        case 'setAssignment': {
          if (db.activeId !== w.id) fail('CONFLICT', '当前资料已切换，请重新确认课题状态。');
          const c = course(message.course);
          const key = `${c.key}contents/${id(message.contentId)}/`;
          const old = w.assignmentCompletions.find(t => t.key === key);
          if ((old?.revision || 0) !== message.expectedRevision) fail('CONFLICT', '另一个窗口或设备修改了此课题，请读取最新状态后重新确认。');
          const heads = w.replica ? KuTodoReplica.headsFor(w.replica, 'assignment', key) : [];
          if (!Array.isArray(message.expectedHeads) || JSON.stringify([...message.expectedHeads].sort()) !== JSON.stringify(heads)) fail('CONFLICT', '课题的同步版本已改变，请重新确认。');
          const value = assignment({ key, courseKey: c.key, contentId: message.contentId, title: message.title, type: message.assignmentType,
            completed: message.completed, updatedAt: now, revision: (old?.revision || 0) + 1 }, new Set([c.key]));
          if (!w.courses.some(v => v.key === c.key)) w.courses.push(c);
          if (old) Object.assign(old, value); else w.assignmentCompletions.push(value);
          break;
        }
        case 'update': case 'delete': case 'restore': case 'purge': {
          const t = w.todos.find(t => t.id === message.id);
          if (!t) fail('CONFLICT', '此待办已不存在。你的输入已保留。');
          if (t.revision !== message.expectedRevision) fail('CONFLICT', '另一个窗口修改了此待办。你的输入已保留；请比较最新内容后再保存。');
          if (message.action === 'purge') {
            if (!t.deletedAt) fail('INVALID', '只能永久删除回收站中的待办。');
            w.todos = w.todos.filter(v => v.id !== t.id);
          } else {
            if (message.action === 'update') {
              if (t.deletedAt) fail('CONFLICT', '此待办已移入回收站。请先恢复。');
              if (message.text !== undefined) t.text = text(message.text);
              if (message.completed !== undefined) {
                if (typeof message.completed !== 'boolean') fail('INVALID', '完成状态无效。');
                t.completedAt = message.completed ? now : null;
              }
            } else t.deletedAt = message.action === 'delete' ? now : null;
            t.revision += 1; t.updatedAt = now;
          }
          break;
        }
        case 'draft': {
          if (!w.courses.some(c => c.key === message.courseKey) || typeof message.text !== 'string' || message.text.length > 2000) fail('INVALID', '草稿内容无效。');
          const draft = { id: id(message.id), courseKey: message.courseKey, todoId: message.todoId ? id(message.todoId) : null, text: message.text, baseRevision: revision(message.baseRevision), updatedAt: now };
          w.drafts = w.drafts.filter(d => d.id !== draft.id); w.drafts.push(draft); break;
        }
        case 'dropDraft': w.drafts = w.drafts.filter(d => d.id !== message.id); break;
        case 'import': {
          if (db.revision !== message.expectedRevision) fail('CONFLICT', '预览后数据已改变，请重新预览导入。');
          size(message.data); const incoming = imported(message.data);
          if (incoming.assignmentCompletions.some(t => w.assignmentCompletions.some(old => old.key === t.key && old.completed !== t.completed))) {
            fail('CONFLICT', '备份与本机的课题完成状态不同，未覆盖任何数据。请先在课题页面统一状态后重新预览导入。');
          }
          await storage.set({ [BACKUP_KEY]: db });
          for (const c of incoming.courses) if (!w.courses.some(old => old.key === c.key)) w.courses.push(c);
          for (const t of incoming.todos) {
            const old = w.todos.find(old => old.id === t.id);
            if (!old) w.todos.push(t);
            else if (JSON.stringify(old) !== JSON.stringify(t)) {
              // Keep both conflicting versions. Never silently replace local work.
              const conflictId = `copy_${operationId}_${w.todos.length}`.slice(0, 100);
              w.todos.push({ ...t, id: conflictId, text: t.text, revision: 1 });
            }
          }
          for (const t of incoming.assignmentCompletions) if (!w.assignmentCompletions.some(old => old.key === t.key)) w.assignmentCompletions.push({ ...t, revision: 1 });
          break;
        }
        case 'restoreBackup': {
          if (db.workspaces.some(w => w.replica)) fail('SYNC_BOUND', '已绑定同步的资料不能整库回退。请导出备份，并使用合并导入恢复内容。');
          if (db.revision !== message.expectedRevision) fail('CONFLICT', '数据已改变，请刷新后再恢复。');
          const raw = await storage.get(BACKUP_KEY);
          if (!raw[BACKUP_KEY]) fail('INVALID', '还没有导入前快照。');
          const backup = database(raw[BACKUP_KEY]); backup.revision = db.revision + 1;
          backup.schemaVersion = 3;
          size(backup); await storage.set({ [KEY]: backup, [BACKUP_KEY]: db }); return backup;
        }
        default: fail('INVALID', '不支持的 TODO 操作。');
      }
      if (!changed) return db;
      if (w) w.operations = [...w.operations, operationId].slice(-512);
      if (w?.replica && beforeSync && !message.action.startsWith('__')) KuTodoReplica.record(w.replica, beforeSync, w, () => crypto.randomUUID(), message.action === 'setAssignment');
      db.schemaVersion = 3;
      db.revision += 1; size(db);
      await storage.set({ [KEY]: db, ...(beforeMigration ? { [MIGRATION_KEY]: beforeMigration } : {}) });
      return db;
    }
    return { dispatch(message) { const result = queue.then(() => perform(message)); queue = result.catch(() => {}); return result; } };
  }
  return { KEY, BACKUP_KEY, MIGRATION_KEY, create, courseKey, database };
})();

if (globalThis.chrome?.runtime?.onMessage && globalThis.chrome?.storage?.local) {
  const storage = {
    get(key) { return new Promise((resolve, reject) => chrome.storage.local.get(key, value => chrome.runtime.lastError ? reject(new Error('无法读取 TODO，原数据未改动。')) : resolve(value))); },
    set(value) { return new Promise((resolve, reject) => chrome.storage.local.set(value, () => chrome.runtime.lastError ? reject(new Error('保存失败，可能空间不足。请重试或导出备份。')) : resolve())); }
  };
  const store = KuTodoStore.create(storage);
  if (typeof KuTodoSync !== 'undefined') KuTodoSync.install({ chrome, store });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== 'ku:todo') return undefined;
    const extension = sender?.id === chrome.runtime.id;
    const allowed = extension && (sender.url?.startsWith(chrome.runtime.getURL('')) || /^https:\/\/kulms\.tl\.kansai-u\.ac\.jp\/webclass\//.test(sender.url || ''));
    if (!allowed || String(message.action || '').startsWith('__')) { respond({ ok: false, code: 'ACCESS', error: '无法访问 TODO。' }); return false; }
    store.dispatch(message).then(data => respond({ ok: true, data })).catch(error => respond({ ok: false, code: error.code || 'STORAGE', error: error.code ? error.message : '读取或保存 TODO 失败。原数据未被清空，请重试。' }));
    return true;
  });
}
