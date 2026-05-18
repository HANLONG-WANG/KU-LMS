import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('src/content/main.js', 'utf8');
const architectureDoc = fs.readFileSync('docs/ku-lms-extension-architecture.md', 'utf8');
const sessionSafetyDoc = fs.readFileSync('docs/ku-lms-session-safety-analysis.md', 'utf8');
const entrypointDoc = fs.readFileSync('docs/AI_DOCS_ENTRYPOINT.md', 'utf8');

function extractFunction(name) {
  const patterns = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const pattern of patterns) {
    start = source.indexOf(pattern);
    if (start !== -1) break;
  }
  if (start === -1) throw new Error(`Function not found: ${name}`);
  let brace = 0;
  let seenOpen = false;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') {
      brace += 1;
      seenOpen = true;
    } else if (char === '}') {
      brace -= 1;
      if (seenOpen && brace === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract function: ${name}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(source.includes("const HOME_REFRESH_MAX_AGE_MS = 5 * 60 * 1000"), 'Refresh state should expire automatically');
assert(source.includes("const HOME_REFRESH_STALL_MS = 45 * 1000"), 'Refresh state should bound stalled progress');
assert(source.includes("const HOME_REFRESH_MAX_RESTORE_ATTEMPTS = 2"), 'Refresh restore attempts should be bounded');
const bootingIndex = source.indexOf("document.documentElement.dataset.kuRedesignState = 'booting';");
const earlyReadIndex = source.indexOf('syncBootRefreshOverlay();');
const bootShellIndex = source.indexOf('mountBootShell();');
const initFn = extractFunction('init');
const bootOverlayFn = extractFunction('syncBootRefreshOverlay');
const continueFn = extractFunction('continueHomeRefreshIfNeeded');
const abortFn = extractFunction('abortHomeRefresh');
assert(bootingIndex !== -1, 'Booting state assignment should exist');
assert(earlyReadIndex !== -1, 'Refresh overlay should be rehydrated during boot');
assert(bootShellIndex !== -1, 'Boot shell mount should exist');
assert(bootingIndex < earlyReadIndex, 'Early overlay sync should happen only after the booting state is set');
assert(earlyReadIndex < bootShellIndex, 'Early overlay sync should happen before the boot shell mount');
assert(bootOverlayFn.includes('syncHomeRefreshOverlay(readHomeRefreshState());'), 'Boot overlay helper should remain visual-only and state-derived');
assert(source.includes("window.addEventListener('pagehide', abortInFlightPageRequests);"), 'Pagehide should abort in-flight page requests');
assert(source.includes("window.addEventListener('beforeunload', abortInFlightPageRequests);"), 'Beforeunload should abort in-flight page requests');
assert(source.includes("window.addEventListener('pageshow', resetPageLifecycleGuards);"), 'Pageshow should reset page-leaving guards after history restore');
assert(source.includes("if (normalized === '/webclass/login.php') return { supported: true, name: 'login' };"), 'Route detection should classify login.php as a supported direct login route');
assert(source.includes("if (normalized === '/webclass/logout.php') return { supported: true, name: 'logout' };"), 'Route detection should classify logout.php as a supported direct logout route');
assert(extractFunction('detectRoute').includes("(?:\\/login)?$"), 'Route detection should treat native course login URLs as course-materials routes');
assert(source.includes("abortHomeRefresh(refreshState, isAuthInvalidRoute(route) ? 'auth-invalid-route' : `unsupported-route:${route.name}`);"), 'Unsupported refresh routes should abort instead of restoring home');
assert(source.includes("abortHomeRefresh(payload, 'manual-home-navigation');"), 'Manual return to home mid-refresh should abort');
assert(source.includes("abortHomeRefresh(payload, 'target-mismatch');"), 'Target mismatch should abort instead of forcing home restoration');
assert(initFn.includes("if ((courseConflictPage && !intentionalLogoutRoute) || (authInvalidPage && !intentionalLoginRoute))"), 'Init should have an explicit top-level conflict/auth terminal branch.');
assert(initFn.includes("const intentionalLogoutRoute = route.name === 'logout';"), 'Init should explicitly distinguish the direct logout terminal route.');
assert(initFn.includes("courseConflictPage && !intentionalLogoutRoute"), 'Init should allow direct logout-route rendering while keeping conflict fail-closed elsewhere.');
assert(initFn.includes("abortHomeRefresh(refreshState, courseConflictPage ? 'course-conflict-page' : 'auth-invalid-page');"), 'Init should preserve exact top-level abort reason strings');
assert(extractFunction('continueHomeRefreshIfNeeded').includes("route.name === 'login'"), 'Active refresh should still fail closed when traversal lands on the direct login route');
assert(extractFunction('continueHomeRefreshIfNeeded').includes("route.name === 'logout'"), 'Active refresh should still fail closed when traversal lands on the direct logout route');
assert(extractFunction('continueHomeRefreshIfNeeded').includes("'auth-invalid-route'"), 'Active refresh should fail closed on auth-invalid routes');
assert(extractFunction('continueHomeRefreshIfNeeded').includes("abortHomeRefresh(payload, 'page-leaving');"), 'Leaving-page guard should stop refresh continuation');
assert(continueFn.includes("abortHomeRefresh(payload, isCourseConflictPage(document) ? 'course-conflict-page' : 'auth-invalid-route');"), 'Continuation abort taxonomy should preserve conflict/auth-invalid split');
assert(continueFn.includes("abortHomeRefresh(payload, `unexpected-route:${route.name}`);"), 'Continuation abort taxonomy should preserve unexpected-route reasons');
assert(abortFn.includes('const nextPayload = writeHomeRefreshState('), 'Abort should write terminal state first');
assert(abortFn.includes('syncHomeRefreshOverlay(nextPayload);'), 'Abort flow should still resync the overlay immediately after recording terminal state');
assert(extractFunction('syncHomeRefreshOverlay').includes("document.getElementById('ku-home-refresh-overlay')?.remove();"), 'Overlay sync should remove the blocking overlay when refresh becomes inactive');
assert(source.includes('function isCourseConflictPage(doc = document)'), 'Top-level course conflict pages should be detected explicitly');
assert(extractFunction('renderHome').includes('検証中'), 'Visible refresh affordance should honestly signal the validation-gated state');
assert(extractFunction('loadSupplementalDocument').includes('signal: getPageRequestSignal()'), 'Supplemental home fetches should be abortable on navigation');
assert(extractFunction('fetchCourseTimeline').includes('signal: getPageRequestSignal()'), 'Timeline fetches should be abortable on navigation');
assert(entrypointDoc.includes('prd-ku-lms-home-refresh-login-loop-safety.md'), 'AI docs entrypoint should point to the login-loop safety PRD');
assert(entrypointDoc.includes('test-spec-ku-lms-home-refresh-login-loop-safety.md'), 'AI docs entrypoint should point to the login-loop safety test spec');
assert(architectureDoc.includes('fail closed'), 'Architecture doc should document fail-closed refresh behavior');
assert(sessionSafetyDoc.includes('login.php`, `logout.php`, or another auth-invalid route'), 'Session-safety doc should document logout as a refresh fail-closed terminal route');

const storage = new Map();
const overlayStates = [];
const sandbox = {
  console,
  URL,
  Date,
  AbortController,
  HOME_REFRESH_STATE_KEY: 'ku-redesign-home-refresh-v1',
  HOME_REFRESH_MAX_AGE_MS: 5 * 60 * 1000,
  HOME_REFRESH_STALL_MS: 45 * 1000,
  HOME_REFRESH_MAX_RESTORE_ATTEMPTS: 2,
  pageIsLeaving: false,
  pageRequestAbortController: new AbortController(),
  state: {
    currentRoute: { name: 'home' },
    currentView: { filters: { year: '2026', semester: '1' } },
    currentContext: {
      links: {
        courses: '/courses',
        notifications: '/notifications',
        messages: '/messages'
      }
    },
    homeSearch: ''
  },
  document: {
    body: { innerText: '' },
    getElementById() { return null; }
  },
  window: {
    location: {
      href: 'https://kulms.tl.kansai-u.ac.jp/webclass/?acs_=abc',
      origin: 'https://kulms.tl.kansai-u.ac.jp',
      pathname: '/webclass/',
      search: '?acs_=abc'
    },
    performance: {
      getEntriesByType() {
        return [{ type: 'navigate' }];
      }
    },
    sessionStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); }
    }
  },
  syncHomeRefreshOverlay(payload) {
    overlayStates.push(payload ? payload.phase || 'unknown' : 'cleared');
  },
  filterOtherCourses() { return []; },
  normalizeHomeAnnouncementItems() { return []; },
  renderPanelList() { return '<div>panel</div>'; },
  materialTypeTone() { return 'neutral'; },
  escapeHtml(value = '') { return String(value); },
  escapeAttr(value = '') { return String(value); },
  buildUpcomingSubtitle() { return 'subtitle'; },
  formatDate() { return '05/20'; },
  truncate(value = '') { return String(value); },
  icon() { return ''; },
  renderWeekLabel() { return '2026/05/11 〜 05/16'; },
  renderSchedule() { return '<div>schedule</div>'; },
  renderSyllabusChip() { return ''; },
  submitHomeFilters(year, semester) {
    sandbox.lastSubmittedFilters = { year, semester };
  },
  absoluteUrl(value = '') {
    return value.startsWith('http') ? value : `https://kulms.tl.kansai-u.ac.jp${value}`;
  },
  buildCourseCacheKey(value = '') {
    return String(value || '').replace(/[?#].*$/, '').replace(/\/$/, '/');
  },
  lastSubmittedFilters: null
};
vm.createContext(sandbox);
for (const name of [
  'readHomeRefreshState',
  'writeHomeRefreshState',
  'clearHomeRefreshState',
  'getCurrentHomeRefreshTarget',
  'isHomeRefreshActive',
  'isAuthInvalidRoute',
  'isAuthInvalidPage',
  'isCourseConflictPage',
  'isPageLeaving',
  'resetPageLifecycleGuards',
  'getHomeRefreshNavigationType',
  'abortHomeRefresh',
  'doesHomeRefreshMatchCurrentView',
  'renderHome',
  'restoreHomeRefreshState',
  'continueHomeRefreshOnHome',
  'continueHomeRefreshOnCourse',
  'continueHomeRefreshIfNeeded'
]) {
  vm.runInContext(extractFunction(name), sandbox, { filename: 'src/content/main.js' });
}

const activePayload = {
  version: 1,
  phase: 'navigating-to-course',
  startedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  lastProgressAt: '',
  currentIndex: 0,
  restoreAttempts: 0,
  homeUrl: 'https://kulms.tl.kansai-u.ac.jp/webclass/?acs_=abc',
  homeYear: '2026',
  homeSemester: '1',
  targets: [
    {
      href: 'https://kulms.tl.kansai-u.ac.jp/webclass/course.php/26170340/?acs_=x',
      courseHref: 'https://kulms.tl.kansai-u.ac.jp/webclass/course.php/26170340/',
      title: '言語学'
    }
  ],
  lastProcessedCourse: '',
  abortReason: ''
};

sandbox.writeHomeRefreshState(activePayload);
await sandbox.continueHomeRefreshOnHome({ filters: { year: '2026', semester: '1' } }, sandbox.readHomeRefreshState());
assert(sandbox.readHomeRefreshState().phase === 'aborted', 'Returning home mid-refresh should abort the refresh state');
assert(sandbox.readHomeRefreshState().abortReason === 'manual-home-navigation', 'Home abort should record a manual-home-navigation reason');

sandbox.writeHomeRefreshState(activePayload);
await sandbox.continueHomeRefreshOnCourse({
  course: { course: { links: { materials: 'https://kulms.tl.kansai-u.ac.jp/webclass/course.php/26170399/?acs_=y' } } }
}, sandbox.readHomeRefreshState());
assert(sandbox.readHomeRefreshState().phase === 'aborted', 'Target mismatch should abort the refresh state');
assert(sandbox.readHomeRefreshState().abortReason === 'target-mismatch', 'Target mismatch should be preserved as the abort reason');

sandbox.writeHomeRefreshState(activePayload);
sandbox.window.location.pathname = '/webclass/login.php';
sandbox.window.location.href = 'https://kulms.tl.kansai-u.ac.jp/webclass/login.php';
sandbox.window.location.search = '';
sandbox.document.body.innerText = 'Welcome to KU-LMS 用户 ID 密码';
await sandbox.continueHomeRefreshIfNeeded({ name: 'login' }, null);
assert(sandbox.readHomeRefreshState().phase === 'aborted', 'Auth-invalid route should abort the refresh state');
assert(sandbox.readHomeRefreshState().abortReason === 'auth-invalid-route', 'Auth-invalid abort reason should be recorded');

sandbox.window.location.pathname = '/webclass/logout.php';
sandbox.window.location.href = 'https://kulms.tl.kansai-u.ac.jp/webclass/logout.php';
sandbox.document.body.innerText = 'コース利用中に、別のコースへのアクセスがリクエストされました。 関大LMSの他のウインドウやタブをすべて閉じ';
sandbox.writeHomeRefreshState(activePayload);
await sandbox.continueHomeRefreshIfNeeded({ name: 'logout' }, null);
assert(sandbox.readHomeRefreshState().abortReason === 'course-conflict-page', 'Top-level course conflict page should abort the refresh state');
sandbox.window.location.pathname = '/webclass/logout.php';
sandbox.window.location.href = 'https://kulms.tl.kansai-u.ac.jp/webclass/logout.php';
sandbox.document.body.innerText = '';
sandbox.writeHomeRefreshState(activePayload);
await sandbox.continueHomeRefreshIfNeeded({ name: 'logout' }, null);
assert(sandbox.readHomeRefreshState().abortReason === 'auth-invalid-route', 'Direct logout route should still abort refresh continuation even without explicit conflict copy');

sandbox.window.location.pathname = '/webclass/';
sandbox.window.location.href = 'https://kulms.tl.kansai-u.ac.jp/webclass/?acs_=abc';
sandbox.window.location.search = '?acs_=abc';
sandbox.document.body.innerText = '';
sandbox.pageIsLeaving = true;
sandbox.pageRequestAbortController.abort('navigation');
sandbox.resetPageLifecycleGuards();
assert(sandbox.pageIsLeaving === false, 'Pageshow reset should clear the page-leaving guard');
assert(sandbox.pageRequestAbortController.signal.aborted === false, 'Pageshow reset should recreate an abort controller for future fetches');
sandbox.pageIsLeaving = true;
sandbox.writeHomeRefreshState(activePayload);
await sandbox.continueHomeRefreshIfNeeded({ name: 'home' }, { filters: { year: '2026', semester: '1' } });
assert(sandbox.readHomeRefreshState().abortReason === 'page-leaving', 'Leaving-page guard should stop refresh continuation before it reclaims navigation');
sandbox.pageIsLeaving = false;
sandbox.resetPageLifecycleGuards();
sandbox.writeHomeRefreshState({
  ...activePayload,
  phase: 'restoring-home',
  restoreAttempts: 2
});
sandbox.restoreHomeRefreshState(sandbox.readHomeRefreshState(), 'unsupported-route:auth-invalid');
assert(sandbox.readHomeRefreshState().phase === 'aborted', 'Exhausted restore attempts should abort instead of looping');
assert(sandbox.readHomeRefreshState().abortReason === 'restore-limit:unsupported-route:auth-invalid', 'Restore-limit abort reason should preserve the triggering cause');

storage.set('ku-redesign-home-refresh-v1', JSON.stringify({
  ...activePayload,
  startedAt: new Date(Date.now() - (6 * 60 * 1000)).toISOString(),
  expiresAt: ''
}));
assert(sandbox.readHomeRefreshState() === null, 'Expired refresh state should self-clear from session storage');
assert(storage.has('ku-redesign-home-refresh-v1') === false, 'Expired refresh state should be removed from storage');

storage.set('ku-redesign-home-refresh-v1', JSON.stringify({
  ...activePayload,
  startedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  lastProgressAt: new Date(Date.now() - 60_000).toISOString()
}));
assert(sandbox.readHomeRefreshState() === null, 'Stalled refresh state should self-clear when no progress has been made recently');

const renderedHome = sandbox.renderHome({
  upcoming: { loading: false, items: [] },
  announcements: { loading: false, items: [] },
  homeNotices: [],
  messages: { loading: false, items: [], total: 0 },
  filters: {
    yearOptions: [{ value: '2026', label: '2026', selected: true }],
    semesterOptions: [{ value: '1', label: '春学期', selected: true }],
    label: '2026 春学期',
    year: '2026',
    semester: '1'
  },
  week: [],
  schedule: { entries: [] },
  otherCourses: []
});
assert(renderedHome.includes('検証中の fail-closed 方式です'), 'Rendered refresh affordance should describe the fail-closed contract');
assert(renderedHome.includes('検証中の安全更新を実行'), 'Rendered refresh affordance should describe the validation-gated action');

const report = {
  ok: true,
  checks: [
    'auth-invalid-route-classification-present',
    'boot-overlay-sync-occurs-before-shell-mount',
    'boot-overlay-helper-remains-visual-only',
    'init-preserves-top-level-abort-taxonomy',
    'course-conflict-page-detection-present',
    'unsupported-routes-abort-not-restore',
    'continue-phase-unexpected-route-taxonomy-preserved',
    'manual-home-return-aborts-refresh',
    'target-mismatch-aborts-refresh',
    'restore-attempt-loop-breaker-aborts',
    'abort-contract-resyncs-and-clears-overlay',
    'navigation-aborts-inflight-page-requests',
    'pageshow-resets-page-leaving-guards',
    'visible-refresh-affordance-signals-validation-gated-state',
    'expired-refresh-state-self-clears',
    'durable-docs-point-to-login-loop-safety'
  ]
};

fs.mkdirSync('.omx/artifacts/home-refresh-login-loop-safety', { recursive: true });
fs.writeFileSync('.omx/artifacts/home-refresh-login-loop-safety/verification-report.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
