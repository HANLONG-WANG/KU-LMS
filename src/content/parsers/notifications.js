/* src/content/parsers/notifications.js */

function parseNotificationsList(doc) {
    const items = Array.from(doc.querySelectorAll('.info-list li.odd, .info-list li.eve, .info-list li.even, .info-list li.last'))
      .map((row) => {
        const link = row.querySelector('a[href*="information.php/post"]');
        if (!link) return null;
        const source = cleanText(row.querySelector('.exhibitionInfo')?.textContent || '');
        const sourceParts = source.split(/\s+-\s+/);
        const publication = sourceParts.find((part) => /^\d{4}\/\d{1,2}\/\d{1,2}(?:\s|$)/.test(part) && !part.includes('公開期限')) || '';
        const deadline = source.match(/公開期限\s*[:：]\s*[\s\S]*$/)?.[0] || '';
        return {
          title: link.textContent.trim(),
          href: absoluteUrl(link.getAttribute('href')),
          source,
          issuer: sourceParts[0] || '',
          publishedAt: publication,
          deadline,
          important: !!row.querySelector('.mark1')
        };
      })
      .filter(Boolean);
    const pagination = Array.from(doc.querySelectorAll('a[href*="page="]')).map((a) => ({
      text: a.textContent.trim(), href: absoluteUrl(a.getAttribute('href'))
    }));
    const metaText = cleanText(doc.querySelector('.info-list .head, li.head')?.textContent || '');
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
    const metaNodes = [
      ...Array.from(detailHead?.querySelectorAll('.postBy') || []),
      ...Array.from(detailHead?.querySelectorAll('.data > div') || [])
    ];
    const readMetadata = (label) => {
      const node = metaNodes.find((item) => cleanText(item.textContent).startsWith(label));
      const source = cleanText(node?.textContent || detailHead?.textContent || '');
      const match = source.match(new RegExp('(?:^|\\s)' + label + '\\s*[:：]\\s*([\\s\\S]*?)(?=\\s*(?:発行元|発行日|更新日|公開期限|発行先)\\s*[:：]|$)'));
      return cleanText(match?.[1] || '');
    };
    const issuer = readMetadata('発行元');
    const publishedAt = readMetadata('発行日');
    const updatedAt = readMetadata('更新日');
    const deadline = cleanText(detailHead?.querySelector('.closedAt')?.textContent || '');
    const audience = readMetadata('発行先');
    const authorLink = detailHead?.querySelector('.postBy a[href]');
    return {
      kind: body ? 'detail' : 'error',
      title,
      navigation: {
        prev: navLinks.find((item) => item.text.includes('前へ')) || null,
        list: navLinks.find((item) => item.text.includes('一覧に戻る')) || null,
        next: navLinks.find((item) => item.text.includes('次へ')) || null
      },
      metadata: {
        issuer,
        publishedAt,
        updatedAt,
        deadline,
        audience,
        authorLabel: cleanText(authorLink?.textContent || ''),
        authorHref: absoluteUrl(authorLink?.getAttribute('href') || '')
      },
      bodyHtml: body?.innerHTML?.trim() || '',
      errorMessage,
      pageTitle: cleanText(doc.querySelector('.infopkg h3')?.textContent || 'お知らせ')
    };
  }
