/* src/content/parsers/messages.js */

function parseMessagesTable(doc) {
    const form = doc.forms.condition;
    const table = doc.querySelector('#MsgListTable');
    const rows = table ? Array.from(table.querySelectorAll('tr.odd, tr.even')).map((tr, index) => {
      const cells = Array.from(tr.children);
      const checkbox = cells[0]?.querySelector('input[type="checkbox"]');
      return {
        id: checkbox?.value || `row-${index}`,
        inputName: checkbox?.name || `id[${index}]`,
        sender: cells[1]?.textContent.trim() || '',
        userId: cells[2]?.textContent.trim() || '',
        subject: cells[3]?.textContent.trim() || '',
        href: absoluteUrl(cells[3]?.querySelector('a')?.getAttribute('href') || ''),
        attachments: cells[4]?.textContent.trim() || '',
        date: cells[5]?.textContent.trim() || ''
      };
    }) : [];
    const pagination = {
      prev: findTextHref(doc, '前へ'),
      next: findTextHref(doc, '次へ'),
      last: Array.from(doc.querySelectorAll('a')).find((a) => a.textContent.trim() === '>>')?.getAttribute('href') || '',
      pageText: Array.from(doc.querySelectorAll('font')).find((font) => /\d+\s*\/\d+/.test(font.textContent))?.textContent.trim() || ''
    };
    const folders = Array.from(doc.querySelectorAll('.navi a')).map((a) => ({ title: a.textContent.replace(/^»\s*/, '').trim(), href: absoluteUrl(a.getAttribute('href')) }));
    const sortLinks = Array.from(doc.querySelectorAll('#MsgListTable thead a')).map((a) => ({ label: a.parentElement?.textContent.trim() || a.textContent.trim(), href: a.getAttribute('href') || '' }));
    return { form, rows, pagination, folders, sortLinks };
  }

function parseMessagePreview(doc) {
    const data = parseMessagesTable(doc);
    return { total: data.rows.length, items: data.rows.slice(0, 4) };
  }
