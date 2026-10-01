import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { read, readJson, getKulmsScript, getSyllabusScript, assert } from './lib/content-source.mjs';

const manifest = readJson('manifest.json');
const entrypoint = read('docs/AI_DOCS_ENTRYPOINT.md');
const architecture = read('docs/ku-lms-extension-architecture.md');
const kulms = getKulmsScript();
const syllabus = getSyllabusScript();

const checks = [];
const record = (name, fn) => { fn(); checks.push(name); };

record('manifest keeps kulms document_start takeover', () => {
  assert(kulms.run_at === 'document_start', 'KU-LMS content script must stay at document_start.');
  assert(kulms.js.at(-1) === 'src/content/main.js', 'KU-LMS manifest entry must end with src/content/main.js bootstrap shim.');
});
record('manifest keeps syllabus document_start assist entry', () => {
  assert(syllabus.run_at === 'document_start', 'Syllabus content script must stay at document_start.');
  assert(syllabus.js.at(-1) === 'src/content/syllabus-main.js', 'Syllabus manifest entry must end with src/content/syllabus-main.js bootstrap shim.');
});
record('content subsystem directories exist', () => {
  for (const token of ['src/content/runtime', 'src/content/parsers', 'src/content/render', 'src/content/hydrate', 'src/content/services', 'src/content/utils']) {
    assert(fs.existsSync(path.join(process.cwd(), token)), `Missing content subsystem directory: ${token}`);
  }
});
record('main bootstrap is thin', () => {
  const main = read('src/content/main.js');
  let calls = 0;
  const context = { document: { documentElement: { dataset: {} } }, console, bootKulms() { calls += 1; return Promise.resolve(); } };
  vm.runInNewContext(main, context);
  vm.runInNewContext(main, context);
  assert(calls === 1, 'main.js should invoke bootKulms() once and preserve its duplicate-boot guard.');
  assert(main.split('\n').length <= 10, 'main.js should remain a thin bootstrap shim.');
});
record('syllabus bootstrap is thin', () => {
  const main = read('src/content/syllabus-main.js');
  let calls = 0;
  const context = { document: { documentElement: { dataset: {} } }, console, bootSyllabus() { calls += 1; return Promise.resolve(); } };
  vm.runInNewContext(main, context);
  vm.runInNewContext(main, context);
  assert(calls === 1, 'syllabus-main.js should invoke bootSyllabus() once and preserve its duplicate-boot guard.');
  assert(main.split('\n').length <= 10, 'syllabus-main.js should remain a thin bootstrap shim.');
});
record('docs expose modularization artifacts', () => {
  assert(entrypoint.includes('prd-ku-lms-content-script-modularization.md'), 'AI docs entrypoint should list modularization PRD.');
  assert(entrypoint.includes('test-spec-ku-lms-content-script-modularization.md'), 'AI docs entrypoint should list modularization test spec.');
  assert(/content subsystem/i.test(architecture), 'Architecture doc should describe the content subsystem after modularization.');
});

console.log(JSON.stringify({ ok: true, checks }, null, 2));
