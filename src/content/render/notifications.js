/* src/content/render/notifications.js */

function renderNotifications(view) {
    if (view.kind === 'detail' || view.kind === 'error') {
      return renderNotificationDetail(view);
    }
    return `
      <div class="ku-sidebar-shell">
        ${renderSidebar('notifications')}
        <section class="ku-card ku-main-card">
          <div class="ku-main-card-header"><div><h1 class="ku-page-title">お知らせ一覧</h1><div class="ku-page-subtitle">${escapeHtml(view.metaText || '')}</div></div><div class="ku-pagination">${renderPagination(view.pagination)}</div></div>
          ${view.items.map((item) => `<div class="ku-notice-row"><div>${item.important ? '<span class="ku-chip red">重要</span>' : '<span class="ku-chip blue">お知らせ</span>'}</div><div class="ku-panel-body"><a class="ku-notice-title ku-title-link" href="${escapeAttr(item.href)}">${escapeHtml(item.title)}</a><div class="ku-mini-meta">${escapeHtml(item.source)}</div></div><div class="ku-deadline"><div>${escapeHtml(extractPublishDate(item.source))}</div>${item.deadline ? `<strong>${escapeHtml(item.deadline)}</strong>` : ''}</div></div>`).join('')}
        </section>
      </div>`;
  }

function renderNotificationDetail(view) {
    const metadata = view.metadata || {};
    const detailNav = [view.navigation?.prev, view.navigation?.list, view.navigation?.next]
      .filter(Boolean)
      .map((item) => `<a class="ku-pagination-link" href="${escapeAttr(item.href)}" title="${escapeAttr(item.title || item.text || '')}">${escapeHtml(item.text || '移動')}</a>`)
      .join('');
    return `
      <div class="ku-sidebar-shell">
        ${renderSidebar('notifications-detail')}
        <section class="ku-card ku-main-card">
          <div class="ku-main-card-header">
            <div>
              <h1 class="ku-page-title">${escapeHtml(view.pageTitle || 'お知らせ')}</h1>
              <div class="ku-page-subtitle">${view.kind === 'error' ? '指定されたお知らせを表示できませんでした。' : 'お知らせ本文と関連メタデータを確認できます。'}</div>
            </div>
            <div class="ku-pagination">${detailNav}</div>
          </div>
          <div class="ku-notice-detail-shell">
            <section class="ku-notice-detail-hero">
              <div class="ku-inline">
                <span class="ku-chip ${view.kind === 'error' ? 'orange' : 'blue'}">${view.kind === 'error' ? '表示エラー' : 'お知らせ詳細'}</span>
                ${metadata.deadline ? `<span class="ku-chip red">${escapeHtml(metadata.deadline)}</span>` : ''}
              </div>
              <h2 class="ku-notice-article-title">${escapeHtml(view.title || 'お知らせを表示できません')}</h2>
              ${(metadata.issuer || metadata.publishedAt || metadata.audience || metadata.authorLabel) ? `<div class="ku-notice-meta-grid">
                ${metadata.issuer ? `<div class="ku-notice-meta-item"><span>発行元</span><strong>${escapeHtml(metadata.issuer.replace(/^発行元\\s*:\\s*/, ''))}</strong></div>` : ''}
                ${metadata.publishedAt ? `<div class="ku-notice-meta-item"><span>発行日</span><strong>${escapeHtml(metadata.publishedAt.replace(/^発行日\\s*:\\s*/, ''))}</strong></div>` : ''}
                ${metadata.audience ? `<div class="ku-notice-meta-item"><span>発行先</span><strong>${escapeHtml(metadata.audience.replace(/^発行先\\s*:\\s*/, ''))}</strong></div>` : ''}
                ${metadata.authorLabel ? `<div class="ku-notice-meta-item"><span>投稿者</span><strong>${metadata.authorHref ? `<a class="ku-title-link" href="${escapeAttr(metadata.authorHref)}">${escapeHtml(metadata.authorLabel)}</a>` : escapeHtml(metadata.authorLabel)}</strong></div>` : ''}
              </div>` : ''}
            </section>
            <article class="ku-notice-article">
              ${view.kind === 'error'
                ? `<div class="ku-empty">${escapeHtml(view.errorMessage || 'このお知らせは現在表示できません。')}</div>`
                : `<div class="ku-notice-body">${view.bodyHtml || ''}</div>`}
            </article>
            <div class="ku-notice-detail-footer">
              ${view.navigation?.list ? `<a class="ku-button" href="${escapeAttr(view.navigation.list.href)}">一覧に戻る</a>` : ''}
              ${view.navigation?.next ? `<a class="ku-button" href="${escapeAttr(view.navigation.next.href)}">次のお知らせへ</a>` : ''}
            </div>
          </div>
        </section>
      </div>`;
  }
