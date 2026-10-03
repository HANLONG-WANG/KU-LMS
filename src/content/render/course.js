/* src/content/render/course.js */

function renderCourseMaterials(view) {
    const course = view.course.course;
    return `
      ${renderCourseHeader(view.course.course, view.currentTab)}
      <div class="ku-course-grid">
        <aside class="ku-course-left-column">
          <section class="ku-card ku-course-todo-card" aria-label="このコースの TODO">
            <header class="ku-course-todo-header"><h2 class="ku-card-title">TODO</h2><span class="ku-chip blue" data-course-todo-count aria-label="TODO 读取中">…</span></header>
            <div class="ku-course-todo-notice" data-course-todo-notice role="status">读取当前课程 TODO…</div>
            <div class="ku-course-todo-body" data-course-todo-host></div>
          </section>
          <section class="ku-card ku-timeline-card">
            <div class="ku-card-title">タイムライン</div>
            <div class="ku-course-timeline-scroll" tabindex="0" aria-label="タイムラインの活動">${view.course.timeline.items.length ? view.course.timeline.items.map((item) => {
            const token = materialTypeToken(item.subtitle, item.title);
            const body = renderTimelineBody(item);
            return `<div class="ku-timeline-item"><div class="ku-timeline-icon ku-token-${token.key}">${icon(token.icon)}</div><div class="ku-timeline-content"><div class="ku-timeline-head"><div class="ku-timeline-head-main"><span class="ku-mini-meta ku-timeline-kicker">${escapeHtml(item.subtitle)}</span><span class="ku-chip ${item.label === 'New' ? 'red' : token.tone}">${escapeHtml(item.label || '更新')}</span></div><span class="ku-mini-meta ku-timeline-recency">${escapeHtml(item.recency)}</span></div><div class="ku-timeline-body">${body}</div></div></div>`;
          }).join('') : `<div class="ku-empty">${view.course.timeline.error ? 'タイムラインを取得できませんでした。' : '表示できる活動はありません。'}</div>`}</div>
          </section>
        </aside>
        <section class="ku-sidebar-layout">
          ${view.course.sections.map((section, index) => {
            const sectionId = section.id || `course-section-${index + 1}-${slugify(section.title || 'general')}`;
            const bodyId = `${sectionId}-items`;
            const collapsed = !!state.courseCollapsedSections?.has(bodyId);
            return `
            <section class="ku-section-block" id="${escapeAttr(sectionId)}">
              <button type="button" class="ku-collapse-head" data-action="course-section-toggle" data-section-target="${escapeAttr(bodyId)}" aria-controls="${escapeAttr(bodyId)}" aria-expanded="${!collapsed}"><span>${escapeHtml(section.title || 'General')}</span><span>${icon('chevron-up')}</span></button>
              <div class="ku-section-items" id="${escapeAttr(bodyId)}" data-course-section-body ${collapsed ? 'hidden' : ''}>${section.items.map((item) => {
                const token = materialTypeToken(item.type, item.title);
                const titleInner = `${item.isNew ? '<span class="ku-chip red">New</span> ' : ''}${escapeHtml(item.title)}`;
                const titleNode = item.isTitleClickable && item.titleLaunchHref
                  ? `<a class="ku-title-link" href="${escapeAttr(item.titleLaunchHref)}">${titleInner}</a>`
                  : `<div class="ku-section-title ku-section-item-title">${titleInner}</div>`;
                return `<div class="ku-section-item"><div class="ku-item-icon ku-token-${token.key}">${icon(token.icon)}</div><div class="ku-section-item-meta">${titleNode}<div class="ku-inline"><span class="ku-chip ${token.tone}">${escapeHtml(item.type || token.label)}</span></div>${item.availability ? `<div class="ku-mini-meta">利用可能期間 ${escapeHtml(item.availability)}</div>` : ''}</div><div class="ku-inline">${item.detailHref ? `<a class="ku-chip blue ku-chip-link" href="${escapeAttr(item.detailHref)}">詳細</a>` : ''}${item.historyHref ? `<a class="ku-chip neutral ku-chip-link" href="${escapeAttr(item.historyHref)}">${escapeHtml(item.historyLabel || '履歴')}</a>` : ''}${typeof kuRenderAssignmentBadge === 'function' ? kuRenderAssignmentBadge(item, course.links.materials, course.title) : ''}</div></div>`;
              }).join('')}</div>
            </section>`; }).join('')}
        </section>
        <aside class="ku-card ku-rightnav-card">
          <div class="ku-card-title">${escapeHtml(shortenCourseTitle(course.title))}</div>
          <ul class="ku-rightnav-list">${view.course.anchors.map((anchor, index) => `<li><a class="ku-rightnav-link ${index === 0 ? 'active' : ''}" href="#${escapeAttr(anchor.target)}">${escapeHtml(anchor.title)}</a></li>`).join('')}</ul>
        </aside>
      </div>`;
  }

function renderTimelineBody(item) {
    const bodyText = String(item?.bodyText || '').replace(/\r\n/g, '\n').trim();
    let body = '';
    if (bodyText) {
      body = `<div>${escapeHtml(bodyText).replace(/\n/g, '<br>')}</div>`;
    } else if (item?.href) {
      body = `<a class="ku-title-link" href="${escapeAttr(item.href)}">${escapeHtml(item.title)}</a>`;
    } else if (!item?.attachment) {
      body = `<div>${escapeHtml(item?.title || '')}</div>`;
    }
    if (item?.attachment) {
      const name = escapeHtml(item.attachment.name);
      body += item.attachment.href
        ? `<div><a class="ku-title-link" href="${escapeAttr(item.attachment.href)}" download>${name}</a></div>`
        : `<div>${name}</div>`;
    }
    return body;
  }

function renderMyReports(view) {
    const preferences = state.myReportColumns;
    const defaultColumns = [
      { key: 'task', label: '課題名' }, { key: 'qno', label: 'Q.No' },
      { key: 'preview', label: 'レポート / 本文プレビュー', optional: true }, { key: 'attachments', label: '添付ファイル', optional: true },
      { key: 'comments', label: 'コメント', optional: true }, { key: 'date', label: '提出日' }, { key: 'grade', label: '成績' },
      { key: 'score', label: '得点 / 配点', optional: true }
    ];
    const sourceColumns = view.reports.columns?.length ? view.reports.columns : defaultColumns;
    const columns = sourceColumns.map((column, sourceIndex) => ({ ...column, sourceIndex })).filter((column) => !column.optional || preferences[column.key] !== false);
    const widths = { task: '1.3fr', qno: '0.6fr', preview: '2.4fr', attachments: '1.3fr', comments: '1fr', date: '1.2fr', grade: '0.8fr', score: '1fr' };
    const tracks = columns.map((column) => `minmax(0, ${widths[column.key] || '1fr'})`).join(' ');
    const rows = view.reports.rows;
    return `
      ${renderCourseHeader(view.course, view.currentTab)}
      <section class="ku-card ku-main-card">
        <div class="ku-main-card-header"><h2 class="ku-card-title">マイレポート</h2><div style="position:relative"><button type="button" class="ku-button" data-action="toggle-settings">${icon('sliders')} 表示設定</button>${state.showSettings ? renderMyReportSettings() : ''}</div></div>
        <div class="ku-report-table" role="table" aria-label="提出したレポート" aria-colcount="${columns.length}" style="--ku-report-columns:${tracks};--ku-report-min-width:${Math.max(480, columns.length * 110)}px">
          <div class="ku-report-head" role="row">${columns.map((column) => `<div role="columnheader">${escapeHtml(column.label)}</div>`).join('')}</div>
          ${rows.length ? rows.map((row) => `<div class="ku-report-row" role="row">${columns.map((column) => renderReportCell(column.key, row, column.sourceIndex)).join('')}</div>`).join('') : '<div class="ku-empty">提出したレポートはありません。</div>'}
        </div>
      </section>`;
  }

function renderReportCell(key, row, sourceIndex = null) {
    const nativeCell = sourceIndex === null ? null : row.cells?.[sourceIndex];
    if (nativeCell) {
      if (key === 'preview') return `<div role="cell" class="ku-report-preview">${escapeHtml(nativeCell.text)}</div>`;
      if (key === 'attachments' && nativeCell.links.length) return `<div role="cell" class="ku-report-attachments">${nativeCell.links.map((link) => `<a class="ku-table-link" href="${escapeAttr(link.href)}">${escapeHtml(link.label || nativeCell.text)}</a>`).join('')}</div>`;
      const link = nativeCell.links[0];
      return `<div role="cell">${link ? `<a class="ku-table-link" href="${escapeAttr(link.href)}">${escapeHtml(nativeCell.text || link.label)}</a>` : escapeHtml(nativeCell.text || '—')}</div>`;
    }
    if (key === 'task') return `<div role="cell">${row.taskHref ? `<a class="ku-table-link" href="${escapeAttr(row.taskHref)}">${escapeHtml(row.task)}</a>` : escapeHtml(row.task)}</div>`;
    if (key === 'preview') return `<div role="cell" class="ku-report-preview">${escapeHtml(row.preview)}</div>`;
    if (key === 'attachments') {
      const attachments = row.attachments || (row.attachmentHref ? [{ href: row.attachmentHref, label: row.attachmentName }] : []);
      return `<div role="cell" class="ku-report-attachments">${attachments.length ? attachments.map((link) => `<a class="ku-table-link" href="${escapeAttr(link.href)}">${escapeHtml(link.label)}</a>`).join('') : escapeHtml(row.attachmentName || '—')}</div>`;
    }
    if (key === 'score' && row.scoreHref) return `<div role="cell"><a class="ku-table-link" href="${escapeAttr(row.scoreHref)}">${escapeHtml(row.score)}</a></div>`;
    return `<div role="cell">${escapeHtml(row[key] || '—')}</div>`;
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
    const entries = [...group.rows, ...(group.total ? [group.total] : [])];
    const count = Math.max(3, headers.length, ...entries.map((row) => row.cells?.length || 0));
    const headerCells = Array.from({ length: count }, (_, index) => headers[index] || ['教材', '得点', 'コース平均'][index] || '');
    const renderRow = (row, total = false) => {
      const cells = row.cells || [{ text: row.title, href: row.href }, { text: row.valueText, href: row.valueHref }, { text: row.averageText }];
      return `<div class="ku-score-table-row ${total ? 'ku-score-table-row-total' : ''}" role="row">${Array.from({ length: count }, (_, index) => {
        const cell = cells[index] || {};
        return `<div role="cell">${cell.href ? `<a class="ku-table-link" href="${escapeAttr(cell.href)}">${escapeHtml(cell.text || '—')}</a>` : escapeHtml(cell.text || '—')}</div>`;
      }).join('')}</div>`;
    };
    return `<section class="ku-card ku-main-card ku-score-group-card">
      <div class="ku-main-card-header"><h2 class="ku-card-title">${escapeHtml(group.title || '集計')}</h2><div class="ku-mini-meta">${group.rows.length} 件</div></div>
      <div class="ku-score-table" role="table" style="--ku-score-columns:${headerCells.map((_, index) => index === 0 ? 'minmax(0, 1.8fr)' : 'minmax(0, 1fr)').join(' ')}">
        <div class="ku-score-table-head" role="row">${headerCells.map((cell) => `<div role="columnheader">${escapeHtml(cell)}</div>`).join('')}</div>
        ${group.rows.map((row) => renderRow(row)).join('')}${group.total ? renderRow(group.total, true) : ''}
      </div>
    </section>`;
  }
