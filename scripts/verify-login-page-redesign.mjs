import { read, readKulmsSource, extractFunction, assert } from './lib/content-source.mjs';

const source = readKulmsSource();
const css = read('src/content/critical.css');
const manifest = read('manifest.json');
const architecture = read('docs/ku-lms-extension-architecture.md');
const designCode = read('docs/ku-lms-design-code.md');
const entrypoint = read('docs/AI_DOCS_ENTRYPOINT.md');

const checks = [];
const record = (name, fn) => { fn(); checks.push(name); };

record('manifest loads native login parser, renderer and hydration', () => {
  const scripts = JSON.parse(manifest).content_scripts[0].js;
  for (const file of ['src/content/parsers/auth.js', 'src/content/render/auth.js', 'src/content/hydrate/auth.js']) {
    assert(scripts.includes(file), `Login module missing: ${file}`);
  }
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
  const release = extractFunction(source, 'releaseNative');
  assert(release.indexOf('stopLoginNoticeSync();') >= 0 && release.indexOf('restoreNativeLoginForm();') > release.indexOf('stopLoginNoticeSync();') && release.indexOf('root.remove()') > release.indexOf('restoreNativeLoginForm();'), 'Fail-open must stop notice updates and restore the native form before removing the shell.');
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
    'ku-login-native-extra', 'function syncLoginNotices(', 'new MutationObserver', 'function cleanLoginSupportLabel('
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

record('durable login contract replaces private planning prerequisites', () => {
  assert(architecture.includes('only preserve native login, inquiry/contact, and notice content'), 'The versioned architecture must retain native login content scope.');
  assert(designCode.includes('Login = pre-auth sign-in + support/notices surface'), 'The versioned design contract must retain the pre-auth surface.');
});

console.log(JSON.stringify({ ok: true, checks }, null, 2));
