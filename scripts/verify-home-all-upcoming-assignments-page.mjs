import { loadOfflineKulmsInto } from './lib/offline-content-vm.mjs';
import { read, readKulmsSource, extractFunction, assert, writeArtifact } from './lib/content-source.mjs';

const source = readKulmsSource();
const cssSource = read('src/content/critical.css');
const manifest = JSON.parse(read('manifest.json'));
const architectureDoc = read('docs/ku-lms-extension-architecture.md');
const subsystemDoc = read('docs/ku-lms-content-subsystem-map.md');
const entrypointDoc = read('docs/AI_DOCS_ENTRYPOINT.md');

assert(manifest.content_scripts[0].js.includes('src/content/services/all-upcoming.js'), 'Manifest should load the all-upcoming service in KU-LMS routes.');
assert(extractFunction(source, 'detectRoute').includes("name: isAllUpcomingRouteHash(locationObj) ? 'home-all-upcoming' : 'home'"), 'Route detection should classify the dedicated home all-upcoming variant.');
assert(extractFunction(source, 'routeLabel').includes("'home-all-upcoming': '全コースの締切課題'"), 'Route label map should name the dedicated all-upcoming page.');
assert(extractFunction(source, 'isActiveNav').includes("if (routeName === 'home-all-upcoming') return itemKey === 'home';"), 'Top navigation should keep Home active on the all-upcoming page.');

const renderHomeSource = extractFunction(source, 'renderHome');
assert(renderHomeSource.includes('data-action="open-all-upcoming"'), 'Home due card should expose a dedicated open-all-upcoming action.');
assert(renderHomeSource.includes('buildAllUpcomingUrl('), 'Home due card should target the dedicated all-upcoming page URL.');
assert(renderHomeSource.includes('data-action="refresh-upcoming"'), 'Existing home refresh action should remain present on the card.');
const renderUpcomingSource = extractFunction(source, 'renderHomeUpcoming');
assert(renderUpcomingSource.includes('hasNativeDueReminder') && renderUpcomingSource.includes('コースを開いて確認してください。'), 'Native reminders without collected detail must retain actionable course fallbacks.');
assert(extractFunction(source, 'bindInteractiveHandlers').includes('startAllUpcomingCollection(view)'), 'Hydration should intercept the all-upcoming CTA.');
assert(extractFunction(source, 'bindInteractiveHandlers').includes('startHomeRefresh(view)'), 'Existing homepage refresh button binding should remain intact.');

assert(source.includes("var ALL_UPCOMING_STATE_KEY = 'ku-redesign-all-upcoming-v1';"), 'Dedicated all-upcoming state key should exist.');
assert(source.includes("var ALL_UPCOMING_ROUTE_HASH = '#ku-all-upcoming';"), 'Dedicated all-upcoming route hash should exist.');
assert(extractFunction(source, 'startAllUpcomingCollection').includes('getAllUpcomingCollectionTargets(view.schedule.entries, view.otherCourses)'), 'All-upcoming collection should inspect every visible homepage course source.');
assert(extractFunction(source, 'getAllUpcomingCollectionTargets').includes('scheduleEntries') && extractFunction(source, 'getAllUpcomingCollectionTargets').includes('otherCourseGroups'), 'Target builder should combine schedule and other-course groups.');
assert(extractFunction(source, 'continueAllUpcomingIfNeeded').includes("route.name === 'home' || route.name === 'home-all-upcoming'"), 'All-upcoming workflow should resume on both home variants.');
assert(extractFunction(source, 'continueAllUpcomingIfNeeded').includes("route.name === 'course-materials'"), 'All-upcoming workflow should resume on course pages.');
assert(extractFunction(source, 'presentAllUpcomingResults').includes('window.history?.replaceState'), 'All-upcoming completion should switch to the dedicated hash route without relying on a full reload.');
assert(extractFunction(source, 'presentAllUpcomingResults').includes('state.currentRoute = detectRoute(window.location);'), 'All-upcoming completion should refresh the in-memory route before rerendering the dedicated page.');
assert(extractFunction(source, 'collectAllUpcomingCourseItems').includes('parseUpcomingFromCourse'), 'All-upcoming workflow should source course items from current course-detail parsing.');
assert(extractFunction(source, 'collectAllUpcomingCourseItems').includes('items.filter(isAllUpcomingCandidate)'), 'All-course collection should retain future deadlines without a day limit.');
assert(!extractFunction(source, 'isAllUpcomingCandidate').includes('ALL_UPCOMING_WINDOW_DAYS'), 'All-course eligibility must not depend on the homepage deadline window.');
assert(!extractFunction(source, 'isUpcomingDueSoonUnused').includes('item?.hasUsage'), 'Homepage date candidates are independent of usage counts.');
assert(renderUpcomingSource.includes('kuIsAssignmentCompleted'), 'Only manual completion should exclude a homepage assignment.');
assert(extractFunction(source, 'syncAllUpcomingOverlay').includes("overlay.id = 'ku-all-upcoming-overlay';"), 'Dedicated overlay should use its own DOM id.');
assert(extractFunction(source, 'syncAllUpcomingOverlay').includes('課題を集約しています。しばらくお待ちください。'), 'Dedicated overlay should show explicit wait copy.');
assert(extractFunction(source, 'shouldSuppressCourseTraversalSideEffects').includes('shouldSuppressAllUpcomingSideEffects(courseHref)'), 'Course traversal side-effect suppression should cover the all-upcoming workflow.');
assert(extractFunction(source, 'buildCourseMaterialsView').includes('shouldSuppressCourseTraversalSideEffects'), 'Course build should suppress side effects during all-upcoming traversal.');

assert(cssSource.includes(':not(#ku-all-upcoming-overlay)'), 'Critical CSS should exempt the dedicated all-upcoming overlay from global hiding.');
assert(cssSource.includes('#ku-all-upcoming-overlay'), 'Critical CSS should style the dedicated all-upcoming overlay.');

assert(extractFunction(source, 'buildHomeAllUpcomingView').includes('hydrateAllUpcomingItems(payload?.items || [])'), 'Dedicated page view should build from collected stored results.');
assert(extractFunction(source, 'renderAllUpcoming').includes('全コースの課題・教材'), 'Dedicated page renderer should describe all deadlines and material types.');
assert(extractFunction(source, 'renderPage').includes("case 'home-all-upcoming': return renderAllUpcoming(view);"), 'Shared render dispatch should route the dedicated page.');
assert(architectureDoc.includes('/webclass/#ku-all-upcoming'), 'Architecture doc should describe the dedicated all-upcoming route variant.');
assert(architectureDoc.includes('without an upper deadline window across all visible home-scope courses'), 'Architecture doc should describe all-course aggregation without a day limit.');
assert(subsystemDoc.includes('services/all-upcoming.js'), 'Subsystem map should list the dedicated all-upcoming service.');
assert(subsystemDoc.includes('all-course upcoming aggregation traversal'), 'Subsystem map should describe service ownership for the new traversal.');
assert(entrypointDoc.includes('prd-ku-lms-home-all-upcoming-assignments-page.md'), 'Docs entrypoint should reference the new PRD.');
assert(entrypointDoc.includes('test-spec-ku-lms-home-all-upcoming-assignments-page.md'), 'Docs entrypoint should reference the new test spec.');

const storage = new Map();
const domNodes = new Map();
function createNode() {
  return { id: '', innerHTML: '', remove() { if (this.id) domNodes.delete(this.id); } };
}
const sandbox = {
  console,
  URL,
  Date,
  ALL_UPCOMING_STATE_KEY: 'ku-redesign-all-upcoming-v1',
  ALL_UPCOMING_ROUTE_HASH: '#ku-all-upcoming',
  ALL_UPCOMING_MAX_AGE_MS: 15 * 60 * 1000,
  ALL_UPCOMING_STALL_MS: 60 * 1000,
  ALL_UPCOMING_WINDOW_DAYS: 5,
  state: { currentContext: { links: { home: 'https://kulms.tl.kansai-u.ac.jp/webclass/' } }, currentRoute: { name: 'home-all-upcoming' }, currentView: null },
  window: {
    location: { href: 'https://kulms.tl.kansai-u.ac.jp/webclass/', origin: 'https://kulms.tl.kansai-u.ac.jp', pathname: '/webclass/', search: '', hash: '' },
    sessionStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); }
    }
  },
  document: {
    body: { appendChild(node) { if (node?.id) domNodes.set(node.id, node); } },
    documentElement: { appendChild(node) { if (node?.id) domNodes.set(node.id, node); } },
    createElement() { return createNode(); },
    getElementById(id) { return domNodes.get(id) || null; }
  },
  absoluteUrl(value = '') { return value || 'https://kulms.tl.kansai-u.ac.jp/webclass/'; },
  truncate(value = '', length = 0) { const text = String(value ?? ''); return text.length > length ? `${text.slice(0, length)}…` : text; },
  escapeHtml(value = '') { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); },
  escapeAttr(value = '') { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); },
  buildCourseCacheKey(value = '') { return value.replace(/\?.*$/, '').replace(/\/?$/, '/'); },
  getHomeRefreshNavigationType() { return ''; },
  isPageLeaving() { return false; },
  isAuthInvalidRoute() { return false; },
  isAuthInvalidPage() { return false; },
  isCourseConflictPage() { return false; },
  submitHomeFilters() {},
  rerender() {},
  readHomeRefreshState() { return null; },
  isHomeRefreshActive() { return false; },
  parseUpcomingFromCourse() { return []; },
  HOME_REFRESH_STATE_KEY: 'ku-redesign-home-refresh-v1',
  pad(number) { return String(number).padStart(2, '0'); }
};
loadOfflineKulmsInto(sandbox);

const now = Date.now();
const dueSoon = new Date(now + 2 * 86400000);
const dueLater = new Date(now + 7 * 86400000);
assert(sandbox.isUpcomingDueWithinDays({ dueDate: dueSoon }, 5) === true, 'Five-day filter should include due-soon items.');
assert(sandbox.isUpcomingDueWithinDays({ dueDate: dueLater }, 5) === false, 'Five-day filter should exclude items beyond five days.');
const localDate = time => { const date = new Date(time); return `${date.getFullYear()}/${date.getMonth()+1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2,'0')}`; };
assert(sandbox.isUpcomingDueSoonUnused({ dueDate: dueSoon, availability: `${localDate(now-3600000)} - ${localDate(now+3*86400000)}`, hasUsage: true, usageKnown: true }) === true, 'Both home and all-course candidate lists retain used assignments; home applies manual completion separately.');

const targets = sandbox.getAllUpcomingCollectionTargets(
  [
    { href: 'https://kulms.tl.kansai-u.ac.jp/webclass/course.php/26170340/?acs_=123', title: '言語学', sortIndex: 0 },
    { href: 'https://kulms.tl.kansai-u.ac.jp/webclass/course.php/26170340/?acs_=999', title: '言語学 duplicate', sortIndex: 1 }
  ],
  [{ title: 'その他', items: [{ href: 'https://kulms.tl.kansai-u.ac.jp/webclass/course.php/99112233/?acs_=456', title: '情報社会学' }] }]
);
assert(targets.length === 2, 'All-upcoming target builder should dedupe duplicate schedule/other-course course entries.');

const payload = {
  version: 1,
  phase: 'navigating-to-course',
  startedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  lastProgressAt: new Date().toISOString(),
  currentIndex: 0,
  homeUrl: 'https://kulms.tl.kansai-u.ac.jp/webclass/',
  resultUrl: 'https://kulms.tl.kansai-u.ac.jp/webclass/#ku-all-upcoming',
  targets,
  items: [],
  homeYear: '2026',
  homeSemester: '1'
};
sandbox.writeAllUpcomingState(payload);
assert(sandbox.isAllUpcomingActive(sandbox.readAllUpcomingState()) === true, 'Written all-upcoming state should be active.');
sandbox.syncAllUpcomingOverlay(payload);
const overlay = domNodes.get('ku-all-upcoming-overlay');
assert(overlay, 'Active all-upcoming collection should mount its overlay.');
assert(overlay.innerHTML.includes('課題を集約しています。しばらくお待ちください。'), 'Overlay should render the dedicated wait copy.');
assert(overlay.innerHTML.includes('1 / 2'), 'Overlay should render progress for the current target.');
sandbox.syncAllUpcomingOverlay({ ...payload, phase: 'restoring-home', currentIndex: payload.targets.length });
assert(domNodes.get('ku-all-upcoming-overlay').innerHTML.includes('専用ページへ戻しています…'), 'Overlay should render restore copy when collection is complete.');
sandbox.syncAllUpcomingOverlay(null);
assert(!domNodes.has('ku-all-upcoming-overlay'), 'Inactive all-upcoming collection should clear the overlay.');

const merged = sandbox.mergeAllUpcomingItems(
  [sandbox.serializeAllUpcomingItem({ title: '既存課題', type: '課題', dueDate: dueSoon, href: '/a', courseHref: '/course-a/', courseTitle: 'A', usageText: '利用回数 1', usageCount: 1, hasUsage: true, usageKnown: true })],
  [{ title: '新規課題', type: '課題', dueDate: new Date(now + 86_400_000), href: '/b', courseHref: '/course-b/', courseTitle: 'B', usageText: '', usageCount: 0, hasUsage: false, usageKnown: true }]
);
assert(merged.length === 2, 'Merged all-upcoming results should keep both used and unused items.');
assert(merged[0].title === '新規課題', 'Merged all-upcoming results should sort by nearest due date.');

const courseView = (target) => ({ course: { course: { links: { materials: target.courseHref, returnToCourses: `${target.courseHref}logout?acs_=native-exit` } } } });
sandbox.state.currentRoute = { name: 'course-materials' };
sandbox.state.currentView = courseView(targets[0]);
sandbox.window.location.href = targets[0].courseHref;
sandbox.writeAllUpcomingState(payload);
await sandbox.continueAllUpcomingOnCourse(sandbox.state.currentView, sandbox.readAllUpcomingState());
assert(sandbox.window.location.href === sandbox.state.currentView.course.course.links.returnToCourses, 'All-course collection must use the native course exit before visiting the next target.');
assert(sandbox.readAllUpcomingState().phase === 'returning-home-between-courses', 'All-course collection should persist its inter-course return phase.');
assert(sandbox.readAllUpcomingState().visitedCourseCount === 1, 'Exiting the first course should preserve collection progress.');
sandbox.window.location.href = payload.homeUrl;
sandbox.state.currentRoute = { name: 'home' };
sandbox.resetPageLifecycleGuards({ type: 'pageshow' });
await sandbox.continueAllUpcomingOnHome({ filters: { year: '2026', semester: '1' } }, sandbox.readAllUpcomingState(), sandbox.state.currentRoute);
assert(sandbox.window.location.href === targets[1].href, 'The next course should be entered only after native return reaches home.');
sandbox.state.currentRoute = { name: 'course-materials' };
sandbox.state.currentView = courseView(targets[1]);
sandbox.resetPageLifecycleGuards({ type: 'pageshow' });
await sandbox.continueAllUpcomingOnCourse(sandbox.state.currentView, sandbox.readAllUpcomingState());
assert(sandbox.window.location.href === sandbox.state.currentView.course.course.links.returnToCourses, 'The final course should also use its native exit before restoring results.');
assert(sandbox.readAllUpcomingState().phase === 'restoring-home', 'The final course should switch to results restoration.');
sandbox.window.location.href = payload.homeUrl;
sandbox.state.currentRoute = { name: 'home' };
sandbox.resetPageLifecycleGuards({ type: 'pageshow' });
await sandbox.continueAllUpcomingOnHome({ filters: { year: '2026', semester: '1' } }, sandbox.readAllUpcomingState(), sandbox.state.currentRoute);
assert(sandbox.readAllUpcomingState().phase === 'completed', 'Final home restoration should complete the persisted collection.');
assert(sandbox.state.currentRoute.name === 'home-all-upcoming', 'Completion should synchronize the in-memory route with the dedicated results hash.');

const failures = [];
sandbox.showCourseTraversalFailure = (reason) => failures.push(reason);
sandbox.state.currentRoute = { name: 'course-materials' };
sandbox.state.currentView = { course: { course: { links: { materials: targets[0].courseHref, returnToCourses: `${targets[1].courseHref}logout` } } } };
sandbox.window.location.href = targets[0].courseHref;
sandbox.resetPageLifecycleGuards({ type: 'pageshow' });
sandbox.writeAllUpcomingState(payload);
await sandbox.restoreAllUpcomingState(sandbox.readAllUpcomingState());
assert(sandbox.window.location.href === targets[0].courseHref, 'A logout link for another course must not be treated as a trustworthy exit.');
assert(sandbox.readAllUpcomingState().abortReason === 'missing-native-course-exit' && failures[0] === 'missing-native-course-exit', 'Missing or mismatched native exits should fail closed with an explicit reason.');

const report = { ok: true, checks: ['route-and-home-nav-support-all-upcoming-page', 'home-cta-interception-present-without-removing-refresh-button', 'dedicated-state-key-and-overlay-path-present', 'all-course-target-collection-dedupes-visible-courses', 'five-day-filter-keeps-used-items', 'overlay-runtime-contract-executed', 'native-course-exits-and-async-home-resumption', 'completion-synchronizes-results-route', 'mismatched-course-exit-fails-closed', 'docs-reference-new-route-and-service'] };
writeArtifact('.omx/artifacts/home-all-upcoming-assignments-page', 'verification-report.json', report);
console.log(JSON.stringify(report));
