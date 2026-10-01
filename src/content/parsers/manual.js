/* src/content/parsers/manual.js */

function parseManualSections(doc) {
    const root = nativeQuerySelector(doc, '#js-main') || nativeQuerySelector(doc, 'main') || doc.body;
    if (!root) return [];
    const safeUrl = (raw, image = false) => {
      if (!raw) return '';
      try {
        const url = new URL(absoluteUrl(raw), window.location.href || window.location.origin);
        return (image ? ['http:', 'https:'] : ['http:', 'https:', 'mailto:', 'tel:']).includes(url.protocol) ? url.href : '';
      } catch { return ''; }
    };
    const headings = nativeQuerySelectorAll(root, 'h2, h3, h4');
    return headings.map((heading) => {
      const title = cleanText(heading.textContent || '');
      if (!title) return null;
      const nodes = [];
      let node = heading.nextElementSibling;
      while (node && !/^H[234]$/i.test(node.tagName)) {
        if (!isExtensionOwnedNode(node) && !/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|FORM|INPUT|BUTTON)$/i.test(node.tagName)) nodes.push(node);
        node = node.nextElementSibling;
      }
      const description = nodes.map((element) => String(element.innerText || element.textContent || '').trim()).filter(Boolean);
      const links = nodes.flatMap((element) => {
        const anchors = element.matches?.('a[href]') ? [element] : Array.from(element.querySelectorAll?.('a[href]') || []);
        return anchors.map((anchor) => ({ label: cleanText(anchor.textContent || ''), href: safeUrl(anchor.getAttribute('href') || ''),
          meta: cleanText(anchor.parentElement?.textContent?.replace(anchor.textContent || '', '') || '') }))
          .filter((link) => link.label && link.href && !/このウィンドウを閉じる/.test(link.label));
      });
      const bodyHtml = nodes.map((element) => {
        if (!element.cloneNode) return '';
        const copy = element.cloneNode(true);
        copy.querySelectorAll('script, style, iframe, object, embed, form, input, button').forEach((unsafe) => unsafe.remove());
        [copy, ...copy.querySelectorAll('*')].forEach((child) => {
          Array.from(child.attributes || []).forEach((attribute) => {
            if (/^on/i.test(attribute.name) || attribute.name === 'id' || attribute.name === 'style') child.removeAttribute(attribute.name);
          });
          if (child.hasAttribute?.('href')) {
            const href = safeUrl(child.getAttribute('href') || '');
            if (!href) child.removeAttribute('href');
            else child.setAttribute('href', href);
          }
          if (child.hasAttribute?.('src')) {
            const src = safeUrl(child.getAttribute('src') || '', true);
            if (!src) child.removeAttribute('src');
            else child.setAttribute('src', src);
          }
          if (child.getAttribute?.('target') === '_blank') child.setAttribute('rel', 'noopener noreferrer');
        });
        return copy.outerHTML || '';
      }).join('');
      return description.length || links.length ? { title, description, links: uniqueBy(links, (link) => link.href), bodyHtml } : null;
    }).filter(Boolean);
  }
