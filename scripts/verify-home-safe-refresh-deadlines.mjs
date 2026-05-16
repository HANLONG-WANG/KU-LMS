import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('src/content/main.js', 'utf8');
const cssSource = fs.readFileSync('src/content/critical.css', 'utf8');
const architectureDoc = fs.readFileSync('docs/ku-lms-extension-architecture.md', 'utf8');
const sessionSafetyDoc = fs.readFileSync('docs/ku-lms-session-safety-analysis.md', 'utf8');

function extractFunction(name) {
  const patterns = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const pattern of patterns) {
    start = source.indexOf(pattern);
    if (start !== -1) break;
  }
  if (start === -1) throw new Error(`Function not found: ${name}`);
  let brace = 0;
  let seenOpen = false;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') {
      brace += 1;
      seenOpen = true;
    } else if (char === '}') {
      brace -= 1;
      if (seenOpen && brace === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract function: ${name}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(source.includes("const HOME_REFRESH_STATE_KEY = 'ku-redesign-home-refresh-v1'"), 'Refresh state key should exist');
assert(extractFunction('startHomeRefresh').includes('getStaleRefreshEntries(view.schedule.entries)'), 'Refresh should narrow targets through stale red-flag cache checks');
assert(extractFunction('startHomeRefresh').includes("homeUrl: window.location.href"), 'Refresh should snapshot the exact home URL before navigation');
assert(extractFunction('continueHomeRefreshIfNeeded').includes("route.name === 'home'"), 'Refresh state machine should resume on the home route');
assert(extractFunction('continueHomeRefreshIfNeeded').includes("route.name === 'course-materials'"), 'Refresh state machine should resume on course pages');
assert(extractFunction('continueHomeRefreshOnCourse').includes("phase: 'restoring-home'"), 'Refresh should restore home after the final target');
assert(extractFunction('doesHomeRefreshMatchCurrentView').includes('view.filters?.year'), 'Restoration scope should include year matching');
assert(extractFunction('doesHomeRefreshMatchCurrentView').includes('view.filters?.semester'), 'Restoration scope should include semester matching');
assert(extractFunction('shouldSuppressRefreshSideEffects').includes('getCurrentHomeRefreshTarget'), 'Side-effect suppression should be bound to the active refresh target');

assert(cssSource.includes('#ku-home-refresh-overlay'), 'Critical CSS should define the fullscreen refresh overlay');
assert(cssSource.includes('.ku-home-refresh-box'), 'Critical CSS should style the refresh overlay shell');
assert(cssSource.includes('.ku-card-actions'), 'Critical CSS should support the due-card refresh actions layout');

assert(architectureDoc.includes('validation-gated refresh control'), 'Architecture doc should describe the validation-gated refresh control');
assert(architectureDoc.includes('top-level same-tab navigation only'), 'Architecture doc should describe the same-tab navigation transport rule');
assert(sessionSafetyDoc.includes('session-safer / validation-gated'), 'Session-safety doc should describe the refresh path as validation-gated');

const storage = new Map();
const sandbox = {
  console,
  URL,
  HOME_REFRESH_STATE_KEY: 'ku-redesign-home-refresh-v1',
  window: {
    location: {
      href: 'https://kulms.tl.kansai-u.ac.jp/webclass/?acs_=abc',
      origin: 'https://kulms.tl.kansai-u.ac.jp'
    },
    sessionStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); }
    }
  },
  absoluteUrl: (value = '') => value
};
vm.createContext(sandbox);
for (const name of [
  'readHomeRefreshState',
  'writeHomeRefreshState',
  'clearHomeRefreshState',
  'getCurrentHomeRefreshTarget',
  'isHomeRefreshActive',
  'doesHomeRefreshMatchCurrentView'
]) {
  vm.runInContext(extractFunction(name), sandbox, { filename: 'src/content/main.js' });
}

const payload = {
  version: 1,
  phase: 'navigating-to-course',
  startedAt: '2026-05-16T04:30:00.000Z',
  lastProgressAt: '2026-05-16T04:30:30.000Z',
  currentIndex: 0,
  homeUrl: 'https://kulms.tl.kansai-u.ac.jp/webclass/?acs_=abc',
  homeYear: '2026',
  homeSemester: '春学期',
  targets: [
    {
      href: 'https://kulms.tl.kansai-u.ac.jp/webclass/course.php/26170340/',
      courseHref: 'https://kulms.tl.kansai-u.ac.jp/webclass/course.php/26170340/',
      title: '言語学'
    },
    {
      href: 'https://kulms.tl.kansai-u.ac.jp/webclass/course.php/26170399/',
      courseHref: 'https://kulms.tl.kansai-u.ac.jp/webclass/course.php/26170399/',
      title: 'ヒューマンエージェントインタラクション'
    }
  ],
  lastProcessedCourse: '',
  abortReason: ''
};
sandbox.writeHomeRefreshState(payload);

assert(sandbox.isHomeRefreshActive(sandbox.readHomeRefreshState()) === true, 'Written refresh state should be active');
assert(sandbox.getCurrentHomeRefreshTarget(sandbox.readHomeRefreshState()).courseHref.includes('26170340'), 'Current refresh target should track the indexed course');
assert(
  sandbox.doesHomeRefreshMatchCurrentView({ filters: { year: '2026', semester: '春学期' } }, sandbox.readHomeRefreshState()) === true,
  'Home restoration matcher should accept matching URL + server-backed filter state'
);
assert(
  sandbox.doesHomeRefreshMatchCurrentView({ filters: { year: '2025', semester: '春学期' } }, sandbox.readHomeRefreshState()) === false,
  'Home restoration matcher should reject mismatched server-backed filter state'
);
sandbox.clearHomeRefreshState();
assert(sandbox.readHomeRefreshState() === null, 'Refresh state should clear cleanly');

const report = {
  ok: true,
  checks: [
    'refresh-state-key-and-functions-present',
    'stale-target-narrowing-hooked',
    'home-url-snapshotted-before-navigation',
    'home-and-course-boot-resume-contracts-present',
    'restoration-scope-defined',
    'overlay-and-header-action-styles-present',
    'docs-frame-refresh-as-validation-gated'
  ]
};

fs.mkdirSync('.omx/artifacts/home-safe-refresh-deadlines', { recursive: true });
fs.writeFileSync('.omx/artifacts/home-safe-refresh-deadlines/verification-report.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
