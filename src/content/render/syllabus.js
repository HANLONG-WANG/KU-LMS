/* src/content/render/syllabus.js */

function renderSyllabusDetailPage(view) {
    const heroMeta = view.heroMeta || {};
    const summaryItems = view.summaryItems || [];
    return `
      <div class="ku-app ku-route-syllabus-detail ku-syllabus-app">
        <main class="ku-page ku-syllabus-page">
          <section class="ku-card ku-route-header-card ku-syllabus-hero-card">
            <div class="ku-inline ku-syllabus-hero-topline">
              <span class="ku-chip blue">公開シラバス</span>
              ${heroMeta.courseCode ? `<span class="ku-chip neutral">Course Code ${escapeHtml(heroMeta.courseCode)}</span>` : ''}
              ${view.sourceHref ? `<a class="ku-button ghost" href="${escapeAttr(view.sourceHref)}" target="_blank" rel="noopener noreferrer">${icon('link')} 公開シラバス原本</a>` : ''}
            </div>
            <h1 class="ku-page-title ku-syllabus-page-title">${escapeHtml(heroMeta.title || 'シラバス')}</h1>
            ${heroMeta.subtitle ? `<div class="ku-page-subtitle ku-syllabus-hero-subtitle">${escapeHtml(heroMeta.subtitle)}</div>` : ''}
            <div class="ku-hero-meta ku-syllabus-hero-meta">
              ${heroMeta.faculty ? `<span>${icon('book')} ${escapeHtml(heroMeta.faculty)}</span>` : ''}
              ${heroMeta.termCredits ? `<span>${icon('calendar')} ${escapeHtml(heroMeta.termCredits)}</span>` : ''}
              ${heroMeta.instructor ? `<span>${icon('badge-check')} ${escapeHtml(heroMeta.instructor)}</span>` : ''}
              ${heroMeta.dayPeriod ? `<span>${icon('clock')} ${escapeHtml(heroMeta.dayPeriod)}</span>` : ''}
            </div>
            ${summaryItems.length ? `<div class="ku-syllabus-summary-grid">${summaryItems.map((item) => `<div class="ku-syllabus-summary-item"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`).join('')}</div>` : ''}
          </section>
          <div class="ku-syllabus-shell">
            <section class="ku-syllabus-main">
              ${view.sections.map((section) => renderSyllabusSection(section)).join('')}
            </section>
            <aside class="ku-card ku-rightnav-card ku-syllabus-aside">
              <div class="ku-card-title">シラバス要約</div>
              ${summaryItems.length ? `<div class="ku-syllabus-aside-summary">${summaryItems.map((item) => `<div class="ku-syllabus-aside-item"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`).join('')}</div>` : ''}
              ${view.anchors.length ? `<div class="ku-syllabus-anchor-block"><div class="ku-card-title">目次</div><ul class="ku-rightnav-list">${view.anchors.map((anchor, index) => `<li><a class="ku-rightnav-link ${index === 0 ? 'active' : ''}" href="#${escapeAttr(anchor.target)}">${escapeHtml(anchor.title)}</a></li>`).join('')}</ul></div>` : ''}
            </aside>
          </div>
          <div class="ku-footer">${escapeHtml(view.copyrightText || 'Copyright(C) 関西大学および情報提供者 All rights reserved. 無断転載を禁じます')}</div>
        </main>
      </div>`;
  }

function renderSyllabusSection(section) {
    return `
      <article class="ku-card ku-syllabus-section-card" id="${escapeAttr(section.target)}">
        <div class="ku-card-header"><h2 class="ku-card-title">${escapeHtml(section.title)}</h2></div>
        <div class="ku-syllabus-section-body">
          ${section.rows.length ? `<div class="ku-syllabus-field-grid">${section.rows.map((row) => `<section class="ku-syllabus-field"><div class="ku-syllabus-field-label">${escapeHtml(row.label)}</div><div class="ku-syllabus-field-value">${renderSyllabusTextBody(row.text)}</div></section>`).join('')}</div>` : `<div class="ku-syllabus-prose">${section.text ? renderSyllabusTextBody(section.text) : '<div class="ku-empty">内容を表示できません。</div>'}</div>`}
        </div>
      </article>`;
  }

function renderSyllabusTextBody(text = '') {
    return escapeHtml(String(text || '—')).replace(/\n/g, '<br>');
  }
