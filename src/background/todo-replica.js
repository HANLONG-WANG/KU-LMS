/* Append-only, causal multi-value registers. No wall-clock last-writer-wins. */
var KuTodoReplica = (() => {
  const copy = value => JSON.parse(JSON.stringify(value));
  const error = message => { const e = new Error(message); e.code = 'SYNC_DATA'; throw e; };
  const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
  const stamp = value => value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)));
  function key(value) {
    if (typeof value !== 'string' || !/^https:\/\/kulms\.tl\.kansai-u\.ac\.jp\/webclass\/course\.php\/[a-zA-Z0-9_-]+\/$/.test(value)) error('同步数据的课程标识无效。');
    return value;
  }
  function valueOf(entity, id, raw) {
    if (raw === null) { if (entity !== 'todo') error('课程目录和课题状态不能被同步删除。'); return null; }
    if (!raw || typeof raw !== 'object') error('同步记录格式无效。');
    if (entity === 'course') {
      if (key(raw.key) !== id || typeof raw.title !== 'string' || !raw.title.trim() || raw.title.length > 500 || typeof raw.term !== 'string' || raw.term.length > 100) error('同步课程格式无效。');
      return { key: id, title: raw.title, term: raw.term };
    }
    if (entity === 'assignment') {
      if (!identifier(raw.contentId) || id !== `${key(raw.courseKey)}contents/${raw.contentId}/` || raw.key !== id
        || typeof raw.title !== 'string' || !raw.title.trim() || raw.title.length > 500
        || !['試験', 'アンケート', 'レポート', '自習'].includes(raw.type) || typeof raw.completed !== 'boolean'
        || !raw.updatedAt || !stamp(raw.updatedAt)) error('同步课题完成记录无效。');
      return { key: id, courseKey: raw.courseKey, contentId: raw.contentId, title: raw.title, type: raw.type, completed: raw.completed, updatedAt: raw.updatedAt };
    }
    if (!identifier(id) || raw.id !== id || typeof raw.text !== 'string' || !raw.text.trim() || raw.text.length > 2000
      || !raw.createdAt || !raw.updatedAt || !stamp(raw.createdAt) || !stamp(raw.updatedAt) || !stamp(raw.completedAt) || !stamp(raw.deletedAt)) error('同步待办格式无效。');
    return { id, courseKey: key(raw.courseKey), text: raw.text, createdAt: raw.createdAt, updatedAt: raw.updatedAt, completedAt: raw.completedAt, deletedAt: raw.deletedAt };
  }
  function event(raw) {
    if (!raw || !identifier(raw.id) || !identifier(raw.device) || !['course', 'todo', 'assignment'].includes(raw.entity)
      || !Array.isArray(raw.parents) || raw.parents.length > 1000 || raw.parents.some(p => !identifier(p) || p === raw.id)
      || new Set(raw.parents).size !== raw.parents.length) error('同步变更格式无效。');
    const entityKey = raw.entity === 'course' ? key(raw.key) : raw.key;
    if (raw.entity === 'todo' && !identifier(entityKey)) error('同步待办标识无效。');
    return { id: raw.id, device: raw.device, entity: raw.entity, key: entityKey, parents: [...raw.parents].sort(), value: valueOf(raw.entity, entityKey, raw.value) };
  }
  function validate(raw) {
    if (!raw || ![1, 2].includes(raw.schemaVersion) || !identifier(raw.deviceId) || typeof raw.accountId !== 'string' || !raw.accountId || raw.accountId.length > 100
      || !Array.isArray(raw.events) || !Array.isArray(raw.outbox) || !Array.isArray(raw.files) || raw.events.length > 20000 || raw.files.length > 20000) error('同步历史格式或版本无效，原数据未改动。');
    const events = raw.events.map(event), ids = new Set(events.map(e => e.id));
    if (ids.size !== events.length || raw.outbox.some(id => !ids.has(id)) || raw.files.some(id => !identifier(id))) error('同步历史标识无效。');
    const byId = new Map(events.map(e => [e.id, e]));
    const children = new Map(), remaining = new Map();
    for (const e of events) {
      remaining.set(e.id, e.parents.length);
      for (const parent of e.parents) {
        const p = byId.get(parent);
        if (!p || p.entity !== e.entity || p.key !== e.key) error('同步变更不完整，请稍后重试；本地数据仍保留。');
        if (!children.has(parent)) children.set(parent, []);
        children.get(parent).push(e.id);
      }
    }
    const queue = events.filter(e => !e.parents.length).map(e => e.id); let count = 0;
    for (let i = 0; i < queue.length; i++) {
      count++;
      for (const child of children.get(queue[i]) || []) { remaining.set(child, remaining.get(child) - 1); if (!remaining.get(child)) queue.push(child); }
    }
    if (count !== events.length) error('同步变更存在循环，未覆盖本地内容。');
    return { schemaVersion: 2, accountId: raw.accountId, deviceId: raw.deviceId, events, outbox: [...new Set(raw.outbox)], files: [...new Set(raw.files)] };
  }
  function groups(replica) {
    const superseded = new Set(replica.events.flatMap(e => e.parents)), result = new Map();
    for (const e of replica.events) {
      if (superseded.has(e.id)) continue;
      const k = `${e.entity}:${e.key}`;
      if (!result.has(k)) result.set(k, []);
      result.get(k).push(e);
    }
    return result;
  }
  function headsFor(replica, entity, entityKey) {
    return (groups(replica).get(`${entity}:${entityKey}`) || []).map(e => e.id).sort();
  }
  function choose(heads) {
    // Keep unfinished work visible until an explicit confirmation resolves a conflict.
    const priority = e => e.entity === 'assignment' ? (e.value.completed ? 0 : 1) : e.value === null ? 0 : e.value.deletedAt ? 1 : 2;
    return [...heads].sort((a, b) => priority(b) - priority(a) || a.id.localeCompare(b.id))[0];
  }
  function signature(value) {
    if (value === null) return 'purged';
    if (typeof value.completed === 'boolean' && value.contentId) return JSON.stringify([value.key, value.completed]);
    if (value.key) return JSON.stringify(value);
    return JSON.stringify([value.id, value.courseKey, value.text, !!value.completedAt, !!value.deletedAt]);
  }
  function conflicts(replica) {
    if (!replica) return [];
    return [...groups(replica).values()].filter(heads => heads[0].entity !== 'course' && new Set(heads.map(e => signature(e.value))).size > 1)
      .map(heads => ({ entity: heads[0].entity, key: heads[0].key, heads: heads.map(e => e.id).sort(), versions: heads.map(e => ({ eventId: e.id, device: e.device, value: copy(e.value) })) }));
  }
  function append(replica, entity, entityKey, value, parents, uuid) {
    const change = event({ id: uuid(), device: replica.deviceId, entity, key: entityKey, parents, value });
    replica.events.push(change); replica.outbox.push(change.id);
  }
  function record(replica, before, after, uuid, confirmAssignment = false) {
    const headsByKey = groups(replica);
    for (const [entity, field, idField] of [['course', 'courses', 'key'], ['todo', 'todos', 'id'], ['assignment', 'assignmentCompletions', 'key']]) {
      const old = new Map((before[field] || []).map(v => [v[idField], v])), next = new Map((after[field] || []).map(v => [v[idField], v]));
      for (const entityKey of new Set([...old.keys(), ...next.keys()])) {
        if (entity !== 'todo' && !next.has(entityKey)) continue;
        const value = next.has(entityKey) ? valueOf(entity, entityKey, next.get(entityKey)) : null;
        const prior = old.has(entityKey) ? valueOf(entity, entityKey, old.get(entityKey)) : null;
        const explicitlyConfirmed = confirmAssignment && entity === 'assignment' && next.get(entityKey)?.revision !== old.get(entityKey)?.revision;
        if (JSON.stringify(value) === JSON.stringify(prior) && !explicitlyConfirmed) continue;
        const heads = headsByKey.get(`${entity}:${entityKey}`) || [];
        const hasConflict = entity !== 'course' && new Set(heads.map(e => signature(e.value))).size > 1;
        const parents = hasConflict && !explicitlyConfirmed ? [choose(heads).id] : heads.map(e => e.id);
        append(replica, entity, entityKey, value, parents, uuid);
      }
    }
  }
  function attach(workspace, accountId, uuid) {
    if (workspace.replica) {
      if (workspace.replica.accountId !== accountId) error('此资料已绑定其他 Google 账号。请新建本地资料，避免跨账号上传。');
      return;
    }
    workspace.replica = { schemaVersion: 2, accountId, deviceId: uuid(), events: [], outbox: [], files: [] };
    record(workspace.replica, { courses: [], todos: [], assignmentCompletions: [] }, workspace, uuid);
  }
  function project(workspace) {
    const headsByKey = groups(workspace.replica), courses = new Map(workspace.courses.map(c => [c.key, c]));
    for (const heads of headsByKey.values()) if (heads[0].entity === 'course') { const chosen = choose(heads); courses.set(chosen.key, copy(chosen.value)); }
    const todos = new Map(workspace.todos.map(t => [t.id, t]));
    for (const heads of headsByKey.values()) {
      if (heads[0].entity !== 'todo') continue;
      const chosen = choose(heads), old = todos.get(chosen.key);
      if (chosen.value === null) { todos.delete(chosen.key); continue; }
      if (!courses.has(chosen.value.courseKey)) error('同步待办缺少课程目录，请稍后重试。');
      if (!old || JSON.stringify(valueOf('todo', old.id, old)) !== JSON.stringify(chosen.value)) todos.set(chosen.key, { ...copy(chosen.value), revision: (old?.revision || 0) + 1 });
    }
    workspace.courses = [...courses.values()]; workspace.todos = [...todos.values()];
    const assignments = new Map((workspace.assignmentCompletions || []).map(t => [t.key, t]));
    for (const heads of headsByKey.values()) {
      if (heads[0].entity !== 'assignment') continue;
      const chosen = choose(heads), old = assignments.get(chosen.key);
      if (!courses.has(chosen.value.courseKey)) error('同步课题缺少课程目录，请稍后重试。');
      if (!old || JSON.stringify(valueOf('assignment', old.key, old)) !== JSON.stringify(chosen.value)) {
        assignments.set(chosen.key, { ...copy(chosen.value), revision: (old?.revision || 0) + 1 });
      }
    }
    workspace.assignmentCompletions = [...assignments.values()];
  }
  function merge(workspace, incoming, files = []) {
    const replica = workspace.replica, known = new Map(replica.events.map(e => [e.id, e]));
    for (const raw of incoming) {
      const e = event(raw), existing = known.get(e.id);
      if (existing && JSON.stringify(e) !== JSON.stringify(existing)) error('云端变更标识冲突，未覆盖本地数据。');
      if (!existing) known.set(e.id, e);
    }
    const uploaded = new Set(incoming.map(e => e.id));
    workspace.replica = validate({ ...replica, events: [...known.values()], outbox: replica.outbox.filter(id => !uploaded.has(id)), files: [...new Set([...replica.files, ...files])] });
    project(workspace);
  }
  function resolve(workspace, entityKey, expectedHeads, selectedEvent, uuid, entity = 'todo') {
    if (!['todo', 'assignment'].includes(entity) || !Array.isArray(expectedHeads)) error('无效的冲突选择。');
    const heads = groups(workspace.replica).get(`${entity}:${entityKey}`) || [];
    if (JSON.stringify(heads.map(e => e.id).sort()) !== JSON.stringify([...expectedHeads].sort())) error('冲突版本已改变，请刷新后重新选择。');
    const selected = heads.find(e => e.id === selectedEvent);
    if (!selected) error('选择的冲突版本不存在。');
    append(workspace.replica, entity, entityKey, selected.value, heads.map(e => e.id), uuid);
    project(workspace);
  }
  function exportTodos(workspace) {
    const todos = copy(workspace.todos), used = new Set(todos.map(t => t.id));
    for (const conflict of conflicts(workspace.replica)) {
      if (conflict.entity !== 'todo') continue;
      const displayed = workspace.todos.find(t => t.id === conflict.key);
      for (const version of conflict.versions) {
        if (!version.value || (displayed && signature(version.value) === signature(displayed))) continue;
        const base = `conflict_${version.eventId}`.slice(0, 90);
        let id = base, suffix = 0;
        while (used.has(id)) id = `${base}_${++suffix}`;
        used.add(id);
        todos.push({ ...copy(version.value), id, revision: 1 });
      }
    }
    return todos;
  }
  return { validate, record, attach, project, merge, resolve, conflicts, exportTodos, headsFor };
})();
