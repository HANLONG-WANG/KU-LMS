/* src/content/parsers/manual.js */

function parseManualSections(doc) {
    const root = doc.querySelector('main') || doc.body;
    if (!root) return [];
    const headings = Array.from(root.querySelectorAll('h2, h3, h4'));
    const seen = new Set();
    return headings.map((heading) => {
      const title = heading.textContent.replace(/\s+/g, ' ').trim();
      if (!title || seen.has(title)) return null;
      seen.add(title);
      const description = [];
      const links = [];
      let node = heading.nextElementSibling;
      while (node && !/^H[234]$/i.test(node.tagName)) {
        const text = node.textContent.replace(/\s+/g, ' ').trim();
        if (text && !node.querySelector?.('a[href]') && !links.some((link) => link.label === text)) description.push(text);
        Array.from(node.querySelectorAll?.('a[href]') || []).forEach((anchor) => {
          const label = anchor.textContent.replace(/\s+/g, ' ').trim();
          if (!label || label.includes('このウィンドウを閉じる')) return;
          links.push({
            label,
            href: absoluteUrl(anchor.getAttribute('href')),
            meta: anchor.parentElement?.textContent.replace(anchor.textContent, '').replace(/\s+/g, ' ').trim() || ''
          });
        });
        node = node.nextElementSibling;
      }
      return {
        title,
        description: uniqueBy(description, (item) => item).slice(0, 3),
        links: uniqueBy(links, (item) => item.href || item.label)
      };
    }).filter((section) => section && (section.description.length || section.links.length));
  }
