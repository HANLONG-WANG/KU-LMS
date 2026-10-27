/* Shared deadline rules for content, popup and worker. */
var KuTodoDeadline = {
  HOUR: 60 * 60 * 1000,
  urgency(todo, now = Date.now()) {
    if (!todo.dueAt || todo.completedAt || todo.deletedAt) return 'none';
    const left = Date.parse(todo.dueAt) - now;
    return left <= 0 ? 'overdue' : left <= 24 * this.HOUR ? 'soon' : left <= 72 * this.HOUR ? 'near' : 'normal';
  },
  compareCreated(a, b) { return b.createdAt.localeCompare(a.createdAt); },
  compare(a, b) {
    return (a.dueAt || '9999').localeCompare(b.dueAt || '9999') || KuTodoDeadline.compareCreated(a, b);
  },
  remaining(todo, now = Date.now()) {
    if (!todo.dueAt) return '';
    const left = Date.parse(todo.dueAt) - now;
    if (left <= 0) return '期限切れ';
    if (left < this.HOUR) return `あと ${Math.ceil(left / 60000)}分`;
    if (left <= 24 * this.HOUR) return `あと ${Math.ceil(left / this.HOUR)}時間`;
    return `あと ${Math.ceil(left / (24 * this.HOUR))}日`;
  },
  format(dueAt) {
    const d = new Date(dueAt), pad = n => String(n).padStart(2, '0');
    return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },
  scopedTodos(workspace) {
    const keys = workspace.courseScope?.keys;
    return workspace.todos.filter(t => !t.completedAt && !t.deletedAt && (!keys || keys.includes(t.courseKey)));
  },
  reminders(workspace, now = Date.now()) {
    return this.scopedTodos(workspace).filter(t => ['overdue', 'soon'].includes(this.urgency(t, now)));
  },
  summary(todos, now = Date.now()) {
    const active = todos.filter(t => !t.completedAt && !t.deletedAt).sort(this.compare);
    const overdue = active.filter(t => this.urgency(t, now) === 'overdue').length;
    const soon = active.filter(t => this.urgency(t, now) === 'soon').length;
    return { count: active.length, overdue, soon, state: overdue ? 'overdue' : soon ? 'soon' : 'normal', next: active.find(t => t.dueAt)?.dueAt };
  },
  notificationThreshold(todo, now = Date.now()) {
    const state = this.urgency(todo, now), left = Date.parse(todo.dueAt) - now;
    if (state === 'overdue') return left < -24 * this.HOUR ? null : 0;
    if (state === 'soon') return left <= this.HOUR ? 1 : 24;
    return null;
  }
};
