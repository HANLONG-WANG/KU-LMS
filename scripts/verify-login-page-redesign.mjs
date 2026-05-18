import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const main = read('src/content/main.js');
const css = read('src/content/critical.css');
const manifest = read('manifest.json');
const architecture = read('docs/ku-lms-extension-architecture.md');
const designCode = read('docs/ku-lms-design-code.md');
const entrypoint = read('docs/AI_DOCS_ENTRYPOINT.md');
const prd = read('.omx/plans/prd-ku-lms-login-page-redesign.md');
const testSpec = read('.omx/plans/test-spec-ku-lms-login-page-redesign.md');
const followupPrd = read('.omx/plans/prd-ku-lms-login-page-followups.md');
const followupTestSpec = read('.omx/plans/test-spec-ku-lms-login-page-followups.md');

const checks = [];

function record(name, fn) {
  fn();
  checks.push(name);
}

record('manifest description mentions login support', () => {
  assert(/login, logout, home, course, notices, messages, and manual routes/.test(manifest), 'Manifest description was not updated for auth-route support.');
});

record('detectRoute supports login route', () => {
  assert(/normalized === '\/webclass\/login\.php'\) return \{ supported: true, name: 'login' \};/.test(main), 'detectRoute does not classify /webclass/login.php as supported login.');
});

record('intentional login route bypasses global auth-invalid release', () => {
  assert(/const intentionalLoginRoute = route\.name === 'login';/.test(main), 'Intentional login-route guard is missing.');
  assert(/authInvalidPage && !intentionalLoginRoute/.test(main), 'init\(\) still releases native login unconditionally.');
});

record('login view parser and renderer exist', () => {
  assert(/function buildLoginView\(/.test(main), 'buildLoginView() is missing.');
  assert(/function parseLoginView\(/.test(main), 'parseLoginView() is missing.');
  assert(/function renderLogin\(/.test(main), 'renderLogin() is missing.');
  assert(/renderLoginLanguageLinks/.test(main), 'login language renderer is missing.');
});

record('login form parity fields are preserved in code', () => {
  assert(/input\[name="username"\]/.test(main), 'username field parsing is missing.');
  assert(/input\[name="val"\]/.test(main), 'password field parsing is missing.');
  assert(/data-ku-login-native-form-host/.test(main), 'native login form host is missing.');
  assert(/function hydrateLoginForm\(/.test(main), 'native login form hydrator is missing.');
  assert(/document\.forms\.login/.test(main), 'native login form is not being reused.');
  assert(/function captureLoginFormSnapshot\(/.test(main), 'native login form snapshot helper is missing.');
  assert(/function restoreNativeLoginForm\(/.test(main), 'native login form restore hook is missing.');
  assert(/function restoreLoginFormSnapshot\(/.test(main), 'native login form snapshot restore helper is missing.');
  assert(/function releaseNative\(\) {\s*(stopLoginNoticeSync\(\);\s*)?restoreNativeLoginForm\(\);/s.test(main), 'releaseNative() does not restore the native login form before fail-open fallback.');
  assert(/loginNativeFormSnapshot/.test(main), 'login-native snapshot state is missing.');
  assert(/entry\.element\.className = entry\.className \|\| ''/.test(main), 'restore path does not restore original className values.');
  assert(main.includes("if (entry.style == null) entry.element.removeAttribute('style');"), 'restore path does not clear inline style when the original element had none.');
  assert(main.includes("else entry.element.setAttribute('style', entry.style);"), 'restore path does not restore original inline style values.');
});

record('refresh logic still treats login route as auth-invalid during active refresh', () => {
  assert(/if \(route\.name === 'login' \|\| route\.name === 'logout' \|\| isAuthInvalidRoute\(route\)/.test(main), 'Refresh fail-closed login guard is missing.');
});

record('login shell keeps scope limited', () => {
  assert(/<h2 class="ku-card-title">お問い合わせ<\/h2>/.test(main), 'Login support card heading is missing.');
  assert(/<h2 class="ku-card-title">通告<\/h2>/.test(main), 'Login notice card heading is missing.');
  assert(/if \(route\.name === 'login' \|\| route\.name === 'logout'\)/.test(main), 'Auth terminal routes should share the route-specific unauthenticated shell branch.');
  assert(/const pageClass = route\.name === 'logout' \? 'ku-logout-page' : 'ku-login-page';/.test(main), 'Login route should still resolve to the dedicated ku-login-page shell class.');
});

record('login follow-up invariants are locked in code', () => {
  assert(/renderLoginLanguageLinks\(view\.languages, view\.languageCode\)/.test(main), 'Login render does not route language UI through the single language-links presenter.');
  assert(!/<span class="ku-chip blue">\$\{escapeHtml\(loginLanguageLabel\(view\.languageCode\)\)\}<\/span>\s*\$\{renderLoginLanguageLinks\(view\.languages\)\}/.test(main), 'Login render still duplicates the active language chip and the language list.');
  assert(/function markHydratedLoginFormDecorations\(/.test(main), 'Hydrated login form decoration cleanup is missing.');
  assert(/ku-login-native-extra/.test(main), 'Hydrated login form cleanup marker class is missing from JS.');
  assert(/function syncLoginNotices\(/.test(main), 'Async login notice synchronization helper is missing.');
  assert(/window\.setTimeout\(trySync, 300\)/.test(main), 'Bounded login notice retry loop is missing.');
  assert(/function cleanLoginSupportLabel\(/.test(main), 'Support-label cleanup helper is missing.');
});

record('login route has dedicated CSS classes', () => {
  for (const token of ['.ku-login-page', '.ku-login-shell', '.ku-login-card', '.ku-login-form', '.ku-login-support-card', '.ku-login-notice-card']) {
    assert(css.includes(token), `Missing CSS token: ${token}`);
  }
  assert(css.includes('.ku-login-form .ku-login-native-extra'), 'Missing CSS token: .ku-login-form .ku-login-native-extra');
});

record('architecture doc documents login route', () => {
  assert(architecture.includes('/webclass/login.php'), 'Architecture doc does not list /webclass/login.php as supported.');
  assert(architecture.includes('only preserve native login, inquiry/contact, and notice content'), 'Architecture doc is missing login-route content constraints.');
});

record('design code documents login-route constraints', () => {
  assert(designCode.includes('Login = pre-auth sign-in + support/notices surface'), 'Design code is missing login-route IA guidance.');
  assert(designCode.includes('login/auth controls'), 'Design code is missing login-route content constraints.');
});

record('AI docs entrypoint includes login PRD and test spec', () => {
  assert(entrypoint.includes('.omx/plans/prd-ku-lms-login-page-redesign.md'), 'AI docs entrypoint is missing login PRD.');
  assert(entrypoint.includes('.omx/plans/test-spec-ku-lms-login-page-redesign.md'), 'AI docs entrypoint is missing login test spec.');
  assert(entrypoint.includes('.omx/plans/prd-ku-lms-login-page-followups.md'), 'AI docs entrypoint is missing login follow-up PRD.');
  assert(entrypoint.includes('.omx/plans/test-spec-ku-lms-login-page-followups.md'), 'AI docs entrypoint is missing login follow-up test spec.');
});

record('phase artifacts exist', () => {
  assert(prd.includes('KU-LMS Login Page Redesign'), 'Login PRD content missing.');
  assert(testSpec.includes('KU-LMS Login Page Redesign'), 'Login test spec content missing.');
  assert(followupPrd.includes('KU-LMS Login Page Follow-ups'), 'Login follow-up PRD content missing.');
  assert(followupTestSpec.includes('KU-LMS Login Page Follow-ups'), 'Login follow-up test spec content missing.');
});

console.log(JSON.stringify({
  ok: true,
  checks
}, null, 2));
