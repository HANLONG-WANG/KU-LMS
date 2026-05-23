/* src/content/services/refresh.js */

async function startHomeRefresh(view) {
    if (isPageLeaving()) return;
    const existing = readHomeRefreshState();
    if (isHomeRefreshActive(existing)) {
      syncHomeRefreshOverlay(existing);
      return;
    }
    const targets = getRefreshEntries(view.schedule.entries, view.otherCourses).map((entry) => ({
      href: entry.href,
      courseHref: buildCourseCacheKey(entry.href),
      title: entry.title,
      note: entry.note || '',
      sortIndex: entry.sortIndex ?? Number.MAX_SAFE_INTEGER
    }));
    if (!targets.length) {
      state.currentView = {
        ...state.currentView,
        upcoming: {
          loading: false,
          items: loadUpcomingFromCourseCache(view.schedule.entries)
            .sort(compareUpcomingItems)
            .slice(0, 5)
            .map((item) => ({
              ...item,
              daysLeft: item.dueDate ? Math.max(0, Math.ceil((item.dueDate.getTime() - Date.now()) / 86400000)) : null
            }))
        }
      };
      rerender();
      return;
    }
    const payload = {
      version: 1,
      phase: 'arming',
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + HOME_REFRESH_MAX_AGE_MS).toISOString(),
      lastProgressAt: '',
      currentIndex: 0,
      restoreAttempts: 0,
      homeUrl: window.location.href,
      homeYear: view.filters.year || '',
      homeSemester: view.filters.semester || '',
      targets,
      lastProcessedCourse: '',
      abortReason: ''
    };
    writeHomeRefreshState(payload);
    syncHomeRefreshOverlay(payload);
    await continueHomeRefreshIfNeeded(state.currentRoute, view);
  }

async function continueHomeRefreshIfNeeded(route, view) {
    const payload = readHomeRefreshState();
    if (!isHomeRefreshActive(payload)) {
      syncHomeRefreshOverlay(null);
      return;
    }
    syncHomeRefreshOverlay(payload);
    if (getHomeRefreshNavigationType() === 'back_forward') {
      abortHomeRefresh(payload, 'manual-history-navigation');
      return;
    }
    if (isPageLeaving()) {
      abortHomeRefresh(payload, 'page-leaving');
      return;
    }
    if (route.name === 'login' || route.name === 'logout' || isAuthInvalidRoute(route) || isAuthInvalidPage(document) || isCourseConflictPage(document)) {
      abortHomeRefresh(payload, isCourseConflictPage(document) ? 'course-conflict-page' : 'auth-invalid-route');
      return;
    }
    if (route.name === 'home') {
      await continueHomeRefreshOnHome(view, payload);
      return;
    }
    if (route.name === 'course-materials') {
      await continueHomeRefreshOnCourse(view, payload);
      return;
    }
    abortHomeRefresh(payload, `unexpected-route:${route.name}`);
  }

async function continueHomeRefreshOnHome(view, payload) {
    if (payload.phase === 'arming') {
      const nextPayload = writeHomeRefreshState({
        ...payload,
        phase: 'navigating-to-course',
        lastProgressAt: new Date().toISOString()
      });
      navigateToHomeRefreshTarget(nextPayload);
      return;
    }
    if (payload.phase === 'navigating-to-course' || payload.phase === 'advancing') {
      abortHomeRefresh(payload, 'manual-home-navigation');
      return;
    }
    if (payload.phase === 'restoring-home') {
      if (doesHomeRefreshMatchCurrentView(view, payload)) {
        clearHomeRefreshState();
        syncHomeRefreshOverlay(null);
        return;
      }
      const restoreAttempts = Number(payload.restoreAttempts || 0);
      if (restoreAttempts >= HOME_REFRESH_MAX_RESTORE_ATTEMPTS) {
        abortHomeRefresh(payload, 'restore-home-mismatch');
        return;
      }
      writeHomeRefreshState({
        ...payload,
        restoreAttempts: restoreAttempts + 1,
        lastProgressAt: new Date().toISOString()
      });
      submitHomeFilters(payload.homeYear || view.filters.year, payload.homeSemester || view.filters.semester);
      return;
    }
    if (payload.phase === 'failed-recoverable' || payload.phase === 'aborted') {
      clearHomeRefreshState();
      syncHomeRefreshOverlay(null);
    }
  }

async function continueHomeRefreshOnCourse(view, payload) {
    const target = getCurrentHomeRefreshTarget(payload);
    if (!target) {
      abortHomeRefresh(payload, 'missing-target');
      return;
    }
    const currentCourseHref = buildCourseCacheKey(view.course.course.links.materials || window.location.href);
    if (currentCourseHref !== buildCourseCacheKey(target.courseHref || target.href)) {
      abortHomeRefresh(payload, 'target-mismatch');
      return;
    }
    const nextIndex = payload.currentIndex + 1;
    if (nextIndex < payload.targets.length) {
      const nextPayload = writeHomeRefreshState({
        ...payload,
        phase: 'navigating-to-course',
        currentIndex: nextIndex,
        lastProcessedCourse: currentCourseHref,
        lastProgressAt: new Date().toISOString()
      });
      navigateToHomeRefreshTarget(nextPayload);
      return;
    }
    restoreHomeRefreshState({
      ...payload,
      phase: 'restoring-home',
      currentIndex: nextIndex,
      lastProcessedCourse: currentCourseHref,
      lastProgressAt: new Date().toISOString()
    });
  }

function navigateToHomeRefreshTarget(payload) {
    if (isPageLeaving()) {
      abortHomeRefresh(payload, 'page-leaving');
      return;
    }
    const target = getCurrentHomeRefreshTarget(payload);
    if (!target?.href) {
      abortHomeRefresh(payload, 'missing-target-href');
      return;
    }
    syncHomeRefreshOverlay(payload);
    window.location.href = target.href;
  }

function restoreHomeRefreshState(payload, reason = '') {
    if (isPageLeaving()) {
      abortHomeRefresh(payload, 'page-leaving');
      return;
    }
    const currentPayload = payload || readHomeRefreshState() || {};
    const restoreAttempts = Number(currentPayload.restoreAttempts || 0) + 1;
    if (restoreAttempts > HOME_REFRESH_MAX_RESTORE_ATTEMPTS) {
      abortHomeRefresh(currentPayload, reason ? `restore-limit:${reason}` : 'restore-limit');
      return;
    }
    const nextPayload = writeHomeRefreshState({
      ...currentPayload,
      phase: 'restoring-home',
      restoreAttempts,
      abortReason: reason || payload?.abortReason || '',
      lastProgressAt: new Date().toISOString()
    });
    syncHomeRefreshOverlay(nextPayload);
    const homeUrl = nextPayload.homeUrl || absoluteUrl('/webclass/');
    if (window.location.href !== homeUrl) {
      window.location.href = homeUrl;
      return;
    }
    if (state.currentRoute?.name === 'home' && state.currentView && doesHomeRefreshMatchCurrentView(state.currentView, nextPayload)) {
      clearHomeRefreshState();
      syncHomeRefreshOverlay(null);
    }
  }

function abortHomeRefresh(payload, reason = 'aborted') {
    const nextPayload = writeHomeRefreshState({
      ...(payload || readHomeRefreshState() || {}),
      phase: 'aborted',
      abortReason: reason,
      lastProgressAt: new Date().toISOString()
    });
    syncHomeRefreshOverlay(nextPayload);
    return nextPayload;
  }

function doesHomeRefreshMatchCurrentView(view, payload) {
    if (!view || !payload) return false;
    const currentUrl = new URL(window.location.href, window.location.origin);
    const targetUrl = new URL(payload.homeUrl || absoluteUrl('/webclass/'), window.location.origin);
    return currentUrl.pathname === targetUrl.pathname
      && currentUrl.search === targetUrl.search
      && String(view.filters?.year || '') === String(payload.homeYear || '')
      && String(view.filters?.semester || '') === String(payload.homeSemester || '');
  }

function getCurrentHomeRefreshTarget(payload = readHomeRefreshState()) {
    return payload?.targets?.[payload.currentIndex] || null;
  }

function isHomeRefreshActive(payload = readHomeRefreshState()) {
    return !!payload && !['completed', 'aborted'].includes(String(payload.phase || ''));
  }

function isAuthInvalidRoute(route) {
    return route?.name === 'auth-invalid';
  }

function isAuthInvalidPage(doc = document) {
    const normalizedPath = window.location.pathname.replace(/\/$/, '');
    if (normalizedPath === '/webclass/login.php') return true;
    const bodyText = String(doc?.body?.innerText || '');
    return bodyText.includes('Welcome to KU-LMS')
      && bodyText.includes('用户 ID')
      && bodyText.includes('密码');
  }

function isCourseConflictPage(doc = document) {
    const bodyText = String(doc?.body?.innerText || '');
    return bodyText.includes('コース利用中に、別のコースへのアクセスがリクエストされました。')
      || bodyText.includes('関大LMSの他のウインドウやタブをすべて閉じ');
  }

function getHomeRefreshNavigationType() {
    try {
      return window.performance?.getEntriesByType?.('navigation')?.[0]?.type || '';
    } catch (error) {
      return '';
    }
  }

function shouldSuppressRefreshSideEffects(courseHref = '') {
    const payload = readHomeRefreshState();
    if (!isHomeRefreshActive(payload)) return false;
    const target = getCurrentHomeRefreshTarget(payload);
    if (!target) return false;
    return buildCourseCacheKey(target.courseHref || target.href) === buildCourseCacheKey(courseHref || window.location.href);
  }

function shouldSuppressCourseTraversalSideEffects(courseHref = '') {
    return shouldSuppressRefreshSideEffects(courseHref) || shouldSuppressAllUpcomingSideEffects(courseHref);
  }

function readHomeRefreshState() {
    try {
      const raw = window.sessionStorage?.getItem(HOME_REFRESH_STATE_KEY) || '';
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const expiresAt = parsed.expiresAt ? Date.parse(parsed.expiresAt) : NaN;
      const startedAt = parsed.startedAt ? Date.parse(parsed.startedAt) : NaN;
      const lastProgressAt = parsed.lastProgressAt ? Date.parse(parsed.lastProgressAt) : NaN;
      const expiredByExpiresAt = Number.isFinite(expiresAt) && expiresAt <= Date.now();
      const expiredByAge = !Number.isFinite(expiresAt)
        && Number.isFinite(startedAt)
        && (Date.now() - startedAt) > HOME_REFRESH_MAX_AGE_MS;
      const stalledByNoProgress = Number.isFinite(lastProgressAt)
        && (Date.now() - lastProgressAt) > HOME_REFRESH_STALL_MS;
      if (expiredByExpiresAt || expiredByAge || stalledByNoProgress) {
        window.sessionStorage?.removeItem(HOME_REFRESH_STATE_KEY);
        return null;
      }
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
      return null;
    }
  }

function writeHomeRefreshState(payload) {
    try {
      window.sessionStorage?.setItem(HOME_REFRESH_STATE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn('[KU Redesign] failed to write home refresh state', error);
    }
    return payload;
  }

function clearHomeRefreshState() {
    try {
      window.sessionStorage?.removeItem(HOME_REFRESH_STATE_KEY);
    } catch (error) {
      console.warn('[KU Redesign] failed to clear home refresh state', error);
    }
  }

function syncHomeRefreshOverlay(payload = readHomeRefreshState()) {
    if (!isHomeRefreshActive(payload)) {
      document.getElementById('ku-home-refresh-overlay')?.remove();
      return;
    }
    const total = Math.max(0, payload.targets?.length || 0);
    const currentTarget = payload.phase === 'restoring-home' ? null : getCurrentHomeRefreshTarget(payload);
    const currentIndex = Number(payload.currentIndex) || 0;
    const step = payload.phase === 'restoring-home'
      ? total
      : total ? Math.min(total, Math.max(1, currentIndex + 1)) : 0;
    const progressLabel = `${step} / ${total}`;
    const percent = total ? Math.min(100, Math.max(0, Math.round((step / total) * 100))) : 0;
    const subtitle = payload.phase === 'arming'
      ? '更新を開始しています…'
      : payload.phase === 'restoring-home'
        ? 'ホームへ戻しています…'
        : `対象 ${progressLabel} を更新中…`;
    const note = currentTarget?.title
      ? `現在: ${truncate(currentTarget.title, 56)}`
      : payload.phase === 'restoring-home'
        ? '最終ステップを処理しています'
        : '';
    const noteHtml = note ? `<div class="ku-home-refresh-note">${escapeHtml(note)}</div>` : '';
    let overlay = document.getElementById('ku-home-refresh-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ku-home-refresh-overlay';
      (document.body || document.documentElement).appendChild(overlay);
    }
    overlay.innerHTML = `<div class="ku-home-refresh-box" role="status" aria-live="polite" aria-busy="true"><div class="ku-spinner"></div><div class="ku-home-refresh-content"><strong class="ku-home-refresh-title">更新しています。しばらくお待ちください。</strong><div class="ku-home-refresh-subtitle">${escapeHtml(subtitle)}</div><div class="ku-home-refresh-progress-head"><span>進捗</span><strong>${progressLabel}</strong></div><div class="ku-home-refresh-progress-track" aria-hidden="true"><span class="ku-home-refresh-progress-value" style="width:${escapeAttr(percent)}%"></span></div>${noteHtml}</div></div>`;
  }
