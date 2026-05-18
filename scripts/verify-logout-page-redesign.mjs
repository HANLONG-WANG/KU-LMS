import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function extractFunction(source, name) {
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

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const main = read('src/content/main.js');
const css = read('src/content/critical.css');
const manifest = read('manifest.json');
const architecture = read('docs/ku-lms-extension-architecture.md');
const designCode = read('docs/ku-lms-design-code.md');
const entrypoint = read('docs/AI_DOCS_ENTRYPOINT.md');
const sessionSafety = read('docs/ku-lms-session-safety-analysis.md');
const prd = read('.omx/plans/prd-ku-lms-logout-page-redesign.md');
const testSpec = read('.omx/plans/test-spec-ku-lms-logout-page-redesign.md');
const refreshVerifier = read('scripts/verify-home-refresh-login-loop-safety.mjs');

const checks = [];
function record(name, fn) {
  fn();
  checks.push(name);
}

record('manifest description mentions logout support', () => {
  assert(/login, logout, home, course, notices, messages, and manual routes/.test(manifest), 'Manifest description was not updated for logout support.');
});

record('detectRoute supports logout route', () => {
  assert(/normalized === '\/webclass\/logout\.php'\) return \{ supported: true, name: 'logout' \};/.test(main), 'detectRoute does not classify /webclass/logout.php as supported logout.');
});

record('logout view parser and renderer exist', () => {
  assert(/function buildLogoutView\(/.test(main), 'buildLogoutView() is missing.');
  assert(/function parseLogoutView\(/.test(main), 'parseLogoutView() is missing.');
  assert(/function renderLogout\(/.test(main), 'renderLogout() is missing.');
  assert(/function findShortestMatchingText\(/.test(main), 'findShortestMatchingText() helper is missing for logout parsing.');
});

record('logout action parity is preserved in code', () => {
  assert(/includes\('\/webclass\/login\.php'\)/.test(main), 'Logout parser is missing native login-return action capture.');
  assert(main.includes('window\\.close\\(\\)'), 'Logout parser is missing native close-window action capture.');
  assert(/throw new Error\('Logout actions not found'\)/.test(main), 'Logout view should fail open when required terminal actions are missing.');
});

record('logout shell stays unauthenticated', () => {
  assert(/route\.name === 'login' \|\| route\.name === 'logout'/.test(main), 'Logout route is not using the auth-terminal shell branch.');
  assert(/const pageClass = route\.name === 'logout' \? 'ku-logout-page' : 'ku-login-page';/.test(main), 'Logout route is missing the dedicated page shell class.');
  assert(/<section class="ku-card ku-logout-warning-card">/.test(main), 'Logout warning card markup is missing.');
  assert(/ku-logout-shell \$\{warningCard \? 'has-warning' : 'is-compact'\}/.test(main), 'Logout route is missing the compact-vs-warning shell layout contract.');
});

record('refresh logic still fails closed on logout during active refresh', () => {
  assert(/route\.name === 'login' \|\| route\.name === 'logout'/.test(main), 'Refresh continuation is missing the logout fail-closed branch.');
  assert(refreshVerifier.includes("continueHomeRefreshIfNeeded({ name: 'logout' }"), 'Refresh verifier is not exercising logout-route fail-closed behavior.');
});

record('logout route has dedicated CSS classes', () => {
  for (const token of ['.ku-logout-page', '.ku-logout-shell', '.ku-logout-card', '.ku-logout-warning-card', '.ku-logout-summary-card', '.ku-logout-actions']) {
    assert(css.includes(token), `Missing CSS token: ${token}`);
  }
});

record('logout dedupe regression is locked by parser and renderer', () => {
  const sandbox = {
    console,
    URL,
    window: { location: { origin: 'https://kulms.tl.kansai-u.ac.jp' } },
    cleanText(value = '') {
      return String(value || '').replace(/\s+/g, ' ').trim();
    },
    absoluteUrl(path = '') {
      if (!path) return '';
      if (/^https?:/i.test(path) || String(path).startsWith('javascript:')) return String(path);
      return new URL(String(path), 'https://kulms.tl.kansai-u.ac.jp').toString();
    },
    escapeHtml(value = '') { return String(value ?? ''); },
    escapeAttr(value = '') { return String(value ?? ''); },
    icon() { return ''; }
  };
  vm.createContext(sandbox);
  for (const fn of ['findShortestMatchingText', 'extractFirstMatch', 'parseLogoutView', 'renderLogout']) {
    vm.runInContext(extractFunction(main, fn), sandbox, { filename: 'src/content/main.js' });
  }
  const textNodes = [
    { textContent: 'コース利用中に、別のコースへのアクセスがリクエストされました。' },
    { textContent: '関大LMSの他のウインドウやタブをすべて閉じ、複数同時に開いて操作しないでください。' },
    { textContent: '王 漢隆 さん、おつかれ様でした。 今回の利用時間は 00:00:06 でした。' }
  ];
  const anchors = [
    {
      textContent: 'ログイン画面に戻る',
      getAttribute(name) { return name === 'href' ? '/webclass/login.php?language=JAPANESE' : ''; }
    },
    {
      textContent: 'このウィンドウを閉じる',
      getAttribute(name) { return name === 'href' ? 'javascript:window.close();' : ''; }
    }
  ];
  const doc = {
    title: 'Logout - 関大LMS',
    body: {
      innerText: 'コース利用中に、別のコースへのアクセスがリクエストされました。 関大LMSの他のウインドウやタブをすべて閉じ、複数同時に開いて操作しないでください。 王 漢隆 さん、おつかれ様でした。 今回の利用時間は 00:00:06 でした。'
    },
    querySelectorAll(selector) {
      if (selector === 'a[href]') return anchors;
      if (selector === 'td, div, p, span, li') return textNodes;
      return [];
    }
  };
  const view = sandbox.parseLogoutView(doc);
  assert(view.heading === '王 漢隆 さん、おつかれ様でした。', 'Logout parser should split the farewell line out of the combined summary text.');
  assert(view.subtitle === '今回の利用時間は 00:00:06 でした。', 'Logout parser should split the duration line out of the combined summary text.');
  const html = sandbox.renderLogout(view);
  const count = (needle) => (html.match(new RegExp(escapeRegex(needle), 'g')) || []).length;
  assert(count('王 漢隆 さん、おつかれ様でした。') === 1, 'Logout renderer should output the farewell text exactly once.');
  assert(count('今回の利用時間は 00:00:06 でした。') === 1, 'Logout renderer should output the duration text exactly once.');
  assert(count('ログイン画面に戻る') === 1, 'Logout renderer should output the login action exactly once.');
  assert(count('このウィンドウを閉じる') === 1, 'Logout renderer should output the close-window action exactly once.');
  assert(count('コース利用中に、別のコースへのアクセスがリクエストされました。') === 1, 'Logout renderer should output the warning title exactly once.');
});

record('durable docs document the logout route', () => {
  assert(architecture.includes('/webclass/logout.php'), 'Architecture doc does not list /webclass/logout.php as supported.');
  assert(architecture.includes('post-session warning/farewell/actions surface'), 'Architecture doc is missing logout-route data-source constraints.');
  assert(architecture.includes('landing on `logout.php` still means the refresh must fail closed and stop'), 'Architecture doc is missing logout refresh fail-closed guidance.');
  assert(designCode.includes('Logout = post-session confirmation + warning/next-step surface'), 'Design code is missing logout-route IA guidance.');
  assert(designCode.includes('### Logout-route guidance'), 'Design code is missing logout-route guidance section.');
  assert(sessionSafety.includes('login.php`, `logout.php`, or another auth-invalid route'), 'Session-safety doc is missing logout-route fail-closed guidance.');
  assert(entrypoint.includes('.omx/plans/prd-ku-lms-logout-page-redesign.md'), 'AI docs entrypoint is missing logout PRD.');
  assert(entrypoint.includes('.omx/plans/test-spec-ku-lms-logout-page-redesign.md'), 'AI docs entrypoint is missing logout test spec.');
});

record('logout phase artifacts exist', () => {
  assert(prd.includes('KU-LMS Logout Page Redesign'), 'Logout PRD content missing.');
  assert(testSpec.includes('KU-LMS Logout Page Redesign'), 'Logout test spec content missing.');
});

console.log(JSON.stringify({ ok: true, checks }, null, 2));
