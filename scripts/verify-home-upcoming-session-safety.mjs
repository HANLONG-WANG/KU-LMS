import vm from 'node:vm';
import { read, readKulmsSource, extractFunction, assert, writeArtifact } from './lib/content-source.mjs';

const source = readKulmsSource();
const architectureDoc = read('docs/ku-lms-extension-architecture.md');
const entrypointDoc = read('docs/AI_DOCS_ENTRYPOINT.md');

const enrichHomeAsyncSource = extractFunction(source, 'enrichHomeAsync');
assert(enrichHomeAsyncSource.includes('loadNotificationFeed('), 'Home enrich should still fetch paginated notifications.');
assert(enrichHomeAsyncSource.includes('msgappmode=inbox'), 'Home enrich should still fetch inbox preview.');
assert(enrichHomeAsyncSource.includes('loadUpcomingFromDueCourses('), 'Home enrich should still build homepage upcoming items.');
assert(!enrichHomeAsyncSource.includes('loadUpcomingFromDueCoursesViaBackground('), 'Home enrich must not trigger background course-page fetches.');
assert(!enrichHomeAsyncSource.includes('requestBackgroundUpcomingCourseFetch('), 'Home enrich must not use the removed worker fan-out path.');
assert(!enrichHomeAsyncSource.includes('ku:lms:fetch-upcoming-courses'), 'Home enrich must not reference the retired worker message.');
assert(!enrichHomeAsyncSource.includes('/course.php/'), 'Home enrich must not reference course-page fetch URLs.');
assert(!enrichHomeAsyncSource.includes('parseUpcomingFromAnnouncements('), 'Home enrich should no longer build upcoming items from notice-title parsing.');

const renderHomeSource = extractFunction(source, 'renderHome');
assert(renderHomeSource.includes('data-action="refresh-upcoming"'), 'Home due card should expose an explicit refresh action.');
assert(renderHomeSource.includes('loadDisplayUpcomingFromOtherCourses('), 'Home render should use a display-only other-course cache path.');
assert(renderHomeSource.includes('同一タブキャッシュ'), 'Home render should explain that other-course hints depend on same-tab cache availability.');
assert(extractFunction(source, 'parseSchedule').includes('const period = `${rowIndex + 1}限`;'), 'Schedule parsing should derive canonical period keys from row order.');
assert(extractFunction(source, 'isDueFlagNote').includes("normalized === '締切が近い課題があります。'"), 'Due-flag detection should only key off the explicit native red-flag note.');

const loadUpcomingSource = extractFunction(source, 'loadUpcomingFromDueCourses');
assert(loadUpcomingSource.includes('loadUpcomingFromCourseCache('), 'Home upcoming should be sourced from the same-tab course cache.');
assert(!loadUpcomingSource.includes('loadUpcomingFromDueCoursesViaBackground('), 'Home upcoming must not call background course fetches.');
assert(!loadUpcomingSource.includes('requestBackgroundUpcomingCourseFetch('), 'Home upcoming must not call the removed worker bridge.');
const displayUpcomingSource = extractFunction(source, 'loadDisplayUpcomingFromOtherCourses');
assert(displayUpcomingSource.includes('loadDisplayUpcomingFromCourses('), 'Other-course display hints should flow through a dedicated display-only helper.');
assert(!displayUpcomingSource.includes('isDueFlagNote('), 'Other-course display hints must not inherit red-flag-only refresh targeting.');
assert(!displayUpcomingSource.includes('getRefreshEntries('), 'Other-course display hints must remain separate from refresh targeting.');

assert(entrypointDoc.includes('prd-ku-lms-home-safe-refresh-deadlines.md'), 'AI docs entrypoint should point to the active safe-refresh PRD.');
assert(entrypointDoc.includes('test-spec-ku-lms-home-safe-refresh-deadlines.md'), 'AI docs entrypoint should point to the active safe-refresh test spec.');
assert(architectureDoc.includes('Homepage automatic near-deadline rendering is now cache-first'), 'Architecture doc should describe cache-first homepage upcoming data.');
assert(architectureDoc.includes('top-level same-tab navigation only'), 'Architecture doc should document the refresh transport rule.');

const storage = new Map();
const sandbox = {
  console,
  URL,
  COURSE_UPCOMING_CACHE_KEY: 'ku-redesign-course-upcoming-v1',
  window: {
    sessionStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); }
    }
  },
  absoluteUrl: (value = '') => value,
  canonicalizeCourseMaterialsHref: (value = '') => value,
  state: {
    messageSelection: new Set(),
    homeSearch: '',
    currentContext: {
      links: {
        courses: '/webclass/course/list',
        notifications: '/webclass/information.php/',
        messages: '/webclass/msg_editor.php?msgappmode=inbox'
      }
    }
  },
  filterOtherCourses(groups = []) { return groups; },
  normalizeHomeAnnouncementItems(items = []) { return items; },
  renderPanelList(items = []) { return JSON.stringify(items); },
  materialTypeTone() { return 'neutral'; },
  escapeHtml(value = '') { return String(value); },
  escapeAttr(value = '') { return String(value); },
  buildUpcomingSubtitle(item = {}) { return item.courseTitle || ''; },
  formatDate(date) { return date instanceof Date ? `DATE:${date.toISOString().slice(0, 10)}` : '—'; },
  truncate(value = '') { return String(value); },
  icon() { return ''; },
  renderWeekLabel() { return '2026/05/18 〜 05/24'; },
  renderSchedule() { return '<div>schedule</div>'; },
  renderSyllabusChip() { return ''; },
  readHomeRefreshState() { return null; },
  isHomeRefreshActive() { return false; }
};
vm.createContext(sandbox);
for (const name of [
  'extractCourseId', 'buildCourseCacheKey', 'isDueFlagNote', 'parseAvailabilityRange', 'isUpcomingDueSoonUnused',
  'readCourseUpcomingCache', 'writeCourseUpcomingCache', 'serializeCourseUpcomingItem', 'pruneUpcomingItems',
  'hydrateCourseUpcomingItem', 'areUpcomingCacheEntriesEqual', 'shortenCourseTitle', 'rememberCourseUpcoming',
  'loadUpcomingFromCourseCache', 'loadDisplayUpcomingFromCourses', 'loadDisplayUpcomingFromOtherCourses',
  'mergeUpcomingSources', 'buildUpcomingIdentityKey', 'upcomingPriorityRank', 'compareUpcomingItems', 'renderHome', 'getRefreshEntries'
]) {
  vm.runInContext(extractFunction(source, name), sandbox, { filename: 'kulms-source.js' });
}

const now = Date.now();
const pad = (n) => String(n).padStart(2, '0');
const fmt = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const activeAvailability = `${fmt(now - 60 * 60 * 1000)} - ${fmt(now + 2 * 86400000)}`;
const expiredAvailability = `${fmt(now - 3 * 86400000)} - ${fmt(now - 2 * 86400000)}`;
const scheduleEntry = { href: '/webclass/course.php/26170340/?acs_=123', title: '言語学 (2026-春学期-木曜日-1限-70340)', note: '締切が近い課題があります。', sortIndex: 2 };

sandbox.rememberCourseUpcoming(scheduleEntry.href, [
  { title: '有効課題', type: '課題', availability: activeAvailability, dueDate: new Date(now + 86_400_000), href: '/detail-valid', detailHref: '/detail-valid', historyHref: '', usageText: '', usageCount: 0, hasUsage: false, usageKnown: true },
  { title: '既利用課題', type: '課題', availability: activeAvailability, dueDate: new Date(now + 86_400_000), href: '/detail-used', detailHref: '/detail-used', historyHref: '', usageText: '利用回数 1', usageCount: 1, hasUsage: true, usageKnown: true },
  { title: '期限切れ課題', type: '課題', availability: expiredAvailability, dueDate: new Date(now - 86_400_000), href: '/detail-expired', detailHref: '/detail-expired', historyHref: '', usageText: '', usageCount: 0, hasUsage: false, usageKnown: true }
]);

const prunedUpcoming = sandbox.loadUpcomingFromCourseCache([scheduleEntry]);
assert(prunedUpcoming.length === 1, 'Cache-backed homepage upcoming should prune used and expired items.');
assert(prunedUpcoming[0].title === '有効課題', 'Only valid unused due-soon cache entries should remain visible.');

const rawCache = sandbox.readCourseUpcomingCache();
const cacheKey = sandbox.buildCourseCacheKey(scheduleEntry.href);
assert(Array.isArray(rawCache[cacheKey]) && rawCache[cacheKey].length === 1, 'Cache pruning should persist the reduced cache entry set.');

const refreshEntries = sandbox.getRefreshEntries([scheduleEntry]);
assert(refreshEntries.length === 1, 'Explicit refresh should still target red-flag courses even when cache already has valid items.');
assert(sandbox.isDueFlagNote('別のメモです') === false, 'Arbitrary note text should not trigger refresh targeting.');

sandbox.rememberCourseUpcoming(scheduleEntry.href, [{ title: '利用済みのみ', type: '課題', availability: activeAvailability, dueDate: new Date(now + 86_400_000), href: '/detail-used-only', detailHref: '/detail-used-only', historyHref: '', usageText: '利用回数 1', usageCount: 1, hasUsage: true, usageKnown: true }]);
const refreshAfterUsedOnly = sandbox.getRefreshEntries([scheduleEntry]);
assert(refreshAfterUsedOnly.length === 1, 'Red-flag courses whose cache prunes to empty should remain refresh-targetable.');

const otherCourseEntry = { href: '/webclass/course.php/99112233/?acs_=456', title: '情報社会学 (2026-春学期-火曜日-3限-11223)', meta: '火曜3限' };
sandbox.rememberCourseUpcoming(otherCourseEntry.href, [
  { title: '他コース課題', type: '課題', availability: activeAvailability, dueDate: new Date(now + 2 * 86_400_000), href: '/detail-other', detailHref: '/detail-other', historyHref: '', usageText: '', usageCount: 0, hasUsage: false, usageKnown: true, courseHref: otherCourseEntry.href, courseTitle: '情報社会学', courseNote: '', hasCourseDueFlag: false, scheduleIndex: Number.MAX_SAFE_INTEGER }
]);
const otherCourseHints = sandbox.loadDisplayUpcomingFromOtherCourses([{ title: 'その他', items: [otherCourseEntry] }], [scheduleEntry]);
assert(otherCourseHints.length === 1, 'Display-only other-course hint loader should surface cache-backed items from other courses.');
assert(otherCourseHints[0].title === '他コース課題', 'Display-only other-course hint loader should preserve cached item identity.');

const renderedHome = sandbox.renderHome({
  upcoming: { loading: false, items: prunedUpcoming.map((item) => ({ ...item, daysLeft: 1 })) },
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
  week: [{ date: new Date(now), monthDay: '5/19' }],
  schedule: { entries: [scheduleEntry] },
  otherCourses: [{ title: 'その他', items: [otherCourseEntry] }]
});
assert(renderedHome.includes('他コース課題'), 'Rendered home should include cache-backed other-course items in the upcoming card and/or hint rows.');
assert(renderedHome.includes('同一タブキャッシュ'), 'Rendered home should document that missing other-course hints reflect cache availability, not guaranteed deadline absence.');

const report = { ok: true, checks: ['home-enrich-retired-worker-fetch-path', 'home-upcoming-cache-first', 'home-display-only-other-course-hints-separated-from-refresh-targeting', 'refresh-button-exposed-on-home-card', 'due-flag-contract-explicit-redflag-only', 'cache-pruning-persists-valid-items-only', 'refresh-targets-all-redflag-courses-for-live-latest-data', 'other-course-cache-hints-render-with-cache-availability-copy', 'docs-point-to-safe-refresh-phase'] };
writeArtifact('.omx/artifacts/home-upcoming-session-safety', 'verification-report.json', report);
console.log(JSON.stringify(report));
