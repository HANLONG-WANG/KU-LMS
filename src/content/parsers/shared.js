/* src/content/parsers/shared.js */

function parseTopLinks(doc, route = null) {
    const links = {};
    const all = Array.from(doc.querySelectorAll('a[href]'));
    const get = (matcher) => {
      const anchor = all.find((a) => matcher(a));
      return anchor ? absoluteUrl(anchor.getAttribute('href')) : '';
    };
    const inboxLinks = all
      .map((anchor) => absoluteUrl(anchor.getAttribute('href') || ''))
      .filter((href) => isCanonicalInboxHref(href));
    const contextualInboxCandidate = inboxLinks[0] || '';
    const currentPageInboxHref = absoluteUrl(Array.from(doc.querySelectorAll('.navi a[href]'))
      .find((a) => cleanText(a.textContent).includes('受信箱'))?.getAttribute('href') || '');
    const observedMobileMessageHref = get((a) => isObservedMobileMessageHref(a.getAttribute('href') || ''));
    const globalInboxHref = getDefaultGlobalInboxHref();
    const contextualInboxHref = isSupportedMessageContextSourceRoute(route?.name)
      ? (currentPageInboxHref || contextualInboxCandidate)
      : '';
    links.home = absoluteUrl('/webclass/');
    links.courses = absoluteUrl('/webclass/');
    links.messages = globalInboxHref;
    links.globalInboxHref = globalInboxHref;
    links.contextualInboxHref = contextualInboxHref;
    links.contextSourceRoute = contextualInboxHref ? route?.name || '' : '';
    links.canonicalMessageHref = contextualInboxHref || globalInboxHref;
    links.currentPageInboxHref = currentPageInboxHref || contextualInboxCandidate || globalInboxHref;
    links.observedMobileMessageHref = observedMobileMessageHref;
    links.notifications = normalizeNotificationsUrl(get((a) => (a.getAttribute('href') || '').includes('information.php')) || absoluteUrl('/webclass/information.php/'));
    links.manual = normalizeManualUrl(
      get((a) => {
        const text = a.textContent.replace(/\s+/g, ' ').trim();
        const href = a.getAttribute('href') || '';
        return text === 'マニュアル' || (href.includes('/user.php/manual') && !href.includes('/download/'));
      }) || absoluteUrl('/webclass/user.php/manual')
    );
    links.logout = get((a) => a.textContent.includes('ログアウト')) || absoluteUrl('/webclass/logout.php');
    return links;
  }

function parseUserName(doc) {
    const candidates = Array.from(doc.querySelectorAll('a, span')).map((el) => el.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const preferred = candidates.find((text) => /[\u3000\s]/.test(text) && /[\p{Script=Han}]/u.test(text) && !/関大LMS|ログアウト|日本語|コース/.test(text));
    return preferred || '';
  }

function parseLanguage(doc) {
    const link = Array.from(doc.querySelectorAll('a')).find((a) => a.textContent.trim() === '日本語' || a.textContent.trim() === '言語');
    if (!link) return '日本語';
    return '日本語';
  }
