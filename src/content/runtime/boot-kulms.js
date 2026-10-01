/* src/content/runtime/boot-kulms.js */

async function bootKulms(options = {}) {
  bindKulmsLifecycleListeners();
  bindKulmsExtensionSettingsListener();
  const version = state.pageTaskVersion = (state.pageTaskVersion || 0) + 1;

  if (!options.skipSettingsCheck) {
    const settings = await kuReadExtensionSettings();
    if (version !== state.pageTaskVersion) return;
    state.extensionSettings = settings;
  }
  if (state.extensionSettings?.enabled === false) {
    releaseNative();
    return;
  }
  resetPageLifecycleGuards();
  const route = detectRoute(window.location);
  // Course login is a native JavaScript redirect; collect only on the destination materials page.
  if (route.name === 'course-entry') {
    releaseNative();
    return;
  }
  if (route.name === 'course-return') {
    resetActiveMessageContext();
    releaseNative();
    return;
  }
  document.documentElement.dataset.kuRedesignState = 'booting';
  syncBootRefreshOverlay();
  syncBootAllUpcomingOverlay();
  mountBootShell();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    await init();
  }
}

function bindKulmsLifecycleListeners() {
  if (state.kulmsLifecycleBound) return;
  state.kulmsLifecycleBound = true;
  window.addEventListener('pagehide', abortInFlightPageRequests);
  window.addEventListener('beforeunload', abortInFlightPageRequests);
  window.addEventListener('pageshow', resetPageLifecycleGuards);
  window.addEventListener('pageshow', rebindHomeInterceptionOnHistoryRestore);
}

function bindKulmsExtensionSettingsListener() {
  if (state.kulmsSettingsListenerBound) return;
  state.kulmsSettingsListenerBound = kuOnExtensionSettingsChanged((settings) => {
    const previous = state.extensionSettings || kuNormalizeExtensionSettings(KU_LMS_DEFAULT_SETTINGS);
    const credentialsChanged = previous.username !== settings.username || previous.password !== settings.password;
    const autoLoginChanged = previous.autoLogin !== settings.autoLogin;
    if (credentialsChanged || autoLoginChanged || !settings.enabled) cancelAutoLoginSubmission();
    state.extensionSettings = settings;
    if (!settings.enabled) {
      releaseNative();
      return;
    }
    if (!document.documentElement.dataset.kuRedesignState) {
      bootKulms({ skipSettingsCheck: true }).catch((error) => console.warn('[KU Redesign] settings re-enable failed', error));
      return;
    }
    if ((credentialsChanged || autoLoginChanged) && state.currentRoute?.name === 'login') {
      clearAutoLoginAttempt();
      fillAndMaybeSubmitLoginForm(state.loginNativeForm);
    }
  });
}

async function init() {
  if (state.extensionSettings?.enabled === false || isPageLeaving()) return;
  const version = state.pageTaskVersion = (state.pageTaskVersion || 0) + 1;
  const route = detectRoute(window.location);
  if (route.name === 'course-entry') return releaseNative();
  if (route.name === 'course-return') {
    resetActiveMessageContext();
    return releaseNative();
  }
  const refreshState = readHomeRefreshState();
  const allUpcomingState = readAllUpcomingState();
  const authInvalidPage = isAuthInvalidPage(document);
  const courseConflictPage = isCourseConflictPage(document);
  const intentionalLoginRoute = route.name === 'login';
  const intentionalLogoutRoute = route.name === 'logout';
  if (intentionalLoginRoute || intentionalLogoutRoute) {
    syncCourseUpcomingCacheIdentity('', { clear: true });
  }
  if ((courseConflictPage && !intentionalLogoutRoute) || (authInvalidPage && !intentionalLoginRoute)) {
    if (isHomeRefreshActive(refreshState)) abortHomeRefresh(refreshState, courseConflictPage ? 'course-conflict-page' : 'auth-invalid-page');
    if (isAllUpcomingActive(allUpcomingState)) abortAllUpcoming(allUpcomingState, courseConflictPage ? 'course-conflict-page' : 'auth-invalid-page');
    syncCourseUpcomingCacheIdentity('', { clear: true });
    return releaseNative();
  }
  if (!route.supported) {
    if (isHomeRefreshActive(refreshState)) abortHomeRefresh(refreshState, isAuthInvalidRoute(route) ? 'auth-invalid-route' : `unsupported-route:${route.name}`);
    if (isAllUpcomingActive(allUpcomingState)) abortAllUpcoming(allUpcomingState, isAuthInvalidRoute(route) ? 'auth-invalid-route' : `unsupported-route:${route.name}`);
    return releaseNative();
  }
  if ((route.name === 'notifications' || route.name === 'notifications-detail') && window.location.pathname.includes('/webclass/information.php/mbl')) {
    window.location.replace(normalizeNotificationsUrl(window.location.href));
    return;
  }
  syncHomeRefreshOverlay(refreshState);
  syncAllUpcomingOverlay(allUpcomingState);

  try {
    const context = await collectContext(route);
    if (!isCurrentPageTask(version)) return;
    syncCourseUpcomingCacheIdentity(context.userName);
    const root = ensureRoot();
    if (!root) return;
    state.currentRoute = route;
    state.currentContext = context;
    root.innerHTML = renderShell(route, context, renderLoadingPage(route));
    hideNativePageForExtension(ROOT_ID);
    document.documentElement.dataset.kuRedesignState = 'ready';

    const view = await buildView(route, context);
    if (!isCurrentPageTask(version)) return;
    state.currentView = view;
    rerender();

    await continueHomeRefreshIfNeeded(route, view);
    if (!isCurrentPageTask(version)) return;
    await continueAllUpcomingIfNeeded(route, view);
    if (!isCurrentPageTask(version)) return;
    const collecting = isHomeRefreshActive(readHomeRefreshState()) || isAllUpcomingActive(readAllUpcomingState());
    if (route.name === 'home' && !collecting && state.currentRoute?.name === 'home' && state.currentView === view) {
      enrichHomeAsync(context, view, version).catch((error) => console.warn('[KU Redesign] home enrichment failed', error));
    }
  } catch (error) {
    if (!isCurrentPageTask(version)) return;
    console.error('[KU Redesign] init failed', error);
    releaseNative();
  }
}

function rerender() {
  const route = state.currentRoute;
  const context = state.currentContext;
  const view = state.currentView;
  if (!route || !context || !view || state.extensionSettings?.enabled === false || isPageLeaving()) return;
  if (state.isComposing) {
    state.renderDeferred = true;
    return;
  }
  const root = ensureRoot();
  if (!root) return;
  const active = document.activeElement;
  const action = active?.getAttribute?.('data-action');
  const name = active?.getAttribute?.('name');
  const focus = root.contains?.(active) ? { action, name, id: active.id, start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection } : null;
  root.innerHTML = renderShell(route, context, renderPage(route, view));
  hydrateRouteDom(root, route, view);
  bindInteractiveHandlers(root, route, view);
  hideNativePageForExtension(ROOT_ID);
  if (focus && root.querySelectorAll) {
    const replacement = Array.from(root.querySelectorAll('input, textarea, select, button, a')).find((node) =>
      focus.action ? node.getAttribute('data-action') === focus.action : focus.id ? node.id === focus.id : focus.name ? node.getAttribute('name') === focus.name : false);
    replacement?.focus?.({ preventScroll: true });
    if (replacement?.setSelectionRange && focus.start != null) {
      try { replacement.setSelectionRange(focus.start, focus.end, focus.direction); } catch (error) { /* Non-text controls have no selection range. */ }
    }
  }
}

function ensureRoot() {
  if (state.extensionSettings?.enabled === false || isPageLeaving()) return null;
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = ROOT_ID;
    (document.body || document.documentElement).appendChild(root);
  } else if (document.body && root.parentNode !== document.body) {
    document.body.appendChild(root);
  }
  if (root.addEventListener && !root.__kuCompositionBound) {
    root.__kuCompositionBound = true;
    root.addEventListener('compositionstart', () => { state.isComposing = true; });
    root.addEventListener('compositionend', () => {
      state.isComposing = false;
      if (state.renderDeferred) {
        state.renderDeferred = false;
        window.setTimeout(() => rerender(), 0);
      }
    });
  }
  return root;
}

function releaseNative() {
  state.pageTaskVersion = (state.pageTaskVersion || 0) + 1;
  cancelAutoLoginSubmission();
  stopLoginNoticeSync();
  if (typeof cleanupRouteHydration === 'function') cleanupRouteHydration();
  if (typeof cancelSyllabusPendingWork === 'function') cancelSyllabusPendingWork();
  try { pageRequestAbortController?.abort('extension-released'); } catch (error) { /* Already aborted. */ }
  restoreNativeLoginForm();
  restoreNativePageForExtension(ROOT_ID);
  delete document.documentElement.dataset.kuRedesignState;
  const root = document.getElementById(ROOT_ID);
  if (root) root.remove();
  state.currentRoute = null;
  state.currentContext = null;
  state.currentView = null;
  state.isComposing = false;
  state.renderDeferred = false;
}

function abortInFlightPageRequests() {
  pageIsLeaving = true;
  state.pageTaskVersion = (state.pageTaskVersion || 0) + 1;
  cancelAutoLoginSubmission();
  stopLoginNoticeSync();
  if (typeof cleanupRouteHydration === 'function') cleanupRouteHydration();
  if (typeof cancelSyllabusPendingWork === 'function') cancelSyllabusPendingWork();
  try { pageRequestAbortController?.abort('navigation'); } catch (error) { /* Ignore repeated aborts. */ }
}

function getPageRequestSignal() {
    return pageRequestAbortController?.signal;
  }

function isAbortError(error) {
    return error?.name === 'AbortError' || String(error?.message || '').includes('aborted');
  }

function isCurrentPageTask(version) {
  return version === state.pageTaskVersion && state.extensionSettings?.enabled !== false && !isPageLeaving();
}

function invalidatePageTasks() {
  state.pageTaskVersion = (state.pageTaskVersion || 0) + 1;
  return state.pageTaskVersion;
}

function isPageLeaving() {
    return pageIsLeaving;
  }

function resetPageLifecycleGuards(event) {
  pageIsLeaving = false;
  if (!pageRequestAbortController || pageRequestAbortController.signal?.aborted) {
    pageRequestAbortController = typeof AbortController === 'function' ? new AbortController() : null;
  }
  if (typeof resumeLmsPageRequests === 'function') resumeLmsPageRequests({ afterNavigation: event?.type === 'pageshow' });
}

function rebindHomeInterceptionOnHistoryRestore(event) {
  if (!event?.persisted && getHomeRefreshNavigationType() !== 'back_forward') return;
  const route = detectRoute(window.location);
  if (!route?.supported || state.extensionSettings?.enabled === false) return;
  if (route.name === 'course-entry' || route.name === 'course-return') return releaseNative();
  if (document.documentElement.dataset.kuRedesignState !== 'ready') return;
  if (!state.currentRoute || !state.currentContext || !state.currentView || state.currentRoute.name !== route.name) {
    init().catch((error) => console.warn('[KU Redesign] history restore re-init failed', error));
    return;
  }
  rerender();
  const view = state.currentView;
  if (route.name === 'home' && (view.messages?.loading || view.upcoming?.loading) && !isHomeRefreshActive(readHomeRefreshState()) && !isAllUpcomingActive(readAllUpcomingState())) {
    enrichHomeAsync(state.currentContext, view, state.pageTaskVersion).catch((error) => console.warn('[KU Redesign] home history enrichment failed', error));
  }
}

function mountBootShell() {
    const root = ensureRoot();
    root.innerHTML = `<div class="ku-app"><div class="ku-loading" style="min-height:100vh"><div class="ku-spinner"></div><div>KU-LMS を再構築しています…</div></div></div>`;
  }

function syncBootRefreshOverlay() {
    syncHomeRefreshOverlay(readHomeRefreshState());
  }

function syncBootAllUpcomingOverlay() {
    syncAllUpcomingOverlay(readAllUpcomingState());
  }

async function collectContext(route) {
  const current = document;
  const links = parseTopLinks(current, route);
  const messageContext = resolveMessageContext(route, links, current);
  links.globalInboxHref = messageContext.globalInboxHref;
  links.contextualInboxHref = messageContext.contextualInboxHref;
  links.contextSourceRoute = messageContext.contextSourceRoute;
  links.canonicalMessageHref = messageContext.canonicalMessageHref;
  links.observedMobileMessageHref = messageContext.observedMobileMessageHref;
  links.messages = messageContext.globalInboxHref;
  const userName = route.name === 'login' || route.name === 'logout' ? '' : (parseUserName(current) || '');
  return {
    userName,
    language: route.name === 'login' ? parseLoginLanguageLabel(current) : (parseLanguage(current) || '日本語'),
    links,
    messageContext,
    homeDoc: current
  };
}

function resolveMessageContext(route, links, doc) {
    const globalInboxHref = normalizeInboxHref(links.globalInboxHref || links.messages, getDefaultGlobalInboxHref()) || getDefaultGlobalInboxHref();
    const contextualInboxHref = normalizeInboxHref(links.contextualInboxHref);
    const observedMobileMessageHref = isObservedMobileMessageHref(links.observedMobileMessageHref) ? links.observedMobileMessageHref : '';
    if (isSupportedMessageContextSourceRoute(route?.name) && contextualInboxHref) {
      return setActiveMessageContext({
        globalInboxHref,
        contextualInboxHref,
        contextSourceRoute: route.name,
        canonicalMessageHref: contextualInboxHref,
        observedMobileMessageHref
      });
    }
    if (isGlobalMessageResetRoute(route?.name)) {
      return resetActiveMessageContext(globalInboxHref);
    }
    if (!isMessageRouteName(route?.name)) {
      return setActiveMessageContext({
        globalInboxHref,
        contextualInboxHref: '',
        contextSourceRoute: '',
        canonicalMessageHref: globalInboxHref,
        observedMobileMessageHref
      }, { persist: false });
    }
    return resolveMessageRouteContext(route, {
      globalInboxHref,
      currentPageInboxHref: links.currentPageInboxHref,
      observedMobileMessageHref
    }, doc);
  }

function resolveMessageRouteContext(route, linkState, doc) {
    const globalInboxHref = normalizeInboxHref(linkState?.globalInboxHref, getDefaultGlobalInboxHref()) || getDefaultGlobalInboxHref();
    const currentPageInboxHref = normalizeInboxHref(linkState?.currentPageInboxHref, globalInboxHref) || globalInboxHref;
    const observedMobileMessageHref = linkState?.observedMobileMessageHref || '';
    const persisted = readPersistedMessageContext();
    const hasPersistedContext = !!(persisted?.contextualInboxHref && persisted?.contextSourceRoute);
    const referrerRoute = detectRouteFromHref(doc?.referrer || '');
    const cameFromSupportedFlow = isSupportedMessageContextSourceRoute(referrerRoute.name) || isMessageRouteName(referrerRoute.name);
    const currentHref = normalizeMessageUrlForComparison(window.location.href);
    const globalHref = normalizeMessageUrlForComparison(globalInboxHref);
    const currentMatchesPersistedContext = hasPersistedContext && areMessageHrefsEqual(currentPageInboxHref, persisted.contextualInboxHref);
    if (!hasPersistedContext) {
      return resetActiveMessageContext(globalInboxHref);
    }
    if (route?.name === 'messages-inbox' && currentHref === globalHref && !currentMatchesPersistedContext) {
      return resetActiveMessageContext(globalInboxHref);
    }
    if (route?.name === 'messages-inbox' && !cameFromSupportedFlow && !currentMatchesPersistedContext) {
      return resetActiveMessageContext(globalInboxHref);
    }
    if (route?.name !== 'messages-inbox' && !cameFromSupportedFlow) {
      return resetActiveMessageContext(globalInboxHref);
    }
    return setActiveMessageContext({
      globalInboxHref,
      contextualInboxHref: persisted.contextualInboxHref,
      contextSourceRoute: persisted.contextSourceRoute,
      canonicalMessageHref: persisted.contextualInboxHref || currentPageInboxHref || globalInboxHref,
      observedMobileMessageHref: persisted.observedMobileMessageHref || observedMobileMessageHref
    });
  }

async function buildView(route, context) {
    switch (route.name) {
      case 'login':
        return buildLoginView(document, context);
      case 'logout':
        return buildLogoutView(document, context);
      case 'home':
        return buildHomeView(document, context);
      case 'home-all-upcoming':
        return buildHomeAllUpcomingView(document, context);
      case 'course-materials':
        return buildCourseMaterialsView(document, context);
      case 'course-myreports':
        return buildMyReportsView(document, context);
      case 'course-scores':
        return buildCourseScoresView(document, context);
      case 'notifications':
      case 'notifications-detail':
        return buildNotificationsView(document, context, route);
      case 'messages-inbox':
      case 'messages-outbox':
      case 'messages-recyclebox':
      case 'messages-detail':
        return buildMessagesView(document, context, route);
      case 'manual':
        return buildManualView(document, context);
      default:
        throw new Error('Unsupported route');
    }
  }

function buildHomeView(doc, context) {
    const schedule = parseSchedule(doc);
    const filters = parseHomeFilters(doc);
    const homeNotices = normalizeHomeAnnouncementItems(parseHomeAnnouncements(doc));
    const otherCourses = parseOtherCourses(doc);
    const today = new Date();
    return {
      filters,
      schedule,
      homeNotices,
      otherCourses,
      week: getWeekDays(today, state.weekOffset),
      upcoming: { loading: true, items: [] },
      messages: { loading: true, items: [], total: 0 },
      announcements: { loading: false, items: homeNotices }
    };
  }

function buildHomeAllUpcomingView(doc, context) {
    const filters = parseHomeFilters(doc);
    const payload = readAllUpcomingState();
    const items = hydrateAllUpcomingItems(payload?.items || [])
      .filter((item) => isUpcomingDueWithinDays(item, ALL_UPCOMING_WINDOW_DAYS))
      .sort(compareAllUpcomingResults)
      .map((item) => ({
        ...item,
        daysLeft: item.dueDate ? Math.max(0, Math.ceil((item.dueDate.getTime() - Date.now()) / 86400000)) : null
      }));
    const collectedAt = payload?.completedAt || payload?.collectedAt || payload?.lastProgressAt || '';
    return {
      filters,
      items,
      courseCount: payload?.targets?.length || new Set(items.map((item) => buildCourseCacheKey(item.courseHref || item.href) || item.courseTitle)).size,
      collectedAt,
      collectedAtLabel: formatAllUpcomingCollectedAt(collectedAt),
      homeHref: state.currentContext?.links?.home || absoluteUrl('/webclass/'),
      subtitle: `現在のホーム対象（${filters.label || '全期間'}）から、5日以内に締切の課題をコース詳細ページ経由で集約しました。`,
      emptyMessage: payload?.phase === 'completed'
        ? '5日以内に締切の課題はありません。'
        : 'ホームの「すべて見る」から集約を開始してください。'
    };
  }

async function buildLoginView(doc, context) {
    const view = parseLoginView(doc);
    if (!view?.form) {
      throw new Error('Login form not found');
    }
    return view;
  }

async function buildLogoutView(doc, context) {
    const view = parseLogoutView(doc);
    if (!view?.actions?.loginHref || !view?.actions?.closeHref) {
      throw new Error('Logout actions not found');
    }
    return view;
  }

async function enrichHomeAsync(context, view, version = state.pageTaskVersion) {
  const active = () => isCurrentPageTask(version) && state.currentRoute?.name === 'home' && state.currentContext === context && state.currentView === view;
  if (!active()) return;
  const nextView = { ...view, upcoming: { loading: false, items: [] }, announcements: view.announcements, messages: { loading: false, items: [], total: 0 } };
  try {
    const messagesDoc = await loadSupplementalDocument(context.links.messages || '/webclass/msg_editor.php?msgappmode=inbox');
    if (!active()) return;
    nextView.messages = { loading: false, ...parseMessagePreview(messagesDoc) };
  } catch (error) {
    if (!active()) return;
    nextView.messages.error = true;
    console.warn('[KU Redesign] message enrichment failed', error);
  }
  try {
    const now = new Date();
    const entries = view.schedule?.entries || [];
    const otherEntries = (view.otherCourses || []).flatMap((group) => group.items || []).map((item, index) => ({ ...item, sortIndex: entries.length + index }));
    const courseUpcoming = await loadUpcomingFromDueCourses([...entries, ...otherEntries], view.filters.year);
    if (!active()) return;
    nextView.upcoming = {
      loading: false,
      items: courseUpcoming.sort(compareUpcomingItems).slice(0, 5)
        .map((item) => ({ ...item, daysLeft: item.dueDate ? Math.max(0, Math.ceil((item.dueDate - now) / 86400000)) : null }))
    };
  } catch (error) {
    if (!active()) return;
    nextView.upcoming.error = true;
    console.warn('[KU Redesign] upcoming enrichment failed', error);
  }
  if (!active()) return;
  state.currentView = nextView;
  rerender();
}

async function buildCourseMaterialsView(doc, context) {
    const course = parseCourseDocument(doc);
    rememberCourseUpcoming(course.course.links.materials || window.location.href, parseUpcomingFromCourse(doc, course.course.links.materials || window.location.href));
    course.timeline = shouldSuppressCourseTraversalSideEffects(course.course.links.materials || window.location.href)
      ? { items: [], error: false }
      : await fetchCourseTimeline(course.course.courseId);
    return { course, currentTab: 'materials' };
  }

function buildMyReportsView(doc, context) {
    const course = parseCourseMeta(doc);
    const reports = parseMyReports(doc);
    return { course, reports, currentTab: 'myreports' };
  }

function buildCourseScoresView(doc, context) {
    const course = parseCourseMeta(doc);
    const scores = parseCourseScores(doc);
    return { course, scores, currentTab: 'scores' };
  }

function buildNotificationsView(doc, context, route) {
    if (route?.name === 'notifications-detail') {
      return parseNotificationDetail(doc);
    }
    return parseNotificationsList(doc);
  }

function buildMessagesView(doc, context, route) {
    if (route?.name === 'messages-detail') {
      return parseMessageDetail(doc);
    }
    return parseMessagesTable(doc, route?.name);
  }

function buildManualView(doc, context) {
  const sections = parseManualSections(doc);
  if (!sections.length) throw new Error('Native manual sections could not be parsed');
  return {
    title: 'マニュアル',
    subtitle: '利用ガイド、動作環境、サポート情報をまとめています。',
    closeHref: Array.from(doc.querySelectorAll('a[href]')).find((a) => !isExtensionOwnedNode(a) && a.textContent.includes('このウィンドウを閉じる'))?.getAttribute('href') || '',
    sections
  };
}
