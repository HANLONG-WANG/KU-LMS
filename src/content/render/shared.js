/* src/content/render/shared.js */

function renderPage(route, view) {
    switch (route.name) {
      case 'login': return renderLogin(view);
      case 'logout': return renderLogout(view);
      case 'home': return renderHome(view);
      case 'course-materials': return renderCourseMaterials(view);
      case 'course-myreports': return renderMyReports(view);
      case 'notifications': return renderNotifications(view);
      case 'notifications-detail': return renderNotifications(view);
      case 'messages-inbox': return renderMessages(view);
      case 'messages-outbox': return renderMessages(view);
      case 'messages-recyclebox': return renderMessages(view);
      case 'messages-detail': return renderMessages(view);
      case 'manual': return renderManual(view);
      default: return renderUnsupported();
    }
  }

function renderLoadingPage(route) {
    return `<div class="ku-card ku-loading"><div class="ku-spinner"></div><div>${escapeHtml(routeLabel(route.name))} を読み込み中…</div></div>`;
  }

function renderShell(route, context, content) {
    if (route.name === 'login' || route.name === 'logout') {
      const pageClass = route.name === 'logout' ? 'ku-logout-page' : 'ku-login-page';
      return `
      <div class="ku-app ku-route-${route.name}">
        <main class="ku-page ${pageClass}">${content}<div class="ku-footer">Powered by 関大LMS</div></main>
      </div>`;
    }
    return `
      <div class="ku-app ku-route-${route.name}">
        ${renderTopbar(route, context)}
        <main class="ku-page">${content}<div class="ku-footer">Powered by 関大LMS</div></main>
      </div>`;
  }

function renderTopbar(route, context) {
    const links = context.links;
    const items = [
      { key: 'home', label: 'ホーム', href: links.home, icon: icon('home') },
      { key: 'courses', label: 'コース', href: links.courses, icon: icon('folder') },
      { key: 'notifications', label: 'お知らせ', href: links.notifications, icon: icon('bell') },
      { key: 'messages-inbox', label: 'メッセージ', href: links.messages, icon: icon('mail') },
      { key: 'manual', label: 'マニュアル', href: links.manual, icon: icon('book') }
    ];
    return `
      <header class="ku-topbar">
        <div class="ku-brand"><span class="ku-logo-mark">${icon('wave')}</span><span class="ku-brand-title">関大LMS</span></div>
        <nav class="ku-topnav">${items.map((item) => `<a class="ku-toplink ${isActiveNav(route.name, item.key) ? 'active' : ''}" href="${escapeAttr(item.href)}"><span>${item.icon}</span><span>${escapeHtml(item.label)}</span></a>`).join('')}</nav>
        <div class="ku-topnav-right">
          <span class="ku-pill-user">${icon('globe')}<span>${escapeHtml(context.language)}</span></span>
          <span class="ku-divider"></span>
          <span class="ku-pill-user"><span>${escapeHtml(context.userName)}</span><span class="ku-avatar-block">${escapeHtml(getAvatarInitial(context.userName))}</span></span>
          <a class="ku-toplink" href="${escapeAttr(links.logout)}">${icon('logout')}<span>ログアウト</span></a>
        </div>
      </header>`;
  }

function renderSchedule(schedule, week, year = '') {
    const cells = [];
    cells.push('<div class="ku-schedule-head"></div>');
    DAY_LABELS.forEach((label, index) => {
      const day = week[index];
      cells.push(`<div class="ku-schedule-head">${escapeHtml(label)} ${day.monthDay}</div>`);
    });
    Object.entries(PERIOD_TIMES).forEach(([period, time]) => {
      cells.push(`<div class="ku-schedule-period"><div class="ku-period-title">${escapeHtml(period)}</div><div class="ku-period-time">${escapeHtml(time)}</div></div>`);
      DAY_NAMES.forEach((weekday, weekdayIndex) => {
        const entry = schedule.entries.find((item) => item.period === period && item.weekdayIndex === weekdayIndex);
        cells.push(`<div class="ku-schedule-cell">${entry ? renderScheduleCard(entry, year) : ''}</div>`);
      });
    });
    return `<div class="ku-schedule-grid">${cells.join('')}</div>`;
  }

function renderScheduleCard(entry, year = '') {
    const palette = pickPalette(entry.title);
    const meta = entry.title.match(/(\d限-\d+)/)?.[1] || entry.weekday;
    return `<div class="ku-class-card ${palette}"><div class="ku-class-title-row"><a class="ku-card-link ku-class-title-link" href="${escapeAttr(entry.href)}">${escapeHtml(shortenCourseTitle(entry.title))}</a>${renderSyllabusChip({ title: entry.title, href: entry.href, year })}</div><div class="ku-class-sub">${escapeHtml(meta)}</div>${entry.note ? `<div class="ku-chip red">${escapeHtml(entry.note)}</div>` : ''}</div>`;
  }

function renderSidebar(active) {
    const folderLinks = resolveMessageFolderLinks();
    const inboxBadge = state.currentView?.folder === 'inbox'
      ? state.currentView?.rows?.length || 0
      : state.currentView?.messages?.total || 0;
    const messageLinks = [
      { key: 'messages-inbox', label: '受信箱', href: folderLinks.inbox, badge: inboxBadge },
      { key: 'messages-outbox', label: '送信済箱', href: folderLinks.outbox },
      { key: 'messages-recyclebox', label: 'ゴミ箱', href: folderLinks.recyclebox }
    ];
    const noticeLinks = [
      { key: 'notifications', label: '一覧', href: state.currentContext.links.notifications }
    ];
    return `
      <aside class="ku-card ku-sidebar-card">
        <h2 class="ku-card-title">メッセージ</h2>
        <ul class="ku-sidebar-nav">${messageLinks.map((item) => `<li><a class="ku-sidebar-link ${active === item.key ? 'active' : ''}" href="${escapeAttr(item.href)}"><span>${icon(item.key === 'messages-inbox' ? 'mail' : item.key === 'messages-outbox' ? 'send' : 'trash')}</span><span style="flex:1">${escapeHtml(item.label)}</span>${item.key === 'messages-inbox' && item.badge ? `<span class="ku-mini-badge">${item.badge}</span>` : ''}</a></li>`).join('')}</ul>
        <div class="ku-sidebar-section">
          <h2 class="ku-card-title">お知らせ</h2>
          <ul class="ku-sidebar-nav">${noticeLinks.map((item) => `<li><a class="ku-sidebar-link ${active === 'notifications' || active === 'notifications-detail' ? 'active' : ''}" href="${escapeAttr(item.href)}"><span>${icon('list')}</span><span style="flex:1">${escapeHtml(item.label)}</span></a></li>`).join('')}</ul>
        </div>
      </aside>`;
  }

function renderPanelList(items) {
    return `<div class="ku-panel-list">${items.map((item) => `<div class="ku-panel-item">${item.badge ? `<div>${item.badge}</div>` : `<div>${item.marker || ''}</div>`}<div class="ku-panel-body"><div>${item.title}</div>${item.subtitle ? `<div class="ku-mini-meta">${item.subtitle}</div>` : ''}</div><div>${item.trailing || ''}</div></div>`).join('')}</div>`;
  }

function renderPagination(items) {
    if (!items || !items.length) return '';
    return items.slice(0, 7).map((item) => `<a class="ku-pagination-link ${item.text === '1' ? 'active' : ''}" href="${escapeAttr(item.href)}">${escapeHtml(item.text)}</a>`).join('');
  }

function renderMessagePagination(pagination) {
    const entries = [
      { text: '«', href: pagination.prev },
      { text: pagination.pageText || '1 / 1', href: '' },
      { text: '›', href: pagination.next },
      { text: '»', href: pagination.last }
    ];
    return entries.map((item, index) => item.href ? `<a class="ku-pagination-link" href="#" data-message-js="${escapeAttr(item.href)}">${escapeHtml(item.text)}</a>` : `<span class="ku-pagination-link ${index === 1 ? 'active' : 'disabled'}">${escapeHtml(item.text)}</span>`).join('');
  }

function renderUnsupported() {
    return '<div class="ku-card ku-empty">このページはまだリデザイン対象外です。</div>';
  }

function resolveMessageFolderLinks() {
    const folderMap = Object.fromEntries((state.currentView?.folders || []).map((item) => [item.title, item.href]));
    const messageContext = getActiveMessageContext();
    const canonicalInboxHref = messageContext?.canonicalMessageHref || state.currentContext?.links?.canonicalMessageHref || state.currentContext?.links?.messages;
    const globalInboxHref = messageContext?.globalInboxHref || state.currentContext?.links?.globalInboxHref || state.currentContext?.links?.messages;
    return {
      inbox: canonicalInboxHref || folderMap['受信箱'] || globalInboxHref,
      outbox: folderMap['送信済箱'] || absoluteUrl('/webclass/msg_editor.php?msgappmode=outbox'),
      recyclebox: folderMap['ゴミ箱'] || absoluteUrl('/webclass/msg_editor.php?msgappmode=recyclebox')
    };
  }

function renderSyllabusChip({ title = '', href = '', year = '' } = {}) {
    const query = normalizeSyllabusCourseQuery(title);
    if (!query) return '';
    return `<a class="ku-chip blue ku-chip-link ku-syllabus-chip" href="${escapeAttr(buildSyllabusFallbackHref(year))}" data-syllabus-title="${escapeAttr(title || '')}" data-syllabus-href="${escapeAttr(href || '')}" data-syllabus-year="${escapeAttr(year || '')}" title="シラバスを開く" aria-label="${escapeAttr(`${query} のシラバスを開く`)}">シ</a>`;
  }

function renderCourseHeader(course, currentTab) {
    return `
      <div class="ku-route-header">
        <section class="ku-card ku-route-header-card">
          <div class="ku-page-subtitle"><a class="ku-title-link" href="${escapeAttr(state.currentContext.links.courses)}">← コース一覧に戻る</a></div>
          <div class="ku-title-inline ku-title-inline-large" style="margin-top:12px"><h1 class="ku-page-title">${escapeHtml(course.title)}</h1>${renderSyllabusChip({ title: course.title, href: course.links.info || course.links.materials, year: course.meta.year })}</div>
          <div class="ku-hero-meta"><span>${icon('calendar')} ${escapeHtml(course.meta.year)}年 ${escapeHtml(course.meta.semester)}</span><span>${icon('clock')} ${escapeHtml(course.meta.weekdayPeriod)}</span><span>${icon('pin')} 教室: ${escapeHtml(course.meta.room || '—')}</span></div>
          <nav class="ku-subnav"><a class="ku-subnav-link ${currentTab === 'materials' ? 'active' : ''}" href="${escapeAttr(course.links.materials || '#')}">教材</a><a class="ku-subnav-link ${currentTab === 'myreports' ? 'active' : ''}" href="${escapeAttr(course.links.myreports || '#')}">マイレポート</a><a class="ku-subnav-link" href="${escapeAttr(course.links.attendance || '#')}">出席</a><a class="ku-subnav-link" href="${escapeAttr(course.links.materials || '#')}">その他</a><a class="ku-subnav-link" href="${escapeAttr(state.currentContext.links.courses)}">コース</a></nav>
        </section>
      </div>`;
  }

function icon(name) {
    const map = {
      home: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10.5V20h14v-9.5"/></svg>',
      folder: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7h5l2 2h11v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/></svg>',
      bell: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>',
      mail: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>',
      book: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13Z"/></svg>',
      globe: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18"/><path d="M12 3a15 15 0 0 0 0 18"/></svg>',
      logout: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>',
      wave: '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14c1.7-5.3 5.3-8 10-8 3.7 0 6.3 1.6 8 4.8"/><path d="M4 20c1.7-5.3 5.3-8 10-8 3.7 0 6.3 1.6 8 4.8"/><circle cx="8" cy="8" r="2.2"/></svg>',
      calendar: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
      "chevron-left": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>',
      "chevron-right": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>',
      "chevron-up": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m18 15-6-6-6 6"/></svg>',
      note: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg>',
      list: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
      file: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
      link: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4"/><path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 19"/></svg>',
      clipboard: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="3" width="8" height="4" rx="1"/><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h6"/></svg>',
      "badge-check": '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3 2.5 2.5L18 4l1.5 3.5L23 10l-2.5 2 1 4-4 .5-1.5 3.5-3.5-1.5L9 20l-1.5-3.5-4-.5 1-4L2 10l3.5-2.5L7 4l3.5 1.5Z"/><path d="m9 12 2 2 4-4"/></svg>',
      pin: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-6-4.35-6-10a6 6 0 1 1 12 0c0 5.65-6 10-6 10Z"/><circle cx="12" cy="11" r="2"/></svg>',
      clock: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
      "refresh-cw": '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
      search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
      sliders: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h7M14 6h6M4 12h11M18 12h2M4 18h3M10 18h10"/><circle cx="12" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="18" r="2"/></svg>',
      send: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/></svg>',
      trash: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/></svg>'
    };
    return map[name] || '';
  }
