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
