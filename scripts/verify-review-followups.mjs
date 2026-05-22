import vm from 'node:vm';
import { read, readKulmsSource, extractFunction, assert, writeArtifact } from './lib/content-source.mjs';

const source = readKulmsSource();
const entrypointDoc = read('docs/AI_DOCS_ENTRYPOINT.md');
const architectureDoc = read('docs/ku-lms-extension-architecture.md');
const prd = read('.omx/plans/prd-ku-lms-review-followups.md');
const testSpec = read('.omx/plans/test-spec-ku-lms-review-followups.md');

assert(source.includes("chrome.runtime.sendMessage({ type: 'ku:lms:lookup-syllabus'"), 'Content script should still bridge to the background syllabus resolver first.');
assert(source.includes('シラバスを検索中…'), 'Fallback syllabus page should still show the searching overlay.');
assert(extractFunction(source, 'handleSyllabusNavigation').includes('const resolved = await resolveSyllabusUrl(payload);'), 'Chip navigation should still try direct background resolution first.');
assert(extractFunction(source, 'handleSyllabusNavigation').includes('await submitSyllabusSearchNavigation(payload);'), 'Chip navigation should still fall back to search navigation when direct resolution fails.');
const autoResolveSource = extractFunction(source, 'autoResolveSyllabusResult');
assert(autoResolveSource.includes('exactMatches.length === 1'), 'Syllabus assist should still redirect when exact-title matching is uniquely safe.');
assert(autoResolveSource.includes('resolveSyllabusCandidateByCourseCode'), 'Syllabus assist should still try course-code disambiguation for multi-candidate exact-title sets.');
assert(autoResolveSource.includes("document.documentElement.dataset.kuSyllabusAssist = 'unresolved';"), 'Ambiguous syllabus candidate sets should still fall back without guessing.');
assert(entrypointDoc.includes('.omx/plans/prd-ku-lms-review-followups.md'), 'AI docs entrypoint should still keep the review-followups PRD visible as historical subsystem evidence.');
assert(entrypointDoc.includes('.omx/plans/test-spec-ku-lms-review-followups.md'), 'AI docs entrypoint should still keep the review-followups test spec visible as historical subsystem evidence.');
assert(architectureDoc.includes('background resolution cannot prove a unique detail target'), 'Architecture doc should document the ambiguity fallback behavior for syllabus resolution.');
assert(prd.includes('Review Follow-up Fixes'), 'Review follow-ups PRD content missing.');
assert(testSpec.includes('Review Follow-up Fixes'), 'Review follow-ups test spec content missing.');

const redirects = [];
const sandbox = {
  console,
  URL,
  encodeURIComponent,
  SYLLABUS_DETAIL_CACHE_KEY: 'ku-redesign-syllabus-detail-v1',
  SYLLABUS_WINDOW_STATE_PREFIX: '__KU_SYLLABUS_STATE__',
  SYLLABUS_PENDING_PREFIX: '__KU_SYLLABUS_AUTO__',
  MAX_REMEMBERED_SYLLABUS_DETAILS: 32,
  cleanText: (value = '') => String(value || '').replace(/\s+/g, ' ').trim(),
  redirects,
  readRememberedSyllabusDetailFromBackground: async () => '',
  rememberSyllabusDetailInBackground: async () => {},
  document: { documentElement: { dataset: {} }, getElementById() { return null; } },
  window: {
    name: '__KU_SYLLABUS_AUTO__pending',
    location: { origin: 'https://kulms.tl.kansai-u.ac.jp', replace(url) { redirects.push(url); } },
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
  'normalizeSyllabusCourseQuery', 'extractCourseId', 'deriveSyllabusCourseCode', 'buildSyllabusResolvedDetailKey', 'isRememberedSyllabusDetailUrl', 'readSyllabusResolvedDetails', 'writeSyllabusResolvedDetails', 'readRememberedSyllabusDetail', 'rememberSyllabusDetail', 'readSyllabusWindowState', 'writeSyllabusWindowState', 'clearPendingSyllabusNavigation', 'clearSyllabusAssistOverlay', 'buildSyllabusDetailUrl',
  'resolveSyllabusCandidateByCourseCode', 'autoResolveSyllabusResult'
]) {
  vm.runInContext(extractFunction(source, name), sandbox, { filename: 'kulms-source.js' });
}
vm.runInContext(`globalThis.loadSyllabusCourseCodeViaFrame = async (detailUrl) => detailUrl.includes('UJikanwari_cd=ID2') ? 'ABCD1234' : '';`, sandbox);

await sandbox.autoResolveSyllabusResult({ title: '経済学', year: '2026', courseCode: '' }, [
  { id: 'ID1', year: '2026', query: '経済学', title: '経済学', normalizedTitle: '経済学' }
]);
assert(redirects.length === 1 && redirects[0].includes('UJikanwari_cd=ID1'), 'Single exact-title syllabus candidate should redirect immediately.');
assert(sandbox.document.documentElement.dataset.kuSyllabusAssist === 'redirect-exact', 'Assist state should record exact-match redirects.');
assert(sandbox.window.name === '', 'Pending syllabus navigation marker should clear after a safe redirect.');

redirects.length = 0;
sandbox.window.name = '__KU_SYLLABUS_AUTO__pending';
sandbox.document.documentElement.dataset = {};
await sandbox.autoResolveSyllabusResult({ title: '経済学', year: '2026', courseCode: 'ABCD1234' }, [
  { id: 'ID1', year: '2026', query: '経済学', title: '経済学', normalizedTitle: '経済学' },
  { id: 'ID2', year: '2026', query: '経済学', title: '経済学', normalizedTitle: '経済学' }
]);
assert(redirects.length === 1 && redirects[0].includes('UJikanwari_cd=ID2'), 'Course-code disambiguation should still resolve safe multi-candidate syllabus matches.');
assert(sandbox.document.documentElement.dataset.kuSyllabusAssist === 'redirect-course-code', 'Assist state should record course-code redirects.');
assert(sandbox.window.name.includes('__KU_SYLLABUS_STATE__'), 'Course-code resolution should preserve a remembered same-tab detail state after clearing pending search state.');
assert((await sandbox.readRememberedSyllabusDetail({ title: '経済学', year: '2026', courseCode: 'ABCD1234' })).includes('UJikanwari_cd=ID2'), 'Assist-side course-code resolution should remember the safe detail URL for same-tab repeats.');

redirects.length = 0;
sandbox.window.name = '__KU_SYLLABUS_AUTO__pending';
sandbox.document.documentElement.dataset = {};
vm.runInContext(`globalThis.loadSyllabusCourseCodeViaFrame = async () => '';`, sandbox);
await sandbox.autoResolveSyllabusResult({ title: '経済学', year: '2026', courseCode: 'NOPE' }, [
  { id: 'ID1', year: '2026', query: '経済学', title: '経済学', normalizedTitle: '経済学' },
  { id: 'ID2', year: '2026', query: '経済学', title: '経済学', normalizedTitle: '経済学' }
]);
assert(redirects.length === 0, 'Ambiguous syllabus candidate sets should not redirect blindly.');
assert(sandbox.document.documentElement.dataset.kuSyllabusAssist === 'unresolved', 'Ambiguous syllabus candidate sets should land in unresolved fallback state.');

const report = { ok: true, checks: ['background-direct-resolver-bridge-preserved', 'single-exact-title-redirect', 'course-code-disambiguation-still-works', 'ambiguous-results-still-fall-back', 'review-followup-artifacts-still-listed'] };
writeArtifact('.omx/artifacts/review-followups', 'verification-report.json', report);
console.log(JSON.stringify(report));
