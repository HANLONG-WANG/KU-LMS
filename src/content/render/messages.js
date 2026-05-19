/* src/content/render/messages.js */

function renderMessages(view) {
    const filteredRows = view.rows.filter((row) => {
      if (!state.messageSearch) return true;
      const q = state.messageSearch.toLowerCase();
      return [row.sender, row.userId, row.subject].join(' ').toLowerCase().includes(q);
    });
    return `
      <div class="ku-sidebar-shell">
        ${renderSidebar('messages')}
        <section class="ku-card ku-main-card">
          <div class="ku-main-card-header"><h1 class="ku-page-title">メッセージ</h1></div>
          <div style="padding:0 20px 18px">
            <div class="ku-search-row">
              <div class="ku-actions-bar">
                <button class="ku-button" data-action="message-delete">削除</button>
                <button class="ku-button" data-action="message-read">既読にする</button>
                <button class="ku-button" data-action="message-download">ダウンロード</button>
              </div>
              <div class="ku-search-wrap"><span class="ku-search-icon">${icon('search')}</span><input class="ku-search" data-action="message-search" type="search" value="${escapeAttr(state.messageSearch)}" placeholder="メッセージを検索"></div>
              <div class="ku-pagination">${renderMessagePagination(view.pagination)}</div>
            </div>
          </div>
          <div class="ku-message-table">
            <div class="ku-message-head"><div><input class="ku-checkbox" type="checkbox" data-action="message-select-all" ${allSelected(filteredRows) ? 'checked' : ''}></div><div>差出人</div><div>ユーザID</div><div>件名</div><div>添付ファイル</div><div>日付</div></div>
            ${filteredRows.map((row) => `<div class="ku-message-row"><div><input class="ku-checkbox" type="checkbox" data-action="message-select" data-id="${escapeAttr(row.id)}" ${state.messageSelection.has(row.id) ? 'checked' : ''}></div><div>${escapeHtml(row.sender)}</div><div>${escapeHtml(row.userId)}</div><div><a class="ku-table-link" href="${escapeAttr(row.href)}">${escapeHtml(truncate(row.subject, 78))}</a></div><div>${escapeHtml(row.attachments || '—')}</div><div>${escapeHtml(row.date)}</div></div>`).join('')}
          </div>
          <div style="padding:16px 20px 4px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div class="ku-mini-meta">${escapeHtml(view.pagination.pageText || `${filteredRows.length} 件`)}</div><div class="ku-inline"><span class="ku-mini-meta">1 ページあたり</span><select class="ku-page-size"><option>20件</option></select></div></div>
        </section>
      </div>`;
  }
