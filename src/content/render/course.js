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
            const body = renderTimelineBody(item);
            return `<div class="ku-timeline-item"><div class="ku-timeline-icon ku-token-${token.key}">${icon(token.icon)}</div><div class="ku-timeline-content"><div class="ku-timeline-head"><div class="ku-timeline-head-main"><span class="ku-mini-meta ku-timeline-kicker">${escapeHtml(item.subtitle)}</span><span class="ku-chip ${item.label === 'New' ? 'red' : token.tone}">${escapeHtml(item.label || '更新')}</span></div><span class="ku-mini-meta ku-timeline-recency">${escapeHtml(item.recency)}</span></div><div class="ku-timeline-body">${body}</div></div></div>`;
          }).join('') : `<div class="ku-empty">${view.course.timeline.error ? 'タイムラインを取得できませんでした。' : '表示できる活動はありません。'}</div>`}
        </aside>
        <section class="ku-sidebar-layout">
          ${view.course.sections.map((section) => `
            <section class="ku-section-block" id="${slugify(section.title || 'general')}">
              <div class="ku-collapse-head"><span>${escapeHtml(section.title || 'General')}</span><span>${icon('chevron-up')}</span></div>
              <div class="ku-section-items">${section.items.map((item) => {
                const token = materialTypeToken(item.type, item.title);
                const titleInner = `${item.isNew ? '<span class="ku-chip red">New</span> ' : ''}${escapeHtml(item.title)}`;
                const titleNode = item.isTitleClickable && item.titleLaunchHref
                  ? `<a class="ku-title-link" href="${escapeAttr(item.titleLaunchHref)}">${titleInner}</a>`
                  : `<div class="ku-section-title ku-section-item-title">${titleInner}</div>`;
                return `<div class="ku-section-item"><div class="ku-item-icon ku-token-${token.key}">${icon(token.icon)}</div><div class="ku-section-item-meta">${titleNode}<div class="ku-inline"><span class="ku-chip ${token.tone}">${escapeHtml(item.type || token.label)}</span></div>${item.availability ? `<div class="ku-mini-meta">利用可能期間 ${escapeHtml(item.availability)}</div>` : ''}</div><div class="ku-inline">${item.detailHref ? `<a class="ku-chip blue ku-chip-link" href="${escapeAttr(item.detailHref)}">詳細</a>` : ''}${item.historyHref ? `<a class="ku-chip neutral ku-chip-link" href="${escapeAttr(item.historyHref)}">${escapeHtml(item.historyLabel || '履歴')}</a>` : ''}</div></div>`;
              }).join('')}</div>
            </section>`).join('')}
        </section>
        <aside class="ku-card ku-rightnav-card">
          <div class="ku-card-title">${escapeHtml(shortenCourseTitle(course.title))}</div>
          <ul class="ku-rightnav-list">${view.course.anchors.map((anchor, index) => `<li><a class="ku-rightnav-link ${index === 0 ? 'active' : ''}" href="#${escapeAttr(anchor.target)}">${escapeHtml(anchor.title)}</a></li>`).join('')}</ul>
        </aside>
      </div>`;
  }

function renderTimelineBody(item) {
    const bodyText = String(item?.bodyText || '').replace(/\r\n/g, '\n').trim();
    if (bodyText) {
      return `<div>${escapeHtml(bodyText).replace(/\n/g, '<br>')}</div>`;
    }
    if (item?.href) {
      return `<a class="ku-title-link" href="${escapeAttr(item.href)}">${escapeHtml(item.title)}</a>`;
    }
    return `<div>${escapeHtml(item?.title || '')}</div>`;
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

function renderCourseScores(view) {
    const { course, scores } = view;
    return `
      ${renderCourseHeader(course, view.currentTab)}
      <section class="ku-score-layout">
        <section class="ku-score-main">
          <section class="ku-card ku-main-card">
            <div class="ku-main-card-header">
              <div>
                <div class="ku-page-subtitle">成績サマリー</div>
                <h2 class="ku-card-title">${escapeHtml(scores.title || '集計')}</h2>
              </div>
              <div class="ku-chip blue">${escapeHtml(scores.metricLabel || '表示データ')}</div>
            </div>
            <form class="ku-score-filter-form" action="${escapeAttr(scores.formAction || course.links.scores || '')}" method="${escapeAttr(scores.formMethod || 'post')}">
              ${scores.hiddenFields.map((field) => `<input type="hidden" name="${escapeAttr(field.name)}" value="${escapeAttr(field.value)}">`).join('')}
              <div class="ku-score-filter-grid">
                <section class="ku-score-filter-section">
                  <div class="ku-score-filter-title">得点</div>
                  <div class="ku-score-option-list">${scores.scoreOptions.map((option) => renderScoreRadio(option)).join('')}</div>
                </section>
                <section class="ku-score-filter-section">
                  <div class="ku-score-filter-title">進捗状況</div>
                  <div class="ku-score-option-list">${scores.progressOptions.map((option) => renderScoreRadio(option)).join('')}</div>
                </section>
                <section class="ku-score-filter-section">
                  <div class="ku-score-filter-title">集計期間</div>
                  <div class="ku-score-date-row">
                    <input class="ku-input" type="date" name="summaryOption[dateRangeStart]" value="${escapeAttr(scores.dateRangeStart || '')}">
                    <span class="ku-mini-meta">から</span>
                    <input class="ku-input" type="date" name="summaryOption[dateRangeEnd]" value="${escapeAttr(scores.dateRangeEnd || '')}">
                  </div>
                </section>
              </div>
              <div class="ku-score-filter-actions">
                <input class="ku-button" type="submit" name="${escapeAttr(scores.submitControl?.name || 'search')}" value="${escapeAttr(scores.submitControl?.value || '再表示')}">
                ${course.links.testResults ? `<a class="ku-button ghost" href="${escapeAttr(course.links.testResults)}">テスト結果を開く</a>` : ''}
              </div>
            </form>
          </section>
          <section class="ku-score-overview-grid">
            ${renderScoreOverviewCard('表示データ', scores.metricLabel || '—', '現在のネイティブ集計モード')}
            ${renderScoreOverviewCard('集計期間', scores.periodLabel || `${scores.dateRangeStart || '—'} - ${scores.dateRangeEnd || '—'}`, 'ネイティブフォームの期間設定')}
            ${renderScoreOverviewCard('セクション', String(scores.sectionCount || 0), 'グループ化された教材カテゴリ')}
            ${renderScoreOverviewCard('教材件数', String(scores.rowCount || 0), '現在表示中の教材行数')}
          </section>
          <section class="ku-score-groups">
            ${scores.groups.length ? scores.groups.map((group) => renderScoreGroup(group, scores.headers)).join('') : '<div class="ku-card ku-empty">表示できる成績データがありません。</div>'}
          </section>
        </section>
        <aside class="ku-score-aside">
          <section class="ku-card ku-sidebar-card">
            <h2 class="ku-card-title">表示中の集計</h2>
            <div class="ku-score-aside-title">${escapeHtml(scores.summaryHeading || scores.metricLabel || '集計')}</div>
            <div class="ku-mini-meta">ネイティブ集計ページの値をそのまま整形して表示しています。</div>
            <div class="ku-score-note-list">${scores.notes.length ? scores.notes.map((note) => `<div class="ku-score-note">${escapeHtml(note)}</div>`).join('') : '<div class="ku-empty">追加の注意書きはありません。</div>'}</div>
          </section>
        </aside>
      </section>`;
  }

function renderScoreRadio(option) {
    return `<label class="ku-score-option"><input type="radio" name="showdata" value="${escapeAttr(option.value || '')}" ${option.checked ? 'checked' : ''}><span>${escapeHtml(option.label || option.value || '')}</span></label>`;
  }

function renderScoreOverviewCard(label, value, caption) {
    return `<section class="ku-card ku-score-overview-card"><div class="ku-page-subtitle">${escapeHtml(label)}</div><div class="ku-score-overview-value">${escapeHtml(value)}</div><div class="ku-mini-meta">${escapeHtml(caption)}</div></section>`;
  }

function renderScoreGroup(group, headers = []) {
    const headerCells = [
      headers[0] || '教材',
      headers[1] || '得点',
      headers[2] || 'コース平均'
    ];
    return `<section class="ku-card ku-main-card ku-score-group-card">
      <div class="ku-main-card-header">
        <h2 class="ku-card-title">${escapeHtml(group.title || '集計')}</h2>
        <div class="ku-mini-meta">${escapeHtml(`${group.rows.length} 件`)}</div>
      </div>
      <div class="ku-score-table">
        <div class="ku-score-table-head">${headerCells.map((cell) => `<div>${escapeHtml(cell)}</div>`).join('')}</div>
        ${group.rows.map((row) => `<div class="ku-score-table-row"><div>${row.href ? `<a class="ku-table-link" href="${escapeAttr(row.href)}">${escapeHtml(row.title)}</a>` : escapeHtml(row.title || '—')}</div><div>${row.valueHref ? `<a class="ku-table-link" href="${escapeAttr(row.valueHref)}">${escapeHtml(row.valueText || '—')}</a>` : escapeHtml(row.valueText || '—')}</div><div>${escapeHtml(row.averageText || '—')}</div></div>`).join('')}
        ${group.total ? `<div class="ku-score-table-row ku-score-table-row-total"><div>${escapeHtml(group.total.title || '合計')}</div><div>${group.total.valueHref ? `<a class="ku-table-link" href="${escapeAttr(group.total.valueHref)}">${escapeHtml(group.total.valueText || '—')}</a>` : escapeHtml(group.total.valueText || '—')}</div><div>${escapeHtml(group.total.averageText || '—')}</div></div>` : ''}
      </div>
    </section>`;
  }
