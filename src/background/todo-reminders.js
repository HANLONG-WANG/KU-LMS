/* Reminder metadata is local-only; the TODO database remains read-only here. */
var KuTodoReminders = (() => {
  const KEY = 'kuLmsTodoRemindersV1', TODO_KEY = 'kuLmsTodosV1', ALARM = 'ku-todo-reminders', PREFIX = 'ku-todo-reminder:';
  let queue = Promise.resolve();
  const markKey = (w, t, threshold) => JSON.stringify([w.id, t.id, t.dueAt, threshold]);
  async function update(notify, now) {
    const data = await chrome.storage.local.get([TODO_KEY, KEY]), db = data[TODO_KEY];
    const workspace = db?.workspaces.find(w => w.id === db.activeId);
    const reminders = workspace ? KuTodoDeadline.reminders(workspace, now) : [];
    await chrome.action.setBadgeText({ text: reminders.length ? reminders.length > 99 ? '99+' : String(reminders.length) : '' });
    await chrome.action.setBadgeBackgroundColor({ color: reminders.some(t => KuTodoDeadline.urgency(t, now) === 'overdue') ? '#a6243b' : '#c2410c' });
    if (!notify) return;
    const previous = data[KEY] || {}, marks = {}, valid = new Set();
    let persisted = JSON.stringify(previous);
    for (const w of db?.workspaces || []) {
      for (const t of w.todos.filter(t => t.dueAt && !t.completedAt && !t.deletedAt)) {
        for (const threshold of [24, 1, 0]) valid.add(markKey(w, t, threshold));
      }
    }
    for (const key of Object.keys(previous)) if (valid.has(key)) marks[key] = true;
    for (const t of reminders) {
      const threshold = KuTodoDeadline.notificationThreshold(t, now);
      if (threshold === null || [24, 1, 0].some(n => n <= threshold && marks[markKey(workspace, t, n)])) continue;
      const course = workspace.courses.find(c => c.key === t.courseKey)?.title || '';
      await chrome.notifications.create(PREFIX + JSON.stringify([workspace.id, t.id]), {
        type: 'basic', iconUrl: chrome.runtime.getURL('assets/icons/icon128.png'),
        title: threshold === 0 ? 'TODO 已到截止时间' : `TODO 将在 ${threshold} 小时内截止`,
        message: `${t.text.length > 120 ? t.text.slice(0, 120) + '…' : t.text}\n${course} · 截止：${KuTodoDeadline.format(t.dueAt)}`
      });
      for (const n of [24, 1, 0]) if (n >= threshold) marks[markKey(workspace, t, n)] = true;
      await chrome.storage.local.set({ [KEY]: marks });
      persisted = JSON.stringify(marks);
    }
    if (persisted !== JSON.stringify(marks)) await chrome.storage.local.set({ [KEY]: marks });
  }
  function run(notify = false, now = Date.now()) {
    const result = queue.then(() => update(notify, now));
    queue = result.catch(() => {});
    return result;
  }
  function install() {
    const refresh = (notify = false) => { void run(notify).catch(error => console.error('[KU-LMS TODO reminders]', error)); };
    const schedule = () => { chrome.alarms.create(ALARM, { periodInMinutes: 1 }); refresh(); };
    chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes[TODO_KEY]) refresh(); });
    chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM) refresh(true); });
    chrome.runtime.onStartup.addListener(schedule);
    chrome.runtime.onInstalled.addListener(schedule);
    chrome.notifications.onClicked.addListener(async id => {
      if (!id.startsWith(PREFIX)) return;
      const tabs = await chrome.tabs.query({ url: 'https://kulms.tl.kansai-u.ac.jp/webclass/*' });
      const tab = tabs.find(t => t.active) || tabs[0];
      if (tab) { await chrome.tabs.update(tab.id, { active: true }); await chrome.windows.update(tab.windowId, { focused: true }); }
      else await chrome.tabs.create({ url: 'https://kulms.tl.kansai-u.ac.jp/webclass/' });
      await chrome.notifications.clear(id);
    });
    chrome.alarms.get(ALARM, alarm => { if (!alarm) chrome.alarms.create(ALARM, { periodInMinutes: 1 }); });
    refresh();
  }
  return { KEY, ALARM, run, install };
})();
KuTodoReminders.install();
