/* src/content/parsers/notifications.js */

function parseNotificationsList(doc) {
    const items = Array.from(doc.querySelectorAll('.info-list li.odd, .info-list li.eve, .info-list li.even, .info-list li.last'))
      .map((row) => {
        const link = row.querySelector('a[href*="information.php/post"]');
        if (!link) return null;
        const source = row.querySelector('.exhibitionInfo')?.textContent.replace(/\s+/g, ' ').trim() || '';
        const deadline = source.includes('公開期限') ? source.split('-').find((text) => text.includes('公開期限'))?.trim() || '' : '';
        return {
          title: link.textContent.trim(),
          href: absoluteUrl(link.getAttribute('href')),
          source,
          deadline,
          important: /重要|最新版|中間テスト|注意/.test(link.textContent)
        };
      })
      .filter(Boolean);
    const pagination = Array.from(doc.querySelectorAll('a[href*="page="]')).map((a) => ({
      text: a.textContent.trim(), href: absoluteUrl(a.getAttribute('href'))
    }));
    const metaText = doc.querySelector('.info-list .head, li.head')?.textContent.replace(/\s+/g, ' ').trim() || Array.from(doc.querySelectorAll('body *')).find((el) => /ページ\s+\d+\s*\//.test(el.textContent))?.textContent.trim() || '';
    return { items, pagination, metaText };
  }

function parseNotificationDetail(doc) {
    const errorMessage = cleanText(doc.querySelector('.autoreportmsg td')?.textContent || '');
    const navLinks = Array.from(doc.querySelectorAll('.pager a, .iterator a')).map((a) => ({
      text: cleanText(a.textContent),
      href: absoluteUrl(a.getAttribute('href')),
      title: cleanText(a.getAttribute('title') || '')
    }));
    const detailHead = doc.querySelector('.info-detail-head');
    const title = cleanText(detailHead?.querySelector('h4')?.textContent || doc.querySelector('.infopkg h4')?.textContent || '');
    const body = doc.querySelector('.info-detail-body');
    const issuer = cleanText(Array.from(detailHead?.querySelectorAll('.postBy') || []).find((node) => node.textContent.includes('発行元'))?.textContent || '');
    const publishedAt = cleanText(Array.from(detailHead?.querySelectorAll('.postBy') || []).find((node) => node.textContent.includes('発行日'))?.textContent || '');
    const deadline = cleanText(detailHead?.querySelector('.closedAt')?.textContent || '');
    const audience = cleanText(Array.from(detailHead?.querySelectorAll('.data > div') || []).find((node) => node.textContent.includes('発行先'))?.textContent || '');
    const authorLink = detailHead?.querySelector('.postBy a[href]');
    return {
      kind: body ? 'detail' : 'error',
      title,
      navigation: {
        prev: navLinks.find((item) => item.text.includes('前へ')) || null,
        list: navLinks.find((item) => item.text.includes('一覧に戻る') || item.text === '一覧に戻る') || null,
        next: navLinks.find((item) => item.text.includes('次へ')) || null
      },
      metadata: {
        issuer,
        publishedAt,
        deadline,
        audience,
        authorLabel: cleanText(authorLink?.textContent || ''),
        authorHref: absoluteUrl(authorLink?.getAttribute('href') || '')
      },
      bodyHtml: body?.innerHTML?.trim() || '',
      errorMessage: errorMessage || '',
      pageTitle: cleanText(doc.querySelector('.infopkg h3')?.textContent || 'お知らせ')
    };
  }
