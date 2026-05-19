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
