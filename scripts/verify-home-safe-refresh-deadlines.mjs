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

function assertCssRuleIncludes(selector, declarations, message) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = cssSource.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
  assert(match, `${message} (missing rule)`);
  for (const declaration of declarations) {
    assert(match[1].includes(declaration), `${message} (missing ${declaration})`);
  }
}

assert(source.includes("const HOME_REFRESH_STATE_KEY = 'ku-redesign-home-refresh-v1'"), 'Refresh state key should exist');
const bootingIndex = source.indexOf("document.documentElement.dataset.kuRedesignState = 'booting';");
const earlyReadIndex = source.indexOf('syncBootRefreshOverlay();');
const bootShellIndex = source.indexOf('mountBootShell();');
const initGateIndex = source.indexOf("if (document.readyState === 'loading') {");
const initFn = extractFunction('init');
const bootOverlayFn = extractFunction('syncBootRefreshOverlay');
const syncOverlayFn = extractFunction('syncHomeRefreshOverlay');
assert(bootingIndex !== -1, 'Booting state assignment should exist');
assert(earlyReadIndex !== -1, 'Boot should visually rehydrate the refresh overlay before shell mount');
assert(bootShellIndex !== -1, 'Boot shell mount should exist');
assert(initGateIndex !== -1, 'DOMContentLoaded init gate should exist');
assert(bootingIndex < earlyReadIndex, 'Boot overlay sync should happen after the booting state is set');
assert(earlyReadIndex < bootShellIndex, 'Boot overlay sync should happen before boot shell mount');
assert(bootShellIndex < initGateIndex, 'Boot shell should still mount before the init gate is evaluated');
assert(bootOverlayFn.includes('syncHomeRefreshOverlay(readHomeRefreshState());'), 'Boot overlay helper should remain a visual-only refresh-state rehydration boundary');
assert(initFn.includes("const refreshState = readHomeRefreshState();"), 'Init should re-read fresh refresh state after the boot gate');
assert(initFn.includes("const authInvalidPage = isAuthInvalidPage(document);"), 'Init should classify auth-invalid pages');
assert(initFn.includes("const courseConflictPage = isCourseConflictPage(document);"), 'Init should classify course-conflict pages');
assert(initFn.includes("if (courseConflictPage || (authInvalidPage && !intentionalLoginRoute))"), 'Init should treat top-level conflict/auth-invalid as a terminal branch');
assert(initFn.includes("abortHomeRefresh(refreshState, courseConflictPage ? 'course-conflict-page' : 'auth-invalid-page');"), 'Init should preserve exact top-level abort taxonomy');
assert(syncOverlayFn.includes("let overlay = document.getElementById('ku-home-refresh-overlay');"), 'Overlay sync should reuse the canonical overlay node');
assert(syncOverlayFn.includes("overlay.id = 'ku-home-refresh-overlay';"), 'Overlay sync should canonicalize the overlay id');
assert(syncOverlayFn.includes("(document.body || document.documentElement).appendChild(overlay);"), 'Overlay sync should stay safe before body exists');
assert(syncOverlayFn.includes("document.getElementById('ku-home-refresh-overlay')?.remove();"), 'Overlay sync should clear the overlay when refresh becomes inactive');
assert(extractFunction('startHomeRefresh').includes('getRefreshEntries(view.schedule.entries)'), 'Refresh should explicitly target current due-flag courses when the user asks for latest data');
assert(extractFunction('startHomeRefresh').includes("homeUrl: window.location.href"), 'Refresh should snapshot the exact home URL before navigation');
assert(extractFunction('continueHomeRefreshIfNeeded').includes("route.name === 'home'"), 'Refresh state machine should resume on the home route');
assert(extractFunction('continueHomeRefreshIfNeeded').includes("route.name === 'course-materials'"), 'Refresh state machine should resume on course pages');
assert(extractFunction('continueHomeRefreshOnCourse').includes("phase: 'restoring-home'"), 'Refresh should restore home after the final target');
assert(extractFunction('doesHomeRefreshMatchCurrentView').includes('view.filters?.year'), 'Restoration scope should include year matching');
assert(extractFunction('doesHomeRefreshMatchCurrentView').includes('view.filters?.semester'), 'Restoration scope should include semester matching');
assert(extractFunction('shouldSuppressRefreshSideEffects').includes('getCurrentHomeRefreshTarget'), 'Side-effect suppression should be bound to the active refresh target');

assert(cssSource.includes('#ku-home-refresh-overlay'), 'Critical CSS should define the fullscreen refresh overlay');
assert(cssSource.includes(':not(#ku-home-refresh-overlay)'), 'Critical CSS takeover selector should explicitly exempt the refresh overlay from global hiding');
assertCssRuleIncludes('#ku-redesign-root', ['position: fixed;', 'inset: 0;', 'z-index: 2147483646;'], 'Critical CSS should keep the redesign root z-index contract');
assertCssRuleIncludes('#ku-home-refresh-overlay', ['position: fixed;', 'inset: 0;', 'z-index: 2147483647;'], 'Critical CSS should keep the refresh overlay above the redesign root');
assert(cssSource.includes('.ku-home-refresh-box'), 'Critical CSS should style the refresh overlay shell');
assert(cssSource.includes('.ku-home-refresh-progress-track'), 'Critical CSS should style the refresh progress track');
assert(cssSource.includes('.ku-home-refresh-note'), 'Critical CSS should style the refresh progress note');
assert(cssSource.includes('.ku-card-actions'), 'Critical CSS should support the due-card refresh actions layout');
assert(source.includes('更新しています。しばらくお待ちください。'), 'Refresh overlay should explicitly ask the user to wait during manual refresh');
assert(source.includes('ku-home-refresh-progress-head'), 'Refresh overlay should expose a dedicated progress summary row');
assert(source.includes('ku-home-refresh-progress-value'), 'Refresh overlay should expose a dedicated progress fill row');

assert(architectureDoc.includes('validation-gated refresh control'), 'Architecture doc should describe the validation-gated refresh control');
assert(architectureDoc.includes('top-level same-tab navigation only'), 'Architecture doc should describe the same-tab navigation transport rule');
assert(architectureDoc.includes('must explicitly remain visible through the takeover hide rules'), 'Architecture doc should describe the overlay visibility contract against takeover hide rules');
assert(sessionSafetyDoc.includes('session-safer / validation-gated'), 'Session-safety doc should describe the refresh path as validation-gated');

const storage = new Map();
const domNodes = new Map();
function createNode() {
  return {
    id: '',
    innerHTML: '',
    remove() {
      if (this.id) domNodes.delete(this.id);
    }
  };
}

const sandbox = {
  console,
  URL,
  Date,
  HOME_REFRESH_STATE_KEY: 'ku-redesign-home-refresh-v1',
  HOME_REFRESH_MAX_AGE_MS: 5 * 60 * 1000,
  HOME_REFRESH_STALL_MS: 45 * 1000,
  truncate(value = '', length = 0) {
    const text = String(value ?? '');
    return text.length > length ? `${text.slice(0, length)}…` : text;
  },
  escapeHtml(value = '') {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
  escapeAttr(value = '') {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
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
  document: {
    body: {
      appendChild(node) {
        if (node?.id) domNodes.set(node.id, node);
      }
    },
    documentElement: {
      appendChild(node) {
        if (node?.id) domNodes.set(node.id, node);
      }
    },
    createElement(tagName) {
      return createNode(tagName);
    },
    getElementById(id) {
      return domNodes.get(id) || null;
    }
  },
  absoluteUrl: (value = '') => value
};
vm.createContext(sandbox);
for (const name of [
  'syncBootRefreshOverlay',
  'readHomeRefreshState',
  'writeHomeRefreshState',
  'clearHomeRefreshState',
  'getCurrentHomeRefreshTarget',
  'isHomeRefreshActive',
  'doesHomeRefreshMatchCurrentView',
  'syncHomeRefreshOverlay'
]) {
  vm.runInContext(extractFunction(name), sandbox, { filename: 'src/content/main.js' });
}

const payload = {
  version: 1,
  phase: 'navigating-to-course',
  startedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  lastProgressAt: new Date().toISOString(),
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
sandbox.syncHomeRefreshOverlay({
  ...payload,
  phase: 'arming',
  currentIndex: '0'
});
const armingOverlay = domNodes.get('ku-home-refresh-overlay');
assert(armingOverlay.innerHTML.includes('更新を開始しています…'), 'Overlay should render arming copy');
assert(armingOverlay.innerHTML.includes('1 / 2'), 'Overlay should keep numeric progress while arming');
assert(!armingOverlay.innerHTML.includes('最終ステップを処理しています'), 'Arming overlay should avoid restore-only note copy');
sandbox.syncHomeRefreshOverlay(sandbox.readHomeRefreshState());
const activeOverlay = domNodes.get('ku-home-refresh-overlay');
assert(activeOverlay, 'Active refresh should mount the overlay');
sandbox.syncHomeRefreshOverlay(sandbox.readHomeRefreshState());
assert(domNodes.get('ku-home-refresh-overlay') === activeOverlay, 'Overlay sync should reuse a single canonical overlay node');
assert(activeOverlay.innerHTML.includes('更新しています。しばらくお待ちください。'), 'Overlay should render the explicit wait copy');
assert(activeOverlay.innerHTML.includes('進捗'), 'Overlay should render a visible progress label');
assert(activeOverlay.innerHTML.includes('1 / 2'), 'Overlay should render the current numeric progress');
assert(activeOverlay.innerHTML.includes('width:50%'), 'Overlay should render a proportional progress bar fill');
assert(activeOverlay.innerHTML.includes('現在: 言語学'), 'Overlay should render the current target note when available');
sandbox.syncHomeRefreshOverlay({
  ...payload,
  phase: 'restoring-home',
  currentIndex: payload.targets.length
});
const restoringOverlay = domNodes.get('ku-home-refresh-overlay');
assert(restoringOverlay.innerHTML.includes('ホームへ戻しています…'), 'Overlay should render restoring-home copy');
assert(restoringOverlay.innerHTML.includes('2 / 2'), 'Overlay should render completed progress on restore');
assert(restoringOverlay.innerHTML.includes('width:100%'), 'Overlay should fill the progress bar on restore');
sandbox.syncHomeRefreshOverlay(null);
assert(!domNodes.has('ku-home-refresh-overlay'), 'Inactive refresh should clear the overlay');
sandbox.clearHomeRefreshState();
assert(sandbox.readHomeRefreshState() === null, 'Refresh state should clear cleanly');
sandbox.document.body = null;
sandbox.writeHomeRefreshState({
  ...payload,
  phase: 'arming',
  currentIndex: 0
});
sandbox.syncBootRefreshOverlay();
const preBodyOverlay = domNodes.get('ku-home-refresh-overlay');
assert(preBodyOverlay, 'Boot overlay sync should still mount without a body element');
assert(preBodyOverlay.innerHTML.includes('更新を開始しています…'), 'Boot overlay sync should preserve the same overlay contract before body exists');
sandbox.syncHomeRefreshOverlay(null);
assert(!domNodes.has('ku-home-refresh-overlay'), 'Pre-body boot overlay should still clear cleanly');
sandbox.document.body = {
  appendChild(node) {
    if (node?.id) domNodes.set(node.id, node);
  }
};

const report = {
  ok: true,
  checks: [
    'refresh-state-key-and-functions-present',
    'boot-overlay-sync-happens-before-shell-mount',
    'boot-overlay-helper-preserves-visual-only-boundary',
    'init-rereads-fresh-state-and-preserves-top-level-abort-taxonomy',
    'explicit-refresh-targeting-hooked',
    'home-url-snapshotted-before-navigation',
    'home-and-course-boot-resume-contracts-present',
    'restoration-scope-defined',
    'overlay-exempt-from-takeover-hide-selector',
    'overlay-above-redesign-root',
    'overlay-and-header-action-styles-present',
    'overlay-progress-ui-present',
    'overlay-singleton-contract-preserved',
    'overlay-prebody-boot-sync-safe',
    'overlay-render-behavior-executed',
    'docs-frame-refresh-as-validation-gated'
  ]
};

fs.mkdirSync('.omx/artifacts/home-safe-refresh-deadlines', { recursive: true });
fs.writeFileSync('.omx/artifacts/home-safe-refresh-deadlines/verification-report.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
