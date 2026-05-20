/* src/content/render/messages.js */

function renderMessages(view) {
    if (view.kind === 'detail') {
      return renderMessageDetail(view);
    }
    const selection = getMessageSelection(view);
    const filteredRows = view.rows.filter((row) => {
      if (!state.messageSearch) return true;
      const q = state.messageSearch.toLowerCase();
      return row.cells.map((cell) => cell.text).join(' ').toLowerCase().includes(q);
    });
    const gridTemplate = messageGridTemplate(view.columns || [], view);
    const isOutbox = view.folder === 'outbox';
    const layout = isOutbox ? 'outbox-ledger' : view.folder === 'recyclebox' ? 'recyclebox-grid' : 'inbox-grid';
    return `
      <div class="ku-sidebar-shell">
        ${renderSidebar(`messages-${view.folder}`)}
        <section class="ku-card ku-main-card">
          <div class="ku-main-card-header"><div><h1 class="ku-page-title">${escapeHtml(view.heading || 'メッセージ')}</h1><div class="ku-page-subtitle">${escapeHtml(view.pagination.pageText || '')}</div></div></div>
          ${view.warning ? `<div class="ku-message-warning">${escapeHtml(view.warning)}</div>` : ''}
          <div style="padding:0 20px 18px">
            <div class="ku-search-row">
              <div class="ku-actions-bar">
                ${view.actions.map((action) => `<button class="ku-button" data-action="message-native-action" data-native-action-name="${escapeAttr(action.name)}">${escapeHtml(action.label)}</button>`).join('')}
              </div>
              <div class="ku-search-wrap"><span class="ku-search-icon">${icon('search')}</span><input class="ku-search" data-action="message-search" type="search" value="${escapeAttr(state.messageSearch)}" placeholder="メッセージを検索"></div>
              <div class="ku-pagination">${renderMessagePagination(view.pagination)}</div>
            </div>
          </div>
          <div class="ku-message-table ${isOutbox ? 'ku-message-table-outbox' : ''}" data-message-layout="${layout}">
            <div class="ku-message-head ${isOutbox ? 'ku-message-head-outbox' : ''}" style="grid-template-columns:${escapeAttr(gridTemplate)}">${view.columns.map((column) => renderMessageHeaderCell(column, filteredRows, view)).join('')}</div>
            ${filteredRows.length ? filteredRows.map((row) => `<div class="ku-message-row ${isOutbox ? 'ku-message-row-outbox' : ''}" style="grid-template-columns:${escapeAttr(gridTemplate)}">${row.cells.map((cell) => renderMessageBodyCell(cell, row, selection, view)).join('')}</div>`).join('') : `<div class="ku-empty">表示できるメッセージがありません。</div>`}
          </div>
          <div class="ku-message-footer"><div class="ku-mini-meta">${escapeHtml(view.pagination.pageText || `${filteredRows.length} 件`)}</div>${selection.size ? `<div class="ku-mini-meta">選択中 ${selection.size} 件</div>` : ''}</div>
        </section>
      </div>`;
  }

function renderMessageHeaderCell(column, rows, view) {
    if (column.key === 'select') {
      return `<div class="ku-message-cell ku-message-cell-${column.key}"><input class="ku-checkbox" type="checkbox" data-action="message-select-all" ${allSelected(rows, view) ? 'checked' : ''}></div>`;
    }
    return `<div class="ku-message-cell ku-message-cell-${column.key}"><span class="ku-message-header-label">${escapeHtml(column.label || '')}</span>${renderMessageSortLinks(column.sortLinks)}</div>`;
  }

function renderMessageSortLinks(sortLinks = []) {
    return sortLinks.length ? `<span class="ku-message-sort-links">${sortLinks.map((link) => `<a class="ku-sort-link" href="#" data-message-js="${escapeAttr(link.href)}">${escapeHtml(link.text)}</a>`).join('')}</span>` : '';
  }

function renderMessageBodyCell(cell, row, selection, view) {
    if (cell.key === 'select') {
      return `<div class="ku-message-cell ku-message-cell-${cell.key}"><input class="ku-checkbox" type="checkbox" data-action="message-select" data-id="${escapeAttr(row.id)}" ${selection.has(row.id) ? 'checked' : ''}></div>`;
    }
    if (view?.folder === 'outbox') {
      return renderOutboxMessageBodyCell(cell);
    }
    return renderStandardMessageBodyCell(cell, row, view);
  }

function renderStandardMessageBodyCell(cell, row, view) {
    const text = cell.text || '';
    if (cell.key === 'subject') {
      return `<div class="ku-message-cell ku-message-cell-subject ku-message-cell-subject-primary">${renderMessageSubjectDisplay(text || row.subject || '', cell.href, 120)}</div>`;
    }
    if (cell.key === 'attachments') {
      return `<div class="ku-message-cell ku-message-cell-attachments">${text ? `<span class="ku-chip neutral ku-message-attachment-chip">${escapeHtml(truncate(text, 28))}</span>` : `<span class="ku-mini-meta">なし</span>`}</div>`;
    }
    if (cell.key === 'date') {
      const parts = splitMessageDateTime(text);
      return `<div class="ku-message-cell ku-message-cell-date ku-message-date-stack"><strong>${escapeHtml(parts.date)}</strong>${parts.time ? `<span class="ku-mini-meta">${escapeHtml(parts.time)}</span>` : ''}</div>`;
    }
    if (cell.key === 'sender' || cell.key === 'recipient') {
      return `<div class="ku-message-cell ku-message-cell-${cell.key}"><strong>${escapeHtml(text || '—')}</strong></div>`;
    }
    if (cell.key === 'userId') {
      return `<div class="ku-message-cell ku-message-cell-${cell.key}"><span class="ku-mini-meta">${escapeHtml(text || '—')}</span></div>`;
    }
    const fallbackText = cell.text || (cell.key === 'attachments' ? '—' : '');
    if (cell.href) {
      return `<div class="ku-message-cell ku-message-cell-${cell.key}"><a class="ku-table-link" href="${escapeAttr(cell.href)}">${escapeHtml(truncate(fallbackText, cell.key === 'subject' ? 96 : 78))}</a></div>`;
    }
    return `<div class="ku-message-cell ku-message-cell-${cell.key}">${escapeHtml(fallbackText || '—')}</div>`;
  }

function renderOutboxMessageBodyCell(cell) {
    const text = cell.text || '';
    if (cell.key === 'subject') {
      return `<div class="ku-message-cell ku-message-cell-subject ku-message-cell-subject-primary">${renderMessageSubjectDisplay(text, cell.href, 160)}</div>`;
    }
    if (cell.key === 'attachments') {
      return `<div class="ku-message-cell ku-message-cell-attachments">${text ? `<span class="ku-chip neutral ku-message-attachment-chip">${escapeHtml(truncate(text, 28))}</span>` : `<span class="ku-mini-meta">なし</span>`}</div>`;
    }
    if (cell.key === 'date') {
      const normalized = cleanText(text) || '—';
      const parts = splitMessageDateTime(normalized);
      return `<div class="ku-message-cell ku-message-cell-date ku-message-cell-date-inline"><strong class="ku-message-date-inline-text">${escapeHtml(parts.date)}</strong>${parts.time ? `<span class="ku-message-date-inline-separator" aria-hidden="true">&#8203;</span><span class="ku-mini-meta ku-message-date-inline-time">${escapeHtml(parts.time)}</span>` : ''}</div>`;
    }
    if (cell.key === 'recipient') {
      return `<div class="ku-message-cell ku-message-cell-recipient"><strong>${escapeHtml(text || '—')}</strong></div>`;
    }
    return `<div class="ku-message-cell ku-message-cell-${cell.key}">${cell.href ? `<a class="ku-table-link" href="${escapeAttr(cell.href)}">${escapeHtml(truncate(text, 88))}</a>` : escapeHtml(text || '—')}</div>`;
  }

function messageGridTemplate(columns, view = {}) {
    const widthMap = {
      select: '46px',
      sender: '1.1fr',
      userId: '0.85fr',
      recipient: '1.1fr',
      subject: '1.8fr',
      attachments: '0.85fr',
      date: '1fr'
    };
    if (view?.folder === 'outbox') {
      const outboxWidthMap = {
        select: '46px',
        recipient: 'minmax(156px, 0.95fr)',
        subject: 'minmax(320px, 1.9fr)',
        attachments: 'minmax(112px, 0.72fr)',
        date: 'minmax(104px, 0.72fr)'
      };
      return columns.map((column) => outboxWidthMap[column.key] || widthMap[column.key] || '1fr').join(' ');
    }
    return columns.map((column) => widthMap[column.key] || '1fr').join(' ');
  }

function splitMessageDateTime(text = '') {
    const normalized = cleanText(text);
    const match = normalized.match(/^(.*?)(\d{1,2}:\d{2}(?::\d{2})?)$/);
    if (!match) return { date: normalized || '—', time: '' };
    return {
      date: cleanText(match[1]),
      time: match[2]
    };
  }

function getMessageRowMeta(row) {
    const sender = findMessageRowCellText(row, 'sender');
    const userId = findMessageRowCellText(row, 'userId');
    const recipient = findMessageRowCellText(row, 'recipient');
    const date = findMessageRowCellText(row, 'date');
    const meta = [];
    if (sender) meta.push(sender);
    if (userId) meta.push(userId);
    if (recipient && recipient !== sender) meta.push(`宛先 ${recipient}`);
    if (date) meta.push(date);
    return meta;
  }

function findMessageRowCellText(row, key) {
    return cleanText(row?.cells?.find((cell) => cell.key === key)?.text || '');
  }

function splitMessageSubjectDisplay(subjectText = '') {
    const normalized = cleanText(subjectText);
    const receiptMatch = normalized.match(/^(レポートを受け取りました)\s*(\[[\s\S]*\])$/);
    if (receiptMatch) {
      return {
        primary: receiptMatch[1],
        inlineMeta: receiptMatch[2]
      };
    }
    return {
      primary: normalized,
      inlineMeta: ''
    };
  }

function renderMessageSubjectDisplay(subjectText = '', href = '', length = 120) {
    const display = splitMessageSubjectDisplay(subjectText);
    const primary = truncate(display.primary || '—', length);
    const inlineMeta = display.inlineMeta ? truncate(display.inlineMeta, Math.max(length + 48, 160)) : '';
    const content = inlineMeta
      ? `<span class="ku-message-subject-main">${escapeHtml(primary)}</span><span class="ku-message-subject-inline-meta">${escapeHtml(inlineMeta)}</span>`
      : escapeHtml(primary);
    if (href) {
      const receiptClass = inlineMeta ? ' ku-message-subject-link-receipt' : '';
      return `<a class="ku-table-link ku-message-subject-link${receiptClass}" href="${escapeAttr(href)}">${content}</a>`;
    }
    return inlineMeta
      ? `<span class="ku-message-subject-link ku-message-subject-link-receipt">${content}</span>`
      : `<span class="ku-message-subject-link">${content}</span>`;
  }

function renderMessageDetail(view) {
    const tone = view.folder === 'outbox' ? 'blue' : view.folder === 'recyclebox' ? 'orange' : 'green';
    const metadata = (view.metadata || []).filter((item) => item.key !== 'subject');
    const subjectDisplay = splitMessageSubjectDisplay(view.headline || view.title || 'メッセージ');
    const subjectHeadingHtml = `<h2 class="ku-message-article-title"><span class="ku-message-headline-main">${escapeHtml(subjectDisplay.primary || 'メッセージ')}</span></h2>${subjectDisplay.inlineMeta ? `<div class="ku-message-headline-meta-block">${escapeHtml(subjectDisplay.inlineMeta)}</div>` : ''}`;
    return `
      <div class="ku-sidebar-shell">
        ${renderSidebar(`messages-${view.folder}`)}
        <section class="ku-card ku-main-card">
          <div class="ku-main-card-header">
            <div>
              <h1 class="ku-page-title">${escapeHtml(view.pageTitle || 'メッセージ詳細')}</h1>
              <div class="ku-page-subtitle">${escapeHtml(view.subtitle || 'メッセージ本文と関連メタデータを確認できます。')}</div>
            </div>
            <div class="ku-pagination">${renderMessageDetailPager(view.navigation)}</div>
          </div>
          <div class="ku-message-detail-shell">
            <section class="ku-message-detail-hero">
              <div class="ku-message-detail-topline">
                <div class="ku-inline">
                  <span class="ku-chip ${tone}">${escapeHtml(view.modeLabel || 'メッセージ')}</span>
                  ${view.folderHref ? `<a class="ku-button" href="${escapeAttr(view.folderHref)}">${escapeHtml(view.folder === 'outbox' ? '送信済箱へ戻る' : view.folder === 'recyclebox' ? 'ゴミ箱へ戻る' : '受信箱へ戻る')}</a>` : ''}
                </div>
                <div class="ku-message-detail-toolbar">
                  ${view.downloadHref ? `<a class="ku-button" href="${escapeAttr(view.downloadHref)}">ダウンロード</a>` : ''}
                  ${view.replyHref ? `<a class="ku-button" href="${escapeAttr(view.replyHref)}">返事を書く</a>` : ''}
                  ${view.closeHref ? `<a class="ku-button" href="${escapeAttr(view.closeHref)}">このウィンドウを閉じる</a>` : ''}
                </div>
              </div>
              ${subjectHeadingHtml}
              ${view.forward ? `<div class="ku-message-forward">
                <input class="ku-search ku-message-forward-input" data-action="message-detail-forward-input" type="email" value="" placeholder="${escapeAttr(view.forward.placeholder || 'メールアドレス')}">
                <button class="ku-button" data-action="message-detail-forward">${escapeHtml(view.forward.buttonLabel || 'メールへ転送')}</button>
              </div>` : ''}
            </section>
            ${metadata.length ? `<section class="ku-message-meta-grid">
              ${metadata.map((item) => `<div class="ku-message-meta-item"><span>${escapeHtml(item.label)}</span><strong>${item.href ? `<a class="ku-title-link" href="${escapeAttr(item.href)}">${escapeHtml(item.text)}</a>` : escapeHtml(item.text || '—')}</strong></div>`).join('')}
            </section>` : ''}
            <article class="ku-message-article">
              <div class="ku-message-body">${view.bodyHtml || '<div class="ku-empty">メッセージ本文を表示できません。</div>'}</div>
            </article>
            <div class="ku-message-detail-footer">
              <div class="ku-pagination">${renderMessageDetailPager(view.navigation)}</div>
              <div class="ku-inline">
                ${view.folderHref ? `<a class="ku-button" href="${escapeAttr(view.folderHref)}">一覧へ戻る</a>` : ''}
                ${view.replyHref ? `<a class="ku-button" href="${escapeAttr(view.replyHref)}">返信する</a>` : ''}
              </div>
            </div>
          </div>
        </section>
      </div>`;
  }

function renderMessageDetailPager(navigation = {}) {
    const items = [
      { text: '前のメッセージ', href: navigation?.prev?.href || '', disabled: !navigation?.prev?.href },
      { text: '次のメッセージ', href: navigation?.next?.href || '', disabled: !navigation?.next?.href }
    ];
    return items.map((item) => item.disabled
      ? `<span class="ku-pagination-link disabled">${escapeHtml(item.text)}</span>`
      : `<a class="ku-pagination-link" href="${escapeAttr(item.href)}">${escapeHtml(item.text)}</a>`).join('');
  }
