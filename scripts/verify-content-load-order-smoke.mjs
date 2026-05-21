import { read, getKulmsScript, getSyllabusScript, assert } from './lib/content-source.mjs';

function hasForbiddenTopLevelSideEffect(source) {
  const forbidden = [
    'window.addEventListener(', 'document.addEventListener(', 'window.location =', 'window.location.href =', 'window.location.replace(',
    'fetch(', 'appendChild(', 'replaceChildren(', 'setTimeout(', 'setInterval(', 'chrome.runtime.sendMessage(', 'form.submit(', 'requestSubmit('
  ];
  let depth = 0;
  let inBlockComment = false;
  let inLineComment = false;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escape = false;
  let currentLine = '';

  const scrubStrings = (line) => line
    .replace(/'[^']*'/g, "''")
    .replace(/"[^"]*"/g, '""')
    .replace(/`[^`]*`/g, '``');

  const inspectLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    const normalized = scrubStrings(trimmed);
    const matchesForbidden = forbidden.some((token) => normalized.includes(token));
    if (!matchesForbidden) return false;
    if (/^(function|async function)\b/.test(normalized)) return false;
    return true;
  };

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1] || '';

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        if (depth === 0 && inspectLine(currentLine)) return true;
        currentLine = '';
      }
      continue;
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }
    if (!inSingle && !inDouble && !inTemplate) {
      if (char === '/' && next === '/') {
        inLineComment = true;
        i += 1;
        continue;
      }
      if (char === '/' && next === '*') {
        inBlockComment = true;
        i += 1;
        continue;
      }
    }

    currentLine += char;

    if (escape) {
      escape = false;
    } else if (char === '\\') {
      escape = true;
    } else if (!inDouble && !inTemplate && char === "'") {
      inSingle = !inSingle;
    } else if (!inSingle && !inTemplate && char === '"') {
      inDouble = !inDouble;
    } else if (!inSingle && !inDouble && char === '`') {
      inTemplate = !inTemplate;
    } else if (!inSingle && !inDouble && !inTemplate) {
      if (char === '{') depth += 1;
      if (char === '}') depth = Math.max(0, depth - 1);
    }

    if (char === '\n') {
      if (depth === 0 && inspectLine(currentLine)) return true;
      currentLine = '';
    }
  }
  return depth === 0 && inspectLine(currentLine);
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
    assert(!source.includes('(() => {'), `${file} should not use a top-level boot IIFE.`);
    assert(!hasForbiddenTopLevelSideEffect(source), `${file} contains forbidden top-level side effects.`);
  }
});

console.log(JSON.stringify({ ok: true, checks }, null, 2));
