/* src/content/parsers/shared.js */

function parseTopLinks(doc, route = null) {
    const links = {};
    const all = nativeQuerySelectorAll(doc, 'a[href]');
    const get = (matcher) => {
      const anchor = all.find((a) => matcher(a));
      return anchor ? absoluteUrl(anchor.getAttribute('href')) : '';
    };
    const inboxLinks = all
      .map((anchor) => absoluteUrl(anchor.getAttribute('href') || ''))
      .filter((href) => isCanonicalInboxHref(href));
    const contextualInboxCandidate = inboxLinks[0] || '';
    const currentPageInboxHref = absoluteUrl(nativeQuerySelectorAll(doc, '.navi a[href]')
      .find((a) => cleanText(a.textContent).includes('受信箱'))?.getAttribute('href') || '');
    const observedMobileMessageHref = get((a) => isObservedMobileMessageHref(a.getAttribute('href') || ''));
    const globalInboxHref = getDefaultGlobalInboxHref();
    const contextualInboxHref = isSupportedMessageContextSourceRoute(route?.name)
      ? (currentPageInboxHref || contextualInboxCandidate)
      : '';
    links.home = absoluteUrl('/webclass/');
    links.courses = absoluteUrl('/webclass/');
    links.returnToCourses = get((a) => /\/webclass\/course\.php\/[^/?#]+\/logout(?:[/?#]|$)/.test(a.getAttribute('href') || ''));
    if (route?.name?.startsWith('course-') && links.returnToCourses) {
      links.home = links.returnToCourses;
      links.courses = links.returnToCourses;
    }
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
    const explicit = nativeQuerySelector(doc, 'a[title="アカウントメニュー"], [data-account-name], .account-menu__name, #account-name');
    if (explicit) return cleanText(explicit.getAttribute?.('data-account-name') || explicit.textContent || '');
    const toggles = nativeQuerySelectorAll(doc, 'a.dropdown-toggle, button.dropdown-toggle');
    const account = toggles.find((node) => {
      const menu = node.nextElementSibling || node.parentElement;
      return !!menu?.querySelector?.('a[href*="/user.php/config"], .account-menu__menu__link[href*="/course.php/"][href*="/logout"]');
    });
    return account ? cleanText(account.textContent || '') : '';
  }

function parseLanguage(doc) {
    const link = Array.from(doc.querySelectorAll('a')).find((a) => a.textContent.trim() === '日本語' || a.textContent.trim() === '言語');
    if (!link) return '日本語';
    return '日本語';
  }
