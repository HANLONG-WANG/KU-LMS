/* src/content/parsers/messages.js */

function parseMessagesTable(doc, routeName = '') {
    const form = doc.forms.condition;
    const table = doc.querySelector('#MsgListTable');
    const columns = parseMessageColumns(table);
    const rows = table ? Array.from(table.querySelectorAll('tr.odd, tr.even')).map((tr, index) => {
      const cells = Array.from(tr.children);
      const checkbox = cells[0]?.querySelector('input[type="checkbox"]');
      const rowCells = columns.map((column, cellIndex) => {
        const cell = cells[cellIndex];
        const anchor = cell?.querySelector('a[href]');
        return {
          key: column.key,
          text: cleanText(cell?.textContent?.replace(/\u00a0/g, ' ') || ''),
          href: absoluteUrl(anchor?.getAttribute('href') || '')
        };
      });
      const subjectCell = rowCells.find((cell) => cell.key === 'subject') || rowCells.find((cell) => cell.href);
      return {
        id: checkbox?.value || `row-${index}`,
        inputName: checkbox?.name || `id[${index}]`,
        href: subjectCell?.href || '',
        subject: subjectCell?.text || '',
        cells: rowCells
      };
    }) : [];
    const pagination = {
      prev: findTextHref(doc, '前へ'),
      next: findTextHref(doc, '次へ'),
      last: Array.from(doc.querySelectorAll('a')).find((a) => a.textContent.trim() === '>>')?.getAttribute('href') || '',
      pageText: Array.from(doc.querySelectorAll('font')).find((font) => /\d+\s*\/\d+/.test(font.textContent))?.textContent.trim() || ''
    };
    const folders = Array.from(doc.querySelectorAll('.navi a')).map((a) => ({ title: a.textContent.replace(/^»\s*/, '').trim(), href: absoluteUrl(a.getAttribute('href')) }));
    const actions = Array.from(form?.querySelectorAll('input[type="submit"][name]') || []).map((input) => ({
      name: input.name,
      label: cleanText(input.value || input.textContent || ''),
      onclick: input.getAttribute('onclick') || ''
    }));
    const warning = cleanText(doc.querySelector('.msg h3 + div')?.textContent || '');
    const folder = inferMessageFolder(routeName, doc);
    return {
      form,
      rows,
      columns,
      pagination,
      folders,
      actions,
      warning,
      folder,
      selectionScope: routeName || `messages-${folder}`,
      heading: cleanText(doc.querySelector('.msg h3')?.textContent || doc.querySelector('h3')?.textContent || '')
    };
  }

function parseMessagePreview(doc) {
    const data = parseMessagesTable(doc, 'messages-inbox');
    return { total: data.rows.length, items: data.rows.slice(0, 4) };
  }

function inferMessageFolder(routeName = '', doc) {
    if (routeName === 'messages-outbox') return 'outbox';
    if (routeName === 'messages-recyclebox') return 'recyclebox';
    if (routeName === 'messages-inbox') return 'inbox';
    const heading = cleanText(doc.querySelector('.msg h3')?.textContent || '');
    if (heading.includes('送信済箱')) return 'outbox';
    if (heading.includes('ゴミ箱')) return 'recyclebox';
    return 'inbox';
  }

function parseMessageColumns(table) {
    return Array.from(table?.querySelectorAll('thead th') || []).map((th, index) => ({
      key: getMessageColumnKey(cleanText(th.textContent.replace(/[▲▼]/g, ' ')), index),
      label: cleanText(th.textContent.replace(/[▲▼]/g, ' ')),
      sortLinks: Array.from(th.querySelectorAll('a[href]')).map((a) => ({
        text: cleanText(a.textContent),
        href: a.getAttribute('href') || ''
      }))
    }));
  }

function getMessageColumnKey(label = '', index = 0) {
    if (index === 0) return 'select';
    if (label.includes('差出人')) return 'sender';
    if (label.includes('ユーザID')) return 'userId';
    if (label.includes('宛先')) return 'recipient';
    if (label.includes('件名')) return 'subject';
    if (label.includes('添付ファイル')) return 'attachments';
    if (label.includes('日付')) return 'date';
    return `column-${index}`;
  }
