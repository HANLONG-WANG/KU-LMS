import vm from 'node:vm';
import { loadOfflineKulmsInto } from './lib/offline-content-vm.mjs';
import { read, readKulmsSource, extractFunction, assert, writeArtifact } from './lib/content-source.mjs';

const source = readKulmsSource();
const entrypointDoc = read('docs/AI_DOCS_ENTRYPOINT.md');
const architectureDoc = read('docs/ku-lms-extension-architecture.md');

assert(extractFunction(source, 'lookupSyllabusDirectUrl').includes("sendSyllabusRuntimeMessage('ku:lms:lookup-syllabus'"), 'Content script should still bridge to the background syllabus resolver after checking fresh cache.');
assert(source.includes('シラバスを検索中…'), 'Fallback syllabus page should still show the searching overlay.');
assert(extractFunction(source, 'handleSyllabusNavigation').includes('const resolved = await resolveSyllabusUrl(payload);'), 'Chip navigation should still try direct background resolution before search fallback.');
assert(extractFunction(source, 'handleSyllabusNavigation').includes('await submitSyllabusSearchNavigation(payload);'), 'Chip navigation should still fall back to search navigation when direct resolution fails.');
const autoResolveSource = extractFunction(source, 'autoResolveSyllabusResult');
assert(autoResolveSource.includes('!pending.courseCode && exactMatches.length === 1'), 'Unique-title redirects without known codes should remain distinct from candidates that require code verification.');
assert(autoResolveSource.includes('resolveSyllabusCandidateByCourseCode'), 'Syllabus assist should still try course-code disambiguation for multi-candidate exact-title sets.');
assert(autoResolveSource.includes("document.documentElement.dataset.kuSyllabusAssist = 'unresolved';"), 'Ambiguous syllabus candidate sets should still fall back without guessing.');
assert(entrypointDoc.includes('ku-lms-extension-architecture.md'), 'AI docs entrypoint should expose the durable repository architecture contract.');
assert(entrypointDoc.includes('ku-lms-content-subsystem-map.md'), 'AI docs entrypoint should expose durable subsystem ownership.');
assert(architectureDoc.includes('background resolution cannot prove a unique detail target'), 'Architecture doc should document the ambiguity fallback behavior for syllabus resolution.');
assert(extractFunction(source, 'readRememberedSyllabusDetail').includes('SYLLABUS_DETAIL_CACHE_TTL_MS'), 'The durable source contract should bound repeat-navigation cache freshness.');

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
    location: { href: 'https://kulms.tl.kansai-u.ac.jp/webclass/', origin: 'https://kulms.tl.kansai-u.ac.jp', replace(url) { redirects.push(url); } },
    sessionStorage: {
      store: new Map(),
      getItem(key) { return this.store.has(key) ? this.store.get(key) : null; },
      setItem(key, value) { this.store.set(key, String(value)); },
      removeItem(key) { this.store.delete(key); }
    }
  }
};
loadOfflineKulmsInto(sandbox);
vm.runInContext(`globalThis.loadSyllabusCourseCodeViaFrame = async (detailUrl) => detailUrl.includes('UJikanwari_cd=ID2') ? 'ABCD1234' : '';`, sandbox);

await sandbox.autoResolveSyllabusResult({ title: '経済学', year: '2026', courseCode: '' }, [
  { id: 'ID1', year: '2026', query: '経済学', title: '経済学', normalizedTitle: '経済学' }
]);
assert(redirects.length === 1 && redirects[0].includes('UJikanwari_cd=ID1'), 'Single exact-title syllabus candidate should redirect immediately.');
assert(sandbox.document.documentElement.dataset.kuSyllabusAssist === 'redirect-exact', 'Assist state should record exact-match redirects.');
assert(sandbox.window.name === '', 'Pending syllabus navigation marker should clear after a safe redirect.');

redirects.length = 0;
await sandbox.autoResolveSyllabusResult({ title: '経済学', year: '2026', courseCode: 'ABCD1234' }, [
  { id: 'ID1', year: '2026', query: '経済学', title: '経済学', normalizedTitle: '経済学' }
]);
assert(redirects.length === 0, 'A unique same-title candidate with the wrong course code must not redirect.');
assert(sandbox.document.documentElement.dataset.kuSyllabusAssist === 'unresolved', 'Wrong-code unique candidates should remain available for manual search selection.');
await sandbox.autoResolveSyllabusResult({ title: '経済学', year: '2026', courseCode: 'ABCD1234' }, [
  { id: 'ID2', year: '2026', query: '経済学', title: '経済学', normalizedTitle: '経済学' }
]);
assert(redirects.length === 1 && redirects[0].includes('UJikanwari_cd=ID2'), 'A unique candidate with a verified matching course code should redirect.');
assert(sandbox.document.documentElement.dataset.kuSyllabusAssist === 'redirect-course-code', 'Unique candidates with known codes must use code verification.');

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

const report = { ok: true, checks: ['background-direct-resolver-bridge-preserved', 'single-exact-title-redirect-without-known-code', 'unique-known-code-candidates-verified', 'course-code-disambiguation-still-works', 'ambiguous-results-still-fall-back', 'durable-repository-contracts-without-personal-PRD-dependency'] };
writeArtifact('.omx/artifacts/review-followups', 'verification-report.json', report);
console.log(JSON.stringify(report));
