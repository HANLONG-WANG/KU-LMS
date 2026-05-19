import vm from 'node:vm';
import { read, readKulmsSource, extractFunction, assert, writeArtifact } from './lib/content-source.mjs';

const source = readKulmsSource();
const architectureDoc = read('docs/ku-lms-extension-architecture.md');
const sessionSafetyDoc = read('docs/ku-lms-session-safety-analysis.md');
const entrypointDoc = read('docs/AI_DOCS_ENTRYPOINT.md');

assert(/(?:const|var) HOME_REFRESH_MAX_AGE_MS = 5 \* 60 \* 1000/.test(source), 'Refresh state should expire automatically.');
assert(/(?:const|var) HOME_REFRESH_STALL_MS = 45 \* 1000/.test(source), 'Refresh state should bound stalled progress.');
assert(/(?:const|var) HOME_REFRESH_MAX_RESTORE_ATTEMPTS = 2/.test(source), 'Refresh restore attempts should be bounded.');
const bootingIndex = source.indexOf("document.documentElement.dataset.kuRedesignState = 'booting';");
const earlyReadIndex = source.indexOf('syncBootRefreshOverlay();');
const bootShellIndex = source.indexOf('mountBootShell();');
const initFn = extractFunction(source, 'init');
const bootOverlayFn = extractFunction(source, 'syncBootRefreshOverlay');
const continueFn = extractFunction(source, 'continueHomeRefreshIfNeeded');
const abortFn = extractFunction(source, 'abortHomeRefresh');
assert(bootingIndex !== -1, 'Booting state assignment should exist.');
assert(earlyReadIndex !== -1, 'Refresh overlay should be rehydrated during boot.');
assert(bootShellIndex !== -1, 'Boot shell mount should exist.');
assert(bootingIndex < earlyReadIndex, 'Early overlay sync should happen only after the booting state is set.');
assert(earlyReadIndex < bootShellIndex, 'Early overlay sync should happen before the boot shell mount.');
assert(bootOverlayFn.includes('syncHomeRefreshOverlay(readHomeRefreshState());'), 'Boot overlay helper should remain visual-only and state-derived.');
assert(source.includes("window.addEventListener('pagehide', abortInFlightPageRequests);"), 'Pagehide should abort in-flight page requests.');
assert(source.includes("window.addEventListener('beforeunload', abortInFlightPageRequests);"), 'Beforeunload should abort in-flight page requests.');
assert(source.includes("window.addEventListener('pageshow', resetPageLifecycleGuards);"), 'Pageshow should reset page-leaving guards after history restore.');
assert(source.includes("if (normalized === '/webclass/login.php') return { supported: true, name: 'login' };"), 'Route detection should classify login.php as a supported direct login route.');
assert(source.includes("if (normalized === '/webclass/logout.php') return { supported: true, name: 'logout' };"), 'Route detection should classify logout.php as a supported direct logout route.');
assert(extractFunction(source, 'detectRoute').includes("(?:\\/login)?$"), 'Route detection should treat native course login URLs as course-materials routes.');
assert(source.includes("abortHomeRefresh(refreshState, isAuthInvalidRoute(route) ? 'auth-invalid-route' : `unsupported-route:${route.name}`);"), 'Unsupported refresh routes should abort instead of restoring home.');
assert(source.includes("abortHomeRefresh(payload, 'manual-home-navigation');"), 'Manual return to home mid-refresh should abort.');
assert(source.includes("abortHomeRefresh(payload, 'target-mismatch');"), 'Target mismatch should abort instead of forcing home restoration.');
assert(initFn.includes("if ((courseConflictPage && !intentionalLogoutRoute) || (authInvalidPage && !intentionalLoginRoute))"), 'Init should have an explicit top-level conflict/auth terminal branch.');
assert(initFn.includes("const intentionalLogoutRoute = route.name === 'logout';"), 'Init should explicitly distinguish the direct logout terminal route.');
assert(initFn.includes("courseConflictPage && !intentionalLogoutRoute"), 'Init should allow direct logout-route rendering while keeping conflict fail-closed elsewhere.');
assert(initFn.includes("abortHomeRefresh(refreshState, courseConflictPage ? 'course-conflict-page' : 'auth-invalid-page');"), 'Init should preserve exact top-level abort reason strings.');
assert(continueFn.includes("route.name === 'login'"), 'Active refresh should still fail closed when traversal lands on the direct login route.');
assert(continueFn.includes("route.name === 'logout'"), 'Active refresh should still fail closed when traversal lands on the direct logout route.');
assert(continueFn.includes("'auth-invalid-route'"), 'Active refresh should fail closed on auth-invalid routes.');
assert(continueFn.includes("abortHomeRefresh(payload, 'page-leaving');"), 'Leaving-page guard should stop refresh continuation.');
assert(continueFn.includes("abortHomeRefresh(payload, isCourseConflictPage(document) ? 'course-conflict-page' : 'auth-invalid-route');"), 'Continuation abort taxonomy should preserve conflict/auth-invalid split.');
assert(continueFn.includes("abortHomeRefresh(payload, `unexpected-route:${route.name}`);"), 'Continuation abort taxonomy should preserve unexpected-route reasons.');
assert(abortFn.includes('const nextPayload = writeHomeRefreshState('), 'Abort should write terminal state first.');
assert(abortFn.includes('syncHomeRefreshOverlay(nextPayload);'), 'Abort flow should still resync the overlay immediately after recording terminal state.');
assert(extractFunction(source, 'syncHomeRefreshOverlay').includes("document.getElementById('ku-home-refresh-overlay')?.remove();"), 'Overlay sync should remove the blocking overlay when refresh becomes inactive.');
assert(source.includes('function isCourseConflictPage(doc = document)'), 'Top-level course conflict pages should be detected explicitly.');
assert(extractFunction(source, 'renderHome').includes('検証中'), 'Visible refresh affordance should honestly signal the validation-gated state.');
assert(extractFunction(source, 'loadSupplementalDocument').includes('signal: getPageRequestSignal()'), 'Supplemental home fetches should be abortable on navigation.');
assert(extractFunction(source, 'fetchCourseTimeline').includes('signal: getPageRequestSignal()'), 'Timeline fetches should be abortable on navigation.');
assert(entrypointDoc.includes('prd-ku-lms-home-refresh-login-loop-safety.md'), 'AI docs entrypoint should point to the login-loop safety PRD.');
assert(entrypointDoc.includes('test-spec-ku-lms-home-refresh-login-loop-safety.md'), 'AI docs entrypoint should point to the login-loop safety test spec.');
assert(architectureDoc.includes('fail closed'), 'Architecture doc should document fail-closed refresh behavior.');
assert(sessionSafetyDoc.includes('login.php`, `logout.php`, or another auth-invalid route'), 'Session-safety doc should document logout as a refresh fail-closed terminal route.');

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
  state: { currentRoute: { name: 'home' }, currentView: { filters: { year: '2026', semester: '1' } }, currentContext: { links: { courses: '/courses', notifications: '/notifications', messages: '/messages' } }, homeSearch: '' },
  document: { body: { innerText: '' }, getElementById() { return null; } },
  window: { location: { href: 'https://kulms.tl.kansai-u.ac.jp/webclass/?acs_=abc', origin: 'https://kulms.tl.kansai-u.ac.jp', pathname: '/webclass/', search: '?acs_=abc' }, performance: { getEntriesByType() { return [{ type: 'navigate' }]; } }, sessionStorage: { getItem(key) { return storage.has(key) ? storage.get(key) : null; }, setItem(key, value) { storage.set(key, String(value)); }, removeItem(key) { storage.delete(key); } } },
  syncHomeRefreshOverlay(payload) { overlayStates.push(payload ? payload.phase || 'unknown' : 'cleared'); },
  filterOtherCourses() { return []; }, normalizeHomeAnnouncementItems() { return []; }, renderPanelList() { return '<div>panel</div>'; }, materialTypeTone() { return 'neutral'; }, escapeHtml(value = '') { return String(value); }, escapeAttr(value = '') { return String(value); }, buildUpcomingSubtitle() { return 'subtitle'; }, formatDate() { return '05/20'; }, truncate(value = '') { return String(value); }, icon() { return ''; }, renderWeekLabel() { return '2026/05/11 〜 05/16'; }, renderSchedule() { return '<div>schedule</div>'; }, renderSyllabusChip() { return ''; }, submitHomeFilters(year, semester) { sandbox.lastSubmittedFilters = { year, semester }; }, absoluteUrl(value = '') { return value.startsWith('http') ? value : `https://kulms.tl.kansai-u.ac.jp${value}`; }, buildCourseCacheKey(value = '') { return String(value || '').replace(/[?#].*$/, '').replace(/\/$/, '/'); }, lastSubmittedFilters: null
};
vm.createContext(sandbox);
for (const name of ['readHomeRefreshState', 'writeHomeRefreshState', 'clearHomeRefreshState', 'getCurrentHomeRefreshTarget', 'isHomeRefreshActive', 'isAuthInvalidRoute', 'isAuthInvalidPage', 'isCourseConflictPage', 'isPageLeaving', 'resetPageLifecycleGuards', 'getHomeRefreshNavigationType', 'abortHomeRefresh', 'doesHomeRefreshMatchCurrentView', 'renderHome', 'restoreHomeRefreshState', 'continueHomeRefreshOnHome', 'continueHomeRefreshOnCourse', 'continueHomeRefreshIfNeeded']) {
  vm.runInContext(extractFunction(source, name), sandbox, { filename: 'kulms-source.js' });
}
const activePayload = { version: 1, phase: 'navigating-to-course', startedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), lastProgressAt: '', currentIndex: 0, restoreAttempts: 0, homeUrl: 'https://kulms.tl.kansai-u.ac.jp/webclass/?acs_=abc', homeYear: '2026', homeSemester: '1', targets: [{ href: 'https://kulms.tl.kansai-u.ac.jp/webclass/course.php/26170340/?acs_=x', courseHref: 'https://kulms.tl.kansai-u.ac.jp/webclass/course.php/26170340/', title: '言語学' }], lastProcessedCourse: '', abortReason: '' };

sandbox.writeHomeRefreshState(activePayload);
await sandbox.continueHomeRefreshOnHome({ filters: { year: '2026', semester: '1' } }, sandbox.readHomeRefreshState());
assert(sandbox.readHomeRefreshState().phase === 'aborted', 'Returning home mid-refresh should abort the refresh state.');
assert(sandbox.readHomeRefreshState().abortReason === 'manual-home-navigation', 'Home abort should record a manual-home-navigation reason.');

sandbox.writeHomeRefreshState(activePayload);
await sandbox.continueHomeRefreshOnCourse({ course: { course: { links: { materials: 'https://kulms.tl.kansai-u.ac.jp/webclass/course.php/26170399/?acs_=x' } } } }, sandbox.readHomeRefreshState());
assert(sandbox.readHomeRefreshState().abortReason === 'target-mismatch', 'Entering a non-target course should abort refresh traversal.');

sandbox.writeHomeRefreshState(activePayload);
await sandbox.continueHomeRefreshIfNeeded({ name: 'login' }, null);
assert(sandbox.readHomeRefreshState().abortReason === 'auth-invalid-route', 'Direct login traversal should fail closed.');

sandbox.writeHomeRefreshState(activePayload);
await sandbox.continueHomeRefreshIfNeeded({ name: 'logout' }, null);
assert(sandbox.readHomeRefreshState().abortReason === 'auth-invalid-route', 'Direct logout traversal should fail closed.');

sandbox.document.body.innerText = 'コース利用中に、別のコースへのアクセスがリクエストされました。';
sandbox.writeHomeRefreshState(activePayload);
await sandbox.continueHomeRefreshIfNeeded({ name: 'logout' }, null);
assert(sandbox.readHomeRefreshState().abortReason === 'course-conflict-page', 'Conflict pages should preserve the dedicated abort reason.');
sandbox.document.body.innerText = '';

sandbox.pageRequestAbortController.abort();
sandbox.resetPageLifecycleGuards();
assert(sandbox.pageRequestAbortController.signal.aborted === false, 'pageshow reset should re-arm the abort controller for future fetches.');
sandbox.pageIsLeaving = true;
sandbox.writeHomeRefreshState(activePayload);
await sandbox.continueHomeRefreshIfNeeded({ name: 'home' }, { filters: { year: '2026', semester: '1' } });
assert(sandbox.readHomeRefreshState().abortReason === 'page-leaving', 'Leaving-page guard should stop refresh continuation before it reclaims navigation.');
sandbox.pageIsLeaving = false;

sandbox.writeHomeRefreshState({ ...activePayload, phase: 'restoring-home', restoreAttempts: 2 });
sandbox.restoreHomeRefreshState(sandbox.readHomeRefreshState(), 'unsupported-route:auth-invalid');
assert(sandbox.readHomeRefreshState().phase === 'aborted', 'Exhausted restore attempts should abort instead of looping.');
assert(sandbox.readHomeRefreshState().abortReason === 'restore-limit:unsupported-route:auth-invalid', 'Restore-limit abort reason should preserve the triggering cause.');

storage.set('ku-redesign-home-refresh-v1', JSON.stringify({ ...activePayload, startedAt: new Date(Date.now() - (6 * 60 * 1000)).toISOString(), expiresAt: '' }));
assert(sandbox.readHomeRefreshState() === null, 'Expired refresh state should self-clear from session storage.');
assert(storage.has('ku-redesign-home-refresh-v1') === false, 'Expired refresh state should be removed from storage.');

storage.set('ku-redesign-home-refresh-v1', JSON.stringify({ ...activePayload, startedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), lastProgressAt: new Date(Date.now() - 60_000).toISOString() }));
assert(sandbox.readHomeRefreshState() === null, 'Stalled refresh state should self-clear when no progress has been made recently.');

const renderedHome = sandbox.renderHome({ upcoming: { loading: false, items: [] }, announcements: { loading: false, items: [] }, homeNotices: [], messages: { loading: false, items: [], total: 0 }, filters: { yearOptions: [{ value: '2026', label: '2026', selected: true }], semesterOptions: [{ value: '1', label: '春学期', selected: true }], label: '2026 春学期', year: '2026', semester: '1' }, week: [], schedule: { entries: [] }, otherCourses: [] });
assert(renderedHome.includes('検証中の fail-closed 方式です'), 'Rendered refresh affordance should describe the fail-closed contract.');
assert(renderedHome.includes('検証中の安全更新を実行'), 'Rendered refresh affordance should describe the validation-gated action.');

const report = { ok: true, checks: ['auth-invalid-route-classification-present', 'boot-overlay-sync-occurs-before-shell-mount', 'boot-overlay-helper-remains-visual-only', 'init-preserves-top-level-abort-taxonomy', 'course-conflict-page-detection-present', 'unsupported-routes-abort-not-restore', 'continue-phase-unexpected-route-taxonomy-preserved', 'manual-home-return-aborts-refresh', 'target-mismatch-aborts-refresh', 'restore-attempt-loop-breaker-aborts', 'abort-contract-resyncs-and-clears-overlay', 'navigation-aborts-inflight-page-requests', 'pageshow-resets-page-leaving-guards', 'visible-refresh-affordance-signals-validation-gated-state', 'expired-refresh-state-self-clears', 'durable-docs-point-to-login-loop-safety'] };
writeArtifact('.omx/artifacts/home-refresh-login-loop-safety', 'verification-report.json', report);
console.log(JSON.stringify(report));
