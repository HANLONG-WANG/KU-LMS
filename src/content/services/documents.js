/* src/content/services/documents.js */

function loadSupplementalDocument(url) {
    const normalized = absoluteUrl(url || '/webclass/');
    if (state.supplementalCache.has(normalized)) {
      return Promise.resolve(cloneDocument(state.supplementalCache.get(normalized)));
    }
    state.supplementalCache.queue = ((state.supplementalCache.queue || Promise.resolve()).catch(() => undefined)).then(async () => {
      const response = await fetch(normalized, {
        credentials: 'include',
        redirect: 'follow',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        signal: getPageRequestSignal()
      });
      const html = await response.text();
      if (/コース利用中に、別のコースへのアクセスがリクエストされました/.test(html)) {
        throw new Error(`supplemental course conflict: ${normalized}`);
      }
      if (/window\.top\.location\.href="\/webclass\/login\.php"/.test(html)) {
        throw new Error(`supplemental login redirect: ${normalized}`);
      }
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      state.supplementalCache.set(normalized, parsed);
      return cloneDocument(parsed);
    });
    return state.supplementalCache.queue;
  }

function cloneDocument(doc) {
    return new DOMParser().parseFromString(doc.documentElement.outerHTML, 'text/html');
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
