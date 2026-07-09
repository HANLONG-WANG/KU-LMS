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
    nativeForm.querySelectorAll('label').forEach((label) => label.classList.add('ku-login-label', 'ku-login-native-label'));
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
    stopLoginNoticeSync();
    if (state.currentRoute?.name !== 'login' || view?.notices?.items?.length) return;
    let attempts = 0;
    const trySync = () => {
      if (state.currentRoute?.name !== 'login') {
        stopLoginNoticeSync();
        return;
      }
      const notices = parseLoginNotices(document);
      const previous = state.currentView?.notices || { items: [], moreHref: '' };
      const noticeChanged = previous.items.length !== notices.items.length || previous.moreHref !== notices.moreHref;
      if ((notices.items.length || notices.moreHref) && noticeChanged) {
        state.currentView = { ...state.currentView, notices };
        rerender();
        return;
      }
      attempts += 1;
      if (attempts >= 20) {
        stopLoginNoticeSync();
        return;
      }
      state.loginNoticeSyncTimer = window.setTimeout(trySync, 300);
    };
    state.loginNoticeSyncTimer = window.setTimeout(trySync, 300);
  }

function stopLoginNoticeSync() {
    if (state.loginNoticeSyncTimer) {
      window.clearTimeout(state.loginNoticeSyncTimer);
      state.loginNoticeSyncTimer = null;
    }
  }

function restoreNativeLoginForm() {
    const nativeForm = state.loginNativeForm;
    const parent = state.loginNativeFormParent;
    if (!nativeForm || !parent || parent.contains(nativeForm)) return;
    restoreLoginFormSnapshot(state.loginNativeFormSnapshot);
    parent.insertBefore(nativeForm, state.loginNativeFormNextSibling);
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
    if (!form || state.currentRoute?.name !== 'login') return;
    const settings = state.extensionSettings || kuNormalizeExtensionSettings(KU_LMS_DEFAULT_SETTINGS);
    if (!settings.enabled || !settings.username || !settings.password) return;
    const usernameInput = form.querySelector('input[name="username"], input[type="text"], input[autocomplete="username"]');
    const passwordInput = form.querySelector('input[name="val"], input[type="password"], input[autocomplete="current-password"]');
    if (!usernameInput || !passwordInput) return;

    setLoginInputValue(usernameInput, settings.username);
    setLoginInputValue(passwordInput, settings.password);

    if (parseLoginAlert(document, form) || hasAutoLoginAttempted()) return;
    if (!markAutoLoginAttempted()) return;
    window.setTimeout(() => submitLoginForm(form), 100);
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

function submitLoginForm(form) {
    const submitter = form.querySelector('input[type="submit"], button[type="submit"]');
    const loginControl = submitter || form.querySelector('input[name="login"], button[name="login"]');
    if (typeof form.requestSubmit === 'function') {
      try {
        form.requestSubmit(submitter || undefined);
        return;
      } catch (error) {
        // Fall through to the native click/submit path for older form variants.
      }
    }
    if (loginControl && typeof loginControl.click === 'function') {
      loginControl.click();
      return;
    }
    form.submit();
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
