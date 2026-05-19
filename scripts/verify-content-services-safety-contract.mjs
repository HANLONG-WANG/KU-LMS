import { read, readKulmsSource, readSyllabusSource, extractFunction, assert } from './lib/content-source.mjs';

const source = readKulmsSource();
const syllabusSource = readSyllabusSource();
const worker = read('src/background/service-worker.js');
for (const name of ['loadSupplementalDocument', 'fetchCourseTimeline', 'handleSyllabusNavigation', 'resolveSyllabusUrl', 'lookupSyllabusDirectUrl', 'startHomeRefresh', 'continueHomeRefreshIfNeeded', 'syncHomeRefreshOverlay']) {
  assert(extractFunction(source, name).length > 0, `Service function missing: ${name}`);
}
assert(extractFunction(source, 'loadSupplementalDocument').includes('signal: getPageRequestSignal()'), 'Supplemental document fetches should remain abortable.');
assert(extractFunction(source, 'fetchCourseTimeline').includes('signal: getPageRequestSignal()'), 'Timeline fetches should remain abortable.');
assert(extractFunction(source, 'lookupSyllabusDirectUrl').includes("chrome.runtime.sendMessage({ type: 'ku:lms:lookup-syllabus'"), 'Content script should still bridge syllabus lookup through the background worker.');
assert(worker.includes("message?.type === 'ku:lms:lookup-syllabus'"), 'Background worker should still expose the syllabus lookup contract.');
assert(!source.includes('ku:lms:fetch-upcoming-courses'), 'Retired worker upcoming-course bridge must stay removed.');
assert(extractFunction(source, 'continueHomeRefreshIfNeeded').includes("route.name === 'login' || route.name === 'logout'"), 'Refresh FSM should remain fail-closed on auth-terminal routes.');
assert(extractFunction(syllabusSource, 'initSyllabusAssist').includes('autoResolveSyllabusResult'), 'Syllabus ordered source should still wire assist resolution after bootstrap.');
assert(extractFunction(syllabusSource, 'autoResolveSyllabusResult').includes('resolveSyllabusCandidateByCourseCode'), 'Syllabus ordered source should still support safe course-code disambiguation.');
console.log(JSON.stringify({ ok: true, checks: ['service-cluster-present', 'abortable-fetch-contract-preserved', 'syllabus-background-bridge-preserved', 'syllabus-assist-chain-preserved', 'retired-worker-fetch-path-still-removed', 'refresh-fsm-auth-terminal-guard-preserved'] }, null, 2));
