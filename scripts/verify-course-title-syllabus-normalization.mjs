import vm from 'node:vm';
import { read, readKulmsSource, readSyllabusSource, extractFunction, assert, writeArtifact } from './lib/content-source.mjs';

const kulmsSource = readKulmsSource();
const syllabusSource = readSyllabusSource();
const architectureDoc = read('docs/ku-lms-extension-architecture.md');
const entrypointDoc = read('docs/AI_DOCS_ENTRYPOINT.md');
const prd = read('.omx/plans/prd-ku-lms-course-title-syllabus-normalization.md');
const testSpec = read('.omx/plans/test-spec-ku-lms-course-title-syllabus-normalization.md');

assert(prd.includes('Course Title & Syllabus Normalization'), 'Missing course-title normalization PRD.');
assert(testSpec.includes('Acceptance checks'), 'Missing course-title normalization test spec.');
assert(entrypointDoc.includes('prd-ku-lms-course-title-syllabus-normalization.md'), 'AI docs entrypoint should list the course-title normalization PRD.');
assert(entrypointDoc.includes('test-spec-ku-lms-course-title-syllabus-normalization.md'), 'AI docs entrypoint should list the course-title normalization test spec.');
assert(architectureDoc.includes('remember the safe detail URL'), 'Architecture doc should describe remembered syllabus detail fallback.');
assert(extractFunction(kulmsSource, 'collectContext').includes('shortenCourseTitle(rawUserName)'), 'Course-route topbar identity should use the normalized course title.');
assert(extractFunction(kulmsSource, 'renderCourseHeader').includes('escapeHtml(displayTitle)'), 'Course header should render the normalized display title.');
assert(extractFunction(kulmsSource, 'renderHome').includes('escapeHtml(shortenCourseTitle(item.title))'), 'Home other-course rows should render normalized display titles.');
assert(extractFunction(kulmsSource, 'renderCourseMaterials').includes('escapeHtml(shortenCourseTitle(course.title))'), 'Course sidebar title should render the normalized display title.');

const sandbox = {
  console,
  URL,
  SYLLABUS_DETAIL_CACHE_KEY: 'ku-redesign-syllabus-detail-v1',
  cleanText: (value = '') => String(value || '').replace(/\s+/g, ' ').trim(),
  MAX_REMEMBERED_SYLLABUS_DETAILS: 32,
  normalizeSyllabusCourseQuery: undefined,
  deriveSyllabusCourseCode: undefined,
  fallbackCount: 0,
  window: {
    location: { href: 'https://kulms.tl.kansai-u.ac.jp/webclass/' },
    sessionStorage: {
      store: new Map(),
      getItem(key) { return this.store.has(key) ? this.store.get(key) : null; },
      setItem(key, value) { this.store.set(key, String(value)); },
      removeItem(key) { this.store.delete(key); }
    }
  }
};
vm.createContext(sandbox);
for (const name of [
  'normalizeSyllabusCourseQuery',
  'shortenCourseTitle',
  'extractCourseId',
  'deriveSyllabusCourseCode',
  'buildSyllabusResolvedDetailKey',
  'readSyllabusResolvedDetails',
  'writeSyllabusResolvedDetails',
  'readRememberedSyllabusDetail',
  'rememberSyllabusDetail',
  'isRememberedSyllabusDetailUrl',
  'handleSyllabusNavigation'
]) {
  vm.runInContext(extractFunction(kulmsSource, name), sandbox, { filename: 'kulms-source.js' });
}
for (const name of ['normalizeSyllabusTopLevelSectionTitle', 'parseSyllabusSectionRows']) {
  vm.runInContext(extractFunction(syllabusSource, name), sandbox, { filename: 'syllabus-source.js' });
}

assert(sandbox.shortenCourseTitle('知的財産法（著作権）＜M＞＜S＞＜C＞ (2026-春学期-月曜日-3限-70427)') === '知的財産法（著作権）', 'Visible course-title normalizer should strip timetable suffixes and marker tags while preserving meaningful parentheses.');
assert(sandbox.shortenCourseTitle('活用法を見聞するAI・データサイエンス[A 1] (2026-春学期---00311)') === '活用法を見聞するAI・データサイエンス', 'Visible course-title normalizer should strip trailing section tags.');
assert(sandbox.normalizeSyllabusTopLevelSectionTitle('授業概要Course Description') === '授業概要', 'Top-level syllabus headings should drop appended English labels.');
assert(sandbox.normalizeSyllabusTopLevelSectionTitle('到達目標 / Course Objective') === '到達目標', 'Top-level syllabus headings should drop slash-separated English labels.');
assert(sandbox.normalizeSyllabusTopLevelSectionTitle('AI活用の方法') === 'AI活用の方法', 'Top-level syllabus heading cleanup must preserve legitimate in-title ASCII such as AI.');

const nestedLabels = [];
sandbox.sanitizeSyllabusBodyText = (node) => String(node?.textContent || '').trim();
const rowResult = sandbox.parseSyllabusSectionRows({
  children: [
    { tagName: 'DT', textContent: '授業方法Teaching Method' },
    { tagName: 'DD', textContent: '説明文' }
  ]
});
nestedLabels.push(rowResult[0]?.label || '');
assert(nestedLabels[0] === '授業方法Teaching Method', 'Nested syllabus row labels should remain unchanged.');

sandbox.resolveSyllabusUrl = async () => 'https://syllabus3.jm.kansai-u.ac.jp/syllabus/Controller?UJikanwari_cd=70340&actionClass=syllabus.search.DetailKeySearchSt&nendo=2026&queryString=%E8%A8%80%E8%AA%9E%E5%AD%A6&st=key';
sandbox.submitSyllabusSearchNavigation = async () => { sandbox.fallbackCount += 1; };
const anchor = {
  dataset: {
    loading: 'false',
    syllabusTitle: '言語学 (2026-春学期-木曜日-1限-70340)',
    syllabusHref: 'https://kulms.tl.kansai-u.ac.jp/webclass/course.php/26170340/',
    syllabusYear: '2026'
  },
  textContent: 'シ',
  href: 'https://syllabus3.jm.kansai-u.ac.jp/syllabus/search/keyword/KeywordSearchTop.html?selectedNendo=2026'
};
await sandbox.handleSyllabusNavigation(anchor);
assert(sandbox.window.location.href.includes('UJikanwari_cd=70340'), 'Successful direct syllabus resolution should navigate to the direct detail page.');
assert(sandbox.readRememberedSyllabusDetail({
  title: anchor.dataset.syllabusTitle,
  courseHref: anchor.dataset.syllabusHref,
  year: anchor.dataset.syllabusYear
}).includes('UJikanwari_cd=70340'), 'Successful direct syllabus resolution should be remembered for the same tab.');
assert(sandbox.buildSyllabusResolvedDetailKey({
  title: '同名授業',
  courseHref: 'https://kulms.tl.kansai-u.ac.jp/webclass/course.php/custom-course-1/',
  year: '2026'
}) === '2026::custom-course-1::同名授業', 'Remembered syllabus detail key should fall back to course id when course code is unavailable.');

sandbox.window.location.href = 'https://kulms.tl.kansai-u.ac.jp/webclass/';
sandbox.resolveSyllabusUrl = async () => '';
sandbox.fallbackCount = 0;
await sandbox.handleSyllabusNavigation(anchor);
assert(sandbox.window.location.href.includes('UJikanwari_cd=70340'), 'When direct lookup later fails, remembered syllabus detail should still open instead of falling back to search.');
assert(sandbox.fallbackCount === 0, 'Remembered syllabus detail should prevent unnecessary fallback search navigation.');

const freshAnchor = {
  dataset: {
    loading: 'false',
    syllabusTitle: '別の授業',
    syllabusHref: 'https://kulms.tl.kansai-u.ac.jp/webclass/course.php/26179999/',
    syllabusYear: '2026'
  },
  textContent: 'シ',
  href: 'https://syllabus3.jm.kansai-u.ac.jp/syllabus/search/keyword/KeywordSearchTop.html?selectedNendo=2026'
};
sandbox.window.location.href = 'https://kulms.tl.kansai-u.ac.jp/webclass/';
sandbox.fallbackCount = 0;
await sandbox.handleSyllabusNavigation(freshAnchor);
assert(sandbox.fallbackCount === 1, 'Without remembered detail, failed direct lookup should still fall back to search.');

for (let index = 0; index < 40; index += 1) {
  sandbox.rememberSyllabusDetail({
    title: `授業 ${index}`,
    courseHref: `https://kulms.tl.kansai-u.ac.jp/webclass/course.php/custom-${index}/`,
    year: '2026'
  }, `https://syllabus3.jm.kansai-u.ac.jp/syllabus/Controller?UJikanwari_cd=${index}&actionClass=syllabus.search.DetailKeySearchSt&nendo=2026&queryString=${index}&st=key`);
}
assert(Object.keys(sandbox.readSyllabusResolvedDetails()).length <= sandbox.MAX_REMEMBERED_SYLLABUS_DETAILS, 'Remembered syllabus detail cache should stay bounded.');

const report = {
  ok: true,
  checks: [
    'visible-course-title-normalization',
    'syllabus-top-level-heading-normalization',
    'nested-syllabus-labels-preserved',
    'remembered-direct-detail-fallback'
  ]
};
writeArtifact('.omx/artifacts/course-title-syllabus-normalization', 'verification-report.json', report);
console.log(JSON.stringify(report));
