/* src/content/render/messages.js */

function renderMessages(view) {
    const selection = getMessageSelection(view);
    const filteredRows = view.rows.filter((row) => {
      if (!state.messageSearch) return true;
      const q = state.messageSearch.toLowerCase();
      return row.cells.map((cell) => cell.text).join(' ').toLowerCase().includes(q);
    });
    const gridTemplate = messageGridTemplate(view.columns || []);
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
          <div class="ku-message-table">
            <div class="ku-message-head" style="grid-template-columns:${escapeAttr(gridTemplate)}">${view.columns.map((column) => renderMessageHeaderCell(column, filteredRows, view)).join('')}</div>
            ${filteredRows.length ? filteredRows.map((row) => `<div class="ku-message-row" style="grid-template-columns:${escapeAttr(gridTemplate)}">${row.cells.map((cell) => renderMessageBodyCell(cell, row, selection)).join('')}</div>`).join('') : `<div class="ku-empty">表示できるメッセージがありません。</div>`}
          </div>
          <div style="padding:16px 20px 4px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div class="ku-mini-meta">${escapeHtml(view.pagination.pageText || `${filteredRows.length} 件`)}</div><div class="ku-inline"><span class="ku-mini-meta">1 ページあたり</span><select class="ku-page-size"><option>20件</option></select></div></div>
        </section>
      </div>`;
  }

function renderMessageHeaderCell(column, rows, view) {
    if (column.key === 'select') {
      return `<div><input class="ku-checkbox" type="checkbox" data-action="message-select-all" ${allSelected(rows, view) ? 'checked' : ''}></div>`;
    }
    return `<div>${escapeHtml(column.label || '')}${renderMessageSortLinks(column.sortLinks)}</div>`;
  }

function renderMessageSortLinks(sortLinks = []) {
    return sortLinks.map((link) => `<a class="ku-sort-link" href="#" data-message-js="${escapeAttr(link.href)}">${escapeHtml(link.text)}</a>`).join('');
  }

function renderMessageBodyCell(cell, row, selection) {
    if (cell.key === 'select') {
      return `<div><input class="ku-checkbox" type="checkbox" data-action="message-select" data-id="${escapeAttr(row.id)}" ${selection.has(row.id) ? 'checked' : ''}></div>`;
    }
    const text = cell.text || (cell.key === 'attachments' ? '—' : '');
    if (cell.href) {
      return `<div><a class="ku-table-link" href="${escapeAttr(cell.href)}">${escapeHtml(truncate(text, cell.key === 'subject' ? 96 : 78))}</a></div>`;
    }
    return `<div>${escapeHtml(text || '—')}</div>`;
  }

function messageGridTemplate(columns) {
    const widthMap = {
      select: '46px',
      sender: '1.1fr',
      userId: '0.85fr',
      recipient: '1.1fr',
      subject: '1.8fr',
      attachments: '0.85fr',
      date: '1fr'
    };
    return columns.map((column) => widthMap[column.key] || '1fr').join(' ');
  }
