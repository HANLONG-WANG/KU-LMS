/* src/content/services/all-upcoming.js */

async function startAllUpcomingCollection(view) {
    if (isPageLeaving()) return;
    const existing = readAllUpcomingState();
    if (isAllUpcomingActive(existing)) {
      syncAllUpcomingOverlay(existing);
      return;
    }
    const homeUrl = normalizeAllUpcomingHomeUrl(window.location.href);
    const resultUrl = buildAllUpcomingUrl(homeUrl);
    const targets = getAllUpcomingCollectionTargets(view.schedule.entries, view.otherCourses);
    const basePayload = {
      version: 1,
      phase: targets.length ? 'arming' : 'completed',
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ALL_UPCOMING_MAX_AGE_MS).toISOString(),
      lastProgressAt: '',
      currentIndex: 0,
      restoreAttempts: 0,
      homeUrl,
      resultUrl,
      homeYear: view.filters.year || '',
      homeSemester: view.filters.semester || '',
      targets,
      items: [],
      visitedCourseCount: 0,
      lastProcessedCourse: '',
      collectedAt: targets.length ? '' : new Date().toISOString(),
      completedAt: targets.length ? '' : new Date().toISOString(),
      abortReason: ''
    };
    writeAllUpcomingState(basePayload);
    if (!targets.length) {
      window.location.href = resultUrl;
      return;
    }
    syncAllUpcomingOverlay(basePayload);
    await continueAllUpcomingIfNeeded(state.currentRoute, view);
  }

async function continueAllUpcomingIfNeeded(route, view) {
    const payload = readAllUpcomingState();
    if (!isAllUpcomingActive(payload)) {
      syncAllUpcomingOverlay(null);
      return;
    }
    syncAllUpcomingOverlay(payload);
    if (getHomeRefreshNavigationType() === 'back_forward') {
      abortAllUpcoming(payload, 'manual-history-navigation');
      return;
    }
    if (isPageLeaving()) {
      abortAllUpcoming(payload, 'page-leaving');
      return;
    }
    if (route.name === 'login' || route.name === 'logout' || isAuthInvalidRoute(route) || isAuthInvalidPage(document) || isCourseConflictPage(document)) {
      abortAllUpcoming(payload, isCourseConflictPage(document) ? 'course-conflict-page' : 'auth-invalid-route');
      return;
    }
    if (route.name === 'home' || route.name === 'home-all-upcoming') {
      await continueAllUpcomingOnHome(view, payload, route);
      return;
    }
    if (route.name === 'course-materials') {
      await continueAllUpcomingOnCourse(view, payload);
      return;
    }
    abortAllUpcoming(payload, `unexpected-route:${route.name}`);
  }

async function continueAllUpcomingOnHome(view, payload, route) {
    if (payload.phase === 'arming') {
      const nextPayload = writeAllUpcomingState({
        ...payload,
        phase: 'navigating-to-course',
        lastProgressAt: new Date().toISOString()
      });
      navigateToAllUpcomingTarget(nextPayload);
      return;
    }
    if (payload.phase === 'navigating-to-course' || payload.phase === 'advancing') {
      abortAllUpcoming(payload, 'manual-home-navigation');
      return;
    }
    if (payload.phase === 'restoring-home') {
      if (!doesAllUpcomingMatchCurrentView(view, payload)) {
        const restoreAttempts = Number(payload.restoreAttempts || 0);
        if (restoreAttempts >= ALL_UPCOMING_MAX_RESTORE_ATTEMPTS) {
          abortAllUpcoming(payload, 'restore-home-mismatch');
          return;
        }
        writeAllUpcomingState({
          ...payload,
          restoreAttempts: restoreAttempts + 1,
          lastProgressAt: new Date().toISOString()
        });
        submitHomeFilters(payload.homeYear || view.filters.year, payload.homeSemester || view.filters.semester);
        return;
      }
      return presentAllUpcomingResults(payload);
    }
    if (payload.phase === 'aborted') {
      syncAllUpcomingOverlay(null);
    }
  }

async function continueAllUpcomingOnCourse(view, payload) {
    const target = getCurrentAllUpcomingTarget(payload);
    if (!target) {
      abortAllUpcoming(payload, 'missing-target');
      return;
    }
    const currentCourseHref = buildCourseCacheKey(view.course.course.links.materials || window.location.href);
    if (currentCourseHref !== buildCourseCacheKey(target.courseHref || target.href)) {
      abortAllUpcoming(payload, 'target-mismatch');
      return;
    }
    const mergedItems = mergeAllUpcomingItems(payload.items, collectAllUpcomingCourseItems(view, target))
      .filter((item) => isUpcomingDueWithinDays(item, ALL_UPCOMING_WINDOW_DAYS))
      .map(serializeAllUpcomingItem);
    const nextIndex = payload.currentIndex + 1;
    if (nextIndex < payload.targets.length) {
      const nextPayload = writeAllUpcomingState({
        ...payload,
        phase: 'navigating-to-course',
        currentIndex: nextIndex,
        visitedCourseCount: nextIndex,
        items: mergedItems,
        lastProcessedCourse: currentCourseHref,
        lastProgressAt: new Date().toISOString()
      });
      navigateToAllUpcomingTarget(nextPayload);
      return;
    }
    restoreAllUpcomingState({
      ...payload,
      phase: 'restoring-home',
      currentIndex: nextIndex,
      visitedCourseCount: nextIndex,
      items: mergedItems,
      lastProcessedCourse: currentCourseHref,
      collectedAt: new Date().toISOString(),
      lastProgressAt: new Date().toISOString()
    });
  }

function collectAllUpcomingCourseItems(view, target) {
    const items = parseUpcomingFromCourse(document, view?.course?.course?.links?.materials || target?.courseHref || target?.href || '');
    return items.filter((item) => isUpcomingDueWithinDays(item, ALL_UPCOMING_WINDOW_DAYS));
  }

function mergeAllUpcomingItems(existingItems = [], nextItems = []) {
    const keyed = new Map();
    const push = (item) => {
      const key = buildAllUpcomingIdentityKey(item);
      if (!key) return;
      keyed.set(key, item);
    };
    hydrateAllUpcomingItems(existingItems).forEach(push);
    (nextItems || []).forEach(push);
    return [...keyed.values()].sort(compareAllUpcomingResults);
  }

function buildAllUpcomingIdentityKey(item) {
    const courseHref = buildCourseCacheKey(item?.courseHref || item?.href || '') || String(item?.courseHref || item?.href || '');
    const title = String(item?.title || '').replace(/\s+/g, ' ').trim();
    const dueDate = typeof item?.dueDate?.getTime === 'function' ? item.dueDate.getTime() : Date.parse(item?.dueDate || '');
    return courseHref || title ? `${courseHref}::${title}::${dueDate}` : '';
  }

function compareAllUpcomingResults(a, b) {
    const aDue = typeof a?.dueDate?.getTime === 'function' ? a.dueDate.getTime() : NaN;
    const bDue = typeof b?.dueDate?.getTime === 'function' ? b.dueDate.getTime() : NaN;
    const aHasDue = Number.isFinite(aDue);
    const bHasDue = Number.isFinite(bDue);
    if (aHasDue !== bHasDue) return aHasDue ? -1 : 1;
    if (aHasDue && bHasDue && aDue !== bDue) return aDue - bDue;
    const courseCompare = String(a?.courseTitle || '').localeCompare(String(b?.courseTitle || ''), 'ja');
    if (courseCompare !== 0) return courseCompare;
    return String(a?.title || '').localeCompare(String(b?.title || ''), 'ja');
  }

function serializeAllUpcomingItem(item) {
    return {
      title: item.title,
      type: item.type,
      availability: item.availability,
      dueDate: item.dueDate?.toISOString?.() || '',
      href: item.href,
      detailHref: item.detailHref,
      historyHref: item.historyHref,
      usageText: item.usageText,
      usageCount: item.usageCount,
      hasUsage: item.hasUsage,
      usageKnown: item.usageKnown,
      courseHref: item.courseHref,
      courseTitle: item.courseTitle,
      courseNote: item.courseNote,
      hasCourseDueFlag: item.hasCourseDueFlag,
      scheduleIndex: item.scheduleIndex
    };
  }

function hydrateAllUpcomingItems(items = []) {
    return (items || []).map((item) => {
      const dueDate = item?.dueDate ? new Date(item.dueDate) : null;
      if (!dueDate || Number.isNaN(dueDate.getTime())) return null;
      return {
        ...item,
        dueDate
      };
    }).filter(Boolean);
  }

function getAllUpcomingCollectionTargets(scheduleEntries = [], otherCourseGroups = []) {
    const seen = new Set();
    const targets = [];
    const pushTarget = (entry, sortIndex) => {
      const href = entry?.href || '';
      const courseHref = buildCourseCacheKey(href);
      if (!courseHref || seen.has(courseHref)) return;
      seen.add(courseHref);
      targets.push({
        href,
        courseHref,
        title: entry?.title || '',
        note: entry?.note || '',
        sortIndex: sortIndex ?? Number.MAX_SAFE_INTEGER
      });
    };
    (scheduleEntries || []).forEach((entry, index) => pushTarget(entry, entry?.sortIndex ?? index));
    (otherCourseGroups || []).forEach((group, groupIndex) => {
      (group?.items || []).forEach((item, itemIndex) => {
        pushTarget(item, (scheduleEntries?.length || 0) + (groupIndex * 1000) + itemIndex);
      });
    });
    return targets.sort((a, b) => (a.sortIndex ?? Number.MAX_SAFE_INTEGER) - (b.sortIndex ?? Number.MAX_SAFE_INTEGER));
  }

function navigateToAllUpcomingTarget(payload) {
    if (isPageLeaving()) {
      abortAllUpcoming(payload, 'page-leaving');
      return;
    }
    const target = getCurrentAllUpcomingTarget(payload);
    if (!target?.href) {
      abortAllUpcoming(payload, 'missing-target-href');
      return;
    }
    syncAllUpcomingOverlay(payload);
    window.location.href = target.href;
  }

function restoreAllUpcomingState(payload, reason = '') {
    if (isPageLeaving()) {
      abortAllUpcoming(payload, 'page-leaving');
      return;
    }
    const currentPayload = payload || readAllUpcomingState() || {};
    const restoreAttempts = Number(currentPayload.restoreAttempts || 0) + 1;
    if (restoreAttempts > ALL_UPCOMING_MAX_RESTORE_ATTEMPTS) {
      abortAllUpcoming(currentPayload, reason ? `restore-limit:${reason}` : 'restore-limit');
      return;
    }
    const nextPayload = writeAllUpcomingState({
      ...currentPayload,
      phase: 'restoring-home',
      restoreAttempts,
      abortReason: reason || payload?.abortReason || '',
      lastProgressAt: new Date().toISOString(),
      collectedAt: currentPayload.collectedAt || new Date().toISOString()
    });
    syncAllUpcomingOverlay(nextPayload);
    const homeUrl = nextPayload.homeUrl || absoluteUrl('/webclass/');
    if (normalizeAllUpcomingHomeUrl(window.location.href) !== normalizeAllUpcomingHomeUrl(homeUrl)) {
      window.location.href = homeUrl;
      return;
    }
    if ((state.currentRoute?.name === 'home' || state.currentRoute?.name === 'home-all-upcoming') && state.currentView && doesAllUpcomingMatchCurrentView(state.currentView, nextPayload)) {
      return presentAllUpcomingResults(nextPayload);
    }
  }

function abortAllUpcoming(payload, reason = 'aborted') {
    const nextPayload = writeAllUpcomingState({
      ...(payload || readAllUpcomingState() || {}),
      phase: 'aborted',
      abortReason: reason,
      lastProgressAt: new Date().toISOString()
    });
    syncAllUpcomingOverlay(nextPayload);
    return nextPayload;
  }

function presentAllUpcomingResults(payload) {
    const now = new Date().toISOString();
    const resultUrl = payload?.resultUrl || buildAllUpcomingUrl(payload?.homeUrl || window.location.href);
    if (window.history?.replaceState) {
      window.history.replaceState(null, '', resultUrl);
    } else {
      window.location.hash = new URL(resultUrl, window.location.origin).hash;
    }
    const completedPayload = writeAllUpcomingState({
      ...(payload || {}),
      phase: 'completed',
      lastProgressAt: now,
      collectedAt: payload?.collectedAt || now,
      completedAt: now,
      resultUrl
    });
    syncAllUpcomingOverlay(null);
    if (state.currentContext) {
      state.currentRoute = detectRoute(window.location);
      state.currentView = buildHomeAllUpcomingView(document, state.currentContext);
      rerender();
    }
    return completedPayload;
  }

function doesAllUpcomingMatchCurrentView(view, payload) {
    if (!view || !payload) return false;
    const currentUrl = new URL(normalizeAllUpcomingHomeUrl(window.location.href), window.location.origin);
    const targetUrl = new URL(normalizeAllUpcomingHomeUrl(payload.homeUrl || absoluteUrl('/webclass/')), window.location.origin);
    return currentUrl.pathname === targetUrl.pathname
      && currentUrl.search === targetUrl.search
      && String(view.filters?.year || '') === String(payload.homeYear || '')
      && String(view.filters?.semester || '') === String(payload.homeSemester || '');
  }

function getCurrentAllUpcomingTarget(payload = readAllUpcomingState()) {
    return payload?.targets?.[payload.currentIndex] || null;
  }

function isAllUpcomingActive(payload = readAllUpcomingState()) {
    return !!payload && !['completed', 'aborted'].includes(String(payload.phase || ''));
  }

function normalizeAllUpcomingHomeUrl(href = '') {
    if (!href) return absoluteUrl('/webclass/');
    const url = new URL(absoluteUrl(href), window.location.origin);
    url.hash = '';
    return url.toString();
  }

function readAllUpcomingState() {
    try {
      const raw = window.sessionStorage?.getItem(ALL_UPCOMING_STATE_KEY) || '';
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const expiresAt = parsed.expiresAt ? Date.parse(parsed.expiresAt) : NaN;
      const lastProgressAt = parsed.lastProgressAt ? Date.parse(parsed.lastProgressAt) : NaN;
      const expiredByExpiresAt = Number.isFinite(expiresAt) && expiresAt <= Date.now();
      const stalledWhileActive = isAllUpcomingActive(parsed)
        && Number.isFinite(lastProgressAt)
        && (Date.now() - lastProgressAt) > ALL_UPCOMING_STALL_MS;
      if (expiredByExpiresAt || stalledWhileActive) {
        window.sessionStorage?.removeItem(ALL_UPCOMING_STATE_KEY);
        return null;
      }
      return parsed;
    } catch (error) {
      return null;
    }
  }

function writeAllUpcomingState(payload) {
    try {
      window.sessionStorage?.setItem(ALL_UPCOMING_STATE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn('[KU Redesign] failed to write all-upcoming state', error);
    }
    return payload;
  }

function clearAllUpcomingState() {
    try {
      window.sessionStorage?.removeItem(ALL_UPCOMING_STATE_KEY);
    } catch (error) {
      console.warn('[KU Redesign] failed to clear all-upcoming state', error);
    }
  }

function shouldSuppressAllUpcomingSideEffects(courseHref = '') {
    const payload = readAllUpcomingState();
    if (!isAllUpcomingActive(payload)) return false;
    const target = getCurrentAllUpcomingTarget(payload);
    if (!target) return false;
    return buildCourseCacheKey(target.courseHref || target.href) === buildCourseCacheKey(courseHref || window.location.href);
  }

function syncAllUpcomingOverlay(payload = readAllUpcomingState()) {
    if (!isAllUpcomingActive(payload)) {
      document.getElementById('ku-all-upcoming-overlay')?.remove();
      return;
    }
    const total = Math.max(0, payload.targets?.length || 0);
    const currentTarget = payload.phase === 'restoring-home' ? null : getCurrentAllUpcomingTarget(payload);
    const currentIndex = Number(payload.currentIndex) || 0;
    const step = payload.phase === 'restoring-home'
      ? total
      : total ? Math.min(total, Math.max(1, currentIndex + 1)) : 0;
    const progressLabel = `${step} / ${total}`;
    const percent = total ? Math.min(100, Math.max(0, Math.round((step / total) * 100))) : 0;
    const subtitle = payload.phase === 'arming'
      ? '一覧を準備しています…'
      : payload.phase === 'restoring-home'
        ? '専用ページへ戻しています…'
        : `対象 ${progressLabel} を確認中…`;
    const note = currentTarget?.title
      ? `現在: ${truncate(currentTarget.title, 56)}`
      : payload.phase === 'restoring-home'
        ? '収集結果をまとめています'
        : '';
    const noteHtml = note ? `<div class="ku-home-refresh-note">${escapeHtml(note)}</div>` : '';
    let overlay = document.getElementById('ku-all-upcoming-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ku-all-upcoming-overlay';
      (document.body || document.documentElement).appendChild(overlay);
    }
    overlay.innerHTML = `<div class="ku-home-refresh-box" role="status" aria-live="polite" aria-busy="true"><div class="ku-spinner"></div><div class="ku-home-refresh-content"><strong class="ku-home-refresh-title">課題を集約しています。しばらくお待ちください。</strong><div class="ku-home-refresh-subtitle">${escapeHtml(subtitle)}</div><div class="ku-home-refresh-progress-head"><span>進捗</span><strong>${progressLabel}</strong></div><div class="ku-home-refresh-progress-track" aria-hidden="true"><span class="ku-home-refresh-progress-value" style="width:${escapeAttr(percent)}%"></span></div>${noteHtml}</div></div>`;
  }

function formatAllUpcomingCollectedAt(value = '') {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
