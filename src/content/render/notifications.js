/* src/content/render/notifications.js */

function renderNotifications(view) {
    return `
      <div class="ku-sidebar-shell">
        ${renderSidebar('notifications')}
        <section class="ku-card ku-main-card">
          <div class="ku-main-card-header"><div><h1 class="ku-page-title">お知らせ一覧</h1><div class="ku-page-subtitle">${escapeHtml(view.metaText || '')}</div></div><div class="ku-pagination">${renderPagination(view.pagination)}</div></div>
          ${view.items.map((item) => `<div class="ku-notice-row"><div>${item.important ? '<span class="ku-chip red">重要</span>' : '<span class="ku-chip blue">お知らせ</span>'}</div><div class="ku-panel-body"><a class="ku-notice-title ku-title-link" href="${escapeAttr(item.href)}">${escapeHtml(item.title)}</a><div class="ku-mini-meta">${escapeHtml(item.source)}</div></div><div class="ku-deadline"><div>${escapeHtml(extractPublishDate(item.source))}</div>${item.deadline ? `<strong>${escapeHtml(item.deadline)}</strong>` : ''}</div></div>`).join('')}
        </section>
      </div>`;
  }
