/* src/content/runtime/state.js */

var pageRequestAbortController = typeof AbortController === 'function' ? new AbortController() : null;
var pageIsLeaving = false;
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
  loginNativeForm: null,
  loginNativeFormParent: null,
  loginNativeFormNextSibling: null,
  loginNativeFormSnapshot: null,
  loginNoticeSyncTimer: null
};
