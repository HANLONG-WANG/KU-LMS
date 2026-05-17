import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('src/content/main.js', 'utf8');
const architectureDoc = fs.readFileSync('docs/ku-lms-extension-architecture.md', 'utf8');
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

const enrichHomeAsyncSource = extractFunction('enrichHomeAsync');
assert(enrichHomeAsyncSource.includes('loadNotificationFeed('), 'Home enrich should still fetch paginated notifications');
assert(enrichHomeAsyncSource.includes('msgappmode=inbox'), 'Home enrich should still fetch inbox preview');
assert(enrichHomeAsyncSource.includes('loadUpcomingFromDueCourses('), 'Home enrich should still build homepage upcoming items');
assert(!enrichHomeAsyncSource.includes('loadUpcomingFromDueCoursesViaBackground('), 'Home enrich must not trigger background course-page fetches');
assert(!enrichHomeAsyncSource.includes('requestBackgroundUpcomingCourseFetch('), 'Home enrich must not use the removed worker fan-out path');
assert(!enrichHomeAsyncSource.includes('ku:lms:fetch-upcoming-courses'), 'Home enrich must not reference the retired worker message');
assert(!enrichHomeAsyncSource.includes('/course.php/'), 'Home enrich must not reference course-page fetch URLs');
assert(!enrichHomeAsyncSource.includes('parseUpcomingFromAnnouncements('), 'Home enrich should no longer build upcoming items from notice-title parsing');

const renderHomeSource = extractFunction('renderHome');
assert(renderHomeSource.includes('data-action="refresh-upcoming"'), 'Home due card should expose an explicit refresh action');

const loadUpcomingSource = extractFunction('loadUpcomingFromDueCourses');
assert(loadUpcomingSource.includes('loadUpcomingFromCourseCache('), 'Home upcoming should be sourced from the same-tab course cache');
assert(!loadUpcomingSource.includes('loadUpcomingFromDueCoursesViaBackground('), 'Home upcoming must not call background course fetches');
assert(!loadUpcomingSource.includes('requestBackgroundUpcomingCourseFetch('), 'Home upcoming must not call the removed worker bridge');

assert(entrypointDoc.includes('prd-ku-lms-home-safe-refresh-deadlines.md'), 'AI docs entrypoint should point to the active safe-refresh PRD');
assert(entrypointDoc.includes('test-spec-ku-lms-home-safe-refresh-deadlines.md'), 'AI docs entrypoint should point to the active safe-refresh test spec');
assert(architectureDoc.includes('Homepage automatic near-deadline rendering is now cache-first'), 'Architecture doc should describe cache-first homepage upcoming data');
assert(architectureDoc.includes('it must use top-level same-tab navigation only'), 'Architecture doc should document the refresh transport rule');

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
  canonicalizeCourseMaterialsHref: (value = '') => value
};
vm.createContext(sandbox);
for (const name of [
  'extractCourseId',
  'buildCourseCacheKey',
  'isDueFlagNote',
  'parseAvailabilityRange',
  'isUpcomingDueSoonUnused',
  'readCourseUpcomingCache',
  'writeCourseUpcomingCache',
  'serializeCourseUpcomingItem',
  'pruneUpcomingItems',
  'hydrateCourseUpcomingItem',
  'areUpcomingCacheEntriesEqual',
  'shortenCourseTitle',
  'rememberCourseUpcoming',
  'loadUpcomingFromCourseCache',
  'getRefreshEntries'
]) {
  vm.runInContext(extractFunction(name), sandbox, { filename: 'src/content/main.js' });
}

const now = Date.now();
const pad = (n) => String(n).padStart(2, '0');
const fmt = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const activeAvailability = `${fmt(now - 60 * 60 * 1000)} - ${fmt(now + 2 * 86400000)}`;
const expiredAvailability = `${fmt(now - 3 * 86400000)} - ${fmt(now - 2 * 86400000)}`;
const scheduleEntry = {
  href: '/webclass/course.php/26170340/?acs_=123',
  title: '言語学 (2026-春学期-木曜日-1限-70340)',
  note: '締切が近い課題があります。',
  sortIndex: 2
};

sandbox.rememberCourseUpcoming(scheduleEntry.href, [
  {
    title: '有効課題',
    type: '課題',
    availability: activeAvailability,
    dueDate: new Date(now + 86_400_000),
    href: '/detail-valid',
    detailHref: '/detail-valid',
    historyHref: '',
    usageText: '',
    usageCount: 0,
    hasUsage: false,
    usageKnown: true
  },
  {
    title: '既利用課題',
    type: '課題',
    availability: activeAvailability,
    dueDate: new Date(now + 86_400_000),
    href: '/detail-used',
    detailHref: '/detail-used',
    historyHref: '',
    usageText: '利用回数 1',
    usageCount: 1,
    hasUsage: true,
    usageKnown: true
  },
  {
    title: '期限切れ課題',
    type: '課題',
    availability: expiredAvailability,
    dueDate: new Date(now - 86_400_000),
    href: '/detail-expired',
    detailHref: '/detail-expired',
    historyHref: '',
    usageText: '',
    usageCount: 0,
    hasUsage: false,
    usageKnown: true
  }
]);

const prunedUpcoming = sandbox.loadUpcomingFromCourseCache([scheduleEntry]);
assert(prunedUpcoming.length === 1, 'Cache-backed homepage upcoming should prune used and expired items');
assert(prunedUpcoming[0].title === '有効課題', 'Only valid unused due-soon cache entries should remain visible');

const rawCache = sandbox.readCourseUpcomingCache();
const cacheKey = sandbox.buildCourseCacheKey(scheduleEntry.href);
assert(Array.isArray(rawCache[cacheKey]) && rawCache[cacheKey].length === 1, 'Cache pruning should persist the reduced cache entry set');

const refreshEntries = sandbox.getRefreshEntries([scheduleEntry]);
assert(refreshEntries.length === 1, 'Explicit refresh should still target red-flag courses even when cache already has valid items');

sandbox.rememberCourseUpcoming(scheduleEntry.href, [
  {
    title: '利用済みのみ',
    type: '課題',
    availability: activeAvailability,
    dueDate: new Date(now + 86_400_000),
    href: '/detail-used-only',
    detailHref: '/detail-used-only',
    historyHref: '',
    usageText: '利用回数 1',
    usageCount: 1,
    hasUsage: true,
    usageKnown: true
  }
]);
const refreshAfterUsedOnly = sandbox.getRefreshEntries([scheduleEntry]);
assert(refreshAfterUsedOnly.length === 1, 'Red-flag course whose cache prunes to empty should remain refresh-targetable');

const report = {
  ok: true,
  checks: [
    'home-enrich-retired-worker-fetch-path',
    'home-upcoming-cache-first',
    'refresh-button-exposed-on-home-card',
    'cache-pruning-persists-valid-items-only',
    'refresh-targets-all-redflag-courses-for-live-latest-data',
    'docs-point-to-safe-refresh-phase'
  ]
};

fs.mkdirSync('.omx/artifacts/home-upcoming-session-safety', { recursive: true });
fs.writeFileSync('.omx/artifacts/home-upcoming-session-safety/verification-report.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
