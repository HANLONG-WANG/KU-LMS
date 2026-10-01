/* src/content/services/documents.js */

function loadSupplementalDocument(url) {
    const normalized = absoluteUrl(url || '/webclass/');
    if (state.supplementalCache.has(normalized)) {
      return Promise.resolve(cloneDocument(state.supplementalCache.get(normalized)));
    }
    if (!supplementalDocumentsInFlight.has(normalized)) {
      const cacheEpoch = supplementalDocumentCacheEpoch;
      const pending = fetchLmsResource(normalized, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      }).then(({ text, url: responseUrl }) => {
        const parsed = new DOMParser().parseFromString(text, 'text/html');
        if (isSupplementalAuthDocument(parsed, text, responseUrl)) {
          throw new Error('supplemental authentication required');
        }
        const bodyText = String(parsed.body?.textContent || parsed.body?.innerText || text);
        if (/コース利用中に、別のコースへのアクセスがリクエストされました|関大LMSの他のウインドウやタブをすべて閉じ/.test(bodyText)) {
          throw new Error('supplemental course conflict');
        }
        if (cacheEpoch === supplementalDocumentCacheEpoch) {
          state.supplementalCache.set(normalized, parsed);
        }
        return parsed;
      }).catch((error) => {
        lmsRequestFailureSinceResume = true;
        throw error;
      }).finally(() => {
        if (supplementalDocumentsInFlight.get(normalized) === pending) {
          supplementalDocumentsInFlight.delete(normalized);
        }
      });
      supplementalDocumentsInFlight.set(normalized, pending);
    }
    return supplementalDocumentsInFlight.get(normalized).then(cloneDocument);
  }

function cloneDocument(doc) {
    return new DOMParser().parseFromString(doc.documentElement.outerHTML, 'text/html');
  }

var LMS_REQUEST_TIMEOUT_MS = 12000;
var lmsRequestQueue = Promise.resolve();
var lmsPendingRequests = new Set();
var lmsNavigationPending = false;
var lmsRequestFailureSinceResume = false;
var supplementalDocumentsInFlight = new Map();
var supplementalDocumentCacheEpoch = 0;

function invalidateLmsDocumentCache() {
    supplementalDocumentCacheEpoch += 1;
    state.supplementalCache.clear();
    supplementalDocumentsInFlight.clear();
  }

function resumeLmsPageRequests(options = {}) {
    lmsNavigationPending = false;
    if (options.afterNavigation) lmsRequestFailureSinceResume = false;
  }

function isSupplementalAuthDocument(doc, html = '', responseUrl = '') {
    const path = new URL(responseUrl || window.location.href, window.location.href).pathname;
    return /\/webclass\/(?:login|logout)\.php(?:\/|$)/.test(path)
      || /window\s*\.\s*top\s*\.\s*location(?:\s*\.\s*href)?\s*=\s*['"][^'"]*\/webclass\/login\.php/.test(html)
      || (!!doc.querySelector('input[type="password"], input[name="val"]')
        && !!doc.querySelector('input[name="username"], input[autocomplete="username"]'))
      || (typeof isAuthInvalidPage === 'function' && isAuthInvalidPage(doc));
  }

function fetchLmsResource(url, options = {}) {
    if (lmsNavigationPending || isPageLeaving()) {
      return Promise.reject(new DOMException('Page navigation is pending', 'AbortError'));
    }
    if (lmsRequestFailureSinceResume) return Promise.reject(new Error('Reload the page before retrying LMS requests'));
    const normalized = new URL(absoluteUrl(url), window.location.href);
    if (normalized.origin !== window.location.origin || !normalized.pathname.startsWith('/webclass/')) {
      return Promise.reject(new Error('Refusing an unexpected LMS request URL'));
    }
    const request = lmsRequestQueue.catch(() => undefined).then(async () => {
      if (lmsRequestFailureSinceResume) throw new Error('Previous LMS request did not complete safely');
      const controller = new AbortController();
      const pageSignal = options.signal || getPageRequestSignal();
      const abortForPage = () => controller.abort(pageSignal?.reason);
      if (pageSignal?.aborted) abortForPage();
      else pageSignal?.addEventListener('abort', abortForPage, { once: true });
      if (controller.signal.aborted) throw new DOMException('LMS request aborted', 'AbortError');
      let timer;
      const timedOut = new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('LMS request timed out'));
          controller.abort('timeout');
        }, LMS_REQUEST_TIMEOUT_MS);
      });
      const aborted = new Promise((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(new DOMException('LMS request aborted', 'AbortError')), { once: true });
        if (controller.signal.aborted) reject(new DOMException('LMS request aborted', 'AbortError'));
      });
      try {
        return await Promise.race([
          (async () => {
            const response = await fetch(normalized.href, {
              credentials: 'include',
              redirect: 'follow',
              ...options,
              signal: controller.signal
            });
            if (!response.ok) throw new Error(`LMS HTTP ${response.status}`);
            const finalUrl = new URL(response.url || normalized.href, normalized.href);
            if (finalUrl.origin !== normalized.origin || !finalUrl.pathname.startsWith('/webclass/')
              || /\/webclass\/(?:login|logout)\.php(?:\/|$)/.test(finalUrl.pathname)) {
              throw new Error('LMS response redirected outside the authenticated page');
            }
            const text = await response.text();
            if (/^\s*</.test(text)) {
              const doc = new DOMParser().parseFromString(text, 'text/html');
              if (isSupplementalAuthDocument(doc, text, finalUrl.href)) throw new Error('LMS authentication required');
              const bodyText = String(doc.body?.textContent || doc.body?.innerText || text);
              if (/コース利用中に、別のコースへのアクセスがリクエストされました|関大LMSの他のウインドウやタブをすべて閉じ/.test(bodyText)) {
                throw new Error('LMS course conflict');
              }
            }
            return { text, url: finalUrl.href };
          })(),
          timedOut,
          aborted
        ]);
      } finally {
        clearTimeout(timer);
        pageSignal?.removeEventListener('abort', abortForPage);
      }
    });
    lmsPendingRequests.add(request);
    lmsRequestQueue = request;
    request.then(
      () => lmsPendingRequests.delete(request),
      () => {
        lmsRequestFailureSinceResume = true;
        lmsPendingRequests.delete(request);
      }
    );
    return request;
  }

async function waitForLmsRequestsBeforeNavigation() {
    lmsNavigationPending = true;
    const pending = [...lmsPendingRequests];
    const results = await Promise.allSettled(pending);
    const safe = !isPageLeaving() && !lmsRequestFailureSinceResume
      && results.every((result) => result.status === 'fulfilled');
    if (!safe) lmsNavigationPending = false;
    return safe;
  }

function showCourseTraversalFailure(reason = '') {
    state.courseTraversalError = reason || 'request-not-settled';
    const existing = document.getElementById('ku-course-traversal-error');
    if (existing) existing.remove();
    const notice = document.createElement('div');
    notice.id = 'ku-course-traversal-error';
    notice.className = 'ku-card';
    notice.setAttribute('role', 'alert');
    notice.style.cssText = 'padding:16px;margin:16px;border:1px solid #b91c1c;color:#991b1b;background:#fff7f7';
    notice.textContent = reason === 'missing-native-course-exit'
      ? '課題の集約を停止しました。現在のコースを終了するリンクを確認できなかったため、別のコースへ移動していません。'
      : '課題の集約を停止しました。通信の完了を確認できなかったため、別のコースへ移動していません。ページを再読み込みしてからお試しください。';
    (document.getElementById(ROOT_ID) || document.body)?.appendChild(notice);
  }

function findTextHref(doc, text) {
    const anchor = Array.from(doc.querySelectorAll('a')).find((a) => a.textContent.includes(text));
    return anchor ? anchor.getAttribute('href') || '' : '';
  }

async function loadNotificationFeed(notificationsUrl = '') {
    const firstDoc = await loadSupplementalDocument(notificationsUrl || '/webclass/information.php/');
    const firstPage = parseNotificationsList(firstDoc);
    const pageCount = extractNotificationPageCount(firstPage.metaText);
    let allItems = [...firstPage.items];
    for (let page = 2; page <= pageCount; page += 1) {
      const pageUrl = buildNotificationPageUrl(notificationsUrl, page);
      const pageDoc = await loadSupplementalDocument(pageUrl);
      const parsed = parseNotificationsList(pageDoc);
      allItems = allItems.concat(parsed.items);
    }
    return {
      previewItems: firstPage.items,
      allItems
    };
  }

function extractNotificationPageCount(metaText = '') {
    const match = String(metaText || '').match(/ページ\s+\d+\s*\/\s*(\d+)/);
    const total = Number(match?.[1] || 1);
    return Number.isFinite(total) && total > 0 ? total : 1;
  }

function buildNotificationPageUrl(baseUrl = '', page = 1) {
    const url = new URL(absoluteUrl(baseUrl || '/webclass/information.php/'));
    if (page <= 1) {
      url.searchParams.delete('page');
    } else {
      url.searchParams.set('page', String(page));
    }
    return url.toString();
  }
