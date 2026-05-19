/* src/content/render/auth.js */

function renderLogin(view) {
    const noticeItems = view.notices.items.length
      ? renderPanelList(view.notices.items.map((item) => ({
          marker: `<span class="ku-badge-dot ${item.important ? 'danger' : ''}"></span>`,
          title: `<a class="ku-panel-title ${item.important ? 'danger' : ''}" href="${escapeAttr(item.href)}">${escapeHtml(item.title)}</a>`,
          subtitle: escapeHtml(item.source || ''),
          trailing: item.deadline ? `<div class="ku-mini-meta">${escapeHtml(item.deadline)}</div>` : ''
        })))
      : `<div class="ku-empty">通告はまだ読み込まれていません。</div>`;
    return `
      <section class="ku-login-shell">
        <div class="ku-login-main">
          <div class="ku-card ku-login-card">
            <div class="ku-login-brand">
              <span class="ku-logo-mark">${icon('wave')}</span>
              <div>
                <div class="ku-login-kicker">Kansai University Learning Management System</div>
                <h1 class="ku-page-title">${escapeHtml(view.heading)}</h1>
              </div>
            </div>
            <div class="ku-login-meta">
              ${renderLoginLanguageLinks(view.languages, view.languageCode)}
            </div>
            ${view.intro ? `<p class="ku-login-copy">${escapeHtml(view.intro)}</p>` : ''}
            ${view.alert ? `<div class="ku-login-alert">${escapeHtml(view.alert)}</div>` : ''}
            <div class="ku-login-form-host" data-ku-login-native-form-host="true"></div>
            ${view.version ? `<div class="ku-login-version">${escapeHtml(view.version)}</div>` : ''}
          </div>
        </div>
        <aside class="ku-login-side">
          <section class="ku-card ku-login-support-card">
            <div class="ku-card-header">
              <h2 class="ku-card-title">お問い合わせ</h2>
            </div>
            <div class="ku-login-support-body">
              ${view.support.email ? `<div class="ku-login-support-item"><span class="ku-login-support-label">${escapeHtml(view.support.emailLabel)}</span><a class="ku-panel-title" href="mailto:${escapeAttr(view.support.email)}">${escapeHtml(view.support.email)}</a></div>` : ''}
              ${view.support.inquiryHref ? `<div class="ku-login-support-item"><span class="ku-login-support-label">${escapeHtml(view.support.inquiryLabel)}</span><a class="ku-panel-title" href="${escapeAttr(view.support.inquiryHref)}">${escapeHtml(view.support.inquiryText || 'お問い合わせフォーム')}</a></div>` : ''}
            </div>
          </section>
          <section class="ku-card ku-login-notice-card">
            <div class="ku-card-header">
              <h2 class="ku-card-title">通告</h2>
              ${view.notices.moreHref ? `<a class="ku-panel-title" href="${escapeAttr(view.notices.moreHref)}">一覧へ</a>` : ''}
            </div>
            ${noticeItems}
          </section>
        </aside>
      </section>`;
  }

function renderLoginLanguageLinks(items = [], currentCode = '') {
    if (!items.length) {
      return currentCode ? `<span class="ku-chip blue">${escapeHtml(loginLanguageLabel(currentCode))}</span>` : '';
    }
    return `<div class="ku-login-language-list">${items.map((item) => `<a class="ku-chip ${item.active ? 'blue' : 'neutral'} ku-chip-link" href="${escapeAttr(item.href)}">${escapeHtml(item.label)}</a>`).join('')}</div>`;
  }

function renderLogout(view) {
    const warningCard = (view.warningTitle || view.warningBody) ? `
      <section class="ku-card ku-logout-warning-card">
        <div class="ku-card-header">
          <h2 class="ku-card-title">ご利用上の注意</h2>
        </div>
        <div class="ku-logout-warning-body">
          ${view.warningTitle ? `<p class="ku-logout-warning-copy">${escapeHtml(view.warningTitle)}</p>` : ''}
          ${view.warningBody ? `<p class="ku-logout-warning-copy ku-soft">${escapeHtml(view.warningBody)}</p>` : ''}
        </div>
      </section>` : '';
    return `
      <section class="ku-logout-shell ${warningCard ? 'has-warning' : 'is-compact'}">
        <div class="ku-logout-main">
          <section class="ku-card ku-logout-card">
            <div class="ku-login-brand">
              <span class="ku-logo-mark">${icon('wave')}</span>
              <div>
                <div class="ku-login-kicker">Kansai University Learning Management System</div>
                <h1 class="ku-page-title">${escapeHtml(view.heading)}</h1>
              </div>
            </div>
            <div class="ku-logout-meta">
              <span class="ku-chip ${escapeAttr(view.warningTone)}">${escapeHtml(view.statusLabel)}</span>
            </div>
            ${view.subtitle ? `<p class="ku-page-subtitle">${escapeHtml(view.subtitle)}</p>` : ''}
            <div class="ku-logout-actions">
              <a class="ku-button primary ku-logout-action" href="${escapeAttr(view.actions.loginHref)}">${escapeHtml(view.actions.loginLabel)}</a>
              <a class="ku-button ku-logout-action" href="${escapeAttr(view.actions.closeHref)}">${escapeHtml(view.actions.closeLabel)}</a>
            </div>
          </section>
        </div>
        ${warningCard ? `<aside class="ku-logout-side">${warningCard}</aside>` : ''}
      </section>`;
  }
