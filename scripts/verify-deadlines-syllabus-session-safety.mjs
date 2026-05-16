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
    if (char === '{') {
      brace += 1;
    } else if (char === '}') {
      brace -= 1;
      if (brace === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract function: ${name}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const collectContextSource = extractFunction(mainSource, 'collectContext');
assert(!collectContextSource.includes("loadSupplementalDocument('/webclass/')"), 'Non-home context boot should not fetch /webclass/ automatically anymore');

const buildCourseMaterialsViewSource = extractFunction(mainSource, 'buildCourseMaterialsView');
assert(buildCourseMaterialsViewSource.includes('rememberCourseUpcoming('), 'Explicit course-page visits should continue to refresh the course cache');
assert(buildCourseMaterialsViewSource.includes('shouldSuppressRefreshSideEffects('), 'Course-page refresh mode should suppress nonessential side effects');

const enrichHomeAsyncSource = extractFunction(mainSource, 'enrichHomeAsync');
assert(enrichHomeAsyncSource.includes('loadNotificationFeed('), 'Home enrich should still load the announcements feed');
assert(enrichHomeAsyncSource.includes('loadUpcomingFromDueCourses('), 'Home enrich should still load homepage upcoming data');
assert(!enrichHomeAsyncSource.includes('parseUpcomingFromAnnouncements('), 'Home upcoming should no longer rely on notice-title parsing');

assert(!mainSource.includes('ku:lms:fetch-upcoming-courses'), 'Content script should no longer reference the retired background upcoming-course message');
assert(!workerSource.includes('ku:lms:fetch-upcoming-courses'), 'Service worker should no longer expose the retired background upcoming-course message');
assert(!workerSource.includes('fetchUpcomingCourseHtml'), 'Service worker should no longer keep the homepage course fetch helper');

assert(mainSource.includes("chrome.runtime.sendMessage({ type: 'ku:lms:lookup-syllabus'"), 'Content script should still call the background syllabus resolver');
assert(mainSource.includes('シラバスを検索中…'), 'Syllabus fallback should still mount a visible searching overlay');
assert(!mainSource.includes('コース内で確認'), 'Home upcoming UI must not render the old placeholder copy');

assert(entrypointDoc.includes('prd-ku-lms-home-safe-refresh-deadlines.md'), 'AI docs entrypoint should point to the active safe-refresh PRD');
assert(entrypointDoc.includes('test-spec-ku-lms-home-safe-refresh-deadlines.md'), 'AI docs entrypoint should point to the active safe-refresh test spec');
assert(architectureDoc.includes('Homepage automatic near-deadline rendering is now cache-first'), 'Architecture doc should describe the cache-first homepage contract');
assert(architectureDoc.includes('top-level same-tab navigation only'), 'Architecture doc should document the transport prohibition and same-tab refresh rule');
assert(architectureDoc.includes('Refresh-mode course visits must suppress nonessential side effects'), 'Architecture doc should document side-effect suppression in refresh mode');

const storage = new Map();
const contentSandbox = {
  console,
  URL,
  COURSE_UPCOMING_CACHE_KEY: 'ku-redesign-course-upcoming-v1',
  HOME_REFRESH_STATE_KEY: 'ku-redesign-home-refresh-v1',
  absoluteUrl: (value = '') => value,
  canonicalizeCourseMaterialsHref: (value = '') => value,
  window: {
    location: {
      href: 'https://kulms.tl.kansai-u.ac.jp/webclass/?acs_=abc',
      origin: 'https://kulms.tl.kansai-u.ac.jp'
    },
    sessionStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); }
    }
  }
};
vm.createContext(contentSandbox);
for (const name of [
  'normalizeSyllabusCourseQuery',
  'extractNotificationPageCount',
  'buildNotificationPageUrl',
  'extractCourseId',
  'deriveSyllabusCourseCode',
  'buildCourseCacheKey',
  'isDueFlagNote',
  'parseAvailabilityRange',
  'parseAvailabilityEnd',
  'isUpcomingDueSoonUnused',
  'shortenCourseTitle',
  'sanitizeCourseItemTitle',
  'extractPrimaryTitleText',
  'inferMaterialType',
  'extractCourseItem',
  'parseUpcomingFromCourse',
  'readHomeRefreshState',
  'writeHomeRefreshState',
  'clearHomeRefreshState',
  'getCurrentHomeRefreshTarget',
  'isHomeRefreshActive',
  'shouldSuppressRefreshSideEffects',
  'doesHomeRefreshMatchCurrentView'
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

assert(contentSandbox.normalizeSyllabusCourseQuery('知的財産法（著作権）＜M＞＜S＞＜C＞ (2026-春学期-月曜日-3限-70427)') === '知的財産法（著作権）', 'Content syllabus normalizer should still strip noisy suffixes while preserving meaningful parentheses');
assert(contentSandbox.normalizeSyllabusCourseQuery('活用法を見聞するAI・データサイエンス[A 1] (2026-春学期---00311)') === '活用法を見聞するAI・データサイエンス', 'Content syllabus normalizer should still strip trailing section tags');
assert(contentSandbox.extractNotificationPageCount('ページ 1 / 61 ( No.1 - No.10 : 全 610 件)') === 61, 'Notification page counter should retain full pagination');
assert(contentSandbox.buildNotificationPageUrl('https://kulms.tl.kansai-u.ac.jp/webclass/information.php/?acs_=abc', 3).includes('page=3'), 'Notification page builder should still add page numbers');
assert(contentSandbox.isDueFlagNote('締切が近い課題があります。') === true, 'Only the explicit red-flag note should drive refresh targeting');
assert(contentSandbox.isDueFlagNote('別のメモです') === false, 'Arbitrary note text should not trigger refresh targeting');

const now = Date.now();
const pad = (n) => String(n).padStart(2, '0');
const fmt = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const futureAvailability = `${fmt(now - 60 * 60 * 1000)} - ${fmt(now + 2 * 86400000)}`;
const laterFutureAvailability = `${fmt(now - 60 * 60 * 1000)} - ${fmt(now + 3 * 86400000)}`;
const pastAvailability = `${fmt(now - 5 * 86400000)} - ${fmt(now - 4 * 86400000)}`;

contentSandbox.parseCourseMeta = () => ({ title: '言語学 (2026-春学期-木曜日-1限-70340)' });
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
assert(parsedCourseUpcoming.length === 1 && parsedCourseUpcoming[0].title === '第1回課題', 'Course-page parsing should still keep only future, non-late items');

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
assert(parsedLoginUpcoming.length === 1 && parsedLoginUpcoming[0].title.includes('授業後ミニテスト'), 'Course-page parsing should still support direct-item login-style pages');

contentSandbox.writeHomeRefreshState({
  version: 1,
  phase: 'navigating-to-course',
  homeUrl: 'https://kulms.tl.kansai-u.ac.jp/webclass/?acs_=abc',
  homeYear: '2026',
  homeSemester: '春学期',
  currentIndex: 0,
  targets: [{ href: 'https://kulms.tl.kansai-u.ac.jp/webclass/course.php/26170340/', courseHref: 'https://kulms.tl.kansai-u.ac.jp/webclass/course.php/26170340/' }]
});
assert(contentSandbox.isHomeRefreshActive(contentSandbox.readHomeRefreshState()) === true, 'Refresh state should remain active while navigating');
assert(contentSandbox.shouldSuppressRefreshSideEffects('https://kulms.tl.kansai-u.ac.jp/webclass/course.php/26170340/') === true, 'Refresh-mode course visits should suppress nonessential side effects on the active target');
assert(contentSandbox.doesHomeRefreshMatchCurrentView({ filters: { year: '2026', semester: '春学期' } }, contentSandbox.readHomeRefreshState()) === true, 'Home restoration matcher should accept the supported route+filter scope');
contentSandbox.clearHomeRefreshState();

const normalizedWorker = workerSandbox.normalizeQuery('知的財産法（著作権）＜M＞＜S＞＜C＞ (2026-春学期-月曜日-3限-70427)');
assert(normalizedWorker === '知的財産法（著作権）', 'Background syllabus normalizer should match content normalization');
const queryVariants = workerSandbox.buildQueryVariants('活用法を見聞するAI・データサイエンス[A 1] (2026-春学期---00311)');
assert(Array.isArray(queryVariants) && queryVariants[0] === '活用法を見聞するAI・データサイエンス', 'Background query variants should still start from the cleaned title');

const sampleSearchHtml = `<table><tr><td>法学部</td><td><a onclick="linkSetGoSt('2026','050397','知的財産法（著作権）')">知的財産法（著作権）</a></td><td>山田 太郎</td></tr></table>`;
const parsedCandidates = workerSandbox.parseSyllabusCandidates(sampleSearchHtml);
assert(parsedCandidates.length === 1 && parsedCandidates[0].normalizedTitle === '知的財産法（著作権）', 'parseSyllabusCandidates should still normalize noisy syllabus titles');
assert(workerSandbox.extractSyllabusCourseCode('<div>時間割コード Course Code 70427</div>') === '70427', 'extractSyllabusCourseCode should still recover the public syllabus course code');

workerSandbox.fetch = async (url) => ({ text: async () => (url.includes('UJikanwari_cd=A') ? '<div>Course Code 11111</div>' : '<div>Course Code 70427</div>') });
const resolvedByCode = await workerSandbox.resolveCandidateByCourseCode([
  { id: 'A', year: '2026', query: '知的財産法（著作権）', title: '知的財産法（著作権）' },
  { id: 'B', year: '2026', query: '知的財産法（著作権）', title: '知的財産法（著作権）' }
], '知的財産法（著作権）', '2026', '70427');
assert(resolvedByCode.includes('UJikanwari_cd=B'), 'resolveCandidateByCourseCode should still use detail fetches to disambiguate by course code');

const report = {
  ok: true,
  checks: [
    'no-nonhome-home-fetch',
    'explicit-course-visits-still-refresh-cache',
    'retired-worker-upcoming-fetch-path',
    'refresh-mode-side-effects-suppressed',
    'course-upcoming-parser-still-valid',
    'syllabus-direct-resolver-contract-preserved',
    'active-docs-point-to-safe-refresh-phase'
  ]
};

fs.mkdirSync('.omx/artifacts/deadlines-syllabus-session-safety', { recursive: true });
fs.writeFileSync('.omx/artifacts/deadlines-syllabus-session-safety/verification-report.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
