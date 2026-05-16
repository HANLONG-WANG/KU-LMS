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

const sandbox = { console };
vm.createContext(sandbox);
for (const name of [
  'uniqueBy',
  'normalizeHomeAnnouncementItems',
  'mergeAnnouncementSources',
  'buildDueFlagCourseAlertItems',
  'inferMaterialType',
  'shortenCourseTitle',
  'parseAnnouncementDueDate',
  'parseUpcomingFromAnnouncements',
  'upcomingPriorityRank',
  'compareUpcomingItems',
  'buildUpcomingSubtitle'
]) {
  vm.runInContext(extractFunction(name), sandbox, { filename: 'src/content/main.js' });
}

const enrichHomeAsyncSource = extractFunction('enrichHomeAsync');
assert(enrichHomeAsyncSource.includes('/webclass/information.php/'), 'Home enrich should fetch notifications');
assert(enrichHomeAsyncSource.includes('msgappmode=inbox'), 'Home enrich should fetch inbox preview');
assert(enrichHomeAsyncSource.includes('mergeAnnouncementSources(fallbackAnnouncements, fetchedAnnouncements)'), 'Home enrich should merge current-page and fetched announcements');
assert(enrichHomeAsyncSource.includes('parseUpcomingFromAnnouncements(upcomingAnnouncementSource, view.schedule.entries, view.filters.year)'), 'Home enrich should parse the merged announcement source');
assert(!enrichHomeAsyncSource.includes('parseUpcomingFromCourse('), 'Home enrich must not rebuild upcoming from course-page fetches');
assert(!enrichHomeAsyncSource.includes('/course.php/'), 'Home enrich must not reference course-page supplemental fetches');
assert(!enrichHomeAsyncSource.includes('iframe'), 'Home enrich must not create iframe fan-out');
assert(!enrichHomeAsyncSource.includes('loadSyllabusCourseCodeViaFrame'), 'Home enrich must stay separate from iframe-based syllabus helpers');

const homeOnlyNotice = { title: '第1回課題 05/25 09:00-10:00', href: '/home-only', meta: '経済学' };
const duplicateFetched = { title: '第1回課題 05/25 09:00-10:00', href: '/home-only', source: '経済学', important: false, deadline: '' };
const fetchedOnlyNotice = { title: '第2回課題 05/24 09:00-10:00', href: '/fetched-only', source: '法学', important: false, deadline: '' };
const normalizedHome = sandbox.normalizeHomeAnnouncementItems([homeOnlyNotice]);
const merged = sandbox.mergeAnnouncementSources(normalizedHome, [duplicateFetched, fetchedOnlyNotice]);
assert(merged.length === 2, 'Merged announcement source should dedupe repeated notices across home/fetched sources');
assert(merged.some((item) => item.href === '/home-only'), 'Merged announcement source should retain home-only due notice');
assert(merged.some((item) => item.href === '/fetched-only'), 'Merged announcement source should retain fetched-only due notice');

const longFetched = [
  { title: '一般連絡 05/20 09:00-10:00', href: '/n1', source: '未対応A' },
  { title: '一般連絡 05/19 09:00-10:00', href: '/n2', source: '未対応B' },
  { title: '一般連絡 05/18 09:00-10:00', href: '/n3', source: '未対応C' },
  { title: '一般連絡 05/17 09:00-10:00', href: '/n4', source: '未対応D' },
  { title: '一般連絡 05/16 09:00-10:00', href: '/n5', source: '未対応E' },
  { title: '第6回レポート 05/10 09:00-12:00', href: '/n6', source: '経済学' }
];
const scheduleForLong = [{ title: '経済学 (2026-前期)', href: '/course-long', note: '', sortIndex: 0 }];
const longParsed = sandbox.parseUpcomingFromAnnouncements(longFetched, scheduleForLong, '2026');
assert(longParsed.length === 1 && longParsed[0].href === '/n6', 'Upcoming parsing should preserve a matching notice beyond the fifth fetched row');

const scheduleEntries = [
  { title: '経済学 (2026-前期)', href: '/course-a', note: '締切が近い課題があります。', sortIndex: 0 },
  { title: '法学 (2026-前期)', href: '/course-b', note: '', sortIndex: 1 },
  { title: '社会学 (2026-前期)', href: '/course-c', note: '締切が近い課題があります。', sortIndex: 2 }
];
const parsed = sandbox.parseUpcomingFromAnnouncements(merged, scheduleEntries, '2026');
assert(parsed.length === 2, 'Upcoming parser should keep due notices from both home preview and fetched notifications');
const alerts = sandbox.buildDueFlagCourseAlertItems(scheduleEntries, parsed);
assert(alerts.length === 1, 'Due-flagged schedule course without matching notice should produce one fallback alert card');
assert(alerts[0].courseHref === '/course-c', 'Fallback alert should target the uncovered due-flagged course');
const ranked = [...parsed, ...alerts].sort(sandbox.compareUpcomingItems);
assert(ranked[0].courseHref === '/course-a', 'Detailed due item on a red-flagged course should rank first');
assert(ranked[1].courseHref === '/course-c' && ranked[1].isCourseAlert === true, 'Red-flagged fallback course alert should rank before non-flagged due items');
assert(ranked[2].courseHref === '/course-b', 'Non-flagged due item should remain below red-flagged items');

const usageRanked = [
  { title: 'B課題', dueDate: new Date('2026-05-01T10:00:00Z'), hasCourseDueFlag: false, hasUsage: true, scheduleIndex: 1 },
  { title: 'A課題', dueDate: new Date('2026-05-02T10:00:00Z'), hasCourseDueFlag: false, hasUsage: false, scheduleIndex: 0 }
].sort(sandbox.compareUpcomingItems);
assert(usageRanked[0].title === 'A課題', 'Unknown/no-usage items should rank before used items even when their due date is later');

const titleTiebreak = [
  { title: 'い課題', dueDate: new Date('2026-05-01T10:00:00Z'), hasCourseDueFlag: false, hasUsage: false, scheduleIndex: 0 },
  { title: 'あ課題', dueDate: new Date('2026-05-01T10:00:00Z'), hasCourseDueFlag: false, hasUsage: false, scheduleIndex: 99 }
].sort(sandbox.compareUpcomingItems);
assert(titleTiebreak[0].title === 'あ課題', 'Items with the same due date should fall back to title ordering before schedule position');

const unknownUsageSubtitle = sandbox.buildUpcomingSubtitle({ courseTitle: '経済学', courseNote: '', usageText: '', usageKnown: false, hasUsage: false });
assert(!unknownUsageSubtitle.includes('未利用'), 'Unknown usage state must not be rendered as 未利用');
const knownUnusedSubtitle = sandbox.buildUpcomingSubtitle({ courseTitle: '経済学', courseNote: '', usageText: '', usageKnown: true, hasUsage: false });
assert(knownUnusedSubtitle.includes('未利用'), 'Known unused state should still render 未利用');

assert(entrypointDoc.includes('prd-ku-lms-home-upcoming-session-safety.md'), 'AI docs entrypoint should point to the new active PRD');
assert(entrypointDoc.includes('test-spec-ku-lms-home-upcoming-session-safety.md'), 'AI docs entrypoint should point to the new active test spec');
assert(architectureDoc.includes('must not crawl or prefetch course pages during automatic homepage enrichment'), 'Architecture doc should state that homepage enrichment stays off course pages');
assert(architectureDoc.includes('add an honest fallback card'), 'Architecture doc should document the red-flag fallback-card behavior');

const report = {
  ok: true,
  checks: [
    'home-enrich-stays-off-course-pages-and-iframes',
    'home-plus-fetched-announcements-merged-and-deduped',
    'upcoming-parser-retains-home-only-and-fetched-only-due-notices',
    'fetched-announcements-keep-sixth-row-before-preview-cap',
    'due-flag-priority-ranks-before-non-flagged',
    'red-flagged-course-alert-fallback-fills-uncovered-courses',
    'used-items-rank-after-unknown-or-unused-items',
    'same-due-date-falls-back-to-title-order',
    'unknown-usage-does-not-render-unused-label',
    'docs-point-to-current-phase-and-architecture-contract'
  ]
};

fs.mkdirSync('.omx/artifacts/home-upcoming-session-safety', { recursive: true });
fs.writeFileSync('.omx/artifacts/home-upcoming-session-safety/verification-report.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
