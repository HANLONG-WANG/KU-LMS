import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { getKulmsScript, readOrderedSource } from './lib/content-source.mjs';

const checks = [];
const read = (path) => fs.readFileSync(path, 'utf8');
const tick = () => new Promise((resolve) => setImmediate(resolve));
// These credentials are synthetic fixtures; no browser profile is read.
const username = 'offline-fixture-user';
const password = 'offline-fixture-password';
const settingsKey = 'kuLmsSettingsV1';

function environment(html, storedSettings = {}, delayedWrites = false) {
  const dom = parseHTML(html);
  const logs = [];
  const writes = [];
  const listeners = [];
  const storage = new Map([[settingsKey, storedSettings]]);
  const session = new Map();
  const timers = new Map();
  const callbacks = [];
  let timerId = 0;
  let networkCalls = 0;
  const chrome = {
    runtime: { lastError: null },
    storage: {
      local: {
        get(_keys, callback) { callback(Object.fromEntries(storage)); },
        set(payload, callback) {
          writes.push(payload);
          for (const [key, value] of Object.entries(payload)) storage.set(key, value);
          if (delayedWrites) callbacks.push(callback);
          else callback();
        }
      },
      onChanged: { addListener(fn) { listeners.push(fn); } }
    }
  };
  const window = {
    document: dom.document, HTMLInputElement: dom.window.HTMLInputElement,
    location: new URL('https://kulms.tl.kansai-u.ac.jp/webclass/login.php'),
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener() {}, removeEventListener() {},
    sessionStorage: { getItem: (key) => session.get(key) || null, setItem: (key, value) => session.set(key, String(value)), removeItem: (key) => session.delete(key) }
  };
  const context = {
    window, document: dom.document, chrome, Event: dom.window.Event,
    URL, URLSearchParams, AbortController, DOMException,
    setTimeout: window.setTimeout, clearTimeout: window.clearTimeout,
    console: Object.fromEntries(['log', 'warn', 'error'].map((level) => [level, (...args) => logs.push(args.map(String).join(' '))])),
    fetch() { networkCalls += 1; throw new Error('Real network is disabled in this verifier'); }
  };
  vm.createContext(context);
  return {
    context, writes, timers, logs, storage,
    emitSettings(settings, area = 'local') {
      storage.set(settingsKey, settings);
      for (const listener of listeners) listener({ [settingsKey]: { newValue: settings } }, area);
    },
    finishWrite(failure = false) {
      chrome.runtime.lastError = failure ? { message: password } : null;
      callbacks.shift()?.();
      chrome.runtime.lastError = null;
    },
    flushTimers() {
      for (const [id, callback] of [...timers]) { timers.delete(id); callback(); }
    },
    assertNoLeaks() {
      const status = context.document.getElementById('status')?.textContent || '';
      assert.ok(!status.includes(password) && !status.includes(username), 'Status must not expose saved credential values');
      assert.ok(logs.every((message) => !message.includes(password) && !message.includes(username)), 'Logs must not expose saved credential values');
      assert.equal(networkCalls, 0, 'Every test must remain offline');
    }
  };
}

function login(settings = { enabled: true, username, password }) {
  const env = environment('<html><body><form id="login-form"><input name="username" type="text"><input name="val" type="password"><input type="submit" name="login" value="Login"></form></body></html>', settings);
  const { context } = env;
  const files = getKulmsScript().js.filter((path) => path !== 'src/content/main.js');
  vm.runInContext(readOrderedSource(files), context, { filename: 'offline-login-source.js' });
  context.document.documentElement.dataset.kuRedesignState = 'ready';
  context.state.currentRoute = { name: 'login' };
  context.state.extensionSettings = context.kuNormalizeExtensionSettings(settings);
  const form = context.document.getElementById('login-form');
  let submits = 0;
  form.requestSubmit = () => { submits += 1; };
  form.submit = () => { submits += 1; };
  context.state.loginNativeForm = form;
  context.bindKulmsExtensionSettingsListener();
  return { ...env, form, submits: () => submits };
}

{
  const env = login();
  const { context, form } = env;
  assert.equal(context.KU_LMS_DEFAULT_SETTINGS.autoLogin, true);
  assert.equal(context.kuNormalizeExtensionSettings({}).autoLogin, true, 'Legacy settings preserve the intended automatic-login behavior');
  for (const value of [null, false, 'true', 1, {}]) {
    assert.equal(context.kuNormalizeExtensionSettings({ autoLogin: value }).autoLogin, false);
  }
  assert.equal(context.kuNormalizeExtensionSettings({ autoLogin: true }).autoLogin, true);
  context.fillAndMaybeSubmitLoginForm(form);
  assert.equal(form.querySelector('[name="username"]').value, username);
  assert.equal(form.querySelector('[name="val"]').value, password);
  assert.equal(env.timers.size, 1, 'Legacy saved settings preserve automatic login through the synthetic submit stub');
  env.flushTimers();
  assert.equal(env.submits(), 1);
  context.fillAndMaybeSubmitLoginForm(form);
  assert.equal(env.timers.size, 0, 'Legacy automatic login still obeys the one-attempt guard');
  env.assertNoLeaks();
  checks.push('legacy settings preserve automatic login and reject non-boolean flag coercion');
}
{
  const env = login({ enabled: true, autoLogin: false, username, password });
  const { context, form } = env;
  context.fillAndMaybeSubmitLoginForm(form);
  assert.equal(form.querySelector('[name="username"]').value, username);
  assert.equal(form.querySelector('[name="val"]').value, password);
  assert.equal(env.timers.size, 0, 'Explicitly disabling automatic login still fills without scheduling submission');
  context.submitLoginForm(form, { username, password });
  assert.equal(env.submits(), 0, 'Explicitly disabling automatic login blocks the direct submission entry');
  env.assertNoLeaks();
  checks.push('explicit automatic-login off fills credentials without submission');
}
{
  const env = login({ enabled: true, autoLogin: false, username, password });
  env.emitSettings({ enabled: true, autoLogin: true, username, password });
  assert.equal(env.timers.size, 1, 'Explicit opt-in queues exactly one synthetic submission');
  const oldCallback = [...env.timers.values()][0];
  env.context.fillAndMaybeSubmitLoginForm(env.form);
  assert.equal(env.timers.size, 1, 'Repeated hydration must not duplicate the pending submit');
  env.emitSettings({ enabled: true, autoLogin: false, username, password });
  assert.equal(env.timers.size, 0, 'Turning auto-login off must cancel the pending timer');
  oldCallback();
  assert.equal(env.submits(), 0, 'A stale canceled callback cannot submit');
  env.emitSettings({ enabled: true, autoLogin: true, username, password });
  assert.equal(env.timers.size, 1, 'Explicitly re-enabling auto-login can schedule a fresh attempt');
  env.flushTimers();
  assert.equal(env.submits(), 1, 'Only the current opt-in attempt reaches the submission stub');
  env.context.fillAndMaybeSubmitLoginForm(env.form);
  assert.equal(env.timers.size, 0, 'The per-tab attempt guard prevents repeated auto-submission');
  env.assertNoLeaks();
  checks.push('opt-in settings changes cancel, invalidate and safely reschedule one attempt');
}
{
  const env = login({ enabled: true, autoLogin: true, username, password });
  env.context.document.documentElement.dataset.kuAuditNoSubmit = 'true';
  env.context.fillAndMaybeSubmitLoginForm(env.form);
  assert.equal(env.timers.size, 0, 'The audit guard blocks scheduling despite explicit opt-in');
  delete env.context.document.documentElement.dataset.kuAuditNoSubmit;
  env.context.fillAndMaybeSubmitLoginForm(env.form);
  assert.equal(env.timers.size, 1);
  env.context.document.documentElement.dataset.kuAuditNoSubmit = 'true';
  env.flushTimers();
  assert.equal(env.submits(), 0, 'The audit guard is rechecked when a queued callback runs');
  env.assertNoLeaks();
  checks.push('audit no-submit guard blocks both queueing and delayed submission');
}
{
  const env = login({ enabled: true, autoLogin: true, username, password });
  env.context.fillAndMaybeSubmitLoginForm(env.form);
  env.emitSettings({ enabled: false, autoLogin: true, username, password });
  assert.equal(env.timers.size, 0);
  env.flushTimers();
  assert.equal(env.submits(), 0, 'Disabling the extension cancels opted-in auto-login');
  env.assertNoLeaks();
  checks.push('extension disable cancels automatic login');
}
{
  const env = environment(read('src/popup/popup.html'), { enabled: true, username, password }, true);
  const { context } = env;
  vm.runInContext(read('src/shared/settings.js') + '\n' + read('src/popup/popup.js'), context, { filename: 'offline-popup-source.js' });
  await tick();
  const doc = context.document;
  const enabled = doc.getElementById('enabled');
  const autoLogin = doc.getElementById('auto-login');
  const userInput = doc.getElementById('username');
  const passInput = doc.getElementById('password');
  const saveButton = doc.getElementById('save');
  assert.equal(enabled.checked, true);
  assert.equal(autoLogin.checked, true, 'A legacy popup setting must display the intended automatic-login default');
  assert.equal(userInput.value, username);
  assert.equal(passInput.value, password);
  assert.equal(passInput.type, 'password');
  assert.equal(autoLogin.getAttribute('role'), 'switch');
  autoLogin.checked = true;
  autoLogin.dispatchEvent(new context.Event('change', { bubbles: true }));
  assert.equal(env.writes.length, 0, 'The opt-in checkbox follows the explicit Save form flow');
  userInput.value = ` ${username} `;
  const submitEvent = new context.Event('submit', { bubbles: true, cancelable: true });
  doc.getElementById('settings-form').dispatchEvent(submitEvent);
  assert.equal(submitEvent.defaultPrevented, true, 'Popup form submission is local settings persistence only');
  assert.equal(saveButton.disabled, true);
  assert.equal(env.writes.length, 1);
  const payload = env.writes[0][settingsKey];
  assert.deepEqual(Object.keys(payload).sort(), ['autoLogin', 'enabled', 'password', 'username']);
  assert.equal(payload.autoLogin, true);
  assert.equal(payload.enabled, true);
  assert.equal(payload.username, username);
  assert.equal(payload.password, password);
  env.finishWrite();
  await tick();
  assert.equal(saveButton.disabled, false);
  assert.equal(doc.getElementById('status').textContent, '已保存。');
  doc.getElementById('show-password').checked = true;
  doc.getElementById('show-password').dispatchEvent(new context.Event('change', { bubbles: true }));
  assert.equal(passInput.type, 'text');
  assert.equal(env.writes.length, 1, 'Password visibility must not trigger persistence');
  enabled.checked = false;
  autoLogin.checked = false;
  enabled.dispatchEvent(new context.Event('change', { bubbles: true }));
  assert.equal(env.writes[1][settingsKey].enabled, false);
  assert.equal(env.writes[1][settingsKey].autoLogin, false);
  env.finishWrite(true);
  await tick();
  assert.equal(saveButton.disabled, false);
  assert.equal(doc.getElementById('status').textContent, '保存失败。');
  assert.equal(doc.getElementById('status').classList.contains('error'), true);
  env.assertNoLeaks();
  checks.push('real popup DOM initializes legacy settings and persists explicit opt-in payloads');
  checks.push('popup visibility and failure feedback never leak credential values');
}

{
  for (const [userLabel, passwordLabel] of [['ユーザID', 'パスワード'], ['User ID', 'Password']]) {
    const env = login();
    const { context, form } = env;
    const doc = context.document;
    doc.documentElement.dataset.kuAuditNoSubmit = 'true';
    const originalParent = doc.createElement('section');
    doc.body.insertBefore(originalParent, form);
    originalParent.appendChild(form);
    const userInput = form.querySelector('[name="username"]');
    const passInput = form.querySelector('[name="val"]');
    userInput.id = 'native-user';
    passInput.id = 'native-password';
    const labelA = doc.createElement('label');
    labelA.setAttribute('for', userInput.id);
    labelA.className = 'sr-only original-user-label';
    labelA.setAttribute('style', 'color: navy');
    labelA.textContent = userLabel;
    const labelB = doc.createElement('label');
    labelB.setAttribute('for', passInput.id);
    labelB.className = 'visually-hidden original-password-label';
    labelB.textContent = passwordLabel;
    form.insertBefore(labelA, userInput);
    form.insertBefore(labelB, passInput);
    const originalA = labelA.className;
    const originalB = labelB.className;
    const root = doc.createElement('div');
    root.innerHTML = '<div data-ku-login-native-form-host></div>';
    doc.body.appendChild(root);
    context.hydrateLoginForm(root);
    assert.equal(form.parentNode, root.querySelector('[data-ku-login-native-form-host]'));
    assert.equal(labelA.classList.contains('sr-only'), false);
    assert.equal(labelB.classList.contains('visually-hidden'), false);
    assert.equal(labelA.classList.contains('ku-login-native-label'), true);
    assert.equal(labelB.classList.contains('ku-login-native-label'), true);
    assert.equal(labelA.textContent, userLabel);
    assert.equal(labelB.textContent, passwordLabel);
    assert.equal(labelA.getAttribute('for'), userInput.id);
    assert.equal(labelB.getAttribute('for'), passInput.id);
    assert.equal(env.timers.size, 0, 'Hydration under the audit guard must not queue automatic login');
    context.restoreNativeLoginForm();
    assert.equal(form.parentNode, originalParent);
    assert.equal(labelA.className, originalA, 'Returning to the native page restores the original sr-only class');
    assert.equal(labelB.className, originalB, 'Returning to the native page restores the original visually-hidden class');
    assert.equal(labelA.getAttribute('style'), 'color: navy');
    assert.equal(labelA.getAttribute('for'), userInput.id);
    assert.equal(labelB.getAttribute('for'), passInput.id);
    assert.equal(env.submits(), 0);
    env.assertNoLeaks();
  }
  checks.push('Japanese and English native labels are shown during hydration and restored exactly');
}

{
  for (const removeNextSibling of [false, true]) {
    const env = login();
    const { context, form } = env;
    const doc = context.document;
    doc.documentElement.dataset.kuAuditNoSubmit = 'true';
    assert.equal(form.parentNode, doc.body, 'The fixture must start with a form directly under body');
    form.className = 'original-body-login';
    form.setAttribute('style', 'margin: 1px');
    const label = doc.createElement('label');
    label.className = 'sr-only original-body-label';
    label.textContent = 'User ID';
    form.prepend(label);
    const originalNext = doc.createElement('aside');
    doc.body.appendChild(originalNext);
    const root = doc.createElement('div');
    root.id = context.ROOT_ID;
    root.innerHTML = '<section><div data-ku-login-native-form-host></div></section>';
    doc.body.appendChild(root);
    context.hydrateLoginForm(root);
    assert.notEqual(form.parentNode, doc.body);
    assert.equal(doc.body.contains(form), true, 'A descendant form is not already restored merely because body contains it');
    assert.equal(label.classList.contains('sr-only'), false);
    if (removeNextSibling) originalNext.remove();
    assert.doesNotThrow(() => env.emitSettings({ enabled: false, autoLogin: true, username, password }));
    assert.equal(doc.getElementById('login-form'), form, 'Disabling the extension must preserve the original native form object');
    assert.equal(form.isConnected, true, 'Removing the extension root must not remove the restored native form');
    assert.equal(form.parentNode, doc.body);
    assert.equal(root.isConnected, false);
    assert.equal(form.className, 'original-body-login');
    assert.equal(form.getAttribute('style'), 'margin: 1px');
    assert.equal(label.className, 'sr-only original-body-label');
    if (removeNextSibling) assert.equal(form.nextSibling, null, 'A removed original sibling should use safe append fallback');
    else assert.equal(form.nextSibling, originalNext, 'A surviving original sibling should retain the original form position');
    assert.equal(env.submits(), 0);
    env.assertNoLeaks();
  }
  checks.push('body-level native forms survive disabling a nested extension root with original classes');
  checks.push('removed native-form next siblings use safe append restoration');
}

{
  for (const [originalInert, originalAria] of [[false, 'false'], [false, null], [true, 'true']]) {
    const env = login();
    const { context, form } = env;
    const doc = context.document;
    doc.documentElement.dataset.kuAuditNoSubmit = 'true';
    form.inert = originalInert;
    if (originalAria == null) form.removeAttribute('aria-hidden');
    else form.setAttribute('aria-hidden', originalAria);
    const root = doc.createElement('div');
    root.id = context.ROOT_ID;
    root.innerHTML = '<div data-ku-login-native-form-host></div>';
    doc.body.appendChild(root);
    context.hideNativePageForExtension(context.ROOT_ID);
    assert.equal(form.inert, true, 'Takeover should initially isolate the body-level native form');
    assert.equal(form.getAttribute('aria-hidden'), 'true');
    context.hydrateLoginForm(root);
    assert.equal(form.parentNode, root.querySelector('[data-ku-login-native-form-host]'));
    assert.equal(form.inert, originalInert, 'Moving the form into the extension must restore its pre-takeover inert policy');
    assert.equal(form.getAttribute('aria-hidden'), originalAria, 'Moving the form into the extension must restore the exact original ARIA value');
    if (!originalInert) {
      const input = form.querySelector('[name="username"]');
      assert.equal(input.isConnected, true);
      assert.equal(input.hasAttribute('disabled'), false);
      assert.equal(input.classList.contains('ku-login-input'), true);
      input.value = 'offline-manual-edit';
      input.dispatchEvent(new context.Event('input', { bubbles: true }));
      assert.equal(input.value, 'offline-manual-edit', 'The hydrated username control accepts user edits');
    }
    env.emitSettings({ enabled: false, autoLogin: true, username, password });
    assert.equal(doc.getElementById('login-form'), form);
    assert.equal(form.parentNode, doc.body);
    assert.equal(form.isConnected, true);
    assert.equal(root.isConnected, false);
    assert.equal(form.inert, originalInert);
    assert.equal(form.getAttribute('aria-hidden'), originalAria);
    assert.equal(context.state.nativePageVisibility.has(context.ROOT_ID), false);
    assert.equal(env.submits(), 0);
    env.assertNoLeaks();
  }
  checks.push('takeover-hydration restores body-form editability and preserves original inert/ARIA policy');
}

console.log(JSON.stringify({ ok: true, scope: 'linkedom DOM with synthetic storage, timers and submit stubs; no browser/profile/network', checks }, null, 2));
