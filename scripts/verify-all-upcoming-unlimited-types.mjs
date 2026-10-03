import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { loadOfflineKulmsInto } from './lib/offline-content-vm.mjs';

const origin = 'https://kulms.tl.kansai-u.ac.jp';
const courseHref = `${origin}/webclass/course.php/26170478/`;
const now = Date.now();
const localDate = (time) => {
  const date = new Date(time);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
};
const fixtures = [
  { title: '出席ミニテスト', type: '試験', days: 2 },
  { title: '来月のレポート', type: 'レポート', days: 30, startsIn: 14 },
  { title: '課題の説明資料', type: '資料', days: 180 },
  { title: '授業アンケート', type: 'アンケート', days: 10 },
  { title: '外部学習ツール', type: 'LTIツール', days: 90 },
  { title: '自習教材', type: '自習', days: 20 },
  { title: 'その他の教材', type: 'その他', days: 60 },
  { title: '期限を過ぎたレポート', type: 'レポート', days: -1 }
];
const { document, window } = parseHTML(`<html><head><title>テストコース</title></head><body>
  <select name="year"><option value="2026" selected>2026</option></select>
  <select name="semester"><option value="2" selected>秋学期</option></select>
  ${fixtures.map((item, index) => `<div class="cl-contentsList_listGroupItem">
    <div class="cl-contentsList_contentInfo"><h4>${item.title}</h4></div>
    <span class="cl-contentsList_categoryLabel">${item.type}</span>
    <span class="cl-contentsList_contentDetailListItemLabel">利用可能期間</span>
    <span>${localDate(now + (item.startsIn ?? -10) * 86400000)} - ${localDate(now + item.days * 86400000)}</span>
    <div class="cl-contentsList_contentDetail"><a href="${courseHref}contents/${index}/">詳細</a></div>
  </div>`).join('')}
</body></html>`);
const app = {
  document: {
    title: document.title,
    body: document.body,
    documentElement: document.documentElement,
    querySelector: document.querySelector.bind(document),
    querySelectorAll: document.querySelectorAll.bind(document),
    getElementById: document.getElementById.bind(document),
    createElement: document.createElement.bind(document)
  },
  state: { currentContext: { links: { home: `${origin}/webclass/` } } }
};
loadOfflineKulmsInto(app);

const courseView = { course: { course: { links: { materials: courseHref, returnToCourses: `${courseHref}logout?acs_=exit` } } } };
const items = app.collectAllUpcomingCourseItems(courseView, { courseHref });
assert.equal(items.length, 7, 'Real course parsing must retain all future deadlines, including distant and not-yet-open items.');
assert(items.some((item) => item.title === '来月のレポート'), 'A deadline beyond seven days must survive course collection.');
assert(items.some((item) => item.title === '課題の説明資料'), 'A deadline six months away must survive course collection.');

const payload = {
  version: 1, phase: 'navigating-to-course', currentIndex: 0,
  homeUrl: `${origin}/webclass/?acs_=old`, resultUrl: `${origin}/webclass/?acs_=old#ku-all-upcoming`,
  homeYear: '2026', homeSemester: '2', restoreAttempts: 0,
  expiresAt: new Date(now + 60_000).toISOString(),
  targets: [{ href: courseHref, courseHref }], items: []
};
app.window.location.href = courseHref;
app.state.currentRoute = { name: 'course-materials' };
app.state.currentView = courseView;
app.writeAllUpcomingState(payload);
await app.continueAllUpcomingOnCourse(courseView, app.readAllUpcomingState());
assert.equal(app.readAllUpcomingState().items.length, 7, 'Distant deadlines must survive the persisted traversal merge.');
assert.equal(app.readAllUpcomingState().phase, 'restoring-home');
assert.equal(app.window.location.href, courseView.course.course.links.returnToCourses, 'Collection must still leave the course through its native exit.');

app.window.location.href = `${origin}/webclass/index.php?year=2026&semester=2&acs_=fresh`;
app.resetPageLifecycleGuards({ type: 'pageshow' });
app.state.currentRoute = { name: 'home' };
const homeView = { filters: { year: '2026', semester: '2' } };
app.state.currentView = homeView;
assert(app.doesAllUpcomingMatchCurrentView(homeView, payload), 'The same semester must match after LMS changes the entrypoint and session token.');
assert(!app.doesAllUpcomingMatchCurrentView({ filters: { year: '2025', semester: '2' } }, payload), 'A different year still requires restoration.');
assert(!app.doesAllUpcomingMatchCurrentView({ filters: { year: '2026', semester: '1' } }, payload), 'A different semester still requires restoration.');
assert(!app.doesAllUpcomingMatchCurrentView(homeView, { ...payload, homeUrl: 'https://example.com/webclass/' }), 'A different origin must not match.');
assert(!app.doesAllUpcomingMatchCurrentView(homeView, { ...payload, homeUrl: courseHref }), 'A course route must not count as the restored home.');
let filterSubmissions = 0;
let renders = 0;
app.submitHomeFilters = () => { filterSubmissions++; };
app.rerender = () => { renders++; };
await app.continueAllUpcomingOnHome(homeView, app.readAllUpcomingState(), app.state.currentRoute);
assert.equal(filterSubmissions, 0, 'Equivalent home URLs must finish without a filter-submit loop.');
assert.equal(app.readAllUpcomingState().phase, 'completed');
assert.equal(app.state.currentRoute.name, 'home-all-upcoming');
assert.equal(app.window.location.hash, '#ku-all-upcoming');
assert.equal(new URL(app.readAllUpcomingState().resultUrl).searchParams.get('acs_'), 'fresh', 'Results must use the current session token.');
assert.equal(app.state.currentView.items.length, 7, 'The dedicated view must retain every future deadline.');
assert.equal(renders, 1, 'Completion must render the dedicated results page.');

// Isolate optional panels while exercising the real renderer and change handler.
app.kuBindTodos = () => {};
app.kuBindCourseTodos = () => {};
app.kuBindTaskCompletions = () => {};
const root = document.createElement('main');
document.body.appendChild(root);
app.rerender = () => {
  root.innerHTML = app.renderAllUpcoming(app.state.currentView);
  app.bindInteractiveHandlers(root, app.state.currentRoute, app.state.currentView);
};
app.rerender();
const visibleTitles = () => Array.from(root.querySelectorAll('.ku-panel-title')).map((node) => node.textContent);
const chooseType = (key) => {
  const select = root.querySelector('[data-action="filter-all-upcoming-type"]');
  Array.from(select.querySelectorAll('option')).forEach((option) => { option.removeAttribute('selected'); });
  select.querySelector(`option[value="${key}"]`).selected = true;
  select.dispatchEvent(new window.Event('change'));
};
assert.equal(visibleTitles().length, 7);
for (const [key, title] of [
  ['exam', '出席ミニテスト'], ['report', '来月のレポート'], ['material', '課題の説明資料'],
  ['survey', '授業アンケート'], ['lti', '外部学習ツール'], ['selfstudy', '自習教材'], ['generic', 'その他の教材']
]) {
  chooseType(key);
  assert.deepEqual(visibleTitles(), [title], `Selecting ${key} must show only its native category.`);
  assert.equal(root.querySelector('select').value, key, 'The selected filter must survive rerendering.');
  assert(root.textContent.includes('表示 1 / 全 7 件'), 'The count must distinguish filtered and total items.');
}
chooseType('all');
assert.equal(visibleTitles().length, 7, 'Resetting the selector must restore all items without another collection.');
app.state.currentView.items = app.state.currentView.items.filter((item) => item.type !== '試験');
chooseType('exam');
assert.equal(visibleTitles().length, 0);
assert(root.textContent.includes('この種類の課題・教材はありません。'), 'An empty category must show a specific empty state.');

console.log(JSON.stringify({ ok: true, checks: ['real-course-parser-retains-distant-deadlines', 'traversal-persists-unlimited-results', 'home-alias-and-session-token-restoration', 'dedicated-results-route', 'native-type-filter-events-and-counts', 'empty-type-state'] }));
