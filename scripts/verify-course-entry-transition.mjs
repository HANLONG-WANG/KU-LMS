import assert from 'node:assert/strict';
import vm from 'node:vm';
import { parseHTML, DOMParser } from 'linkedom';
import { getKulmsScript, readOrderedSource } from './lib/content-source.mjs';

const source = readOrderedSource(getKulmsScript().js.filter((file) => file !== 'src/content/main.js'));
const origin = 'https://kulms.tl.kansai-u.ac.jp';
const homeUrl = `${origin}/webclass/`;
const targets = ['26170478', '26170472'].map((id) => ({
  href: `${origin}/webclass/course.php/${id}/login?acs_=offline`,
  courseHref: `${origin}/webclass/course.php/${id}/`, title: `Course ${id}`
}));
// Observed LMS /course.php/:id/login response: a script redirect, without materials or an exit link.
const entryHtml = '<html><body><script>window.location.href="/webclass/course.php/26170478/?acs_=offline";</script></body></html>';
const checks = [];

function page(href, html, storage) {
  const { document } = parseHTML(html);
  Object.defineProperty(document, 'readyState', { value: 'complete', writable: true });
  document.forms = {};
  const calls = [];
  const app = {
    document, console, URL, URLSearchParams, Date, AbortController, DOMException, DOMParser, setTimeout, clearTimeout,
    window: {
      location: new URL(href), addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout,
      performance: { getEntriesByType: () => [{ type: 'navigate' }] },
      sessionStorage: {
        getItem: (key) => storage.get(key) || null,
        setItem: (key, value) => storage.set(key, String(value)), removeItem: (key) => storage.delete(key)
      }
    },
    chrome: { runtime: { lastError: null }, storage: { onChanged: { addListener() {} } } },
    fetch() { throw new Error('A course transition must not issue supplemental requests'); }
  };
  vm.createContext(app);
  vm.runInContext(source, app);
  app.kuReadExtensionSettings = async () => app.kuNormalizeExtensionSettings({ enabled: true, autoLogin: false });
  // Keep real parsers, storage, lifecycle and collectors; omit presentation unrelated to navigation.
  app.renderShell = () => '<main>Offline view</main>';
  app.renderLoadingPage = () => '';
  app.rerender = () => calls.push('render');
  for (const name of ['collectContext', 'buildView', 'rememberCourseUpcoming', 'continueHomeRefreshOnCourse', 'continueAllUpcomingOnCourse']) {
    const original = app[name];
    app[name] = (...args) => { calls.push(name); return original(...args); };
  }
  app.calls = calls;
  return app;
}

function courseHtml(id, index) {
  const start = new Date(Date.now() - 86400000);
  const end = new Date(Date.now() + 2 * 86400000);
  const format = (date) => `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} 12:00`;
  return `<html><body>
    <a title="アカウントメニュー">Student</a>
    <a href="/webclass/course.php/${id}/">Course ${id} (2026-秋学期-水曜日-3限-${id.slice(-5)})</a>
    <a href="/webclass/course.php/${id}/logout">コースリスト</a>
    <div class="cl-contentsList_listGroupItem">
      <div class="cm-contentsList_contentName"><a href="/webclass/course.php/${id}/contents/task-${index}/">Task ${index}</a></div>
      <div class="cm-contentsList_contentDetailListItemLabel">利用可能期間</div><div>${format(start)} - ${format(end)}</div>
      <a href="/webclass/course.php/${id}/contents/task-${index}/history">利用回数 0</a>
    </div></body></html>`;
}

for (const mode of ['refresh', 'all-upcoming']) {
  const storage = new Map();
  const app = page(targets[0].href, entryHtml, storage);
  app.syncCourseUpcomingCacheIdentity('Student');
  const payload = {
    version: 1, phase: 'navigating-to-course', currentIndex: 0, homeUrl, resultUrl: `${homeUrl}#ku-all-upcoming`,
    homeYear: '', homeSemester: '', targets, items: [], visitedCourseCount: 0,
    startedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 900000).toISOString(),
    lastProgressAt: new Date().toISOString(), abortReason: ''
  };
  const key = mode === 'refresh' ? app.HOME_REFRESH_STATE_KEY : app.ALL_UPCOMING_STATE_KEY;
  storage.set(key, JSON.stringify(payload));
  const before = storage.get(key);
  const beforeCache = storage.get(app.COURSE_UPCOMING_CACHE_KEY);

  await app.bootKulms();
  assert.equal(storage.get(key), before, `${mode}: boot must preserve the queue on the native login redirect`);
  assert.equal(app.document.getElementById(app.ROOT_ID), null, 'Do not mount the extension on a native redirect');
  assert.equal(app.document.querySelector('script').isConnected, true, 'The native redirect script must remain intact');
  assert.deepEqual(app.calls, [], 'Do not parse or collect the empty transition document');
  await app.init();
  app.ensureRoot();
  app.document.documentElement.dataset.kuRedesignState = 'ready';
  app.rebindHomeInterceptionOnHistoryRestore({ persisted: true });
  assert.equal(storage.get(key), before, 'Direct init and history restoration must preserve the queue too');
  assert.equal(storage.get(app.COURSE_UPCOMING_CACHE_KEY), beforeCache);
  assert.equal(app.document.getElementById(app.ROOT_ID), null);
  assert.deepEqual(app.calls, []);
  checks.push(`${mode}: entry boot, init and history restoration preserve collectors and native redirect`);

  for (const [index, target] of targets.entries()) {
    if (index) {
      const entry = page(target.href, entryHtml, storage);
      const saved = storage.get(key);
      await entry.bootKulms();
      assert.equal(storage.get(key), saved, 'Each course entry must retain the current target');
    }
    const id = new URL(target.courseHref).pathname.split('/')[3];
    const materials = page(target.courseHref, courseHtml(id, index), storage);
    await materials.bootKulms();
    const collected = JSON.parse(storage.get(key));
    assert.equal(collected.currentIndex, index + 1, 'Only a real materials page advances the queue');
    assert.equal(collected.phase, index + 1 < targets.length ? 'returning-home-between-courses' : 'restoring-home');
    assert.equal(materials.window.location.href, `${target.courseHref}logout`, 'Leave through the native course exit');
    const cache = JSON.parse(storage.get(materials.COURSE_UPCOMING_CACHE_KEY));
    assert.equal(cache.entries[target.courseHref].items[0].title, `Task ${index}`, 'Collect actual materials into the home cache');
    if (mode === 'all-upcoming') assert.equal(collected.items.length, index + 1);
    if (index + 1 < targets.length) {
      const home = page(homeUrl, '<html><body><a title="アカウントメニュー">Student</a></body></html>', storage);
      home.buildView = async () => ({ filters: { year: '', semester: '' } });
      await home.init();
      assert.equal(home.window.location.href, targets[index + 1].href, 'Resume the next course only after returning home');
    }
  }
  if (mode === 'refresh') {
    const homeHtml = `<html><body><a title="アカウントメニュー">Student</a>
      <table id="schedule-table"><tbody><tr><th>1限</th><td>${targets.map((target) => `
        <div class="course-data-box-normal"><a href="${target.href}">${target.title}</a>
          <div class="course-contents-info">締切が近い課題があります。</div></div>`).join('')}
      </td></tr></tbody></table></body></html>`;
    const restoredHome = page(homeUrl, homeHtml, storage);
    restoredHome.loadSupplementalDocument = async (href) => {
      assert.equal(new URL(href, origin).pathname, '/webclass/msg_editor.php', 'Home enrichment may request only the message preview');
      const { document } = parseHTML('<html><body></body></html>');
      document.forms = {};
      return document;
    };
    let enrichment;
    const enrich = restoredHome.enrichHomeAsync;
    restoredHome.enrichHomeAsync = (...args) => (enrichment = enrich(...args));
    await restoredHome.bootKulms();
    await enrichment;
    assert.equal(restoredHome.readHomeRefreshState(), null, 'Returning home completes the refresh queue');
    assert.equal(restoredHome.state.currentView.upcoming.loading, false, 'The restored home must finish loading upcoming assignments');
    assert.equal(restoredHome.state.currentView.messages.loading, false, 'The restored home must finish loading messages');
    assert.deepEqual(Array.from(restoredHome.state.currentView.upcoming.items, (item) => item.title).sort(), ['Task 0', 'Task 1']);
    assert.equal(restoredHome.renderHome(restoredHome.state.currentView).includes('課題を集約中'), false, 'The completed home must render assignments without a stuck spinner');
    checks.push('refresh: returning home clears the queue, displays cached assignments and settles both loading cards');
  }
  checks.push(`${mode}: two real course pages collect items and navigate through native exits in order`);
}

const routeApp = page(homeUrl, entryHtml, new Map());
for (const [path, name] of [
  ['/webclass/login.php', 'login'], ['/webclass/login.php/?top_menu=1', 'login'],
  ['/webclass/logout.php', 'logout'], ['/webclass/course.php/26170478/login', 'course-entry'],
  ['/webclass/course.php/example_001/login/?acs_=offline', 'course-entry'],
  ['/webclass/course.php/26170478/', 'course-materials'], ['/webclass/course.php/26170478/logout', 'course-return'],
  ['/webclass/course.php/26170478/my-reports', 'course-myreports'], ['/webclass/course.php/26170478/scores', 'course-scores']
]) assert.equal(routeApp.detectRoute(new URL(path, origin)).name, name, path);
checks.push('global login/logout, materials, course exits, reports and scores retain their routes');

const loginStorage = new Map();
const login = page(`${origin}/webclass/login.php`, '<html><body><form><input name="username"><input type="password" name="val"></form></body></html>', loginStorage);
login.syncCourseUpcomingCacheIdentity('Student');
login.writeHomeRefreshState({ phase: 'navigating-to-course' });
login.writeAllUpcomingState({ phase: 'navigating-to-course', items: [] });
let renderedLogin = false;
login.buildView = async (route) => { renderedLogin = route.name === 'login'; return { form: login.document.querySelector('form') }; };
await login.bootKulms();
assert.equal(renderedLogin, true, 'The real login page must still enter its rendering flow');
assert.equal(login.state.currentRoute.name, 'login');
assert.ok(login.document.getElementById(login.ROOT_ID));
assert.equal(login.readHomeRefreshState(), null, 'A real login still clears stale collector state');
assert.equal(login.readAllUpcomingState(), null);
assert.equal(loginStorage.has(login.COURSE_UPCOMING_CACHE_KEY), false);
checks.push('the real login page still renders and clears authenticated collector/cache state');
console.log(JSON.stringify({ ok: true, checks }, null, 2));
