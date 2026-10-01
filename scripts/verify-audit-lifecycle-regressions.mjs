import vm from 'node:vm';
import { strict as assert } from 'node:assert';
import { parseHTML } from 'linkedom';
import { readKulmsSource } from './lib/content-source.mjs';

const source = readKulmsSource().replace(/\/\* FILE: src\/content\/main\.js \*\/[\s\S]*$/m, '');
const checks = [];
function runtime(html = '<main id="js-main"><p>Original</p></main>') {
  const { document } = parseHTML(`<html><head></head><body>${html}</body></html>`);
  const timers = new Map();
  let timerId = 0;
  const storage = new Map();
  const location = new URL('https://kulms.tl.kansai-u.ac.jp/webclass/');
  const context = {
    document, URL, URLSearchParams, AbortController, Map, Set,
    console: { log() {}, warn() {}, error() {} },
    window: {
      location, sessionStorage: {
        getItem: (key) => storage.get(key) || null,
        setItem: (key, value) => storage.set(key, String(value)),
        removeItem: (key) => storage.delete(key)
      },
      addEventListener() {}, removeEventListener() {},
      setTimeout(callback) { const id = timerId++; timers.set(id, callback); return id; },
      clearTimeout(id) { timers.delete(id); }
    },
    chrome: { runtime: { lastError: null }, storage: { onChanged: { addListener() {} } } }
  };
  context.setTimeout = context.window.setTimeout;
  context.clearTimeout = context.window.clearTimeout;
  vm.createContext(context);
  vm.runInContext(source, context);
  context.timers = timers;
  context.countRenders = () => { context.rendered = 0; context.rerender = () => { context.rendered += 1; }; };
  context.home = () => {
    const view = { schedule: { entries: [] }, otherCourses: [], filters: { year: '2026' }, announcements: { items: [] } };
    const pageContext = { links: {}, userName: 'Account' };
    Object.assign(context.state, { currentRoute: { name: 'home', supported: true }, currentContext: pageContext, currentView: view });
    return { view, pageContext };
  };
  return context;
}
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
async function check(name, fn) { await fn(); checks.push(name); }

await check('late home response cannot overwrite an all-upcoming results view', async () => {
  const app = runtime();
  const { view, pageContext } = app.home();
  app.countRenders();
  const response = deferred();
  app.loadSupplementalDocument = () => response.promise;
  app.parseMessagePreview = () => ({ items: [] });
  app.loadUpcomingFromDueCourses = async () => [];
  const work = app.enrichHomeAsync(pageContext, view);
  const results = { items: [{ title: 'Due' }] };
  app.state.currentRoute = { name: 'home-all-upcoming' };
  app.state.currentView = results;
  response.resolve({});
  await work;
  assert.equal(app.state.currentView, results);
  assert.equal(app.rendered, 0);
});

await check('disabling during enrichment cancels writeback and does not recreate root', async () => {
  const app = runtime();
  const { view, pageContext } = app.home();
  const root = app.ensureRoot();
  const response = deferred();
  app.countRenders();
  app.loadSupplementalDocument = () => response.promise;
  app.loadUpcomingFromDueCourses = async () => [];
  app.parseMessagePreview = () => ({ items: [] });
  const work = app.enrichHomeAsync(pageContext, view);
  app.state.extensionSettings.enabled = false;
  app.releaseNative();
  response.resolve({});
  await work;
  assert.equal(root.isConnected, false);
  assert.equal(app.document.getElementById('ku-redesign-root'), null);
  assert.equal(app.state.currentView, null);
  assert.equal(app.rendered, 0);
});

function prepareInit(app, view) {
  app.collectContext = async () => ({ links: {}, userName: 'Account' });
  app.isAuthInvalidPage = () => false;
  app.isCourseConflictPage = () => false;
  app.syncCourseUpcomingCacheIdentity = () => {};
  app.syncHomeRefreshOverlay = app.syncAllUpcomingOverlay = () => {};
  app.readHomeRefreshState = () => null;
  app.readAllUpcomingState = () => null;
  app.isHomeRefreshActive = app.isAllUpcomingActive = (value) => !!value;
  app.renderShell = () => '<main>Loading</main>';
  app.renderLoadingPage = () => '';
  app.buildView = async () => view;
  app.continueHomeRefreshIfNeeded = async () => {};
  app.continueAllUpcomingIfNeeded = async () => {};
  app.countRenders();
}

await check('collector restoring results never starts a parallel home message fetch', async () => {
  const app = runtime();
  const { view } = app.home();
  prepareInit(app, view);
  app.readAllUpcomingState = () => ({ phase: 'restoring-home' });
  let requests = 0;
  app.loadSupplementalDocument = async () => { requests += 1; return {}; };
  app.parseMessagePreview = () => ({ items: [] });
  app.loadUpcomingFromDueCourses = async () => [];
  const results = { items: ['Result'] };
  app.continueAllUpcomingIfNeeded = async () => {
    app.state.currentRoute = { name: 'home-all-upcoming' };
    app.state.currentView = results;
  };
  await app.init();
  assert.equal(requests, 0);
  assert.equal(app.state.currentView, results);
});

await check('disabling during initial view build prevents mounting its late result', async () => {
  const app = runtime();
  const response = deferred();
  prepareInit(app, {});
  app.buildView = () => response.promise;
  const work = app.init();
  await Promise.resolve();
  await Promise.resolve();
  app.state.extensionSettings.enabled = false;
  app.releaseNative();
  response.resolve({ reports: { rows: [] } });
  await work;
  assert.equal(app.state.currentView, null);
  assert.equal(app.document.getElementById('ku-redesign-root'), null);
  assert.equal(app.rendered, 0);
});

await check('home cache enrichment also includes other-course entries', async () => {
  const app = runtime();
  const { view, pageContext } = app.home();
  view.otherCourses = [{ items: [{ href: '/course-OTHER', title: 'Other', hasNativeDueReminder: true }] }];
  app.countRenders();
  app.loadSupplementalDocument = async () => ({});
  app.parseMessagePreview = () => ({ items: [] });
  let sources;
  app.loadUpcomingFromDueCourses = async (entries) => { sources = entries; return []; };
  await app.enrichHomeAsync(pageContext, view);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].href, '/course-OTHER');
});

function prepareLogin(app) {
  const form = app.document.createElement('form');
  form.innerHTML = '<input name="username" type="text"><input name="val" type="password"><input name="login" type="submit">';
  app.document.body.append(form);
  app.state.currentRoute = { name: 'login' };
  app.state.extensionSettings = { enabled: true, autoLogin: true, username: 'account', password: 'test-only-password' };
  app.setLoginInputValue = (input, value) => { input.value = value; };
  app.parseLoginAlert = () => '';
  let submissions = 0;
  form.requestSubmit = () => { submissions += 1; };
  return { form, submissions: () => submissions };
}

await check('queued auto-login is canceled on disable including timer id zero', () => {
  const app = runtime();
  const login = prepareLogin(app);
  app.fillAndMaybeSubmitLoginForm(login.form);
  assert.equal(app.timers.size, 1);
  const alreadyQueued = [...app.timers.values()][0];
  app.state.extensionSettings.enabled = false;
  app.cancelAutoLoginSubmission();
  assert.equal(app.timers.size, 0);
  alreadyQueued();
  assert.equal(login.submissions(), 0);
});

await check('explicitly disabled automatic login only fills saved credentials', () => {
  const app = runtime();
  const login = prepareLogin(app);
  app.state.extensionSettings = app.kuNormalizeExtensionSettings({ enabled: true, autoLogin: false, username: 'account', password: 'test-only-password' });
  assert.equal(app.state.extensionSettings.autoLogin, false);
  app.fillAndMaybeSubmitLoginForm(login.form);
  assert.equal(login.form.querySelector('input[name="username"]').value, 'account');
  assert.equal(app.timers.size, 0);
  assert.equal(login.submissions(), 0);
});

await check('inspection mode blocks automatic login even when it is explicitly enabled', () => {
  const app = runtime();
  const login = prepareLogin(app);
  app.document.documentElement.dataset.kuAuditNoSubmit = 'true';
  app.fillAndMaybeSubmitLoginForm(login.form);
  app.submitLoginForm(login.form, { username: 'account', password: 'test-only-password' });
  assert.equal(app.timers.size, 0);
  assert.equal(login.submissions(), 0);
});

await check('auto-login rechecks changed credentials and form connection', () => {
  for (const change of ['credentials', 'detach', 'leave', 'edited-input']) {
    const app = runtime();
    const login = prepareLogin(app);
    app.fillAndMaybeSubmitLoginForm(login.form);
    const callback = [...app.timers.values()][0];
    if (change === 'credentials') app.state.extensionSettings.username = 'different-account';
    if (change === 'detach') login.form.remove();
    if (change === 'leave') app.abortInFlightPageRequests();
    if (change === 'edited-input') login.form.querySelector('input[name="username"]').value = 'user-edited';
    callback();
    assert.equal(login.submissions(), 0, change);
  }
});

await check('takeover hides original controls and restores original accessibility attributes', () => {
  const app = runtime('<header aria-hidden="false"><a href="#">Native</a></header><main id="js-main">Original</main>');
  const original = app.document.querySelector('header');
  original.inert = false;
  const root = app.ensureRoot();
  app.hideNativePageForExtension('ku-redesign-root');
  assert.equal(original.inert, true);
  assert.equal(original.getAttribute('aria-hidden'), 'true');
  assert.notEqual(root.inert, true);
  let temporarilyInteractive = false;
  app.withNativeInteraction(original.querySelector('a'), () => { temporarilyInteractive = !original.inert; });
  assert.equal(temporarilyInteractive, true);
  assert.equal(original.inert, true);
  app.restoreNativePageForExtension('ku-redesign-root');
  assert.equal(original.inert, false);
  assert.equal(original.getAttribute('aria-hidden'), 'false');
});

await check('login notice observer catches late content and same-count title changes', () => {
  const app = runtime('<ul id="AjaxInfoBox"></ul>');
  class Observer { constructor(callback) { this.callback = callback; } observe() {} disconnect() { this.disconnected = true; } }
  app.MutationObserver = Observer;
  app.state.currentRoute = { name: 'login' };
  app.state.currentView = { notices: { items: [], moreHref: '' } };
  app.countRenders();
  app.syncLoginNotices(app.state.currentView);
  const observer = app.state.loginNoticeSyncObserver;
  const list = app.document.querySelector('#AjaxInfoBox');
  list.innerHTML = '<li><a class="title" href="/webclass/information.php/post/1">First</a><span class="data">Admin - 2027/01/01</span></li>';
  observer.callback([{ target: list }]);
  assert.equal(app.state.currentView.notices.items[0].title, 'First');
  list.querySelector('a').textContent = 'Changed';
  observer.callback([{ target: list }]);
  assert.equal(app.state.currentView.notices.items[0].title, 'Changed');
  assert.equal(app.rendered, 2);
  app.stopLoginNoticeSync();
  assert.equal(observer.disconnected, true);
});

await check('course return is a supported native transition and does not clear collector state', async () => {
  const app = runtime();
  app.window.location = new URL('https://kulms.tl.kansai-u.ac.jp/webclass/course.php/26170478/logout?acs_=test');
  assert.equal(app.detectRoute(app.window.location).name, 'course-return');
  assert.equal(app.detectRoute(app.window.location).supported, true);
  let clearedCollectors = false;
  app.syncCourseUpcomingCacheIdentity = () => { clearedCollectors = true; };
  await app.init();
  assert.equal(clearedCollectors, false);
  assert.equal(app.document.getElementById('ku-redesign-root'), null);
});

await check('manual parse failure releases control instead of faking a quick-access guide', () => {
  const app = runtime();
  app.parseManualSections = () => [];
  assert.throws(() => app.buildManualView(app.document, { homeDoc: app.document }), /manual sections/);
});

await check('composition defers full-page rendering until committed input', () => {
  const app = runtime();
  app.home();
  const root = app.ensureRoot();
  root.innerHTML = '<input data-action="home-search" value="composition">';
  const input = root.querySelector('input');
  app.state.isComposing = true;
  app.rerender();
  assert.equal(root.querySelector('input'), input);
  assert.equal(app.state.renderDeferred, true);
});

console.log(JSON.stringify({ ok: true, checks }, null, 2));
