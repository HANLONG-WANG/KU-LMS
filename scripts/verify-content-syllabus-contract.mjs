import { readSyllabusSource, getSyllabusScript, extractFunction, assert } from './lib/content-source.mjs';

const source = readSyllabusSource();
const script = getSyllabusScript();

assert(script.js.includes('src/content/services/syllabus.js'), 'Syllabus manifest chain must include services/syllabus.js.');
assert(script.js.includes('src/content/runtime/boot-syllabus.js'), 'Syllabus manifest chain must include runtime/boot-syllabus.js.');
assert(script.js.at(-1) === 'src/content/syllabus-main.js', 'Syllabus manifest chain must end with syllabus-main.js.');
assert(source.includes('bootSyllabus();'), 'Syllabus ordered source should still end in bootSyllabus() execution.');
assert(!source.includes('bootKulms();'), 'Syllabus ordered source must not boot the KU-LMS shell.');
for (const name of ['mountSyllabusAssistOverlay', 'clearSyllabusAssistOverlay', 'submitSyllabusSearchForm', 'initSyllabusAssist', 'autoResolveSyllabusResult', 'parseSyllabusResultCandidates', 'resolveSyllabusCandidateByCourseCode']) {
  assert(extractFunction(source, name).length > 0, `Syllabus contract function missing: ${name}`);
}
assert(extractFunction(source, 'autoResolveSyllabusResult').includes("document.documentElement.dataset.kuSyllabusAssist = 'unresolved';"), 'Syllabus assist should still mark unresolved ambiguity instead of guessing.');
console.log(JSON.stringify({ ok: true, checks: ['syllabus-manifest-chain-preserved', 'syllabus-assist-service-cluster-present', 'syllabus-assist-fallback-contract-preserved'] }, null, 2));
