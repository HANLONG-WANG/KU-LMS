/* src/content/render/home.js */

function renderHome(view) {
    const filteredGroups = filterOtherCourses(view.otherCourses, state.homeSearch);
    const now = Date.now();
    const displayOtherCourseUpcoming = typeof loadDisplayUpcomingFromOtherCourses === 'function'
      ? loadDisplayUpcomingFromOtherCourses(view.otherCourses, view.schedule.entries)
      : [];
    const displayUpcoming = mergeUpcomingSources(
      view.upcoming.items,
      displayOtherCourseUpcoming.map((item) => ({
        ...item,
        daysLeft: item.dueDate ? Math.max(0, Math.ceil((item.dueDate.getTime() - now) / 86400000)) : null
      }))
    ).sort(compareUpcomingItems).slice(0, 5);
    const otherCourseHints = new Map();
    [...displayOtherCourseUpcoming].sort(compareUpcomingItems)
      .forEach((item) => {
        const cacheKey = buildCourseCacheKey(item.courseHref || item.href || '');
        if (!cacheKey || otherCourseHints.has(cacheKey)) return;
        otherCourseHints.set(cacheKey, item);
      });
    const deadlineTarget = displayUpcoming[0]?.courseHref || state.currentContext.links.courses;
    const refreshState = readHomeRefreshState();
    const refreshActive = isHomeRefreshActive(refreshState);
    const upcomingHtml = view.upcoming.loading
      ? `<div class="ku-loading"><div class="ku-spinner"></div><div>課題を集約中…</div></div>`
      : (displayUpcoming.length ? renderPanelList(displayUpcoming.map((item) => ({
          badge: `<span class="ku-chip ${materialTypeTone(item.type)}">${escapeHtml(item.type || '未提出')}</span>`,
          title: `<a class="ku-panel-title" href="${escapeAttr(item.href)}">${escapeHtml(item.title)}</a>`,
          subtitle: escapeHtml(buildUpcomingSubtitle(item)),
          trailing: `<div class="ku-deadline">${formatDate(item.dueDate)}<br><strong>（あと${item.daysLeft}日）</strong></div>`
        }))) : `<div class="ku-empty">表示できる近い締切はありません。その他のコースのヒントは、このタブで最近開いたコースのキャッシュがある場合のみ表示されます。</div>`);
    const announcementSource = view.announcements.items.length ? view.announcements.items : normalizeHomeAnnouncementItems(view.homeNotices);
    const announcementsHtml = view.announcements.loading
      ? `<div class="ku-loading"><div class="ku-spinner"></div><div>お知らせを読み込み中…</div></div>`
      : (announcementSource.length ? renderPanelList(announcementSource.map((item) => ({
          marker: `<span class="ku-badge-dot"></span>`,
          title: `<a class="ku-panel-title ${item.important ? 'danger' : ''}" href="${escapeAttr(item.href)}">${escapeHtml(item.title)}</a>`,
          subtitle: escapeHtml(item.source || ''),
          trailing: `<div class="ku-mini-meta">${escapeHtml(item.deadline || '')}</div>`
        }))) : `<div class="ku-empty">お知らせはありません。</div>`);
    const messagesHtml = view.messages.loading
      ? `<div class="ku-loading"><div class="ku-spinner"></div><div>メッセージを読み込み中…</div></div>`
      : ((view.messages.items.length ? renderPanelList(view.messages.items.map((item) => ({
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
            <div class="ku-card-header"><h2 class="ku-card-title">時間割（今週）</h2></div>
            <div class="ku-weekbar">
              <div class="ku-weekbar-left">
                <button class="ku-button ghost" data-action="today-week">今日</button>
                <button class="ku-icon-button" data-action="week-prev">${icon('chevron-left')}</button>
                <button class="ku-icon-button" data-action="week-next">${icon('chevron-right')}</button>
                <div class="ku-date-range">${escapeHtml(renderWeekLabel(view.week))}</div>
              </div>
              <div class="ku-weekbar-right"><button class="ku-button">${icon('calendar')} 週表示</button></div>
            </div>
            ${renderSchedule(view.schedule, view.week, view.filters.year)}
          </section>
          <section class="ku-card ku-other-courses">
            <div class="ku-other-courses-header">
              <h2 class="ku-card-title">その他のコース</h2>
              <input class="ku-search" type="search" placeholder="コース名・教員名で検索" value="${escapeAttr(state.homeSearch)}" data-action="home-search" />
            </div>
            <div class="ku-mini-meta">期限ヒントは、このタブで最近開いたコースの同一タブキャッシュがある場合のみ表示されます。</div>
            ${filteredGroups.map((group) => `
              <section class="ku-other-group">
                <div class="ku-other-group-title">${escapeHtml(group.title)}</div>
                ${group.items.map((item) => {
                  const hint = otherCourseHints.get(buildCourseCacheKey(item.href));
                  const hintMeta = hint ? `期限ヒント · ${formatDate(hint.dueDate)}（あと${Math.max(0, Math.ceil((hint.dueDate.getTime() - now) / 86400000))}日） · ${hint.title}` : '';
                  return `<div class="ku-other-row"><div class="ku-course-link-stack"><div class="ku-title-inline"><a class="ku-title-link" href="${escapeAttr(item.href)}">${escapeHtml(item.title)}</a>${renderSyllabusChip({ title: item.title, href: item.href, year: view.filters.year })}</div><div class="ku-mini-meta">${escapeHtml(item.meta || '')}</div>${hintMeta ? `<div class="ku-mini-meta">${escapeHtml(hintMeta)}</div>` : ''}</div></div>`;
                }).join('')}
              </section>`).join('') || `<div class="ku-empty">一致するコースがありません。</div>`}
          </section>
        </div>
        <aside class="ku-side-stack">
          <section class="ku-card"><div class="ku-card-header"><h2 class="ku-card-title">期限が近い課題</h2><div class="ku-card-actions"><span class="ku-chip neutral" title="この更新は検証中の fail-closed 方式です">検証中</span><button class="ku-button ghost" data-action="refresh-upcoming" title="検証中の安全更新を実行" ${refreshActive ? 'disabled aria-disabled=\"true\"' : ''}>${icon('refresh-cw')}${refreshActive ? ' 更新中…' : ' 更新'}</button><a class="ku-panel-title" href="${escapeAttr(deadlineTarget)}">すべて見る</a></div></div>${upcomingHtml}</section>
          <section class="ku-card"><div class="ku-card-header"><h2 class="ku-card-title">最新のお知らせ</h2><a class="ku-panel-title" href="${escapeAttr(state.currentContext.links.notifications)}">すべて見る</a></div>${announcementsHtml}</section>
          <section class="ku-card"><div class="ku-card-header"><h2 class="ku-card-title">メッセージ</h2><a class="ku-panel-title" href="${escapeAttr(state.currentContext.links.messages)}">すべて見る</a></div>${messagesHtml}</section>
        </aside>
      </div>`;
  }
