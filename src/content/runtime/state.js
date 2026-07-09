/* src/content/runtime/state.js */

var pageRequestAbortController = typeof AbortController === 'function' ? new AbortController() : null;
var pageIsLeaving = false;
var MESSAGE_CONTEXT_STORAGE_KEY = 'KU_LMS_MESSAGE_CONTEXT_V1';
var DEFAULT_GLOBAL_INBOX_HREF = '/webclass/msg_editor.php?msgappmode=inbox';
var state = {
  homeSearch: '',
  messageSearch: '',
  showSettings: false,
  myReportColumns: {
    preview: true,
    attachments: true,
    comments: true,
    score: true
  },
  supplementalCache: new Map(),
  weekOffset: 0,
  messageSelection: new Set(),
  messageSelectionScopes: new Map(),
  currentView: null,
  currentContext: null,
  currentRoute: null,
  messageContext: null,
  loginNativeForm: null,
  loginNativeFormParent: null,
  loginNativeFormNextSibling: null,
  loginNativeFormSnapshot: null,
  loginNoticeSyncTimer: null,
  extensionSettings: kuNormalizeExtensionSettings(KU_LMS_DEFAULT_SETTINGS),
  kulmsLifecycleBound: false,
  kulmsSettingsListenerBound: false,
  syllabusSettingsListenerBound: false
};

function getDefaultGlobalInboxHref() {
  return absoluteUrl(DEFAULT_GLOBAL_INBOX_HREF);
}

function isSupportedMessageContextSourceRoute(routeName = '') {
  return routeName === 'course-materials' || routeName === 'course-myreports' || routeName === 'course-scores';
}

function isMessageRouteName(routeName = '') {
  return /^messages-/.test(routeName || '');
}

function isGlobalMessageResetRoute(routeName = '') {
  return routeName === 'home'
    || routeName === 'home-all-upcoming'
    || routeName === 'notifications'
    || routeName === 'notifications-detail'
    || routeName === 'manual'
    || routeName === 'login'
    || routeName === 'logout';
}

function normalizeMessageUrlForComparison(href = '') {
  if (!href) return '';
  try {
    const url = new URL(absoluteUrl(href));
    return `${url.origin}${url.pathname}${url.search}`;
  } catch (error) {
    return absoluteUrl(href);
  }
}

function areMessageHrefsEqual(left = '', right = '') {
  return normalizeMessageUrlForComparison(left) === normalizeMessageUrlForComparison(right);
}

function isCanonicalInboxHref(href = '') {
  if (!href) return false;
  try {
    const url = new URL(absoluteUrl(href));
    return url.pathname.replace(/\/$/, '') === '/webclass/msg_editor.php' && url.searchParams.get('msgappmode') === 'inbox';
  } catch (error) {
    return false;
  }
}

function isObservedMobileMessageHref(href = '') {
  if (!href) return false;
  try {
    const url = new URL(absoluteUrl(href));
    return /\/webclass\/mbl\.php\/messages\/?$/.test(url.pathname.replace(/\/$/, ''));
  } catch (error) {
    return false;
  }
}

function normalizeInboxHref(href = '', fallback = '') {
  if (isCanonicalInboxHref(href)) return absoluteUrl(href);
  if (fallback && isCanonicalInboxHref(fallback)) return absoluteUrl(fallback);
  return '';
}

function normalizeMessageContextPayload(payload = {}, fallbackGlobalInboxHref = '') {
  const globalInboxHref = normalizeInboxHref(payload.globalInboxHref, fallbackGlobalInboxHref) || getDefaultGlobalInboxHref();
  const contextualInboxHref = normalizeInboxHref(payload.contextualInboxHref);
  const contextSourceRoute = contextualInboxHref && isSupportedMessageContextSourceRoute(payload.contextSourceRoute)
    ? payload.contextSourceRoute
    : '';
  const canonicalMessageHref = normalizeInboxHref(payload.canonicalMessageHref)
    || contextualInboxHref
    || globalInboxHref;
  const observedMobileMessageHref = isObservedMobileMessageHref(payload.observedMobileMessageHref)
    ? absoluteUrl(payload.observedMobileMessageHref)
    : '';
  return {
    globalInboxHref,
    contextualInboxHref,
    contextSourceRoute,
    canonicalMessageHref,
    observedMobileMessageHref
  };
}

function readPersistedMessageContext() {
  try {
    const raw = window.sessionStorage?.getItem(MESSAGE_CONTEXT_STORAGE_KEY) || '';
    if (!raw) return null;
    return normalizeMessageContextPayload(JSON.parse(raw));
  } catch (error) {
    return null;
  }
}

function writePersistedMessageContext(payload = {}) {
  const normalized = normalizeMessageContextPayload(payload);
  try {
    window.sessionStorage?.setItem(MESSAGE_CONTEXT_STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    console.warn('[KU Redesign] failed to persist message context', error);
  }
  return normalized;
}

function clearPersistedMessageContext() {
  try {
    window.sessionStorage?.removeItem(MESSAGE_CONTEXT_STORAGE_KEY);
  } catch (error) {
    console.warn('[KU Redesign] failed to clear message context', error);
  }
}

function setActiveMessageContext(payload = {}, options = {}) {
  const normalized = normalizeMessageContextPayload(payload);
  state.messageContext = normalized;
  if (state.currentContext) {
    state.currentContext.messageContext = normalized;
    state.currentContext.links = state.currentContext.links || {};
    state.currentContext.links.globalInboxHref = normalized.globalInboxHref;
    state.currentContext.links.contextualInboxHref = normalized.contextualInboxHref;
    state.currentContext.links.contextSourceRoute = normalized.contextSourceRoute;
    state.currentContext.links.canonicalMessageHref = normalized.canonicalMessageHref;
    state.currentContext.links.observedMobileMessageHref = normalized.observedMobileMessageHref;
    state.currentContext.links.messages = normalized.globalInboxHref;
  }
  if (options.persist === false) return normalized;
  return writePersistedMessageContext(normalized);
}

function resetActiveMessageContext(globalInboxHref = '') {
  clearPersistedMessageContext();
  return setActiveMessageContext({
    globalInboxHref,
    contextualInboxHref: '',
    contextSourceRoute: '',
    canonicalMessageHref: globalInboxHref || getDefaultGlobalInboxHref()
  });
}

function getActiveMessageContext() {
  return state.currentContext?.messageContext
    || state.messageContext
    || readPersistedMessageContext()
    || normalizeMessageContextPayload({
      globalInboxHref: state.currentContext?.links?.globalInboxHref || state.currentContext?.links?.messages || getDefaultGlobalInboxHref()
    });
}

function detectRouteFromHref(href = '') {
  if (!href) return { supported: false, name: '' };
  try {
    return detectRoute(new URL(absoluteUrl(href)));
  } catch (error) {
    return { supported: false, name: '' };
  }
}
