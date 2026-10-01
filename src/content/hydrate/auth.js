/* src/content/hydrate/auth.js */

function hydrateRouteDom(root, route, view) {
    if (route.name === 'login') {
      hydrateLoginForm(root);
      syncLoginNotices(view);
      return;
    }
    stopLoginNoticeSync();
  }

function hydrateLoginForm(root) {
    const host = root.querySelector('[data-ku-login-native-form-host]');
    if (!host) return;
    const nativeForm = state.loginNativeForm || document.forms.login || document.querySelector('form[name="login"], form[action*="/webclass/login.php"]');
    if (!nativeForm) return;
    state.loginNativeForm = nativeForm;
    if (!state.loginNativeFormParent) {
      state.loginNativeFormParent = nativeForm.parentNode || null;
      state.loginNativeFormNextSibling = nativeForm.nextSibling || null;
    }
    if (!state.loginNativeFormSnapshot) {
      state.loginNativeFormSnapshot = captureLoginFormSnapshot(nativeForm);
    }
    markHydratedLoginFormDecorations(nativeForm);
    nativeForm.classList.add('ku-login-form');
    nativeForm.removeAttribute('style');
    nativeForm.querySelectorAll('.form-group').forEach((group) => group.classList.add('ku-login-field'));
    nativeForm.querySelectorAll('label').forEach((label) => {
      label.classList.remove('sr-only', 'visually-hidden');
      label.classList.add('ku-login-label', 'ku-login-native-label');
    });
    nativeForm.querySelectorAll('input[type="text"], input[type="password"]').forEach((input) => {
      input.classList.add('ku-login-input');
      input.removeAttribute('style');
    });
    nativeForm.querySelectorAll('input[type="submit"], button[type="submit"]').forEach((button) => {
      button.classList.add('ku-button', 'ku-login-submit');
      button.classList.remove('btn', 'btn-primary');
      button.removeAttribute('style');
    });
    host.replaceChildren(nativeForm);
    const visibility = state.nativePageVisibility?.get(ROOT_ID)?.snapshots?.get(nativeForm);
    if (visibility) {
      nativeForm.inert = visibility.inert;
      if (visibility.ariaHidden == null) nativeForm.removeAttribute('aria-hidden');
      else nativeForm.setAttribute('aria-hidden', visibility.ariaHidden);
    }
    fillAndMaybeSubmitLoginForm(nativeForm);
  }

function markHydratedLoginFormDecorations(form) {
    form.querySelectorAll('img').forEach((image) => image.classList.add('ku-login-native-extra'));
    form.querySelectorAll('p, .description').forEach((node) => {
      const text = cleanText(node.textContent);
      const hasInteractiveContent = !!node.querySelector('input, button, select, textarea, label, a');
      if (!hasInteractiveContent && (node.querySelector('img') || /ようこそWebClassへ|Welcome to KU-LMS|ユーザIDとパスワード/.test(text))) {
        node.classList.add('ku-login-native-extra');
      }
    });
  }

function syncLoginNotices(view) {
  if (state.currentRoute?.name !== 'login' || state.extensionSettings?.enabled === false || isPageLeaving()) {
    stopLoginNoticeSync();
    return;
  }
  if (state.loginNoticeSyncObserver || state.loginNoticeSyncTimer != null) return;
  const version = state.pageTaskVersion;
  const trySync = () => {
    if (!isCurrentPageTask(version) || state.currentRoute?.name !== 'login') {
      stopLoginNoticeSync();
      return;
    }
    const notices = parseLoginNotices(document);
    const previous = state.currentView?.notices || { items: [], moreHref: '' };
    if (JSON.stringify(previous) !== JSON.stringify(notices)) {
      state.currentView = { ...state.currentView, notices };
      rerender();
    }
  };
  if (typeof MutationObserver === 'function') {
    state.loginNoticeSyncObserver = new MutationObserver((records) => {
      if (records.some((record) => !isExtensionOwnedNode(record.target))) trySync();
    });
    state.loginNoticeSyncObserver.observe(document.body || document.documentElement, { childList: true, characterData: true, attributes: true, attributeFilter: ['href', 'class'], subtree: true });
  } else {
    const poll = () => {
      state.loginNoticeSyncTimer = null;
      trySync();
      if (isCurrentPageTask(version) && state.currentRoute?.name === 'login') state.loginNoticeSyncTimer = window.setTimeout(poll, 1000);
    };
    state.loginNoticeSyncTimer = window.setTimeout(poll, 1000);
  }
  trySync();
}

function stopLoginNoticeSync() {
  if (state.loginNoticeSyncTimer != null) {
    window.clearTimeout(state.loginNoticeSyncTimer);
    state.loginNoticeSyncTimer = null;
  }
  state.loginNoticeSyncObserver?.disconnect();
  state.loginNoticeSyncObserver = null;
}

function restoreNativeLoginForm() {
  const nativeForm = state.loginNativeForm;
  const parent = state.loginNativeFormParent;
  if (!nativeForm) return;
  restoreLoginFormSnapshot(state.loginNativeFormSnapshot);
  if (!parent || nativeForm.parentNode === parent) return;
  const next = state.loginNativeFormNextSibling;
  parent.insertBefore(nativeForm, next?.parentNode === parent ? next : null);
}

function captureLoginFormSnapshot(form) {
    return [form, ...form.querySelectorAll('*')].map((element) => ({
      element,
      className: element.className,
      style: element.getAttribute('style')
    }));
  }

function restoreLoginFormSnapshot(snapshot = []) {
    (snapshot || []).forEach((entry) => {
      if (!entry?.element) return;
      entry.element.className = entry.className || '';
      if (entry.style == null) entry.element.removeAttribute('style');
      else entry.element.setAttribute('style', entry.style);
    });
  }

function fillAndMaybeSubmitLoginForm(form) {
  if (!form || state.currentRoute?.name !== 'login' || isPageLeaving()) return;
  const settings = state.extensionSettings || kuNormalizeExtensionSettings(KU_LMS_DEFAULT_SETTINGS);
  if (!settings.enabled || !settings.username || !settings.password) return;
  const usernameInput = form.querySelector('input[name="username"], input[type="text"], input[autocomplete="username"]');
  const passwordInput = form.querySelector('input[name="val"], input[type="password"], input[autocomplete="current-password"]');
  if (!usernameInput || !passwordInput) return;
  if (state.loginAutoSubmitTimer != null) return;

  setLoginInputValue(usernameInput, settings.username);
  setLoginInputValue(passwordInput, settings.password);
  if (settings.autoLogin !== true || document.documentElement?.dataset?.kuAuditNoSubmit === 'true') return;
  if (parseLoginAlert(document, form) || hasAutoLoginAttempted()) return;
  if (!markAutoLoginAttempted()) return;
  const version = state.loginAutoSubmitVersion = (state.loginAutoSubmitVersion || 0) + 1;
  const credentials = { username: settings.username, password: settings.password };
  state.loginAutoSubmitTimer = window.setTimeout(() => {
    state.loginAutoSubmitTimer = null;
    if (version !== state.loginAutoSubmitVersion) return;
    submitLoginForm(form, credentials);
  }, 100);
}

function setLoginInputValue(input, value) {
    try {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(input, value);
      else input.value = value;
    } catch (error) {
      input.value = value;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

function submitLoginForm(form, credentials) {
  const settings = state.extensionSettings;
  if (!form || form.isConnected === false || state.currentRoute?.name !== 'login' || !settings?.enabled || settings.autoLogin !== true || document.documentElement?.dataset?.kuAuditNoSubmit === 'true' || isPageLeaving()) return;
  if (credentials && (settings.username !== credentials.username || settings.password !== credentials.password)) return;
  if (credentials) {
    const usernameInput = form.querySelector('input[name="username"], input[type="text"], input[autocomplete="username"]');
    const passwordInput = form.querySelector('input[name="val"], input[type="password"], input[autocomplete="current-password"]');
    if (usernameInput?.value !== credentials.username || passwordInput?.value !== credentials.password) return;
  }
  const submitter = form.querySelector('input[type="submit"], button[type="submit"]');
  const loginControl = submitter || form.querySelector('input[name="login"], button[name="login"]');
  return withNativeInteraction(form, () => {
    if (typeof form.requestSubmit === 'function') {
      form.requestSubmit(submitter || undefined);
      return;
    }
    if (loginControl && typeof loginControl.click === 'function') {
      loginControl.click();
      return;
    }
    if (typeof form.checkValidity === 'function' && !form.checkValidity()) {
      form.reportValidity?.();
      return;
    }
    form.submit();
  });
}

function autoLoginAttemptStorageKey() {
    return 'KU_LMS_AUTO_LOGIN_ATTEMPTED_V1';
  }

function hasAutoLoginAttempted() {
    try {
      const raw = window.sessionStorage?.getItem(autoLoginAttemptStorageKey()) || '';
      if (!raw) return false;
      const attempted = JSON.parse(raw);
      return attempted?.username === (state.extensionSettings?.username || '');
    } catch (error) {
      return true;
    }
  }

function markAutoLoginAttempted() {
    try {
      window.sessionStorage?.setItem(autoLoginAttemptStorageKey(), JSON.stringify({
        username: state.extensionSettings?.username || '',
        attemptedAt: new Date().toISOString()
      }));
      return window.sessionStorage?.getItem(autoLoginAttemptStorageKey()) ? true : false;
    } catch (error) {
      // If sessionStorage is unavailable, fail closed and do not submit automatically.
      return false;
    }
  }

function clearAutoLoginAttempt() {
    try {
      window.sessionStorage?.removeItem(autoLoginAttemptStorageKey());
    } catch (error) {
      // Ignore storage failures; the user can still submit the filled form manually.
    }
  }

function cancelAutoLoginSubmission() {
  state.loginAutoSubmitVersion = (state.loginAutoSubmitVersion || 0) + 1;
  if (state.loginAutoSubmitTimer != null) {
    window.clearTimeout(state.loginAutoSubmitTimer);
    state.loginAutoSubmitTimer = null;
    clearAutoLoginAttempt();
  }
}
