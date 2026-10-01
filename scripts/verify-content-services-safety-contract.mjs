import { read, readKulmsSource, readSyllabusSource, extractFunction, assert } from './lib/content-source.mjs';

const source = readKulmsSource();
const syllabusSource = readSyllabusSource();
const worker = read('src/background/service-worker.js');
for (const name of ['loadSupplementalDocument', 'fetchCourseTimeline', 'handleSyllabusNavigation', 'resolveSyllabusUrl', 'lookupSyllabusDirectUrl', 'startHomeRefresh', 'continueHomeRefreshIfNeeded', 'syncHomeRefreshOverlay']) {
  assert(extractFunction(source, name).length > 0, `Service function missing: ${name}`);
}
assert(extractFunction(source, 'loadSupplementalDocument').includes('fetchLmsResource('), 'Supplemental documents should use the shared serialized request boundary.');
assert(extractFunction(source, 'fetchCourseTimeline').includes('fetchLmsResource('), 'Timeline should use the same serialized request boundary.');
assert(extractFunction(source, 'fetchLmsResource').includes('getPageRequestSignal()') && extractFunction(source, 'fetchLmsResource').includes('signal: controller.signal'), 'The shared LMS request boundary should link page cancellation to every fetch.');
assert(extractFunction(source, 'lookupSyllabusDirectUrl').includes("sendSyllabusRuntimeMessage('ku:lms:lookup-syllabus'"), 'Content script should still bridge syllabus lookup through the background worker.');
assert(worker.includes("message?.type === 'ku:lms:lookup-syllabus'"), 'Background worker should still expose the syllabus lookup contract.');
assert(!source.includes('ku:lms:fetch-upcoming-courses'), 'Retired worker upcoming-course bridge must stay removed.');
assert(extractFunction(source, 'continueHomeRefreshIfNeeded').includes("route.name === 'login' || route.name === 'logout'"), 'Refresh FSM should remain fail-closed on auth-terminal routes.');
assert(extractFunction(syllabusSource, 'initSyllabusAssist').includes('autoResolveSyllabusResult'), 'Syllabus ordered source should still wire assist resolution after bootstrap.');
assert(extractFunction(syllabusSource, 'autoResolveSyllabusResult').includes('resolveSyllabusCandidateByCourseCode'), 'Syllabus ordered source should still support safe course-code disambiguation.');
assert(extractFunction(syllabusSource, 'autoResolveSyllabusResult').includes("document.documentElement.dataset.kuSyllabusAssist = 'unresolved';"), 'Syllabus assist should still fail open on unresolved ambiguity.');
assert(!/exactMatches\.length\s*>\s*1[\s\S]{0,180}window\.location\.replace/.test(extractFunction(syllabusSource, 'autoResolveSyllabusResult')), 'Syllabus assist must not guess when multiple exact-title candidates remain.');
assert(!syllabusSource.includes('bootKulms();'), 'Syllabus domain source must not boot the KU-LMS shell.');
console.log(JSON.stringify({ ok: true, checks: ['service-cluster-present', 'abortable-fetch-contract-preserved', 'syllabus-background-bridge-preserved', 'syllabus-assist-chain-preserved', 'syllabus-ambiguity-no-guess-preserved', 'syllabus-domain-never-boots-kulms', 'retired-worker-fetch-path-still-removed', 'refresh-fsm-auth-terminal-guard-preserved'] }, null, 2));
