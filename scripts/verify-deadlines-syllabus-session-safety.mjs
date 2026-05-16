import fs from 'node:fs';
import vm from 'node:vm';

const mainSource = fs.readFileSync('src/content/main.js', 'utf8');
const workerSource = fs.readFileSync('src/background/service-worker.js', 'utf8');
const architectureDoc = fs.readFileSync('docs/ku-lms-extension-architecture.md', 'utf8');
const entrypointDoc = fs.readFileSync('docs/AI_DOCS_ENTRYPOINT.md', 'utf8');

function extractFunction(source, name) {
  const patterns = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const pattern of patterns) {
    start = source.indexOf(pattern);
    if (start !== -1) break;
  }
  if (start === -1) throw new Error(`Function not found: ${name}`);
  const signatureEnd = source.indexOf(')', start);
  const bodyStart = source.indexOf('{', signatureEnd);
  if (bodyStart === -1) throw new Error(`Could not find body start for: ${name}`);
  let brace = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') brace += 1;
    else if (char === '}') {
      brace -= 1;
      if (brace === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract function: ${name}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const storage = new Map();
const contentSandbox = {
  console,
  URL,
  COURSE_UPCOMING_CACHE_KEY: 'ku-redesign-course-upcoming-v1',
  chrome: { runtime: { sendMessage() {} } },
  absoluteUrl: (value = '') => value,
  window: {
    sessionStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); }
    }
  },
  DOMParser: class {
    parseFromString(html) {
      return { html };
    }
  }
};
vm.createContext(contentSandbox);
for (const name of [
  'normalizeSyllabusCourseQuery',
  'mountSyllabusAssistOverlay',
  'lookupSyllabusDirectUrl',
  'extractNotificationPageCount',
  'buildNotificationPageUrl',
  'isDueFlagNote',
  'extractCourseId',
  'buildCourseCacheKey',
  'loadNotificationFeed',
  'readCourseUpcomingCache',
  'writeCourseUpcomingCache',
  'rememberCourseUpcoming',
  'loadUpcomingFromCourseCache',
  'requestBackgroundUpcomingCourseFetch',
  'loadUpcomingFromDueCoursesViaBackground',
  'parseAvailabilityRange',
  'parseAvailabilityEnd',
  'isUpcomingDueSoonUnused',
  'loadUpcomingFromDueCourses',
  'buildUpcomingIdentityKey',
  'mergeUpcomingSources',
  'parseUpcomingFromCourse',
  'shortenCourseTitle'
]) {
  vm.runInContext(extractFunction(mainSource, name), contentSandbox, { filename: 'src/content/main.js' });
}

const workerSandbox = { console };
vm.createContext(workerSandbox);
for (const name of [
  'stripHtml',
  'normalizeQuery',
  'uniqueBy',
  'buildQueryVariants',
  'parseSyllabusCandidates',
  'extractSyllabusCourseCode',
  'buildSyllabusDetailUrl',
  'fetchSyllabusCourseCode',
  'resolveCandidateByCourseCode',
  'lookupSyllabusDetailUrl'
]) {
  vm.runInContext(extractFunction(workerSource, name), workerSandbox, { filename: 'src/background/service-worker.js' });
}

const collectContextSource = extractFunction(mainSource, 'collectContext');
assert(!collectContextSource.includes("loadSupplementalDocument('/webclass/')"), 'Non-home context boot should not fetch /webclass/ automatically anymore');

const buildCourseMaterialsViewSource = extractFunction(mainSource, 'buildCourseMaterialsView');
assert(buildCourseMaterialsViewSource.includes('rememberCourseUpcoming('), 'Explicit course-page visits should refresh the session cache');

const enrichHomeAsyncSource = extractFunction(mainSource, 'enrichHomeAsync');
assert(enrichHomeAsyncSource.includes('loadNotificationFeed('), 'Home enrich should load paginated notification feed for the announcements panel');
assert(enrichHomeAsyncSource.includes('loadUpcomingFromDueCourses('), 'Home enrich should load red-flag course upcoming data');
assert(!enrichHomeAsyncSource.includes('parseUpcomingFromAnnouncements('), 'Home upcoming should no longer be built from notice-derived task parsing');
assert(!enrichHomeAsyncSource.includes('buildDueFlagCourseAlertItems('), 'Home enrich should no longer use course-alert placeholder cards');

const loadUpcomingSource = extractFunction(mainSource, 'loadUpcomingFromDueCourses');
assert(loadUpcomingSource.includes('loadUpcomingFromDueCoursesViaBackground('), 'Home upcoming should request background course fetches for red-flag courses');
assert(loadUpcomingSource.includes('loadUpcomingFromCourseCache('), 'Home upcoming should still merge same-tab course cache results');
assert(loadUpcomingSource.includes('mergeUpcomingSources(backgroundItems, cacheItems)'), 'Background course results should stay primary over same-tab cache fallbacks');
assert(loadUpcomingSource.includes('isUpcomingDueSoonUnused('), 'Home upcoming should filter to due-soon unused items');

const backgroundFetchSource = extractFunction(mainSource, 'requestBackgroundUpcomingCourseFetch');
assert(backgroundFetchSource.includes("type: 'ku:lms:fetch-upcoming-courses'"), 'Content script should request background upcoming-course fetches');

const submitFallbackSource = extractFunction(mainSource, 'submitSyllabusSearchNavigation');
assert(!submitFallbackSource.includes('resolveCourseInstructor'), 'Visible syllabus-search fallback should not fetch KU-LMS course instructor via /info');
const autoResolveSource = extractFunction(mainSource, 'autoResolveSyllabusResult');
assert(!autoResolveSource.includes('normalizedInstructor'), 'Syllabus-domain fallback should not retain the removed instructor branch');
assert(mainSource.includes("chrome.runtime.sendMessage({ type: 'ku:lms:lookup-syllabus'"), 'Content script should call the background syllabus resolver');
assert(mainSource.includes('シラバスを検索中…'), 'Syllabus fallback should mount a visible searching overlay instead of flashing raw search results');
const overlaySource = extractFunction(mainSource, 'mountSyllabusAssistOverlay');
assert(!overlaySource.includes('DOMContentLoaded'), 'Syllabus overlay should mount immediately without waiting for DOMContentLoaded');
assert(!mainSource.includes('コース内で確認'), 'Home upcoming UI must not render the course-confirm placeholder anymore');
assert(!workerSource.includes('normalizedInstructor'), 'Background resolver should no longer retain the removed instructor-only branch');
assert(workerSource.includes("type === 'ku:lms:fetch-upcoming-courses'"), 'Service worker should handle background upcoming-course fetches');
assert(workerSource.includes('credentials: \"include\"') || workerSource.includes("credentials: 'include'"), 'Background course fetches should include KU-LMS cookies');

contentSandbox.canonicalizeCourseMaterialsHref = (value = '') => value;
const normalizedContent = contentSandbox.normalizeSyllabusCourseQuery('知的財産法（著作権）＜M＞＜S＞＜C＞ (2026-春学期-月曜日-3限-70427)');
assert(normalizedContent === '知的財産法（著作権）', 'Content syllabus normalizer should strip timetable suffixes and angle tags but keep meaningful Japanese parentheses');
assert(contentSandbox.normalizeSyllabusCourseQuery('活用法を見聞するAI・データサイエンス[A 1] (2026-春学期---00311)') === '活用法を見聞するAI・データサイエンス', 'Content syllabus normalizer should strip trailing [A 1] style tags');
assert(contentSandbox.extractNotificationPageCount('ページ 1 / 61 ( No.1 - No.10 : 全 610 件)') === 61, 'Notification page counter should not cap the last page count');
assert(contentSandbox.buildNotificationPageUrl('https://kulms.tl.kansai-u.ac.jp/webclass/information.php/?acs_=abc', 3).includes('page=3'), 'Notification page URL builder should append page numbers');
assert(contentSandbox.isDueFlagNote('締切が近い課題があります。') === true, 'Only the explicit due-flag note should trigger due-course fetching');
assert(contentSandbox.isDueFlagNote('別のメモです') === false, 'Arbitrary note text should not trigger due-course fetching');

const range = contentSandbox.parseAvailabilityRange('2026/05/14 09:00 - 2026/05/20 16:59');
assert(typeof range.start?.getTime === 'function' && typeof range.end?.getTime === 'function' && range.end.getTime() > range.start.getTime(), 'Availability range parsing should recover both start and end datetimes');

// Behavioral: loadNotificationFeed should walk every page returned by extractNotificationPageCount.
const notificationCalls = [];
const pageDocs = new Map();
for (let page = 1; page <= 61; page += 1) {
  const url = page === 1
    ? 'https://kulms.tl.kansai-u.ac.jp/webclass/information.php/?acs_=abc'
    : `https://kulms.tl.kansai-u.ac.jp/webclass/information.php/?acs_=abc&page=${page}`;
  pageDocs.set(url, { page });
}
contentSandbox.loadSupplementalDocument = async (url) => {
  notificationCalls.push(url);
  return pageDocs.get(url);
};
contentSandbox.parseNotificationsList = (doc) => ({
  items: [{ title: `notice-${doc.page}`, href: `/n${doc.page}`, source: `source-${doc.page}` }],
  metaText: `ページ ${doc.page} / 61 ( No.${doc.page} - No.${doc.page} : 全 61 件)`
});
const notificationFeed = await contentSandbox.loadNotificationFeed('https://kulms.tl.kansai-u.ac.jp/webclass/information.php/?acs_=abc');
assert(notificationCalls.length === 61, 'loadNotificationFeed should fetch the entire reported pagination range');
assert(notificationFeed.previewItems.length === 1 && notificationFeed.previewItems[0].title === 'notice-1', 'loadNotificationFeed should keep first-page items as the visible preview source');
assert(notificationFeed.allItems.length === 61 && notificationFeed.allItems.at(-1).title === 'notice-61', 'loadNotificationFeed should aggregate every fetched notice page');

// Behavioral: same-tab cache should write/read by stable courseId key.
const now = Date.now();
const fmt = (ts) => { const d = new Date(ts); const pad = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const futureAvailability = `${fmt(now - 60 * 60 * 1000)} - ${fmt(now + 2 * 86400000)}`;
const laterFutureAvailability = `${fmt(now - 60 * 60 * 1000)} - ${fmt(now + 3 * 86400000)}`;
const pastAvailability = `${fmt(now - 5 * 86400000)} - ${fmt(now - 4 * 86400000)}`;
contentSandbox.rememberCourseUpcoming('/webclass/course.php/26170340/?acs_=777', [
  {
    title: '第1回課題', type: '課題', availability: futureAvailability, dueDate: new Date(now + 86_400_000),
    href: '/d1', detailHref: '/d1', historyHref: '', usageText: '', usageCount: 0, hasUsage: false, usageKnown: true
  }
]);
const cachedUpcoming = contentSandbox.loadUpcomingFromCourseCache([
  { href: '/webclass/course.php/26170340/?acs_=123', note: '締切が近い課題があります。', title: '言語学 (2026-春学期-木曜日-1限-70340)', sortIndex: 2 },
  { href: '/webclass/course.php/26105097/?acs_=456', note: '別のメモです', title: '日本語３ａ (2026-春学期-月曜日-2限-05097)', sortIndex: 3 }
]);
assert(cachedUpcoming.length === 1 && cachedUpcoming[0].title === '第1回課題', 'Course cache should read back through the same stable courseId key even when homepage href carries a different acs');

// Behavioral: background fetch request and filter logic.
const backgroundRequests = [];
const originalParseUpcomingFromCourse = contentSandbox.parseUpcomingFromCourse;
contentSandbox.chrome.runtime.sendMessage = (payload, callback) => {
  backgroundRequests.push(payload);
  callback({ results: [
    { href: '/webclass/course.php/26170340/?acs_=123', supplementalHref: '/webclass/course.php/26170340/login?acs_=123', html: '<div>ok</div>', conflict: false, loginRedirect: false },
    { href: '/webclass/course.php/26170399/?acs_=456', supplementalHref: '/webclass/course.php/26170399/login?acs_=456', html: '', conflict: true, loginRedirect: false }
  ] });
};
contentSandbox.parseUpcomingFromCourse = (doc, href, { scheduleEntry }) => {
  if (!doc.html || doc.html.includes('ok') === false) return [];
  return [{
    title: '第1回課題',
    type: '課題',
    availability: futureAvailability,
    dueDate: new Date(now + 2 * 86_400_000),
    href: '/detail',
    detailHref: '/detail',
    historyHref: '',
    courseHref: href,
    courseTitle: '言語学',
    courseNote: scheduleEntry.note,
    hasCourseDueFlag: true,
    usageText: '',
    usageCount: 0,
    hasUsage: false,
    usageKnown: true,
    scheduleIndex: scheduleEntry.sortIndex,
    isCourseAlert: false
  }];
};
const backgroundCourseItems = await contentSandbox.loadUpcomingFromDueCoursesViaBackground([
  { href: '/webclass/course.php/26170340/?acs_=123', supplementalHref: '/webclass/course.php/26170340/login?acs_=123', note: '締切が近い課題があります。', title: '言語学 (2026-春学期-木曜日-1限-70340)', sortIndex: 2 },
  { href: '/webclass/course.php/26170399/?acs_=456', supplementalHref: '/webclass/course.php/26170399/login?acs_=456', note: '締切が近い課題があります。', title: 'ヒューマンエージェントインタラクション＜M＞＜C＞ (2026-春学期-金曜日-2限-70399)', sortIndex: 3 }
]);
assert(backgroundRequests.length === 1 && backgroundRequests[0].type === 'ku:lms:fetch-upcoming-courses', 'Home upcoming should request background course fetches through the service worker');
assert(backgroundCourseItems.length === 1 && backgroundCourseItems[0].title === '第1回課題', 'Background course loader should skip aborted/conflict course results and keep successful ones');

const filteredUpcoming = await contentSandbox.loadUpcomingFromDueCourses([
  { href: '/webclass/course.php/26170340/?acs_=123', supplementalHref: '/webclass/course.php/26170340/login?acs_=123', note: '締切が近い課題があります。', title: '言語学 (2026-春学期-木曜日-1限-70340)', sortIndex: 2 }
]);
assert(filteredUpcoming.length >= 1 && filteredUpcoming.every((item) => item.hasUsage === false && contentSandbox.isUpcomingDueSoonUnused(item)), 'Home upcoming should keep only due-soon unused items from red-flag courses');
assert(contentSandbox.isUpcomingDueSoonUnused({ dueDate: new Date(now + 8 * 86_400_000), availability: '2026/05/14 09:00 - 2026/05/30 16:59', hasUsage: false }) === false, 'Items due after 7 days should not be shown');
assert(contentSandbox.isUpcomingDueSoonUnused({ dueDate: new Date(now + 2 * 86_400_000), availability: futureAvailability, hasUsage: true }) === false, 'Items with usage history should not be shown');
contentSandbox.parseUpcomingFromCourse = originalParseUpcomingFromCourse;

// Behavioral: parseUpcomingFromCourse should skip 締め切り後提出 and still parse direct-item login pages.
contentSandbox.parseCourseMeta = () => ({ title: '言語学 (2026-春学期-木曜日-1限-70340)' });
contentSandbox.canonicalizeCourseMaterialsHref = (value) => value;
contentSandbox.extractCourseItem = (item) => item.data;
const courseDoc = {
  querySelectorAll(selector) {
    if (selector !== '.cl-contentsList_folder') return [];
    return [{
      querySelector(sel) { return sel === '.panel-title' ? { textContent: '課題' } : null; },
      querySelectorAll(sel) {
        if (sel !== '.cl-contentsList_listGroupItem') return [];
        return [
          { data: { title: '第1回課題', type: '課題', availability: futureAvailability, detailHref: '/d1', historyHref: '', usage: '', usageCount: 0, href: '/d1' } },
          { data: { title: '第2回課題', type: '課題', availability: pastAvailability, detailHref: '/d2', historyHref: '', usage: '', usageCount: 0, href: '/d2' } }
        ];
      }
    }, {
      querySelector(sel) { return sel === '.panel-title' ? { textContent: '締め切り後提出' } : null; },
      querySelectorAll(sel) {
        if (sel !== '.cl-contentsList_listGroupItem') return [];
        return [
          { data: { title: '締切後の課題', type: '課題', availability: futureAvailability, detailHref: '/d3', historyHref: '', usage: '', usageCount: 0, href: '/d3' } }
        ];
      }
    }];
  }
};
const parsedCourseUpcoming = contentSandbox.parseUpcomingFromCourse(courseDoc, '/course-a', {
  scheduleEntry: { title: '言語学 (2026-春学期-木曜日-1限-70340)', note: '締切が近い課題があります。', sortIndex: 4 }
});
assert(parsedCourseUpcoming.length === 1 && parsedCourseUpcoming[0].title === '第1回課題', 'Course-page parsing should keep only future, non-late items');
const loginLikeDoc = {
  querySelectorAll(selector) {
    if (selector === '.cl-contentsList_folder') return [];
    if (selector === '.cl-contentsList_listGroupItem') {
      return [
        { data: { title: '第05回　授業後ミニテスト', type: '試験', availability: laterFutureAvailability, detailHref: '/login-detail', historyHref: '', usage: '', usageCount: 0, href: '/login-detail' } },
        { data: { title: '第05回　授業後ミニテスト（締め切り後提出）', type: '試験', availability: laterFutureAvailability, detailHref: '/late-detail', historyHref: '', usage: '', usageCount: 0, href: '/late-detail' } }
      ];
    }
    return [];
  }
};
const parsedLoginUpcoming = contentSandbox.parseUpcomingFromCourse(loginLikeDoc, '/course-b', {
  scheduleEntry: { title: 'ヒューマンエージェントインタラクション＜M＞＜C＞ (2026-春学期-金曜日-2限-70399)', note: '締切が近い課題があります。', sortIndex: 2 }
});
assert(parsedLoginUpcoming.length === 1 && parsedLoginUpcoming[0].title.includes('授業後ミニテスト'), 'parseUpcomingFromCourse should parse direct-item login pages and still drop late-submission items');

const normalizedWorker = workerSandbox.normalizeQuery('知的財産法（著作権）＜M＞＜S＞＜C＞ (2026-春学期-月曜日-3限-70427)');
assert(normalizedWorker === '知的財産法（著作権）', 'Background syllabus normalizer should match content normalization');
const queryVariants = workerSandbox.buildQueryVariants('活用法を見聞するAI・データサイエンス[A 1] (2026-春学期---00311)');
assert(Array.isArray(queryVariants) && queryVariants[0] === '活用法を見聞するAI・データサイエンス', 'Background query variants should start from the cleaned course title');

const sampleSearchHtml = `<table><tr><td>法学部</td><td><a onclick="linkSetGoSt('2026','050397','知的財産法（著作権）')">知的財産法（著作権）</a></td><td>山田 太郎</td></tr></table>`;
const parsedCandidates = workerSandbox.parseSyllabusCandidates(sampleSearchHtml);
assert(parsedCandidates.length === 1 && parsedCandidates[0].normalizedTitle === '知的財産法（著作権）', 'parseSyllabusCandidates should normalize noisy syllabus titles from HTML rows');
const sampleDetailHtml = '<div>時間割コード Course Code 70427</div>';
assert(workerSandbox.extractSyllabusCourseCode(sampleDetailHtml) === '70427', 'extractSyllabusCourseCode should recover the public syllabus course code');
workerSandbox.fetch = async (url) => ({ text: async () => (url.includes('UJikanwari_cd=A') ? '<div>Course Code 11111</div>' : '<div>Course Code 70427</div>') });
const realResolved = await workerSandbox.resolveCandidateByCourseCode([
  { id: 'A', year: '2026', query: '知的財産法（著作権）', title: '知的財産法（著作権）' },
  { id: 'B', year: '2026', query: '知的財産法（著作権）', title: '知的財産法（著作権）' }
], '知的財産法（著作権）', '2026', '70427');
assert(realResolved.includes('UJikanwari_cd=B'), 'resolveCandidateByCourseCode should use the real detail fetch path to find the matching course code');
workerSandbox.searchSyllabus = async ({ query }) => query;
workerSandbox.parseSyllabusCandidates = (query) => {
  if (query !== '知的財産法（著作権）') return [];
  return [
    { id: 'A', year: '2026', query, title: '知的財産法（著作権）', normalizedTitle: '知的財産法（著作権）', courseCode: '11111' },
    { id: 'B', year: '2026', query, title: '知的財産法（著作権）', normalizedTitle: '知的財産法（著作権）', courseCode: '70427' }
  ];
};
workerSandbox.buildSyllabusDetailUrl = (candidate) => `detail:${candidate.id}`;
workerSandbox.resolveCandidateByCourseCode = async (candidates, _query, _nendo, courseCode) => {
  const match = candidates.find((candidate) => candidate.courseCode === courseCode);
  return match ? `detail:${match.id}` : '';
};
const directSyllabusUrl = await workerSandbox.lookupSyllabusDetailUrl({
  title: '知的財産法（著作権）＜M＞＜S＞＜C＞ (2026-春学期-月曜日-3限-70427)',
  year: '2026',
  courseCode: '70427'
});
assert(directSyllabusUrl === 'detail:B', 'Background syllabus lookup should resolve noisy course titles through the cleaned query plus courseCode');

assert(entrypointDoc.includes('prd-ku-lms-deadlines-syllabus-session-safety.md'), 'AI docs entrypoint should point to the new active PRD');
assert(entrypointDoc.includes('test-spec-ku-lms-deadlines-syllabus-session-safety.md'), 'AI docs entrypoint should point to the new active test spec');
assert(architectureDoc.includes('do not fetch KU-LMS `/course.php/:courseId/info` during chip-click handling'), 'Architecture doc should forbid KU-LMS /info fetches during syllabus clicks');
assert(architectureDoc.includes('parses notification rows across pagination'), 'Architecture doc should document full notification pagination for the announcements panel');
assert(architectureDoc.includes('background first by fetching the public search/detail pages'), 'Architecture doc should describe the background direct-fetch resolver versus syllabus-page fallback split');
assert(architectureDoc.includes('Only red-flag timetable courses are background-fetched'), 'Architecture doc should document the red-flag-only background fetch rule');
assert(architectureDoc.includes('7 days') || architectureDoc.includes('7 日'), 'Architecture doc should document the 7-day upcoming filter');
assert(architectureDoc.includes('Same-tab session cache'), 'Architecture doc should document same-tab course caching');
assert(architectureDoc.includes('シラバスを検索中…'), 'Architecture doc should document the syllabus searching overlay for fallback resolution');

const report = {
  ok: true,
  checks: [
    'no-nonhome-home-fetch',
    'load-notification-feed-walks-full-pagination',
    'home-upcoming-uses-background-redflag-fetch-plus-cache',
    'upcoming-filter-enforces-availability-seven-day-unused-rules',
    'course-page-parsing-supports-full-and-login-layouts',
    'syllabus-click-uses-background-resolver-not-ku-info',
    'background-resolver-handles-noisy-course-titles',
    'real-syllabus-parser-and-coursecode-extractor-still-work',
    'no-course-confirm-placeholder',
    'active-docs-point-to-new-phase'
  ]
};

fs.mkdirSync('.omx/artifacts/deadlines-syllabus-session-safety', { recursive: true });
fs.writeFileSync('.omx/artifacts/deadlines-syllabus-session-safety/verification-report.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
