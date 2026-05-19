/* src/content/render/manual.js */

function renderManual(view) {
    return `
      <div class="ku-manual-shell">
        <section class="ku-card ku-route-header-card">
          <div class="ku-route-header">
            <div>
              <h1 class="ku-page-title">${escapeHtml(view.title)}</h1>
              <div class="ku-page-subtitle">${escapeHtml(view.subtitle)}</div>
            </div>
            ${view.closeHref ? `<a class="ku-button ghost" href="${escapeAttr(view.closeHref)}">このウィンドウを閉じる</a>` : ''}
          </div>
        </section>
        <section class="ku-manual-grid">
          ${view.sections.map((section) => `
            <article class="ku-card ku-manual-card">
              <div class="ku-card-header"><h2 class="ku-card-title">${escapeHtml(section.title)}</h2></div>
              <div class="ku-manual-card-body">
                ${section.description.map((text) => `<p class="ku-manual-copy">${escapeHtml(text)}</p>`).join('')}
                ${section.links.length ? `<div class="ku-manual-links">${section.links.map((link) => `<a class="ku-title-link ku-manual-link" href="${escapeAttr(link.href)}">${escapeHtml(link.label)}</a>${link.meta ? `<div class="ku-mini-meta">${escapeHtml(link.meta)}</div>` : ''}`).join('')}</div>` : ''}
              </div>
            </article>`).join('')}
        </section>
      </div>`;
  }
