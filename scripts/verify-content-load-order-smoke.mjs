import { read, getKulmsScript, getSyllabusScript, assert } from './lib/content-source.mjs';

function hasForbiddenTopLevelSideEffect(source) {
  // Keep the outer statement skeleton; callback/function bodies cannot be boot entries.
  let skeleton = '';
  let depth = 0;
  let quote = '';
  let escaped = false;
  let comment = '';
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]; const next = source[index + 1];
    if (comment === 'line') { if (char === '\n') { comment = ''; if (!depth) skeleton += '\n'; } continue; }
    if (comment === 'block') { if (char === '*' && next === '/') { comment = ''; index += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') { comment = 'line'; index += 1; continue; }
    if (char === '/' && next === '*') { comment = 'block'; index += 1; continue; }
    if (char === "'" || char === '"' || char === '`') { quote = char; if (!depth) skeleton += "''"; continue; }
    if (char === '{') { if (!depth) skeleton += char; depth += 1; continue; }
    if (char === '}') { depth = Math.max(0, depth - 1); if (!depth) skeleton += char; continue; }
    if (!depth) skeleton += char;
  }
  const bootIife = /\(\s*(?:async\s*)?(?:\([^()]*\)\s*=>|function(?:\s+\w+)?\s*\([^()]*\))\s*\{\s*\}\s*\)\s*\(/;
  const forbidden = /(?:window|document)\s*\.\s*addEventListener\s*\(|window\s*\.\s*location(?:\s*\.\s*(?:href|replace))?\s*(?:=|\()|\bfetch\s*\(|\b(?:appendChild|replaceChildren|setTimeout|setInterval|requestSubmit)\s*\(|chrome\s*\.\s*runtime\s*\.\s*sendMessage\s*\(|form\s*\.\s*submit\s*\(/;
  return bootIife.test(skeleton) || forbidden.test(skeleton);
}

const kulms = getKulmsScript();
const syllabus = getSyllabusScript();
const kulmsPre = kulms.js.slice(0, -1);
const syllabusPre = syllabus.js.slice(0, -1);

const checks = [];
const record = (name, fn) => { fn(); checks.push(name); };

record('bootstrap files are final in manifest order', () => {
  assert(kulms.js.at(-1) === 'src/content/main.js', 'KU-LMS bootstrap must be last in manifest order.');
  assert(syllabus.js.at(-1) === 'src/content/syllabus-main.js', 'Syllabus bootstrap must be last in manifest order.');
  assert(!syllabus.js.includes('src/content/runtime/boot-kulms.js'), 'Syllabus manifest chain must not include the KU-LMS boot runtime.');
  assert(!syllabus.js.includes('src/content/main.js'), 'Syllabus manifest chain must not include the KU-LMS app entrypoint.');
  assert(syllabus.js.includes('src/content/runtime/boot-syllabus.js'), 'Syllabus manifest chain must include its standalone boot runtime.');
});
record('pre-bootstrap files stay definition-only', () => {
  for (const file of new Set([...kulmsPre, ...syllabusPre])) {
    const source = read(file);
    assert(!hasForbiddenTopLevelSideEffect(source), `${file} contains forbidden top-level side effects.`);
  }
});

record('top-level detector distinguishes boot calls from deferred callback bodies', () => {
  assert(!hasForbiddenTopLevelSideEffect('function later() { setTimeout(() => { fetch("/local"); }, 10); }'), 'Nested callback bodies must not be mistaken for a top-level boot entry.');
  assert(!hasForbiddenTopLevelSideEffect('const deferred = (() => { fetch("/local"); });'), 'A wrapped arrow definition is still deferred.');
  assert(hasForbiddenTopLevelSideEffect('(() => { bootKulms(); })();'), 'Top-level arrow boot IIFE must be rejected.');
  assert(hasForbiddenTopLevelSideEffect('(function boot() { start(); })();'), 'Top-level function boot IIFE must be rejected.');
  assert(hasForbiddenTopLevelSideEffect('setTimeout(() => {}, 10);'), 'A top-level timer must remain rejected.');
  assert(hasForbiddenTopLevelSideEffect('fetch("/local");'), 'A top-level request must remain rejected.');
});

console.log(JSON.stringify({ ok: true, checks }, null, 2));
