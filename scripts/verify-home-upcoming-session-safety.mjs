import vm from 'node:vm';
import { read, readKulmsSource, extractFunction, assert, writeArtifact } from './lib/content-source.mjs';

const source = readKulmsSource();
const architectureDoc = read('docs/ku-lms-extension-architecture.md');
const entrypointDoc = read('docs/AI_DOCS_ENTRYPOINT.md');
const designCodeDoc = read('docs/ku-lms-design-code.md');

const enrichHomeAsyncSource = extractFunction(source, 'enrichHomeAsync');
assert(!enrichHomeAsyncSource.includes('loadNotificationFeed('), 'Home enrich should no longer replace the homepage notice card with the notifications feed.');
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
assert(renderHomeSource.includes('ホームの既存表示を反映します'), 'Home render should explain that other-course reminder chips mirror the native homepage indicator.');
assert(renderHomeSource.includes('同一タブキャッシュ'), 'Home render should explain that right-column other-course details still depend on same-tab cache availability.');
assert(extractFunction(source, 'parseSchedule').includes('const period = `${rowIndex + 1}限`;'), 'Schedule parsing should derive canonical period keys from row order.');
assert(extractFunction(source, 'isDueFlagNote').includes('const canonical = dueSoonReminderText();'), 'Due-flag detection should key off the shared native red-flag reminder copy.');
const parseOtherCoursesSource = extractFunction(source, 'parseOtherCourses');
assert(parseOtherCoursesSource.includes('.course-data-box-normal'), 'Other-course parsing should inspect the full native course row wrapper.');
assert(parseOtherCoursesSource.includes('.course-contents-info'), 'Other-course parsing should read the native homepage reminder field.');

const loadUpcomingSource = extractFunction(source, 'loadUpcomingFromDueCourses');
assert(loadUpcomingSource.includes('loadUpcomingFromCourseCache('), 'Home upcoming should be sourced from the same-tab course cache.');
assert(!loadUpcomingSource.includes('loadUpcomingFromDueCoursesViaBackground('), 'Home upcoming must not call background course fetches.');
assert(!loadUpcomingSource.includes('requestBackgroundUpcomingCourseFetch('), 'Home upcoming must not call the removed worker bridge.');
const displayUpcomingSource = extractFunction(source, 'loadDisplayUpcomingFromOtherCourses');
assert(displayUpcomingSource.includes('loadDisplayUpcomingFromCourses('), 'Other-course display hints should flow through a dedicated display-only helper.');
assert(!displayUpcomingSource.includes('getRefreshEntries('), 'Other-course display hints must remain separate from refresh-target collection.');
const refreshEntriesSource = extractFunction(source, 'getRefreshEntries');
assert(refreshEntriesSource.includes('otherCourseGroups'), 'Refresh target collection should inspect other-course groups.');
assert(refreshEntriesSource.includes('hasNativeDueReminder'), 'Refresh target collection should include native-reminder other-course rows semantically.');
assert(!refreshEntriesSource.includes('loadDisplayUpcomingFromOtherCourses('), 'Refresh target collection must not depend on cache-only other-course detail loading.');

assert(entrypointDoc.includes('prd-ku-lms-home-safe-refresh-deadlines.md'), 'AI docs entrypoint should point to the active safe-refresh PRD.');
assert(entrypointDoc.includes('test-spec-ku-lms-home-safe-refresh-deadlines.md'), 'AI docs entrypoint should point to the active safe-refresh test spec.');
assert(entrypointDoc.includes('prd-ku-lms-home-other-courses-deadline-reminder.md'), 'AI docs entrypoint should point to the active native other-course reminder parity PRD.');
assert(entrypointDoc.includes('test-spec-ku-lms-home-other-courses-deadline-reminder.md'), 'AI docs entrypoint should point to the active native other-course reminder parity test spec.');
assert(entrypointDoc.includes('prd-ku-lms-home-notice-card-parity.md'), 'AI docs entrypoint should point to the homepage notice-card parity PRD.');
assert(entrypointDoc.includes('test-spec-ku-lms-home-notice-card-parity.md'), 'AI docs entrypoint should point to the homepage notice-card parity test spec.');
assert(architectureDoc.includes('Homepage automatic near-deadline rendering is now cache-first'), 'Architecture doc should describe cache-first homepage upcoming data.');
assert(architectureDoc.includes('top-level same-tab navigation only'), 'Architecture doc should document the refresh transport rule.');
assert(architectureDoc.includes('Homepage notice-card rendering stays on the current home DOM preview'), 'Architecture doc should document the native homepage notice-card source contract.');
assert(designCodeDoc.includes('native homepage `.course-contents-info` field'), 'Design code should describe native homepage DOM as the source of row-level other-course reminder chips.');
assert(designCodeDoc.includes('row-level `その他のコース` chips must not depend on prior course visits'), 'Design code should distinguish native row-level reminder chips from cache-backed detailed items.');
assert(designCodeDoc.includes('homepage refresh button should refresh timetable red-flag rows and any `その他のコース` row that already exposes the native homepage reminder'), 'Design code should document the expanded refresh target contract for native-reminder other-course rows.');

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
  'extractCourseId', 'buildCourseCacheKey', 'dueSoonReminderText', 'isDueFlagNote', 'parseAvailabilityRange', 'isUpcomingDueSoonUnused',
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
const otherCourseDomEntry = { href: '/webclass/course.php/26100311/?acs_=789', title: '活用法を見聞するAI・データサイエンス[A 1] (2026-春学期---00311)', meta: '2026 春学期 - -', note: '締切が近い課題があります。', hasNativeDueReminder: true };
const refreshTargetsWithOtherCourse = sandbox.getRefreshEntries([scheduleEntry], [{ title: 'その他', items: [otherCourseDomEntry, otherCourseEntry] }]);
assert(refreshTargetsWithOtherCourse.length === 2, 'Refresh target collection should include native-reminder other-course rows alongside timetable red-flag rows.');
assert(refreshTargetsWithOtherCourse.some((item) => item.href === otherCourseDomEntry.href), 'Refresh target collection should include the native-reminder other-course href.');
assert(!refreshTargetsWithOtherCourse.some((item) => item.href === otherCourseEntry.href), 'Cache-only other-course detail items must not become refresh targets.');

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
  otherCourses: [{ title: 'その他', items: [otherCourseDomEntry, otherCourseEntry] }]
});
assert(renderedHome.includes('他コース課題'), 'Rendered home should still include cache-backed other-course items in the right-column upcoming card.');
assert(renderedHome.includes('<div class="ku-chip red" title="ホーム画面の既存表示を反映しています">締切が近い課題があります。</div>'), 'Rendered home should show the exact schedule-style red reminder chip for native homepage other-course reminders without requiring cache hydration.');
assert(!renderedHome.includes('期限ヒント ·'), 'Rendered home should no longer expose verbose other-course deadline hint metadata.');
assert(renderedHome.includes('ホームの既存表示を反映します'), 'Rendered home should document that other-course reminder chips mirror the native homepage indicator.');
assert(renderedHome.includes('同一タブキャッシュ'), 'Rendered home should document that right-column other-course details still depend on cache availability.');
const renderedHomeEmpty = sandbox.renderHome({
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
  week: [{ date: new Date(now), monthDay: '5/19' }],
  schedule: { entries: [scheduleEntry] },
  otherCourses: [{ title: 'その他', items: [otherCourseDomEntry] }]
});
assert(renderedHomeEmpty.includes('その他のコースの行内リマインダーはホームの既存表示を反映します。右側カードの詳細は、このタブで最近開いたコースの同一タブキャッシュがある場合のみ表示されます。'), 'Rendered home empty state should distinguish native row-level reminders from cache-backed right-column details.');

const report = { ok: true, checks: ['home-enrich-retired-worker-fetch-path', 'home-upcoming-cache-first', 'home-display-only-other-course-details-separated-from-refresh-targeting', 'refresh-button-exposed-on-home-card', 'due-flag-contract-explicit-redflag-only', 'cache-pruning-persists-valid-items-only', 'refresh-targets-schedule-and-native-other-course-reminders', 'other-course-native-reminders-render-on-first-home-render', 'docs-point-to-native-reminder-parity-phase'] };
writeArtifact('.omx/artifacts/home-upcoming-session-safety', 'verification-report.json', report);
console.log(JSON.stringify(report));
