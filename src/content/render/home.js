/* src/content/render/home.js */

function renderHome(view) {
    const allUpcomingHref = buildAllUpcomingUrl(state.currentContext.links.home || window.location.href);
    const refreshState = readHomeRefreshState();
    const refreshActive = isHomeRefreshActive(refreshState);
    const upcomingHtml = renderHomeUpcoming(view);
    const announcementSource = view.announcements.items.length ? view.announcements.items : normalizeHomeAnnouncementItems(view.homeNotices);
    const announcementsHtml = announcementSource.length ? renderPanelList(announcementSource.map((item) => ({
          marker: `<span class="ku-badge-dot"></span>`,
          title: `<a class="ku-panel-title ${item.important ? 'danger' : ''}" href="${escapeAttr(item.href)}">${escapeHtml(item.title)}</a>`,
          subtitle: escapeHtml(item.source || ''),
          trailing: `<div class="ku-mini-meta">${escapeHtml(item.deadline || '')}</div>`
        }))) : `<div class="ku-empty">お知らせはありません。</div>`;
    const messagesHtml = view.messages.loading
      ? `<div class="ku-loading"><div class="ku-spinner"></div><div>メッセージを読み込み中…</div></div>`
      : ((view.messages.error ? `<div class="ku-empty">メッセージを読み込めませんでした。受信箱で確認してください。</div>` : view.messages.items.length ? renderPanelList(view.messages.items.map((item) => ({
          marker: icon('mail'),
          title: `<a class="ku-panel-title" href="${escapeAttr(item.href)}">${escapeHtml(truncate(item.subject, 44))}</a>`,
          subtitle: `${escapeHtml(item.sender)}${item.userId ? ` (${escapeHtml(item.userId)})` : ''}`,
          trailing: `<div class="ku-mini-meta">${escapeHtml(item.date)}</div>`
        }))) : `<div class="ku-empty">表示できるメッセージがありません。</div>`) + `<div style="padding:0 16px 16px"><a class="ku-panel-title" href="${escapeAttr(state.currentContext.links.messages)}">受信箱へ →</a></div>`);
    return `
      <div class="ku-toolbar">
        <select class="ku-select" data-action="select-year">${view.filters.yearOptions.map((option) => `<option value="${escapeAttr(option.value)}" ${option.selected ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select>
        <select class="ku-select" data-action="select-semester">${view.filters.semesterOptions.map((option) => `<option value="${escapeAttr(option.value)}" ${option.selected ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select>
        <div class="ku-mini-meta">表示中: ${escapeHtml(view.filters.label)}</div>
      </div>
      <div class="ku-home-layout">
        <div class="ku-home-main">
          <section class="ku-card ku-schedule-card">
            <div class="ku-card-header"><h2 class="ku-card-title">時間割</h2></div>
            <div class="ku-weekbar">
              <div class="ku-weekbar-left">
                <button class="ku-button ghost" data-action="today-week">今日</button>
                <button type="button" class="ku-icon-button" data-action="week-prev" aria-label="前の週" title="前の週">${icon('chevron-left')}</button>
                <button type="button" class="ku-icon-button" data-action="week-next" aria-label="次の週" title="次の週">${icon('chevron-right')}</button>
                <div class="ku-date-range">${escapeHtml(renderWeekLabel(view.week))}</div>
              </div>
            </div>
            ${renderSchedule(view.schedule, view.week, view.filters.year)}
          </section>
          <section class="ku-card ku-other-courses">
            <div class="ku-other-courses-header">
              <h2 class="ku-card-title">その他のコース</h2>
              <input class="ku-search" type="search" placeholder="コース名・教員名で検索" value="${escapeAttr(state.homeSearch)}" data-action="home-search" />
            </div>
            <div data-home-course-results>${renderHomeOtherCourses(view)}</div>
          </section>
        </div>
        <aside class="ku-side-stack">
          <section class="ku-card"><div class="ku-card-header"><h2 class="ku-card-title">期限が近い課題</h2><div class="ku-card-actions"><button type="button" class="ku-button ghost" data-action="refresh-upcoming" title="対象コースを順に開いて締切情報を更新" ${refreshActive ? 'disabled aria-disabled=\"true\"' : ''}>${icon('refresh-cw')}${refreshActive ? ' 更新中…' : ' 更新'}</button><a class="ku-panel-title" href="${escapeAttr(allUpcomingHref)}" data-action="open-all-upcoming">すべて見る</a></div></div><div data-completion-upcoming>${upcomingHtml}</div></section>
          <section class="ku-card" data-todo-summary><div class="ku-card-header"><h2 class="ku-card-title">TODO</h2><button type="button" class="ku-button ghost" data-todo-open="">すべて見る</button></div><div class="ku-empty" data-todo-summary-body>読み込み中…</div></section>
          <section class="ku-card"><div class="ku-card-header"><h2 class="ku-card-title">最新のお知らせ</h2><a class="ku-panel-title" href="${escapeAttr(state.currentContext.links.notifications)}">すべて見る</a></div>${announcementsHtml}</section>
          <section class="ku-card"><div class="ku-card-header"><h2 class="ku-card-title">メッセージ</h2><a class="ku-panel-title" href="${escapeAttr(state.currentContext.links.messages)}">すべて見る</a></div>${messagesHtml}</section>
        </aside>
      </div>`;
  }

function renderHomeUpcoming(view) {
    if (view.upcoming.loading) return '<div class="ku-loading"><div class="ku-spinner"></div><div>課題を集約中…</div></div>';
    if (view.upcoming.error) return '<div class="ku-empty">締切情報を読み込めませんでした。対象コースで確認してください。</div>';
    if (typeof kuTaskCompletion !== 'undefined' && kuTaskCompletion.phase !== 'ready') {
      return kuTaskCompletion.phase === 'error'
        ? `<div class="ku-empty" role="status">${escapeHtml(kuTaskCompletion.error)} <button type="button" class="ku-button ghost" data-completion-retry>再読み込み</button></div>`
        : '<div class="ku-loading"><div class="ku-spinner"></div><div>完了状態を読み込み中…</div></div>';
    }
    const now = Date.now();
    const cached = typeof loadDisplayUpcomingFromOtherCourses === 'function' ? loadDisplayUpcomingFromOtherCourses(view.otherCourses, view.schedule.entries) : [];
    const candidates = mergeUpcomingSources(view.upcoming.items, cached).filter(isUpcomingDueSoonUnused);
    const displayUpcoming = candidates.filter(item => typeof kuIsAssignmentCompleted !== 'function' || !kuIsAssignmentCompleted(item, item.courseHref))
      .sort(compareUpcomingItems).slice(0, 5);
    if (displayUpcoming.length) return renderPanelList(displayUpcoming.map(item => ({
      badge: `<span class="ku-chip ${materialTypeTone(item.type)}">${escapeHtml(item.type || '教材')}</span>`,
      title: `<a class="ku-panel-title" href="${escapeAttr(item.href)}">${escapeHtml(item.title)}</a>`,
      subtitle: escapeHtml(buildUpcomingSubtitle(item)),
      trailing: `<div class="ku-completion-trailing">${item.dueDate ? `<div class="ku-deadline">${formatDate(item.dueDate)}<br><strong>（あと${Math.max(0, Math.ceil((item.dueDate.getTime() - now) / 86400000))}日）</strong></div>` : ''}${typeof kuRenderAssignmentBadge === 'function' ? kuRenderAssignmentBadge(item, item.courseHref, item.courseTitle) : ''}</div>`
    })));
    const known = new Set(candidates.map(item => buildCourseCacheKey(item.courseHref)));
    const unread = uniqueBy([...view.schedule.entries, ...view.otherCourses.flatMap(group => group.items)]
      .filter(entry => (entry.hasNativeDueReminder || isDueFlagNote(entry.note)) && !known.has(buildCourseCacheKey(entry.href))
        && !getCourseUpcomingCacheCollectedAt(entry.href)), entry => buildCourseCacheKey(entry.href) || entry.href);
    return `<div class="ku-empty">${unread.length ? '課題情報が未取得です。更新するか、コースを開いて確認してください。' : candidates.length ? '期限が近い未完了の課題はありません。' : '読み取り済みの情報に近い締切はありません。'}${unread.map(entry => `<div><a class="ku-title-link" href="${escapeAttr(entry.href)}">${escapeHtml(shortenCourseTitle(entry.title))}</a></div>`).join('')}</div>`;
  }

function renderHomeOtherCourses(view) {
    const groups = filterOtherCourses(view.otherCourses, state.homeSearch);
    return groups.map((group) => `<section class="ku-other-group">
      ${group.title ? `<div class="ku-other-group-title">${escapeHtml(group.title)}</div>` : ''}
      ${group.items.map((item) => {
        const hasReminder = Boolean(item.hasNativeDueReminder || isDueFlagNote(item.note));
        return `<div class="ku-other-row"><div class="ku-course-link-stack"><div class="ku-title-inline ku-other-course-title-row"><a class="ku-title-link" href="${escapeAttr(item.href)}">${escapeHtml(shortenCourseTitle(item.title))}</a>${hasReminder ? `<div class="ku-chip red">${escapeHtml(dueSoonReminderText())}</div>` : ''}${renderSyllabusChip({ title: item.title, href: item.href, year: view.filters.year })}${typeof kuRenderTodoChip === 'function' ? kuRenderTodoChip(item) : ''}</div><div class="ku-mini-meta">${escapeHtml(item.meta || '')}</div></div></div>`;
      }).join('')}
    </section>`).join('') || `<div class="ku-empty">${state.homeSearch ? '一致するコースがありません。' : 'その他のコースはありません。'}</div>`;
  }

function renderAllUpcoming(view) {
    const typeOptions = [
      { key: 'all', label: 'すべて' },
      { key: 'exam', label: '試験' },
      { key: 'report', label: 'レポート・課題' },
      { key: 'material', label: '資料' },
      { key: 'survey', label: 'アンケート' },
      { key: 'lti', label: 'LTIツール' },
      { key: 'selfstudy', label: '自習' },
      { key: 'generic', label: 'その他' }
    ];
    const typeCounts = new Map();
    view.items.forEach((item) => {
      const key = materialTypeToken(item.type, item.title).key;
      typeCounts.set(key, (typeCounts.get(key) || 0) + 1);
    });
    const selectedType = typeOptions.some((option) => option.key === view.typeFilter) ? view.typeFilter : 'all';
    const displayItems = selectedType === 'all'
      ? view.items
      : view.items.filter((item) => materialTypeToken(item.type, item.title).key === selectedType);
    const summaryMeta = [
      '<span class="ku-chip blue">期限の上限なし</span>',
      `<span class="ku-chip neutral">${escapeHtml(`${view.courseCount} コース`)}</span>`,
      `<span class="ku-chip neutral">${escapeHtml(`表示 ${displayItems.length} / 全 ${view.items.length} 件`)}</span>`
    ];
    if (view.collectedAtLabel) {
      summaryMeta.push(`<span class="ku-mini-meta">更新: ${escapeHtml(view.collectedAtLabel)}</span>`);
    }
    const itemsHtml = displayItems.length
      ? renderPanelList(displayItems.map((item) => ({
          badge: `<span class="ku-chip ${materialTypeTone(item.type, item.title)}">${escapeHtml(item.type || '課題')}</span>`,
          title: `<a class="ku-panel-title" href="${escapeAttr(item.href)}">${escapeHtml(item.title)}</a>`,
          subtitle: escapeHtml(buildUpcomingSubtitle(item)),
          trailing: `<div class="ku-completion-trailing"><div class="ku-deadline">${formatDate(item.dueDate)}<br><strong>（あと${item.daysLeft}日）</strong></div>${typeof kuRenderAssignmentBadge === 'function' ? kuRenderAssignmentBadge(item, item.courseHref, item.courseTitle) : ''}</div>`
        })))
      : `<div class="ku-empty">${escapeHtml(selectedType === 'all' ? view.emptyMessage : 'この種類の課題・教材はありません。')}</div>`;
    return `
      <section class="ku-card ku-main-card">
        <div class="ku-main-card-header">
          <div>
            <h1 class="ku-page-title">全コースの課題・教材</h1>
            <div class="ku-page-subtitle">${escapeHtml(view.subtitle)}</div>
          </div>
          <div class="ku-card-actions">
            <a class="ku-button ghost" href="${escapeAttr(view.homeHref)}">ホームへ戻る</a>
          </div>
        </div>
        <div style="padding:0 20px 20px">
          <div class="ku-inline">${summaryMeta.join('')}</div>
          <label class="ku-inline" style="margin-top:12px">
            <span class="ku-mini-meta">種類</span>
            <select class="ku-select" data-action="filter-all-upcoming-type" aria-label="課題・教材の種類">
              ${typeOptions.map((option) => `<option value="${option.key}" ${option.key === selectedType ? 'selected' : ''}>${escapeHtml(option.label)}（${option.key === 'all' ? view.items.length : typeCounts.get(option.key) || 0}）</option>`).join('')}
            </select>
          </label>
        </div>
        ${itemsHtml}
      </section>`;
  }
