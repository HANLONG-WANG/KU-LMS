/* src/content/render/course.js */

function renderCourseMaterials(view) {
    const course = view.course.course;
    return `
      ${renderCourseHeader(view.course.course, view.currentTab)}
      <div class="ku-course-grid">
        <aside class="ku-card ku-timeline-card">
          <div class="ku-card-title">タイムライン</div>
          ${view.course.timeline.items.length ? view.course.timeline.items.map((item) => {
            const token = materialTypeToken(item.subtitle, item.title);
            const body = item.href ? `<a class="ku-title-link" href="${escapeAttr(item.href)}">${escapeHtml(item.title)}</a>` : `<div>${escapeHtml(item.title)}</div>`;
            return `<div class="ku-timeline-item"><div class="ku-timeline-icon ku-token-${token.key}">${icon(token.icon)}</div><div class="ku-panel-body">${body}<span class="ku-mini-meta">${escapeHtml(item.subtitle)}</span><span class="ku-chip ${item.label === 'New' ? 'red' : token.tone}">${escapeHtml(item.label || '更新')}</span></div><div class="ku-mini-meta">${escapeHtml(item.recency)}</div></div>`;
          }).join('') : `<div class="ku-empty">${view.course.timeline.error ? 'タイムラインを取得できませんでした。' : '表示できる活動はありません。'}</div>`}
        </aside>
        <section class="ku-sidebar-layout">
          ${view.course.sections.map((section) => `
            <section class="ku-section-block" id="${slugify(section.title || 'general')}">
              <div class="ku-collapse-head"><span>${escapeHtml(section.title || 'General')}</span><span>${icon('chevron-up')}</span></div>
              <div class="ku-section-items">${section.items.map((item) => {
                const token = materialTypeToken(item.type, item.title);
                return `<div class="ku-section-item"><div class="ku-item-icon ku-token-${token.key}">${icon(token.icon)}</div><div class="ku-section-item-meta"><a class="ku-title-link" href="${escapeAttr(item.href || item.detailHref)}">${item.isNew ? '<span class="ku-chip red">New</span> ' : ''}${escapeHtml(item.title)}</a><div class="ku-inline"><span class="ku-chip ${token.tone}">${escapeHtml(item.type || token.label)}</span></div>${item.availability ? `<div class="ku-mini-meta">利用可能期間 ${escapeHtml(item.availability)}</div>` : ''}</div><div class="ku-inline">${item.detailHref ? `<a class="ku-chip blue ku-chip-link" href="${escapeAttr(item.detailHref)}">詳細</a>` : ''}${item.historyHref ? `<a class="ku-chip neutral ku-chip-link" href="${escapeAttr(item.historyHref)}">${escapeHtml(item.historyLabel || '履歴')}</a>` : ''}</div></div>`;
              }).join('')}</div>
            </section>`).join('')}
        </section>
        <aside class="ku-card ku-rightnav-card">
          <div class="ku-card-title">${escapeHtml(course.title.split('(')[0].trim())}</div>
          <ul class="ku-rightnav-list">${view.course.anchors.map((anchor, index) => `<li><a class="ku-rightnav-link ${index === 0 ? 'active' : ''}" href="#${escapeAttr(anchor.target)}">${escapeHtml(anchor.title)}</a></li>`).join('')}</ul>
        </aside>
      </div>`;
  }

function renderMyReports(view) {
    const columns = state.myReportColumns;
    const rows = view.reports.rows;
    const headers = [
      { key: 'task', label: '課題名' },
      { key: 'qno', label: 'Q.No' },
      { key: 'preview', label: 'レポート / 本文プレビュー', optional: true, enabled: columns.preview },
      { key: 'attachments', label: '添付ファイル', optional: true, enabled: columns.attachments },
      { key: 'comments', label: 'コメント', optional: true, enabled: columns.comments },
      { key: 'date', label: '提出日' },
      { key: 'grade', label: '成績' },
      { key: 'score', label: '得点 / 配点', optional: true, enabled: columns.score }
    ].filter((header) => !header.optional || header.enabled);
    return `
      ${renderCourseHeader(view.course, view.currentTab)}
      <section class="ku-card ku-main-card" style="position:relative;">
        <div class="ku-main-card-header"><h2 class="ku-card-title">マイレポート</h2><div style="position:relative"><button class="ku-button" data-action="toggle-settings">${icon('sliders')} 表示設定</button>${state.showSettings ? renderMyReportSettings() : ''}</div></div>
        <div class="ku-report-table">
          <div class="ku-report-head">${headers.map((header) => `<div>${escapeHtml(header.label)}</div>`).join('')}</div>
          ${rows.map((row) => `<div class="ku-report-row">${headers.map((header) => renderReportCell(header.key, row)).join('')}</div>`).join('')}
        </div>
      </section>`;
  }

function renderReportCell(key, row) {
    if (key === 'task') return `<div><a class="ku-table-link" href="${escapeAttr(row.taskHref)}">${escapeHtml(row.task)}</a></div>`;
    if (key === 'qno') return `<div>${escapeHtml(row.qno)}</div>`;
    if (key === 'preview') return `<div class="ku-report-preview">${escapeHtml(truncate(row.preview, 250))}</div>`;
    if (key === 'attachments') return `<div>${row.attachmentHref ? `<a class="ku-table-link" href="${escapeAttr(row.attachmentHref)}">${escapeHtml(row.attachmentName)}</a>` : escapeHtml(row.attachmentName || '-')}</div>`;
    if (key === 'comments') return `<div>${escapeHtml(row.comments || '-')}</div>`;
    if (key === 'date') return `<div>${escapeHtml(row.date)}</div>`;
    if (key === 'grade') return `<div>${escapeHtml(row.grade || '-')}</div>`;
    if (key === 'score') return `<div>${row.scoreHref ? `<a class="ku-table-link" href="${escapeAttr(row.scoreHref)}">${escapeHtml(row.score)}</a>` : escapeHtml(row.score || '-')}</div>`;
    return '<div></div>';
  }

function renderMyReportSettings() {
    return `<div class="ku-settings-popover">${[
      ['preview', '本文プレビュー'],
      ['attachments', '添付ファイル'],
      ['comments', 'コメント'],
      ['score', '得点 / 配点']
    ].map(([key, label]) => `<label class="ku-settings-item"><span>${escapeHtml(label)}</span><input class="ku-checkbox" type="checkbox" data-setting-key="${escapeAttr(key)}" ${state.myReportColumns[key] ? 'checked' : ''}></label>`).join('')}</div>`;
  }
