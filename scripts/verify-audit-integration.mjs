import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const sources = [...new Set(manifest.content_scripts.flatMap((entry) => entry.js))].filter((file) => !['src/content/main.js', 'src/content/syllabus-main.js'].includes(file));
const checks = [];
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

function runtime(url, content) {
  const { document, window } = parseHTML(`<!doctype html><html><head></head><body>${content}</body></html>`);
  // Browsers keep document.body stable when an extension root precedes it; LinkeDOM otherwise synthesizes another body.
  const nativeBody = document.body;
  Object.defineProperty(document, 'body', { get: () => nativeBody });
  const location = new URL(url);
  window.location = { href: location.href, origin: location.origin, pathname: location.pathname, search: location.search, hash: location.hash, replace() { throw new Error('Unexpected real navigation'); } };
  const storage = new Map();
  window.sessionStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: (key) => storage.delete(key) };
  window.setTimeout = setTimeout;
  window.clearTimeout = clearTimeout;
  window.alert = () => {};
  Object.defineProperty(document, 'forms', { get() {
    const forms = [...document.querySelectorAll('form')];
    for (const form of forms) {
      forms[form.getAttribute('name')] = form;
      if (!Object.getOwnPropertyDescriptor(form, 'elements')) Object.defineProperty(form, 'elements', { get() {
        const controls = [...form.querySelectorAll('input, select, textarea, button')];
        controls.forEach((control) => { if (control.getAttribute('name')) controls[control.getAttribute('name')] = control; });
        return controls;
      } });
    }
    return forms;
  } });
  const sandbox = {
    document, window, URL, URLSearchParams, Map, Set, WeakSet, Date, AbortController, DOMException,
    DOMParser: window.DOMParser, MutationObserver: window.MutationObserver, CSS: { escape: (value) => String(value).replace(/[^\w-]/g, '\\$&') },
    Event: window.Event, setTimeout, clearTimeout,
    console: { warn() {}, error(...args) { throw new Error(args.map(String).join(' ')); } },
    chrome: { storage: { onChanged: { addListener() {} }, local: { get(_keys, callback) { callback({}); } } } },
    fetch: () => { throw new Error('Unexpected network access in offline integration test'); }
  };
  vm.createContext(sandbox);
  for (const file of sources) vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
  sandbox.state.extensionSettings = sandbox.kuNormalizeExtensionSettings({ enabled: true });
  return sandbox;
}

// Full boot/view/render/hydrate integration with a real DOM and an early root outside body.
const manual = runtime('https://kulms.tl.kansai-u.ac.jp/webclass/user.php/manual', `
  <nav><a title="アカウントメニュー">Audit User</a></nav>
  <main id="js-main"><h2>教材実行時の注意点</h2><p>Do not run materials concurrently.</p>
  <h3>動作環境</h3><p>Supported devices.</p><h4>ブラウザ</h4><ul><li>Chrome</li><li>Firefox</li></ul>
  <h4>スマートフォン</h4><p>Current systems.</p><h2>マニュアル・テンプレート</h2>
  <ul><li><a href="/webclass/user.php/manual/download/a.pdf">PDF A</a></li><li><a href="/webclass/user.php/manual/download/b.pdf">PDF B</a></li></ul></main>`);
const earlyRoot = manual.document.createElement('div');
earlyRoot.id = 'ku-redesign-root';
manual.document.documentElement.insertBefore(earlyRoot, manual.document.body);
await manual.init();
assert.equal(earlyRoot.parentNode, manual.document.body);
assert.equal(manual.state.currentView.sections.length, 5);
assert.equal(earlyRoot.querySelectorAll('.ku-manual-card').length, 5);
assert.equal(earlyRoot.querySelectorAll('a[href$=".pdf"]').length, 2);
assert.equal(manual.document.querySelector('#js-main').inert, true);
checks.push('early-root boot renders all native manual sections and PDF links while isolating native focus');

// Native proxy must enter the page's DOM listener while restoring inert immediately afterwards.
const native = manual.document.querySelector('#js-main');
const sortAnchor = manual.document.createElement('a');
sortAnchor.setAttribute('href', "javascript:sortMessageListTable('date')");
native.appendChild(sortAnchor);
let nativeClicks = 0;
sortAnchor.addEventListener('click', () => { assert.equal(native.inert, false); nativeClicks += 1; });
manual.executeMessageHref(sortAnchor.getAttribute('href'), {});
assert.equal(nativeClicks, 1);
assert.equal(native.inert, true);
assert.equal(native.getAttribute('aria-hidden'), 'true');
checks.push('native paging proxy synchronously releases and restores inert without requiring page-world globals');

const messages = runtime('https://kulms.tl.kansai-u.ac.jp/webclass/msg_editor.php?msgappmode=inbox', `
  <form name="condition"><input type="checkbox" name="autochecker"><table id="MsgListTable"><thead><tr><th></th><th>件名</th></tr></thead><tbody>
  <tr class="odd"><td><input type="checkbox" name="id[0]" value="first"></td><td><a href="/webclass/msg_viewer.php?uomsgid=first">Visible message</a></td></tr>
  <tr class="even"><td><input type="checkbox" name="id[1]" value="second"></td><td><a href="/webclass/msg_viewer.php?uomsgid=second">Hidden second</a></td></tr>
  <tr class="odd"><td><input type="checkbox" name="id[2]" value="third"></td><td><a href="/webclass/msg_viewer.php?uomsgid=third">Hidden third</a></td></tr>
  </tbody></table></form><div id="ku-redesign-root"><div data-message-results></div></div>`);
const messageView = messages.parseMessagesTable(messages.document, 'messages-inbox');
messages.state.currentRoute = { name: 'messages-inbox' };
messages.state.currentView = messageView;
messages.state.messageSearch = 'Visible';
const messageRoot = messages.document.querySelector('#ku-redesign-root');
messages.refreshMessageResults(messageRoot, messageView);
const changeVisibleMaster = (checked) => {
  const checkbox = messageRoot.querySelector('[data-action="message-select-all"]');
  checkbox.checked = checked;
  checkbox.dispatchEvent(new messages.Event('change', { bubbles: true }));
};
changeVisibleMaster(true);
const nativeMaster = messageView.form.elements.autochecker;
assert.equal(messageView.form.elements['id[0]'].checked, true);
assert.equal(messageView.form.elements['id[1]'].checked, false);
assert.equal(messageView.form.elements['id[2]'].checked, false);
assert.equal(nativeMaster.checked, false, 'The native master represents all three native rows, not only the filtered row.');
assert.equal(messageRoot.querySelector('[data-action="message-select-all"]').hasAttribute('checked'), true);
changeVisibleMaster(false);
assert.equal(messages.getMessageSelection(messageView).size, 0);
assert.equal(nativeMaster.checked, false);
messages.state.messageSearch = '';
messages.refreshMessageResults(messageRoot, messageView);
changeVisibleMaster(true);
assert.equal(nativeMaster.checked, true);
messages.state.currentView = { selectionScope: 'messages-outbox', rows: [] };
messages.syncNativeMessageSelection(messageView);
assert.equal(nativeMaster.checked, true, 'Synchronization must use the passed view selection rather than implicit currentView.');
messages.state.currentView = messageView;
changeVisibleMaster(false);
assert.equal(nativeMaster.checked, false);
assert.equal(messageView.rows.some((row) => messageView.form.elements[row.inputName].checked), false);
checks.push('real native message master stays separate from filtered header, and selection/cancel uses the passed view');

// Pagehide removes ephemeral listeners; a BFCache restoration must rebind all supported routes.
assert.equal(typeof manual.state.lmsLinkNavigationCleanup, 'function');
manual.abortInFlightPageRequests();
assert.equal(manual.state.lmsLinkNavigationCleanup, null);
manual.resetPageLifecycleGuards();
manual.rebindHomeInterceptionOnHistoryRestore({ persisted: true });
await nextTurn();
assert.equal(typeof manual.state.lmsLinkNavigationCleanup, 'function', 'BFCache must restore request-safe navigation on non-home routes.');
manual.releaseNative();
assert.equal(native.inert, undefined);
assert.equal(native.hasAttribute('aria-hidden'), false);
checks.push('BFCache restores non-home hydration, and release returns the original native accessibility state');

// Moving the actual login form preserves native handlers, hidden tokens and restoring its original parent.
const login = runtime('https://kulms.tl.kansai-u.ac.jp/webclass/login.php', `
  <div id="login-container" class="container"><h1 id="welcome">Welcome</h1><form name="login" action="/webclass/login.php" method="post">
  <label for="username">User ID</label><input id="username" name="username" type="text"><input name="val" type="password">
  <input name="token" type="hidden" value="offline-token"><input name="login" type="submit" value="Login"></form></div>
  <ul id="AjaxInfoBox"><li><a href="/webclass/information.php/post/1/" class="title">Initial notice</a><div class="data">Admin - 2026/09/14</div></li></ul>`);
const originalForm = login.document.forms.login;
const originalParent = originalForm.parentNode;
await login.init();
assert.equal(login.state.loginNativeForm, originalForm);
assert.equal(originalForm.closest('#ku-redesign-root')?.id, 'ku-redesign-root');
assert.equal(originalForm.querySelector('[name="token"]').value, 'offline-token');
login.document.querySelector('#AjaxInfoBox .title').textContent = 'Updated notice with unchanged row count';
await nextTurn();
await nextTurn();
assert.equal(login.state.currentView.notices.items[0].title, 'Updated notice with unchanged row count');
assert.match(login.document.querySelector('#ku-redesign-root').textContent, /Updated notice with unchanged row count/);
login.releaseNative();
assert.equal(originalForm.parentNode, originalParent);
assert.equal(originalForm.classList.contains('ku-login-form'), false);
assert.equal(login.state.loginNoticeSyncObserver, null);
checks.push('login uses/restores the original form and reacts to same-count native notice mutations');

const notifications = runtime('https://kulms.tl.kansai-u.ac.jp/webclass/information.php/', `<ul class="info-list">
  <li class="head">Page 1 / 1</li><li class="odd"><a class="title mark1" href="/webclass/information.php/post/74688/">Important notice</a>
  <div class="exhibitionInfo">情報学部（2026-秋-火-1限-01739） - 2026/09/14 - 公開期限 : 2027/03/21 23:59</div></li>
  <li class="even"><a class="title" href="/webclass/information.php/post/9237/">Date-only notice</a><div class="exhibitionInfo">Admin - 2020/07/22</div></li></ul>`);
await notifications.init();
assert.equal(notifications.state.currentView.items[0].issuer, '情報学部（2026-秋-火-1限-01739）');
assert.match(notifications.state.currentView.items[0].source, /公開期限/);
for (const [index, row] of [...notifications.document.querySelectorAll('#ku-redesign-root .ku-notice-row')].entries()) {
  const item = notifications.state.currentView.items[index];
  assert.equal(row.querySelector('.ku-mini-meta').textContent, item.issuer);
  assert.equal(row.textContent.split(item.publishedAt).length - 1, 1);
  if (item.deadline) assert.equal(row.textContent.split(item.deadline).length - 1, 1);
}
notifications.releaseNative();
checks.push('notification rows retain issuer plus dates while displaying publication and deadline once each');

// URL normalization must occur before a rich-DOM protocol allowlist, including embedded control characters.
const rich = runtime('https://syllabus3.jm.kansai-u.ac.jp/syllabus/Controller?nendo=2026', '<main></main>');
const dd = rich.document.createElement('dd');
dd.innerHTML = '<p><a href="../ref.pdf" onclick="evil()">Reference</a><a href="java&#10;script:evil()">Bad</a></p><img src="/chart.png" onerror="evil()"><table><tr><td colspan="2">Cells</td></tr></table><math><mi>x</mi></math><svg viewBox="0 0 10 10"><path d="M0 0 L10 10" onload="evil()" /></svg>';
const cleaned = rich.sanitizeSyllabusBodyHtml(dd);
const reparsed = rich.document.createElement('div');
reparsed.innerHTML = cleaned;
assert.equal(reparsed.querySelector('a').getAttribute('href'), 'https://syllabus3.jm.kansai-u.ac.jp/ref.pdf');
assert.equal(reparsed.querySelectorAll('a[href]').length, 1);
assert.equal(reparsed.querySelectorAll('img[src], table, math, svg').length, 4);
assert.equal(reparsed.querySelectorAll('[onclick], [onerror], [onload]').length, 0);
const manualUnsafe = runtime('https://kulms.tl.kansai-u.ac.jp/webclass/user.php/manual', '<main id="js-main"><h2>Reference</h2><p><a href="java&#10;script:evil()">Bad</a><a href="/safe.pdf">Good</a></p></main>');
const manualSections = manualUnsafe.parseManualSections(manualUnsafe.document);
const manualReparsed = manualUnsafe.document.createElement('div');
manualReparsed.innerHTML = manualSections[0].bodyHtml;
assert.equal(manualReparsed.querySelectorAll('a[href^="javascript:"]').length, 0);
assert.equal(manualSections[0].links.some((link) => link.href.startsWith('javascript:')), false);
checks.push('real DOM roundtrip retains safe rich syllabus elements and rejects control-character executable URLs');

// The genuine cross-service queue counts response-body completion, not just fetch headers.
const requests = runtime('https://kulms.tl.kansai-u.ac.jp/webclass/', '<main>Home</main>');
const fetchCalls = [];
const responseBodies = [];
requests.fetch = async (url) => {
  fetchCalls.push(url);
  return { ok: true, status: 200, url, text: () => new Promise((resolve) => responseBodies.push(resolve)) };
};
const first = requests.fetchLmsResource('/webclass/a.php');
const second = requests.fetchLmsResource('/webclass/b.php');
await nextTurn();
assert.equal(fetchCalls.length, 1);
let barrierDone = false;
const barrier = requests.waitForLmsRequestsBeforeNavigation().then((safe) => { barrierDone = true; return safe; });
await assert.rejects(requests.fetchLmsResource('/webclass/c.php'), /navigation is pending/);
responseBodies[0]('{"records":[]}');
await first;
await nextTurn();
assert.equal(fetchCalls.length, 2);
assert.equal(barrierDone, false);
responseBodies[1]('{"records":[]}');
await second;
assert.equal(await barrier, true);
requests.resumeLmsPageRequests();
requests.fetch = async (url) => ({ ok: false, status: 500, url, text: async () => 'error' });
await assert.rejects(requests.fetchLmsResource('/webclass/fail.php'), /LMS HTTP 500/);
assert.equal(await requests.waitForLmsRequestsBeforeNavigation(), false);
assert.equal(requests.state.supplementalCache.size, 0);
checks.push('shared request queue waits through bodies, rejects late work during navigation, and fails closed on HTTP errors');

const returning = runtime('https://kulms.tl.kansai-u.ac.jp/webclass/course.php/26170399', '<div id="ku-redesign-root"><a href="/webclass/course.php/26170399/logout?acs_=offline">Return</a></div>');
const returnRoot = returning.document.querySelector('#ku-redesign-root');
const returnAnchor = returnRoot.querySelector('a');
assert.equal(returning.detectRoute(new URL(returnAnchor.getAttribute('href'), returning.window.location.href)).name, 'course-return');
let returnHandler;
let finishReturnWait;
let returnClicks = 0;
returnRoot.addEventListener = (_name, handler) => { returnHandler = handler; };
returnAnchor.click = () => { returnClicks += 1; };
returning.waitForLmsRequestsBeforeNavigation = () => new Promise((resolve) => { finishReturnWait = resolve; });
returning.bindLmsLinkNavigation(returnRoot);
const returnNavigation = returnHandler({ target: returnAnchor, button: 0, preventDefault() {}, stopImmediatePropagation() {} });
assert.equal(returnClicks, 0);
assert.equal(typeof finishReturnWait, 'function');
finishReturnWait(true);
await returnNavigation;
assert.equal(returnClicks, 1);
checks.push('native course-exit endpoint waits for requests although its page intentionally bypasses redesign');

console.log(JSON.stringify({ ok: true, checks }, null, 2));
