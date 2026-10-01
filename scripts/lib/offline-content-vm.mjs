import vm from 'node:vm';
import { getKulmsScript, getSyllabusScript, readOrderedSource } from './content-source.mjs';

function offlineNode() {
  return {
    style: {}, dataset: {}, children: [], classList: { add() {}, remove() {}, contains() { return false; } },
    appendChild(node) { this.children.push(node); }, append(node) { this.appendChild(node); },
    setAttribute() {}, removeAttribute() {}, hasAttribute() { return false; }, getAttribute() { return null; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener() {}, removeEventListener() {}, remove() {},
    submit() { throw new Error('Real form submission is disabled in the offline verifier'); },
    requestSubmit() { throw new Error('Real form submission is disabled in the offline verifier'); }
  };
}

// Execute the manifest's real dependency order without either boot entrypoint.
// Preserve each verifier's explicit stubs after initialization; real source fills
// missing helpers and runtime fields instead of silently omitting dependencies.
export function loadOfflineSourceInto(sandbox, files) {
  const overrides = { ...sandbox };
  const storage = new Map();
  const originalWindow = overrides.window || {};
  const originalLocation = originalWindow.location || {};
  const location = new URL(originalLocation.href || `${originalLocation.origin || 'https://kulms.tl.kansai-u.ac.jp'}/webclass/`);
  location.replace = originalLocation.replace || ((url) => { location.href = new URL(url, location.href).href; });
  location.assign = originalLocation.assign || ((url) => { location.href = new URL(url, location.href).href; });
  const window = {
    setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {},
    performance: { getEntriesByType: () => [{ type: 'navigate' }] },
    sessionStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key)
    },
    ...originalWindow,
    location
  };
  const document = {
    readyState: 'complete', forms: {}, body: offlineNode(), documentElement: { ...offlineNode(), dataset: {} },
    getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
    createElement: offlineNode, addEventListener() {}, removeEventListener() {},
    ...overrides.document
  };
  if (document.body) document.body = { ...offlineNode(), ...document.body };
  if (document.documentElement) document.documentElement = { ...offlineNode(), dataset: {}, ...document.documentElement };
  const defaults = {
    console, URL, URLSearchParams, Date, AbortController, DOMException, setTimeout, clearTimeout,
    fetch() { throw new Error('Real fetch is disabled in the offline verifier; provide an explicit response stub'); },
    chrome: { runtime: { lastError: null, sendMessage(_message, callback) { callback?.({}); }, onInstalled: { addListener() {} }, onMessage: { addListener() {} } }, tabs: { onRemoved: { addListener() {} } } }
  };
  Object.assign(sandbox, defaults, overrides, { window, document });
  vm.createContext(sandbox);
  vm.runInContext(readOrderedSource(files), sandbox, { filename: 'offline-manifest-source.js' });
  const initializedState = sandbox.state || {};
  Object.assign(sandbox, overrides, { window, document });
  sandbox.state = { ...initializedState, ...(overrides.state || {}) };
  return sandbox;
}

export function loadOfflineKulmsInto(sandbox) {
  return loadOfflineSourceInto(sandbox, getKulmsScript().js.filter((file) => file !== 'src/content/main.js'));
}

export function loadOfflineSyllabusInto(sandbox) {
  return loadOfflineSourceInto(sandbox, getSyllabusScript().js.filter((file) => file !== 'src/content/syllabus-main.js'));
}
