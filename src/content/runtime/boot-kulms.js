/* src/content/runtime/boot-kulms.js */

function bootKulms() {
  window.addEventListener('pagehide', abortInFlightPageRequests);
  window.addEventListener('beforeunload', abortInFlightPageRequests);
  window.addEventListener('pageshow', resetPageLifecycleGuards);

  document.documentElement.dataset.kuRedesignState = 'booting';
  syncBootRefreshOverlay();
  mountBootShell();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}

async function init() {
    const route = detectRoute(window.location);
    const refreshState = readHomeRefreshState();
    const authInvalidPage = isAuthInvalidPage(document);
    const courseConflictPage = isCourseConflictPage(document);
    const intentionalLoginRoute = route.name === 'login';
    const intentionalLogoutRoute = route.name === 'logout';
    if ((courseConflictPage && !intentionalLogoutRoute) || (authInvalidPage && !intentionalLoginRoute)) {
      if (isHomeRefreshActive(refreshState)) {
        abortHomeRefresh(refreshState, courseConflictPage ? 'course-conflict-page' : 'auth-invalid-page');
      }
      return releaseNative();
    }
    if (!route.supported) {
      if (isHomeRefreshActive(refreshState)) {
        abortHomeRefresh(refreshState, isAuthInvalidRoute(route) ? 'auth-invalid-route' : `unsupported-route:${route.name}`);
      }
      return releaseNative();
    }
    if ((route.name === 'notifications' || route.name === 'notifications-detail') && window.location.pathname.includes('/webclass/information.php/mbl')) {
      window.location.replace(normalizeNotificationsUrl(window.location.href));
      return;
    }
    syncHomeRefreshOverlay(refreshState);

    try {
      const context = await collectContext(route);
      const root = ensureRoot();
      state.currentRoute = route;
      state.currentContext = context;
      root.innerHTML = renderShell(route, context, renderLoadingPage(route));
      document.documentElement.dataset.kuRedesignState = 'ready';

      const view = await buildView(route, context);
      state.currentView = view;
      rerender();

      if (route.name === 'home') {
        enrichHomeAsync(context, view).catch((error) => console.warn('[KU Redesign] home enrichment failed', error));
      }
      await continueHomeRefreshIfNeeded(route, view);
    } catch (error) {
      console.error('[KU Redesign] init failed', error);
      releaseNative();
    }
  }

function rerender() {
    const route = state.currentRoute;
    const context = state.currentContext;
    const view = state.currentView;
    if (!route || !context || !view) return;
    const root = ensureRoot();
    root.innerHTML = renderShell(route, context, renderPage(route, view));
    hydrateRouteDom(root, route, view);
    bindInteractiveHandlers(root, route, view);
  }

function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      (document.body || document.documentElement).appendChild(root);
    }
    return root;
  }

function releaseNative() {
    stopLoginNoticeSync();
    restoreNativeLoginForm();
    delete document.documentElement.dataset.kuRedesignState;
    const root = document.getElementById(ROOT_ID);
    if (root) root.remove();
  }

function abortInFlightPageRequests() {
    pageIsLeaving = true;
    try {
      pageRequestAbortController?.abort('navigation');
    } catch (error) {
      // Ignore repeated aborts.
    }
  }

function getPageRequestSignal() {
    return pageRequestAbortController?.signal;
  }

function isAbortError(error) {
    return error?.name === 'AbortError' || String(error?.message || '').includes('aborted');
  }

function isPageLeaving() {
    return pageIsLeaving;
  }

function resetPageLifecycleGuards() {
    pageIsLeaving = false;
    if (!pageRequestAbortController || pageRequestAbortController.signal?.aborted) {
      pageRequestAbortController = typeof AbortController === 'function' ? new AbortController() : null;
    }
  }

function mountBootShell() {
    const root = ensureRoot();
    root.innerHTML = `<div class="ku-app"><div class="ku-loading" style="min-height:100vh"><div class="ku-spinner"></div><div>KU-LMS を再構築しています…</div></div></div>`;
  }

function syncBootRefreshOverlay() {
    syncHomeRefreshOverlay(readHomeRefreshState());
  }

async function collectContext(route) {
    const current = document;
    const links = parseTopLinks(current);
    return {
      userName: route.name === 'login' || route.name === 'logout' ? '' : (parseUserName(current) || 'ユーザー'),
      language: route.name === 'login' ? parseLoginLanguageLabel(current) : (parseLanguage(current) || '日本語'),
      links,
      homeDoc: current
    };
  }

async function buildView(route, context) {
    switch (route.name) {
      case 'login':
        return buildLoginView(document, context);
      case 'logout':
        return buildLogoutView(document, context);
      case 'home':
        return buildHomeView(document, context);
      case 'course-materials':
        return buildCourseMaterialsView(document, context);
      case 'course-myreports':
        return buildMyReportsView(document, context);
      case 'notifications':
      case 'notifications-detail':
        return buildNotificationsView(document, context, route);
      case 'messages-inbox':
      case 'messages-outbox':
      case 'messages-recyclebox':
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
    const homeNotices = parseHomeAnnouncements(doc);
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
      announcements: { loading: true, items: homeNotices }
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

async function enrichHomeAsync(context, view) {
    const nextView = { ...view, upcoming: { loading: false, items: [] }, announcements: { loading: false, items: [] }, messages: { loading: false, items: [], total: 0 } };
    const fallbackAnnouncements = normalizeHomeAnnouncementItems(view.homeNotices);

    try {
      const noticeFeed = await loadNotificationFeed(context.links.notifications || '/webclass/information.php/');
      nextView.announcements = { loading: false, items: noticeFeed.previewItems.slice(0, 5) };
    } catch (error) {
      console.warn('[KU Redesign] notices enrichment failed', error);
    }

    try {
      const messagesDoc = await loadSupplementalDocument(context.links.messages || '/webclass/msg_editor.php?msgappmode=inbox');
      nextView.messages = { loading: false, ...parseMessagePreview(messagesDoc) };
    } catch (error) {
      console.warn('[KU Redesign] message enrichment failed', error);
    }

    try {
      const now = new Date();
      const courseUpcoming = await loadUpcomingFromDueCourses(view.schedule.entries, view.filters.year);
      const combinedUpcoming = courseUpcoming.sort(compareUpcomingItems);
      nextView.upcoming = {
        loading: false,
        items: combinedUpcoming
          .slice(0, 5)
          .map((item) => ({ ...item, daysLeft: item.dueDate ? Math.max(0, Math.ceil((item.dueDate - now) / 86400000)) : null }))
      };
    } catch (error) {
      console.warn('[KU Redesign] upcoming enrichment failed', error);
    }

    state.currentView = nextView;
    rerender();
  }

async function buildCourseMaterialsView(doc, context) {
    const course = parseCourseDocument(doc);
    rememberCourseUpcoming(course.course.links.materials || window.location.href, parseUpcomingFromCourse(doc, course.course.links.materials || window.location.href));
    course.timeline = shouldSuppressRefreshSideEffects(course.course.links.materials || window.location.href)
      ? { items: [], error: false }
      : await fetchCourseTimeline(course.course.courseId);
    return { course, currentTab: 'materials' };
  }

function buildMyReportsView(doc, context) {
    const course = parseCourseMeta(doc);
    const reports = parseMyReports(doc);
    return { course, reports, currentTab: 'myreports' };
  }

function buildNotificationsView(doc, context, route) {
    if (route?.name === 'notifications-detail') {
      return parseNotificationDetail(doc);
    }
    return parseNotificationsList(doc);
  }

function buildMessagesView(doc, context, route) {
    return parseMessagesTable(doc, route?.name);
  }

function buildManualView(doc, context) {
    const sections = parseManualSections(doc);
    const fallbackSections = parseHomeHelpSections(context.homeDoc);
    return {
      title: 'マニュアル',
      subtitle: '利用ガイド、動作環境、サポート情報をまとめています。',
      closeHref: Array.from(doc.querySelectorAll('a[href]')).find((a) => a.textContent.includes('このウィンドウを閉じる'))?.getAttribute('href') || '',
      sections: sections.length ? sections : fallbackSections
    };
  }
