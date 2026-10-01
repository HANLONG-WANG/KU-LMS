import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Every request, navigation, iframe and runtime message is isolated below.
// This verifier never uses Node's or Chrome's real fetch implementation.
const checks = [];
const source = (path) => fs.readFileSync(path, 'utf8');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const response = (text, overrides = {}) => ({ ok: true, status: 200, url: 'https://kulms.tl.kansai-u.ac.jp/webclass/messages', text: async () => text, ...overrides });
class OfflineDOMParser {
  parseFromString(html) {
    return {
      documentElement: { outerHTML: html },
      body: { textContent: html.replace(/<[^>]*>/g, '') },
      querySelector(selector) {
        if (selector.includes('password') && /type=["']password["']|name=["']val["']/.test(html)) return {};
        if (selector.includes('username') && /name=["']username["']/.test(html)) return {};
        return null;
      }
    };
  }
}
function sandbox(files, extras = {}) {
  const storage = new Map();
  const elements = new Map();
  const location = { href: 'https://kulms.tl.kansai-u.ac.jp/webclass/', origin: 'https://kulms.tl.kansai-u.ac.jp', pathname: '/webclass/' };
  const context = {
    console: { warn() {}, error() {}, log() {} }, URL, URLSearchParams, Date, Map, Set, Promise, DOMException, AbortController,
    setTimeout, clearTimeout,
    DOMParser: OfflineDOMParser,
    ROOT_ID: 'ku-redesign-root', SYLLABUS_ROOT_ID: 'ku-syllabus-root',
    COURSE_UPCOMING_CACHE_KEY: 'offline-course-cache', HOME_REFRESH_STATE_KEY: 'offline-refresh', ALL_UPCOMING_STATE_KEY: 'offline-all',
    HOME_REFRESH_MAX_AGE_MS: 300000, HOME_REFRESH_STALL_MS: 45000, HOME_REFRESH_MAX_RESTORE_ATTEMPTS: 2,
    ALL_UPCOMING_MAX_AGE_MS: 300000, ALL_UPCOMING_STALL_MS: 45000, ALL_UPCOMING_MAX_RESTORE_ATTEMPTS: 2,
    state: { supplementalCache: new Map(), extensionSettings: { enabled: true }, currentRoute: { name: 'home' } },
    window: {
      location,
      sessionStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)), removeItem: (key) => storage.delete(key) },
      addEventListener() {}, removeEventListener() {},
      performance: { getEntriesByType: () => [{ type: 'navigate' }] }
    },
    document: {
      documentElement: { dataset: {} },
      body: { appendChild(node) { elements.set(node.id, node); } },
      getElementById: (id) => elements.get(id) || null,
      createElement() { return { style: {}, setAttribute() {}, remove() { elements.delete(this.id); } }; }
    },
    absoluteUrl: (url) => new URL(url, location.href).href,
    isPageLeaving: () => false,
    getPageRequestSignal: () => undefined,
    isAuthInvalidPage: () => false,
    isAbortError: (error) => error?.name === 'AbortError',
    fetch: () => { throw new Error('A test must explicitly stub fetch'); },
    ...extras
  };
  vm.createContext(context);
  for (const file of files) vm.runInContext(source(file), context, { filename: file });
  context.offlineStorage = storage;
  return context;
}
const docs = 'src/content/services/documents.js';
const timeline = 'src/content/services/timeline.js';
const cache = 'src/content/services/cache.js';
const refresh = 'src/content/services/refresh.js';
const all = 'src/content/services/all-upcoming.js';
const syllabus = 'src/content/services/syllabus.js';

{
  let fetches = 0;
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const s = sandbox([docs], { fetch: async () => { fetches += 1; await pending; return response('<html><body>messages</body></html>'); } });
  const first = s.loadSupplementalDocument('/webclass/messages');
  const second = s.loadSupplementalDocument('/webclass/messages');
  await tick();
  assert.equal(fetches, 1);
  finish();
  const [a, b] = await Promise.all([first, second]);
  assert.notEqual(a, b, 'each consumer receives its own parsed document');
  assert.equal(s.state.supplementalCache.size, 1);
  checks.push('same-URL in-flight merge with independent document clones');
}
{
  for (const [name, result] of [
    ['HTTP 500', response('<html>error</html>', { ok: false, status: 500 })],
    ['login redirect', response('<html>login</html>', { url: 'https://kulms.tl.kansai-u.ac.jp/webclass/login.php' })],
    ['native login form', response('<form><input name="username"><input type="password" name="val"></form>')],
    ['changed login script', response("<script>window . top . location . href = '/webclass/login.php';</script>")],
    ['course conflict', response('<p>コース利用中に、別のコースへのアクセスがリクエストされました。</p>')]
  ]) {
    const s = sandbox([docs], { fetch: async () => result });
    await assert.rejects(s.loadSupplementalDocument('/webclass/messages'), undefined, name);
    assert.equal(s.state.supplementalCache.size, 0, name);
    assert.equal(await s.waitForLmsRequestsBeforeNavigation(), false, name);
  }
  checks.push('HTTP/auth/conflict failures never enter cache or permit course navigation');
}
{
  let active = 0;
  let maxActive = 0;
  let finishFirst;
  const firstBody = new Promise((resolve) => { finishFirst = resolve; });
  const s = sandbox([docs, timeline], {
    fetch: async (url) => {
      active += 1; maxActive = Math.max(maxActive, active);
      return response('', { text: async () => {
        if (!url.includes('/api/timeline/')) await firstBody;
        active -= 1;
        return url.includes('/api/timeline/') ? '{"records":[]}' : '<html><body>ok</body></html>';
      } });
    }
  });
  const a = s.loadSupplementalDocument('/webclass/messages');
  const b = s.fetchCourseTimeline('course-A');
  let ready = false;
  const barrier = s.waitForLmsRequestsBeforeNavigation().then((ok) => { ready = ok; });
  await tick();
  assert.equal(ready, false);
  await assert.rejects(s.fetchLmsResource('/webclass/later'), { name: 'AbortError' });
  finishFirst();
  await Promise.all([a, b, barrier]);
  assert.equal(maxActive, 1);
  assert.equal(ready, true);
  checks.push('document/timeline requests serialize through body completion before navigation');
}
{
  const s = sandbox([docs], { fetch: () => new Promise(() => {}) });
  s.LMS_REQUEST_TIMEOUT_MS = 5;
  await assert.rejects(s.fetchLmsResource('/webclass/messages'), /timed out/);
  assert.equal(await s.waitForLmsRequestsBeforeNavigation(), false);
  await assert.rejects(s.fetchLmsResource('/webclass/messages'), /Reload/);
  s.resumeLmsPageRequests();
  await assert.rejects(s.fetchLmsResource('/webclass/messages'), /Reload/, 'reenabling cannot reset an unconfirmed failed request');
  checks.push('pending LMS requests time out and fail navigation closed');
}
{
  const s = sandbox([docs, timeline], { fetch: async () => response('{"error":"expired"}') });
  assert.equal((await s.fetchCourseTimeline('A')).error, true);
  s.resumeLmsPageRequests({ afterNavigation: true });
  s.fetch = async () => response('{"records":[]}', { ok: false, status: 401 });
  assert.equal((await s.fetchCourseTimeline('A')).error, true);
  checks.push('timeline rejects HTTP and malformed JSON envelopes');
}
{
  const s = sandbox([docs, cache], {
    buildCourseCacheKey: (href) => href,
    isUpcomingDueSoonUnused: () => true
  });
  s.syncCourseUpcomingCacheIdentity('student A');
  assert.equal(JSON.parse(s.offlineStorage.get(s.COURSE_UPCOMING_CACHE_KEY)).identity, 'student A', 'identity persists before the first course is visited');
  s.rememberCourseUpcoming('/course-A', [{ title: 'Task', dueDate: new Date(Date.now() + 86400000), hasUsage: false }]);
  assert.equal(s.readCourseUpcomingCache()['/course-A'].length, 1);
  const stored = JSON.parse(s.offlineStorage.get(s.COURSE_UPCOMING_CACHE_KEY));
  assert.equal(stored.identity, 'student A');
  assert.ok(stored.entries['/course-A'].collectedAt);
  s.syncCourseUpcomingCacheIdentity('');
  assert.equal(s.readCourseUpcomingCache()['/course-A'].length, 1, 'unknown identity does not erase current cache');
  stored.entries['/course-A'].collectedAt = new Date(Date.now() - s.COURSE_UPCOMING_CACHE_TTL_MS - 1).toISOString();
  s.offlineStorage.set(s.COURSE_UPCOMING_CACHE_KEY, JSON.stringify(stored));
  assert.equal(Object.keys(s.readCourseUpcomingCache()).length, 0);
  assert.equal(s.getCourseUpcomingCacheCollectedAt('/course-A'), '');
  s.offlineStorage.set(s.HOME_REFRESH_STATE_KEY, '{"phase":"arming"}');
  s.offlineStorage.set(s.ALL_UPCOMING_STATE_KEY, '{"phase":"completed"}');
  s.syncCourseUpcomingCacheIdentity('student B');
  assert.equal(s.offlineStorage.has(s.HOME_REFRESH_STATE_KEY), false);
  assert.equal(s.offlineStorage.has(s.ALL_UPCOMING_STATE_KEY), false);
  assert.equal(Object.keys(s.readCourseUpcomingCache()).length, 0);
  s.syncCourseUpcomingCacheIdentity('', { clear: true });
  assert.equal(s.courseUpcomingCacheIdentity, '');
  checks.push('course caches isolate accounts, preserve unknown identity, expire and clear traversal state');
}
{
  const s = sandbox([docs, refresh, all], {
    buildCourseCacheKey: (href) => String(href).replace(/[?#].*$/, ''),
    syncHomeRefreshOverlay() {}, syncAllUpcomingOverlay() {},
    doesHomeRefreshMatchCurrentView: () => true,
    doesAllUpcomingMatchCurrentView: () => true
  });
  s.syncHomeRefreshOverlay = () => {};
  s.syncAllUpcomingOverlay = () => {};
  const courseA = 'https://kulms.tl.kansai-u.ac.jp/webclass/course.php/A/';
  const courseB = 'https://kulms.tl.kansai-u.ac.jp/webclass/course.php/B/';
  const exitA = `${courseA}logout`;
  const view = { course: { course: { links: { materials: courseA, returnToCourses: exitA } } } };
  s.state.currentRoute = { name: 'course-materials' };
  s.state.currentView = view;
  s.window.location.href = courseA;
  const payload = { phase: 'navigating-to-course', currentIndex: 0, startedAt: new Date().toISOString(), homeUrl: 'https://kulms.tl.kansai-u.ac.jp/webclass/', targets: [{ href: courseA, courseHref: courseA }, { href: courseB, courseHref: courseB }] };
  s.writeHomeRefreshState(payload);
  await s.continueHomeRefreshOnCourse(view, payload);
  assert.equal(s.window.location.href, exitA, 'leaves the active course before entering another');
  assert.equal(s.readHomeRefreshState().phase, 'returning-home-between-courses');
  assert.equal(s.readHomeRefreshState().restoreAttempts, 0);
  s.window.location.href = payload.homeUrl;
  s.state.currentRoute = { name: 'home' };
  s.resumeLmsPageRequests();
  await s.continueHomeRefreshOnHome({}, s.readHomeRefreshState());
  assert.equal(s.window.location.href, courseB);
  s.resumeLmsPageRequests();
  s.state.currentRoute = { name: 'course-materials' };
  s.state.currentView = { course: { course: { links: {} } } };
  s.window.location.href = courseA;
  s.writeAllUpcomingState({ ...payload, targets: [payload.targets[0]] });
  await s.restoreAllUpcomingState(s.readAllUpcomingState());
  assert.equal(s.window.location.href, courseA);
  assert.equal(s.readAllUpcomingState().abortReason, 'missing-native-course-exit');
  checks.push('course traversal uses native exits between courses and fails closed without an exit');
}
{
  let removed;
  const s = sandbox(['src/background/service-worker.js'], {
    chrome: { runtime: { onInstalled: { addListener() {} }, onMessage: { addListener() {} } }, tabs: { onRemoved: { addListener(fn) { removed = fn; } } } }
  });
  let detailChecks = 0;
  s.buildQueryVariants = () => ['Title'];
  s.normalizeQuery = (value) => value;
  s.parseSyllabusCandidates = () => [{ normalizedTitle: 'Title' }];
  s.searchSyllabus = async () => '';
  const detailUrl = 'https://syllabus3.jm.kansai-u.ac.jp/syllabus/Controller?actionClass=syllabus.search.DetailKeySearchSt&UJikanwari_cd=123';
  s.buildSyllabusDetailUrl = () => detailUrl;
  s.fetchSyllabusCourseCode = async () => { detailChecks += 1; return 'WRONG'; };
  assert.equal(await s.lookupSyllabusDetailUrl({ title: 'Title', year: '2026', courseCode: 'RIGHT' }), '');
  assert.equal(detailChecks, 1, 'even the only title candidate must have its code checked');
  s.fetchSyllabusCourseCode = async () => 'RIGHT';
  assert.equal(await s.lookupSyllabusDetailUrl({ title: 'Title', year: '2026', courseCode: 'RIGHT' }), detailUrl);
  s.rememberSyllabusDetailForTab(0, { key: 'key', url: detailUrl });
  assert.equal(s.readRememberedSyllabusDetailForTab(0, 'key'), detailUrl);
  s.rememberedSyllabusDetailsByTab.get(0).key.storedAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  assert.equal(s.readRememberedSyllabusDetailForTab(0, 'key'), '');
  s.rememberSyllabusDetailForTab(0, { key: 'key', url: detailUrl });
  removed(0);
  assert.equal(s.readRememberedSyllabusDetailForTab(0, 'key'), '');
  await assert.rejects(s.fetchSyllabusText(detailUrl, {}, AbortSignal.abort()), { name: 'AbortError' });
  checks.push('unique syllabus candidates require matching codes and closed tabs drop cached details');
}
{
  let frames = 0;
  let removed = 0;
  let restoreCalls = 0;
  let parseCalls = 0;
  const s = sandbox([syllabus], {
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 5)),
    cleanText: (value) => String(value || '').trim(),
    normalizeSyllabusCourseQuery: (value) => value,
    extractCourseId: () => '123', deriveSyllabusCourseCode: () => '123',
    readSyllabusWindowState: () => ({}),
    restoreNativePageForExtension: () => { restoreCalls += 1; },
    cleanupRouteHydration() {},
    parseSyllabusDetailDocument: () => { parseCalls += 1; return {}; },
    clearSyllabusAssistOverlay() {},
    chrome: { runtime: { sendMessage() {}, lastError: null } }
  });
  s.document.createElement = () => ({ style: {}, remove() { removed += 1; } });
  s.document.body.appendChild = () => { frames += 1; };
  const detailUrl = 'https://syllabus3.jm.kansai-u.ac.jp/syllabus/Controller?actionClass=syllabus.search.DetailKeySearchSt&UJikanwari_cd=123';
  assert.equal(await s.loadSyllabusCourseCodeViaFrame(detailUrl), '');
  assert.equal(frames, 1);
  assert.equal(removed, 1, 'timeout removes hidden frame');
  const pendingFrame = s.loadSyllabusCourseCodeViaFrame(detailUrl);
  s.cancelSyllabusPendingWork();
  assert.equal(await pendingFrame, '');
  assert.equal(removed, 2, 'cancellation removes hidden frame');
  s.resumeSyllabusPendingWork();
  assert.equal(await s.sendSyllabusRuntimeMessage('offline-test', {}, 5), null);
  const key = s.buildSyllabusResolvedDetailKey({ title: 'Title', courseHref: '/123', year: '2026' });
  s.offlineStorage.set(s.SYLLABUS_DETAIL_CACHE_KEY, JSON.stringify({ [key]: { version: 2, url: detailUrl, storedAt: new Date().toISOString() } }));
  assert.equal(await s.readRememberedSyllabusDetail({ title: 'Title', courseHref: '/123', year: '2026' }), detailUrl);
  let liveLookups = 0;
  s.resolveSyllabusUrl = async () => { liveLookups += 1; return ''; };
  await s.handleSyllabusNavigation({ dataset: { syllabusTitle: 'Title', syllabusHref: '/123', syllabusYear: '2026' }, textContent: 'Syllabus', href: detailUrl });
  assert.equal(liveLookups, 0, 'fresh verified cache is used before a live lookup');
  s.window.location.href = 'https://kulms.tl.kansai-u.ac.jp/webclass/';
  s.offlineStorage.set(s.SYLLABUS_DETAIL_CACHE_KEY, JSON.stringify({ [key]: { url: detailUrl, storedAt: new Date().toISOString() } }));
  assert.equal(await s.readRememberedSyllabusDetail({ title: 'Title', courseHref: '/123', year: '2026' }), '', 'unverified legacy candidates are not reused');
  s.offlineStorage.set(s.SYLLABUS_DETAIL_CACHE_KEY, JSON.stringify({ [key]: { version: 2, url: detailUrl, storedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() } }));
  assert.equal(await s.readRememberedSyllabusDetail({ title: 'Title', courseHref: '/123', year: '2026' }), '', 'stale details are not reused');
  s.rememberPendingSyllabusNavigation({ title: 'Title', courseCode: '123', year: '2026' });
  assert.ok(s.readPendingSyllabusNavigation()?.createdAt);
  const remembered = s.readSyllabusWindowState().remembered;
  s.writeSyllabusWindowState({ pending: { title: 'legacy' }, remembered });
  assert.equal(s.readPendingSyllabusNavigation(), null);
  s.writeSyllabusWindowState({ pending: { title: 'stale', createdAt: new Date(Date.now() - 301000).toISOString() }, remembered });
  assert.equal(s.readPendingSyllabusNavigation(), null);
  let redirects = 0;
  s.window.location.replace = () => { redirects += 1; };
  s.loadSyllabusCourseCodeViaFrame = async () => 'WRONG';
  const candidate = { normalizedTitle: 'Title', id: '123', year: '2026' };
  await s.autoResolveSyllabusResult({ title: 'Title', courseCode: 'RIGHT', year: '2026' }, [candidate]);
  assert.equal(redirects, 0, 'frontend fallback does not guess a mismatched unique candidate');
  s.loadSyllabusCourseCodeViaFrame = async () => 'RIGHT';
  s.rememberSyllabusDetail = async () => {};
  await s.autoResolveSyllabusResult({ title: 'Title', courseCode: 'RIGHT', year: '2026' }, [candidate]);
  assert.equal(redirects, 1);
  s.window.location.href = `${detailUrl}&ku-native=1`;
  s.document.readyState = 'complete';
  s.initSyllabusAssist();
  s.initSyllabusDetailRedesign();
  assert.equal(parseCalls, 0);
  assert.equal(restoreCalls, 2);
  checks.push('syllabus message/frame deadlines, cancellation, fresh cache, pending TTL and native bypass');
}

console.log(JSON.stringify({ ok: true, scope: 'offline stubs only; zero real network/forms/navigation', checks }, null, 2));
