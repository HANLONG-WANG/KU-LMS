import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const KULMS_MATCH = 'https://kulms.tl.kansai-u.ac.jp/webclass/*';
const SYLLABUS_MATCH = 'https://syllabus3.jm.kansai-u.ac.jp/syllabus/*';

export function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

export function readJson(relPath) {
  return JSON.parse(read(relPath));
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function getContentScript(match) {
  const manifest = readJson('manifest.json');
  const entry = manifest.content_scripts.find((item) => Array.isArray(item.matches) && item.matches.includes(match));
  if (!entry) throw new Error(`Content script not found for match: ${match}`);
  return entry;
}

export function getKulmsScript() {
  return getContentScript(KULMS_MATCH);
}

export function getSyllabusScript() {
  return getContentScript(SYLLABUS_MATCH);
}

export function readOrderedSource(files) {
  return files.map((relPath) => `/* FILE: ${relPath} */\n${read(relPath)}`).join('\n\n');
}

export function readKulmsSource() {
  return readOrderedSource(getKulmsScript().js || []);
}

export function readSyllabusSource() {
  return readOrderedSource(getSyllabusScript().js || []);
}

export function extractFunction(source, name) {
  const patterns = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const pattern of patterns) {
    start = source.indexOf(pattern);
    if (start !== -1) break;
  }
  if (start === -1) throw new Error(`Function not found: ${name}`);
  const signatureEnd = source.indexOf(')', start);
  const bodyStart = source.indexOf('{', signatureEnd);
  if (bodyStart === -1) throw new Error(`Could not find body start for: ${name}`);
  let brace = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') brace += 1;
    else if (char === '}') {
      brace -= 1;
      if (brace === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract function: ${name}`);
}

export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function writeArtifact(dir, filename, payload) {
  fs.mkdirSync(path.join(root, dir), { recursive: true });
  fs.writeFileSync(path.join(root, dir, filename), `${JSON.stringify(payload, null, 2)}\n`);
}
