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
      kind: 'list',
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

function parseMessageDetail(doc) {
    const folders = Array.from(doc.querySelectorAll('.navi a')).map((a) => ({
      title: a.textContent.replace(/^»\s*/, '').trim(),
      href: absoluteUrl(a.getAttribute('href'))
    }));
    const folder = inferMessageDetailFolder(doc);
    const modeLabel = parseMessageDetailModeLabel(doc, folder);
    const pagerItems = Array.from(doc.querySelectorAll('.pager li, .iterator li')).map((item) => {
      const anchor = item.querySelector('a[href]');
      return {
        text: cleanText(item.textContent),
        href: absoluteUrl(anchor?.getAttribute('href') || '')
      };
    }).filter((item) => item.text);
    const table = doc.querySelector('#MessageData');
    const metadata = parseMessageDetailMetadata(table);
    const bodyCell = table?.querySelector('td.MessageBody, td.messageBody');
    const bodyFooter = table?.querySelector('td.messageFoot');
    const forwardForm = Array.from(doc.querySelectorAll('form') || []).find((form) => (form.getAttribute('action') || '').includes('msg_viewer.php')) || null;
    const forwardInput = forwardForm?.querySelector('input[name="f_address"]');
    const forwardButton = forwardForm?.querySelector('input[type="submit"][name]');
    const downloadLink = Array.from(doc.querySelectorAll('a[href]')).find((a) => cleanText(a.textContent).includes('ダウンロード'));
    const replyLink = bodyFooter?.querySelector('a[href]') || Array.from(doc.querySelectorAll('a[href]')).find((a) => cleanText(a.textContent).includes('返事を書く'));
    const closeLink = doc.querySelector('a.uppernavi[href]');
    const subjectMeta = metadata.find((item) => item.key === 'subject');
    const courseMeta = metadata.find((item) => item.key === 'course');
    const dateMeta = metadata.find((item) => item.key === 'date');
    const folderTitle = folder === 'outbox' ? '送信済箱' : folder === 'recyclebox' ? 'ゴミ箱' : '受信箱';
    const folderHref = folders.find((item) => item.title.includes(folderTitle))?.href || '';
    const title = subjectMeta?.text || cleanText((doc.title || '').replace(/\s*-\s*メッセージ\s*$/, ''));
    const headline = deriveMessageDetailHeadline(title);
    const excerpt = deriveMessageDetailExcerpt(bodyCell, title);
    return {
      kind: 'detail',
      folder,
      folders,
      folderHref,
      selectionScope: `messages-${folder}`,
      modeLabel,
      pageTitle: 'メッセージ詳細',
      title,
      headline,
      excerpt,
      subtitle: courseMeta?.text || dateMeta?.text || '',
      navigation: {
        prev: pagerItems.find((item) => item.text.includes('前へ')) || null,
        next: pagerItems.find((item) => item.text.includes('次へ')) || null
      },
      closeHref: absoluteUrl(closeLink?.getAttribute('href') || ''),
      forward: forwardForm && forwardInput && forwardButton ? {
        form: forwardForm,
        inputName: forwardInput.name || 'f_address',
        placeholder: forwardInput.getAttribute('title') || 'メールアドレス',
        buttonName: forwardButton.name || '',
        buttonLabel: cleanText(forwardButton.value || forwardButton.textContent || 'メールへ転送')
      } : null,
      downloadHref: absoluteUrl(downloadLink?.getAttribute('href') || ''),
      replyHref: absoluteUrl(replyLink?.getAttribute('href') || ''),
      metadata,
      bodyHtml: bodyCell?.innerHTML?.trim() || ''
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

function inferMessageDetailFolder(doc) {
    const activeLabel = cleanText(doc.querySelector('.navi dd.active a')?.textContent.replace(/^»\s*/, '') || '');
    if (activeLabel.includes('送信済箱')) return 'outbox';
    if (activeLabel.includes('ゴミ箱')) return 'recyclebox';
    const modeLabel = cleanText(Array.from(doc.querySelectorAll('.content font b, .content b') || []).map((node) => node.textContent).find((text) => /受信メッセージ|送信メッセージ/.test(cleanText(text))) || '');
    if (modeLabel.includes('送信')) return 'outbox';
    return 'inbox';
  }

function parseMessageDetailModeLabel(doc, folder = 'inbox') {
    const modeLabel = cleanText(Array.from(doc.querySelectorAll('.content font b, .content b') || []).map((node) => node.textContent).find((text) => /受信メッセージ|送信メッセージ/.test(cleanText(text))) || '');
    if (modeLabel) return modeLabel;
    return folder === 'outbox' ? '送信メッセージ' : folder === 'recyclebox' ? 'ゴミ箱メッセージ' : '受信メッセージ';
  }

function parseMessageDetailMetadata(table) {
    return Array.from(table?.querySelectorAll('tr') || []).map((tr) => {
      const th = tr.querySelector('th');
      const td = tr.querySelector('td');
      const label = cleanText(th?.textContent || '');
      if (!label || !td) return null;
      if ((th?.getAttribute('class') || '').includes('messageHead')) return null;
      if ((td.getAttribute('class') || '').match(/messageBody|MessageBody/)) return null;
      if ((td.getAttribute('class') || '').includes('messageFoot')) return null;
      const anchor = td.querySelector('a[href]');
      return {
        key: getMessageDetailMetaKey(label),
        label,
        text: cleanText(td.textContent),
        href: absoluteUrl(anchor?.getAttribute('href') || '')
      };
    }).filter(Boolean);
  }

function getMessageDetailMetaKey(label = '') {
    if (label.includes('件名')) return 'subject';
    if (label.includes('日付')) return 'date';
    if (label.includes('差出人')) return 'sender';
    if (label.includes('コース')) return 'course';
    if (label.includes('宛先')) return 'recipient';
    return label;
  }

function deriveMessageDetailHeadline(subject = '') {
    return cleanText(subject);
  }

function deriveMessageDetailExcerpt(bodyCell, subject = '') {
    const title = cleanText(subject);
    const subjectLead = cleanText(title.split('[')[0]);
    const lines = String(bodyCell?.textContent || '')
      .split(/\n+/)
      .map((line) => cleanText(line))
      .filter(Boolean)
      .filter((line) => !/^(提出日|提出者|コース\s*名|課題名|設問番号|提出ファイル名)\s*:/.test(line));
    const preferred = lines.find((line) => line !== title && line !== subjectLead);
    return preferred || '';
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
