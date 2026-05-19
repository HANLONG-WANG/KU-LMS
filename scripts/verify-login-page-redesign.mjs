import { read, readKulmsSource, assert } from './lib/content-source.mjs';

const source = readKulmsSource();
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
const record = (name, fn) => { fn(); checks.push(name); };

record('manifest description mentions login support', () => {
  assert(/login, logout, home, course, notices, messages, and manual routes/.test(manifest), 'Manifest description missing login support wording.');
});

record('detectRoute supports login route', () => {
  assert(source.includes("if (normalized === '/webclass/login.php') return { supported: true, name: 'login' };"), 'detectRoute() no longer supports /webclass/login.php.');
});

record('intentional login route bypasses global auth-invalid release', () => {
  assert(source.includes("const intentionalLoginRoute = route.name === 'login';"), 'Intentional login-route guard is missing.');
  assert(source.includes('authInvalidPage && !intentionalLoginRoute'), 'init() no longer preserves direct login-route rendering.');
});

record('login view parser and renderer exist', () => {
  for (const token of ['function buildLoginView(', 'function parseLoginView(', 'function renderLogin(', 'renderLoginLanguageLinks']) {
    assert(source.includes(token), `Missing login token: ${token}`);
  }
});

record('login form parity fields are preserved in code', () => {
  for (const token of [
    'input[name="username"]', 'input[name="val"]', 'data-ku-login-native-form-host', 'function hydrateLoginForm(',
    'document.forms.login', 'function captureLoginFormSnapshot(', 'function restoreNativeLoginForm(',
    'function restoreLoginFormSnapshot(', 'loginNativeFormSnapshot'
  ]) {
    assert(source.includes(token), `Missing login parity token: ${token}`);
  }
  assert(/function releaseNative\(\) \{\s*stopLoginNoticeSync\(\);\s*restoreNativeLoginForm\(\);/s.test(source), 'releaseNative() must restore the native login form before fail-open fallback.');
  assert(source.includes("if (entry.style == null) entry.element.removeAttribute('style');"), 'restore path no longer clears inline style when the original element had none.');
  assert(source.includes("else entry.element.setAttribute('style', entry.style);"), 'restore path no longer restores original inline style values.');
});

record('refresh logic still treats login route as auth-invalid during active refresh', () => {
  assert(source.includes("if (route.name === 'login' || route.name === 'logout' || isAuthInvalidRoute(route) || isAuthInvalidPage(document) || isCourseConflictPage(document))"), 'Refresh fail-closed login guard is missing.');
});

record('login shell keeps scope limited', () => {
  assert(source.includes('<h2 class="ku-card-title">お問い合わせ</h2>'), 'Login support card heading is missing.');
  assert(source.includes('<h2 class="ku-card-title">通告</h2>'), 'Login notice card heading is missing.');
  assert(source.includes("if (route.name === 'login' || route.name === 'logout') {"), 'Auth terminal shell branch is missing.');
  assert(source.includes("const pageClass = route.name === 'logout' ? 'ku-logout-page' : 'ku-login-page';"), 'Auth pageClass branch is missing.');
});

record('login follow-up invariants are locked in code', () => {
  for (const token of [
    'renderLoginLanguageLinks(view.languages, view.languageCode)', 'function markHydratedLoginFormDecorations(',
    'ku-login-native-extra', 'function syncLoginNotices(', 'window.setTimeout(trySync, 300)', 'function cleanLoginSupportLabel('
  ]) {
    assert(source.includes(token), `Missing login follow-up token: ${token}`);
  }
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
  for (const token of [
    '.omx/plans/prd-ku-lms-login-page-redesign.md', '.omx/plans/test-spec-ku-lms-login-page-redesign.md',
    '.omx/plans/prd-ku-lms-login-page-followups.md', '.omx/plans/test-spec-ku-lms-login-page-followups.md'
  ]) {
    assert(entrypoint.includes(token), `AI docs entrypoint missing: ${token}`);
  }
});

record('phase artifacts exist', () => {
  assert(prd.includes('KU-LMS Login Page Redesign'), 'Login PRD content missing.');
  assert(testSpec.includes('KU-LMS Login Page Redesign'), 'Login test spec content missing.');
  assert(followupPrd.includes('KU-LMS Login Page Follow-ups'), 'Login follow-up PRD content missing.');
  assert(followupTestSpec.includes('KU-LMS Login Page Follow-ups'), 'Login follow-up test spec content missing.');
});

console.log(JSON.stringify({ ok: true, checks }, null, 2));
