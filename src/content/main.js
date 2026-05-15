(() => {
  if (document.documentElement.dataset.kuRedesignBooted === 'true') return;
  document.documentElement.dataset.kuRedesignBooted = 'true';

  const ROOT_ID = 'ku-redesign-root';
  const PERIOD_TIMES = {
    '1限': '08:50–10:20',
    '2限': '10:30–12:00',
    '3限': '13:00–14:30',
    '4限': '14:40–16:10',
    '5限': '16:20–17:50',
    '6限': '18:00–19:30',
    '7限': '19:40–21:10',
    '8限': '21:20–22:50'
  };
  const DAY_LABELS = ['月', '火', '水', '木', '金', '土'];
  const DAY_NAMES = ['月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];
  const state = {
    homeSearch: '',
    messageSearch: '',
    showSettings: false,
    myReportColumns: {
      preview: true,
      attachments: true,
      comments: true,
      score: true
    },
    supplementalCache: new Map(),
    weekOffset: 0,
    messageSelection: new Set(),
    currentView: null,
    currentContext: null,
    currentRoute: null
  };

  if (window.location.hostname === 'syllabus3.jm.kansai-u.ac.jp') {
    initSyllabusAssist();
    return;
  }

  document.documentElement.dataset.kuRedesignState = 'booting';
  mountBootShell();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  async function init() {
    const route = detectRoute(window.location);
    if (!route.supported) return releaseNative();
    if (route.name === 'notifications' && window.location.pathname.replace(/\/$/, '') === '/webclass/information.php/mbl') {
      window.location.replace(normalizeNotificationsUrl(window.location.href));
      return;
    }

    try {
      const context = await collectContext(route);
      const root = ensureRoot();
      state.currentRoute = route;
      state.currentContext = context;
      root.innerHTML = renderShell(route, context, renderLoadingPage(route));
      document.documentElement.dataset.kuRedesignState = 'ready';

      const view = await buildView(route, context);
      state.currentView = view;
      rerender();

      if (route.name === 'home') {
        enrichHomeAsync(context, view).catch((error) => console.warn('[KU Redesign] home enrichment failed', error));
      }
    } catch (error) {
      console.error('[KU Redesign] init failed', error);
      releaseNative();
    }
  }

  function rerender() {
    const route = state.currentRoute;
    const context = state.currentContext;
    const view = state.currentView;
    if (!route || !context || !view) return;
    const root = ensureRoot();
    root.innerHTML = renderShell(route, context, renderPage(route, view));
    bindInteractiveHandlers(root, route, view);
  }

  function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      (document.body || document.documentElement).appendChild(root);
    }
    return root;
  }

  function releaseNative() {
    delete document.documentElement.dataset.kuRedesignState;
    const root = document.getElementById(ROOT_ID);
    if (root) root.remove();
  }

  function mountBootShell() {
    const root = ensureRoot();
    root.innerHTML = `<div class="ku-app"><div class="ku-loading" style="min-height:100vh"><div class="ku-spinner"></div><div>KU-LMS を再構築しています…</div></div></div>`;
  }

  function getAvatarInitial(name) {
    const source = (name || '').trim();
    if (!source) return 'U';
    return source.replace(/\s+/g, '').charAt(0).toUpperCase();
  }

  function detectRoute(locationObj) {
    const pathname = locationObj.pathname;
    const query = new URLSearchParams(locationObj.search);
    const normalized = pathname.replace(/\/$/, '');
    if (normalized === '/webclass') return { supported: true, name: 'home' };
    if (normalized === '/webclass/index.php') return { supported: true, name: 'home' };
    if (/\/webclass\/course\.php\/[^/]+\/my-reports$/.test(normalized)) return { supported: true, name: 'course-myreports' };
    if (/\/webclass\/course\.php\/[^/]+$/.test(normalized)) return { supported: true, name: 'course-materials' };
    if (normalized === '/webclass/information.php' || normalized === '/webclass/information.php/mbl') return { supported: true, name: 'notifications' };
    if (normalized === '/webclass/msg_editor.php' && query.get('msgappmode') === 'inbox') return { supported: true, name: 'messages-inbox' };
    if (normalized === '/webclass/user.php/manual') return { supported: true, name: 'manual' };
    return { supported: false, name: 'unsupported' };
  }

  async function collectContext(route) {
    const current = document;
    const homeDoc = route.name === 'home' ? current : await loadSupplementalDocument('/webclass/');
    const topLinks = parseTopLinks(homeDoc);
    const currentTopLinks = parseTopLinks(current);
    const links = { ...topLinks, ...currentTopLinks };
    return {
      userName: parseUserName(homeDoc) || parseUserName(current) || 'ユーザー',
      language: parseLanguage(homeDoc) || '日本語',
      links,
      homeDoc
    };
  }

  async function buildView(route, context) {
    switch (route.name) {
      case 'home':
        return buildHomeView(document, context);
      case 'course-materials':
        return buildCourseMaterialsView(document, context);
      case 'course-myreports':
        return buildMyReportsView(document, context);
      case 'notifications':
        return buildNotificationsView(document, context);
      case 'messages-inbox':
        return buildMessagesView(document, context);
      case 'manual':
        return buildManualView(document, context);
      default:
        throw new Error('Unsupported route');
    }
  }

  function buildHomeView(doc, context) {
    const schedule = parseSchedule(doc);
    const filters = parseHomeFilters(doc);
    const homeNotices = parseHomeAnnouncements(doc);
    const otherCourses = parseOtherCourses(doc);
    const today = new Date();
    return {
      filters,
      schedule,
      homeNotices,
      otherCourses,
      week: getWeekDays(today, state.weekOffset),
      upcoming: { loading: true, items: [] },
      messages: { loading: true, items: [], total: 0 },
      announcements: { loading: true, items: homeNotices },
      allCourseLinks: uniqueBy(schedule.entries.map((entry) => entry.href).concat(otherCourses.flatMap((group) => group.items.map((item) => item.href))).filter(Boolean), (item) => item)
    };
  }

  async function enrichHomeAsync(context, view) {
    const nextView = { ...view, upcoming: { loading: false, items: [] }, announcements: { loading: false, items: [] }, messages: { loading: false, items: [], total: 0 } };

    try {
      const noticesDoc = await loadSupplementalDocument(context.links.notifications || '/webclass/information.php/');
      nextView.announcements = { loading: false, items: parseNotificationsList(noticesDoc).items.slice(0, 5) };
    } catch (error) {
      console.warn('[KU Redesign] notices enrichment failed', error);
    }

    try {
      const messagesDoc = await loadSupplementalDocument(context.links.messages || '/webclass/msg_editor.php?msgappmode=inbox');
      nextView.messages = { loading: false, ...parseMessagePreview(messagesDoc) };
    } catch (error) {
      console.warn('[KU Redesign] message enrichment failed', error);
    }

    try {
      const now = new Date();
      const fallbackUpcoming = parseUpcomingFromAnnouncements(nextView.announcements.items, view.schedule.entries, view.filters.year)
        .sort((a, b) => {
          if (a.dueDate?.getTime() !== b.dueDate?.getTime()) return a.dueDate - b.dueDate;
          return a.title.localeCompare(b.title, 'ja');
        });
      nextView.upcoming = {
        loading: false,
        items: fallbackUpcoming
          .slice(0, 5)
          .map((item) => ({ ...item, daysLeft: Math.max(0, Math.ceil((item.dueDate - now) / 86400000)) }))
      };
    } catch (error) {
      console.warn('[KU Redesign] upcoming enrichment failed', error);
    }

    state.currentView = nextView;
    rerender();
  }

  async function buildCourseMaterialsView(doc, context) {
    const course = parseCourseDocument(doc);
    course.timeline = await fetchCourseTimeline(course.course.courseId);
    return { course, currentTab: 'materials' };
  }

  function buildMyReportsView(doc, context) {
    const course = parseCourseMeta(doc);
    const reports = parseMyReports(doc);
    return { course, reports, currentTab: 'myreports' };
  }

  function buildNotificationsView(doc, context) {
    return parseNotificationsList(doc);
  }

  function buildMessagesView(doc, context) {
    return parseMessagesTable(doc);
  }

  function buildManualView(doc, context) {
    const sections = parseManualSections(doc);
    const fallbackSections = parseHomeHelpSections(context.homeDoc);
    return {
      title: 'マニュアル',
      subtitle: '利用ガイド、動作環境、サポート情報をまとめています。',
      closeHref: Array.from(doc.querySelectorAll('a[href]')).find((a) => a.textContent.includes('このウィンドウを閉じる'))?.getAttribute('href') || '',
      sections: sections.length ? sections : fallbackSections
    };
  }

  function parseTopLinks(doc) {
    const links = {};
    const all = Array.from(doc.querySelectorAll('a[href]'));
    const get = (matcher) => {
      const anchor = all.find((a) => matcher(a));
      return anchor ? absoluteUrl(anchor.getAttribute('href')) : '';
    };
    links.home = absoluteUrl('/webclass/');
    links.courses = absoluteUrl('/webclass/');
    links.messages = get((a) => (a.getAttribute('href') || '').includes('msg_editor.php?msgappmode=inbox')) || absoluteUrl('/webclass/msg_editor.php?msgappmode=inbox');
    links.notifications = normalizeNotificationsUrl(get((a) => (a.getAttribute('href') || '').includes('information.php')) || absoluteUrl('/webclass/information.php/'));
    links.manual = normalizeManualUrl(
      get((a) => {
        const text = a.textContent.replace(/\s+/g, ' ').trim();
        const href = a.getAttribute('href') || '';
        return text === 'マニュアル' || (href.includes('/user.php/manual') && !href.includes('/download/'));
      }) || absoluteUrl('/webclass/user.php/manual')
    );
    links.logout = get((a) => a.textContent.includes('ログアウト')) || absoluteUrl('/webclass/logout.php');
    return links;
  }

  function parseUserName(doc) {
    const candidates = Array.from(doc.querySelectorAll('a, span')).map((el) => el.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const preferred = candidates.find((text) => /[\u3000\s]/.test(text) && /[\p{Script=Han}]/u.test(text) && !/関大LMS|ログアウト|日本語|コース/.test(text));
    return preferred || '';
  }

  function parseLanguage(doc) {
    const link = Array.from(doc.querySelectorAll('a')).find((a) => a.textContent.trim() === '日本語' || a.textContent.trim() === '言語');
    if (!link) return '日本語';
    return '日本語';
  }

  function parseHomeFilters(doc) {
    const form = doc.forms.condition;
    const yearSelect = form?.querySelector('select[name="year"]');
    const semesterSelect = form?.querySelector('select[name="semester"]');
    const toOptions = (select) => Array.from(select?.options || []).map((option) => ({
      value: option.value || option.textContent.trim(),
      label: option.textContent.trim() || option.value || '',
      selected: option.selected
    }));
    const yearLabel = yearSelect?.selectedOptions?.[0]?.textContent.trim() || yearSelect?.value || '';
    const rawSemester = semesterSelect?.selectedOptions?.[0]?.textContent.trim() || semesterSelect?.value || '';
    const semesterMap = { '1': '春学期', '2': '秋学期', all: 'All' };
    const semesterLabel = semesterMap[rawSemester] || rawSemester;
    return {
      action: absoluteUrl(form?.getAttribute('action') || '/webclass/'),
      year: yearSelect?.value || '',
      semester: semesterSelect?.value || '',
      yearOptions: toOptions(yearSelect),
      semesterOptions: toOptions(semesterSelect),
      label: `${yearLabel} ${semesterLabel}`.trim()
    };
  }

  function parseSchedule(doc) {
    const table = doc.querySelector('#schedule-table');
    const entries = [];
    if (!table) return { entries, weekdays: DAY_NAMES };
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    rows.forEach((row, rowIndex) => {
      const period = row.querySelector('.schedule-table-class_order')?.textContent.trim() || `${rowIndex + 1}限`;
      const cells = Array.from(row.children).slice(1);
      cells.forEach((cell, cellIndex) => {
        const anchor = cell.querySelector('a');
        if (!anchor) return;
        const fullText = anchor.textContent.replace(/\s+/g, ' ').trim();
        const dueFlag = cell.querySelector('.course-contents-info')?.textContent.trim() || '';
        const rawHref = absoluteUrl(anchor.getAttribute('href'));
        entries.push({
          period,
          weekdayIndex: cellIndex,
          weekday: DAY_NAMES[cellIndex],
          title: fullText.replace(dueFlag, '').replace(/^»\s*/, '').trim(),
          href: canonicalizeCourseMaterialsHref(rawHref),
          supplementalHref: rawHref,
          note: dueFlag
        });
      });
    });
    return { entries, weekdays: DAY_NAMES };
  }

  function parseHomeAnnouncements(doc) {
    return Array.from(doc.querySelectorAll('a[href*="information.php/post"]')).slice(0, 5).map((anchor) => ({
      title: anchor.textContent.trim(),
      href: absoluteUrl(anchor.getAttribute('href')),
      meta: anchor.parentElement?.textContent.replace(anchor.textContent, '').trim() || ''
    }));
  }

  function parseOtherCourses(doc) {
    const groups = [];
    const titles = Array.from(doc.querySelectorAll('.courseTree-levelTitle'));
    titles.forEach((titleEl) => {
      const group = { title: titleEl.textContent.trim(), items: [] };
      const list = titleEl.nextElementSibling?.querySelector('.courseList') || titleEl.parentElement?.querySelector('.courseList');
      if (list) {
        Array.from(list.querySelectorAll('.course-title')).forEach((box) => {
          const anchor = box.querySelector('a[href]');
          if (!anchor) return;
          const meta = box.querySelector('.course-info')?.textContent.replace(/\s+/g, ' ').trim() || '';
          const rawHref = absoluteUrl(anchor.getAttribute('href'));
          group.items.push({ title: anchor.textContent.replace(/^»\s*/, '').trim(), href: canonicalizeCourseMaterialsHref(rawHref), supplementalHref: rawHref, meta });
        });
      }
      if (group.items.length) groups.push(group);
    });
    return groups;
  }

  function parseCourseMeta(doc) {
    const brand = Array.from(doc.querySelectorAll('.navbar a, a')).find((a) => /\(\d{4}-/.test(a.textContent));
    const title = brand ? brand.textContent.trim() : (doc.title || '').replace(' - 関大LMS', '');
    const meta = deriveCourseMetaFromTitle(title);
    const courseId = extractCourseId(brand?.getAttribute('href') || window.location.pathname);
    const links = {
      materials: canonicalizeCourseMaterialsHref(doc.querySelector('a[href*="#contents"], a[href*="/course.php/"]')?.getAttribute('href') || window.location.pathname),
      myreports: absoluteUrl(Array.from(doc.querySelectorAll('a')).find((a) => a.textContent.includes('マイレポート'))?.getAttribute('href') || ''),
      attendance: absoluteUrl(Array.from(doc.querySelectorAll('a')).find((a) => a.textContent.includes('出席'))?.getAttribute('href') || ''),
      manual: absoluteUrl(Array.from(doc.querySelectorAll('a')).find((a) => a.textContent.includes('マニュアル'))?.getAttribute('href') || ''),
      info: absoluteUrl(Array.from(doc.querySelectorAll('a')).find((a) => a.textContent.includes('開講情報'))?.getAttribute('href') || (courseId ? `/webclass/course.php/${courseId}/info` : ''))
    };
    return { title, meta, courseId, links };
  }

  function deriveCourseMetaFromTitle(title) {
    const match = title.match(/\((\d{4})-([^\-]+)-([^\-]+)-(\d限)-?(\d+)?\)/);
    if (!match) {
      return { year: '', semester: '', weekdayPeriod: '', room: '' };
    }
    return {
      year: match[1],
      semester: match[2],
      weekdayPeriod: `${match[3]} ${match[4]}`,
      room: match[5] || ''
    };
  }

  function parseCourseDocument(doc) {
    const course = parseCourseMeta(doc);
    const root = doc.querySelector('course-learning-index') || doc;
    const sectionBlocks = [];
    Array.from(root.querySelectorAll('.cl-contentsList_folder')).forEach((folder) => {
      const title = folder.querySelector('.panel-title')?.textContent.trim() || '';
      const normalizedTitle = title || 'General';
      const items = Array.from(folder.querySelectorAll('.cl-contentsList_listGroupItem')).map((item) => extractCourseItem(item));
      if (!items.length) return;
      const existing = sectionBlocks.find((section) => section.title === normalizedTitle);
      if (existing) {
        existing.items.push(...items);
      } else {
        sectionBlocks.push({ title: normalizedTitle, items });
      }
    });

    const anchors = sectionBlocks.filter((section) => section.title).map((section) => ({
      title: section.title,
      target: slugify(section.title)
    }));

    return { course, sections: sectionBlocks, timeline: { items: [], error: false }, anchors };
  }

  function parseUpcomingFromCourse(doc, courseHref = '') {
    const courseTitle = parseCourseMeta(doc).title;
    const items = [];
    Array.from(doc.querySelectorAll('.cl-contentsList_listGroupItem')).forEach((item) => {
      const courseItem = extractCourseItem(item);
      if (!courseItem.title || !courseItem.availability) return;
      const dueDate = parseAvailabilityEnd(courseItem.availability);
      items.push({
        title: courseItem.title,
        type: courseItem.type,
        availability: courseItem.availability,
        dueDate,
        href: courseItem.detailHref || courseHref || courseItem.href,
        detailHref: courseItem.detailHref,
        historyHref: courseItem.historyHref,
        courseHref: canonicalizeCourseMaterialsHref(courseHref || courseItem.href || courseItem.detailHref),
        courseTitle,
        usageText: courseItem.usage,
        usageCount: courseItem.usageCount,
        hasUsage: courseItem.usageCount > 0
      });
    });
    return items;
  }

  function extractCourseItem(item) {
    const allLinks = Array.from(item.querySelectorAll('a[href]'));
    const titleSource = item.querySelector('.cm-contentsList_contentName, .cl-contentsList_contentName, .cl-contentsList_contentInfo h4, .cl-contentsList_contentInfo');
    const primaryTitleNode = item.querySelector('.cm-contentsList_contentName, .cl-contentsList_contentName, .cl-contentsList_contentInfo h4');
    const titleCandidates = [
      primaryTitleNode?.querySelector('a[href]')?.textContent || '',
      extractPrimaryTitleText(primaryTitleNode),
      extractPrimaryTitleText(titleSource),
      ...Array.from(primaryTitleNode?.querySelectorAll('div, span') || []).map((node) => node.textContent || ''),
      ...allLinks.map((link) => link.textContent || '')
    ].map((text) => sanitizeCourseItemTitle(text)).filter(Boolean);
    const rawTitle = titleCandidates[0] || '';
    const availabilityLabel = Array.from(item.querySelectorAll('.cm-contentsList_contentDetailListItemLabel, .cl-contentsList_contentDetailListItemLabel')).find((label) => label.textContent.includes('利用可能期間'));
    const availabilityData = availabilityLabel?.nextElementSibling?.textContent.replace(/\s+/g, ' ').trim() || '';
    const detailLinks = Array.from(item.querySelectorAll('.cl-contentsList_contentDetail a, .cl-contentsList_contentDetailListItem a, .cm-contentsList_contentDetailListItem a'));
    const primaryTitleLink = allLinks.find((link) => sanitizeCourseItemTitle(link.textContent || ''));
    const detailHref = absoluteUrl(detailLinks.find((link) => /\/contents\//.test(link.getAttribute('href') || '') || /詳細/.test(link.textContent || ''))?.getAttribute('href') || primaryTitleLink?.getAttribute('href') || '');
    const historyHref = absoluteUrl(allLinks.find((link) => /\/history(?:[/?]|$)/.test(link.getAttribute('href') || ''))?.getAttribute('href') || '');
    const historyLabel = allLinks.find((link) => /利用回数|履歴/.test(link.textContent || ''))?.textContent.replace(/\s+/g, ' ').trim() || '';
    const usage = /利用回数/.test(historyLabel) ? historyLabel : '';
    const usageCount = Number(usage.match(/\d+/)?.[0] || 0);
    const categoryType = item.querySelector('.cl-contentsList_categoryLabel')?.textContent.replace(/\s+/g, ' ').trim() || '';
    const inferredType = inferMaterialType(rawTitle);
    const type = /試験/.test(inferredType) ? inferredType : (categoryType || inferredType);
    const href = absoluteUrl(detailHref || primaryTitleLink?.getAttribute('href') || '');
    return {
      title: rawTitle || '項目',
      isNew: !!item.querySelector('.cl-contentsList_new') || /(^|\s)New(\s|$)/.test(titleSource?.textContent || ''),
      type,
      availability: availabilityData,
      href,
      detailHref,
      historyHref,
      historyLabel,
      usage,
      usageCount
    };
  }

  function parseMyReports(doc) {
    const table = doc.querySelector('table.table.table-striped');
    if (!table) return { rows: [] };
    const rows = Array.from(table.querySelectorAll('tr')).slice(1).map((tr) => {
      const cells = Array.from(tr.children);
      return {
        task: cells[0]?.textContent.trim() || '',
        taskHref: absoluteUrl(cells[0]?.querySelector('a')?.getAttribute('href') || ''),
        qno: cells[1]?.textContent.trim() || '',
        preview: cells[2]?.textContent.trim() || '',
        attachmentName: cells[3]?.textContent.trim() || '-',
        attachmentHref: absoluteUrl(cells[3]?.querySelector('a')?.getAttribute('href') || ''),
        comments: cells[4]?.textContent.trim() || '',
        date: cells[5]?.textContent.trim() || '',
        grade: cells[6]?.textContent.trim() || '-',
        score: cells[7]?.textContent.trim() || '-',
        scoreHref: absoluteUrl(cells[7]?.querySelector('a')?.getAttribute('href') || '')
      };
    }).filter((row) => row.task);
    return { rows };
  }

  function parseNotificationsList(doc) {
    const items = Array.from(doc.querySelectorAll('.info-list li.odd, .info-list li.eve, .info-list li.even, .info-list li.last'))
      .map((row) => {
        const link = row.querySelector('a[href*="information.php/post"]');
        if (!link) return null;
        const source = row.querySelector('.exhibitionInfo')?.textContent.replace(/\s+/g, ' ').trim() || '';
        const deadline = source.includes('公開期限') ? source.split('-').find((text) => text.includes('公開期限'))?.trim() || '' : '';
        return {
          title: link.textContent.trim(),
          href: absoluteUrl(link.getAttribute('href')),
          source,
          deadline,
          important: /重要|最新版|中間テスト|注意/.test(link.textContent)
        };
      })
      .filter(Boolean);
    const pagination = Array.from(doc.querySelectorAll('a[href*="page="]')).map((a) => ({
      text: a.textContent.trim(), href: absoluteUrl(a.getAttribute('href'))
    }));
    const metaText = doc.querySelector('.info-list .head, li.head')?.textContent.replace(/\s+/g, ' ').trim() || Array.from(doc.querySelectorAll('body *')).find((el) => /ページ\s+\d+\s*\//.test(el.textContent))?.textContent.trim() || '';
    return { items, pagination, metaText };
  }

  function parseMessagesTable(doc) {
    const form = doc.forms.condition;
    const table = doc.querySelector('#MsgListTable');
    const rows = table ? Array.from(table.querySelectorAll('tr.odd, tr.even')).map((tr, index) => {
      const cells = Array.from(tr.children);
      const checkbox = cells[0]?.querySelector('input[type="checkbox"]');
      return {
        id: checkbox?.value || `row-${index}`,
        inputName: checkbox?.name || `id[${index}]`,
        sender: cells[1]?.textContent.trim() || '',
        userId: cells[2]?.textContent.trim() || '',
        subject: cells[3]?.textContent.trim() || '',
        href: absoluteUrl(cells[3]?.querySelector('a')?.getAttribute('href') || ''),
        attachments: cells[4]?.textContent.trim() || '',
        date: cells[5]?.textContent.trim() || ''
      };
    }) : [];
    const pagination = {
      prev: findTextHref(doc, '前へ'),
      next: findTextHref(doc, '次へ'),
      last: Array.from(doc.querySelectorAll('a')).find((a) => a.textContent.trim() === '>>')?.getAttribute('href') || '',
      pageText: Array.from(doc.querySelectorAll('font')).find((font) => /\d+\s*\/\d+/.test(font.textContent))?.textContent.trim() || ''
    };
    const folders = Array.from(doc.querySelectorAll('.navi a')).map((a) => ({ title: a.textContent.replace(/^»\s*/, '').trim(), href: absoluteUrl(a.getAttribute('href')) }));
    const sortLinks = Array.from(doc.querySelectorAll('#MsgListTable thead a')).map((a) => ({ label: a.parentElement?.textContent.trim() || a.textContent.trim(), href: a.getAttribute('href') || '' }));
    return { form, rows, pagination, folders, sortLinks };
  }

  function parseMessagePreview(doc) {
    const data = parseMessagesTable(doc);
    return { total: data.rows.length, items: data.rows.slice(0, 4) };
  }

  function parseManualSections(doc) {
    const root = doc.querySelector('main') || doc.body;
    if (!root) return [];
    const headings = Array.from(root.querySelectorAll('h2, h3, h4'));
    const seen = new Set();
    return headings.map((heading) => {
      const title = heading.textContent.replace(/\s+/g, ' ').trim();
      if (!title || seen.has(title)) return null;
      seen.add(title);
      const description = [];
      const links = [];
      let node = heading.nextElementSibling;
      while (node && !/^H[234]$/i.test(node.tagName)) {
        const text = node.textContent.replace(/\s+/g, ' ').trim();
        if (text && !node.querySelector?.('a[href]') && !links.some((link) => link.label === text)) description.push(text);
        Array.from(node.querySelectorAll?.('a[href]') || []).forEach((anchor) => {
          const label = anchor.textContent.replace(/\s+/g, ' ').trim();
          if (!label || label.includes('このウィンドウを閉じる')) return;
          links.push({
            label,
            href: absoluteUrl(anchor.getAttribute('href')),
            meta: anchor.parentElement?.textContent.replace(anchor.textContent, '').replace(/\s+/g, ' ').trim() || ''
          });
        });
        node = node.nextElementSibling;
      }
      return {
        title,
        description: uniqueBy(description, (item) => item).slice(0, 3),
        links: uniqueBy(links, (item) => item.href || item.label)
      };
    }).filter((section) => section && (section.description.length || section.links.length));
  }

  function parseHomeHelpSections(doc) {
    if (!doc) return [];
    const sections = Array.from(doc.querySelectorAll('.side-block')).map((block) => ({
      title: block.querySelector('.side-block-title')?.textContent.replace(/\s+/g, ' ').trim() || 'サポート',
      description: [],
      links: Array.from(block.querySelectorAll('a[href]')).map((anchor) => ({
        label: anchor.textContent.replace(/\s+/g, ' ').trim(),
        href: absoluteUrl(anchor.getAttribute('href')),
        meta: anchor.target === '_blank' ? '外部サイト' : ''
      })).filter((item) => item.label)
    })).filter((section) => section.links.length);
    const quickLinks = [
      { label: 'お知らせ一覧', href: normalizeNotificationsUrl('/webclass/information.php/') },
      { label: 'メッセージ受信箱', href: absoluteUrl('/webclass/msg_editor.php?msgappmode=inbox') },
      { label: 'アカウント設定', href: absoluteUrl(Array.from(doc.querySelectorAll('a[href]')).find((anchor) => anchor.textContent.includes('アカウント情報の変更'))?.getAttribute('href') || '') }
    ].filter((item) => item.href);
    if (quickLinks.length) {
      sections.unshift({
        title: 'クイックアクセス',
        description: ['よく使うサポート導線をまとめています。'],
        links: quickLinks
      });
    }
    return sections;
  }

  function renderPage(route, view) {
    switch (route.name) {
      case 'home': return renderHome(view);
      case 'course-materials': return renderCourseMaterials(view);
      case 'course-myreports': return renderMyReports(view);
      case 'notifications': return renderNotifications(view);
      case 'messages-inbox': return renderMessages(view);
      case 'manual': return renderManual(view);
      default: return renderUnsupported();
    }
  }

  function renderLoadingPage(route) {
    return `<div class="ku-card ku-loading"><div class="ku-spinner"></div><div>${escapeHtml(routeLabel(route.name))} を読み込み中…</div></div>`;
  }

  function renderShell(route, context, content) {
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

  function renderHome(view) {
    const filteredGroups = filterOtherCourses(view.otherCourses, state.homeSearch);
    const deadlineTarget = view.upcoming.items[0]?.courseHref || state.currentContext.links.courses;
    const upcomingHtml = view.upcoming.loading
      ? `<div class="ku-loading"><div class="ku-spinner"></div><div>課題を集約中…</div></div>`
      : (view.upcoming.items.length ? renderPanelList(view.upcoming.items.map((item) => ({
          badge: `<span class="ku-chip ${materialTypeTone(item.type)}">${escapeHtml(item.type || '未提出')}</span>`,
          title: `<a class="ku-panel-title" href="${escapeAttr(item.href)}">${escapeHtml(item.title)}</a>`,
          subtitle: escapeHtml(`${item.courseTitle}${item.usageText ? ` · ${item.usageText}` : ' · 未利用'}`),
          trailing: `<div class="ku-deadline">${formatDate(item.dueDate)}<br><strong>（あと${item.daysLeft}日）</strong></div>`
        }))) : `<div class="ku-empty">近い締切の課題は見つかりませんでした。</div>`);
    const announcementSource = view.announcements.items.length ? view.announcements.items : view.homeNotices.map((item) => ({ ...item, source: item.meta || '', deadline: '', important: /重要|テスト/.test(item.title) }));
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
            ${filteredGroups.map((group) => `
              <section class="ku-other-group">
                <div class="ku-other-group-title">${escapeHtml(group.title)}</div>
                ${group.items.map((item) => `<div class="ku-other-row"><div class="ku-course-link-stack"><div class="ku-title-inline"><a class="ku-title-link" href="${escapeAttr(item.href)}">${escapeHtml(item.title)}</a>${renderSyllabusChip({ title: item.title, href: item.href, year: view.filters.year })}</div><div class="ku-mini-meta">${escapeHtml(item.meta || '')}</div></div></div>`).join('')}
              </section>`).join('') || `<div class="ku-empty">一致するコースがありません。</div>`}
          </section>
        </div>
        <aside class="ku-side-stack">
          <section class="ku-card"><div class="ku-card-header"><h2 class="ku-card-title">期限が近い課題</h2><a class="ku-panel-title" href="${escapeAttr(deadlineTarget)}">すべて見る</a></div>${upcomingHtml}</section>
          <section class="ku-card"><div class="ku-card-header"><h2 class="ku-card-title">最新のお知らせ</h2><a class="ku-panel-title" href="${escapeAttr(state.currentContext.links.notifications)}">すべて見る</a></div>${announcementsHtml}</section>
          <section class="ku-card"><div class="ku-card-header"><h2 class="ku-card-title">メッセージ</h2><a class="ku-panel-title" href="${escapeAttr(state.currentContext.links.messages)}">すべて見る</a></div>${messagesHtml}</section>
        </aside>
      </div>`;
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

  function renderNotifications(view) {
    return `
      <div class="ku-sidebar-shell">
        ${renderSidebar('notifications')}
        <section class="ku-card ku-main-card">
          <div class="ku-main-card-header"><div><h1 class="ku-page-title">お知らせ一覧</h1><div class="ku-page-subtitle">${escapeHtml(view.metaText || '')}</div></div><div class="ku-pagination">${renderPagination(view.pagination)}</div></div>
          ${view.items.map((item) => `<div class="ku-notice-row"><div>${item.important ? '<span class="ku-chip red">重要</span>' : '<span class="ku-chip blue">お知らせ</span>'}</div><div class="ku-panel-body"><a class="ku-notice-title ku-title-link" href="${escapeAttr(item.href)}">${escapeHtml(item.title)}</a><div class="ku-mini-meta">${escapeHtml(item.source)}</div></div><div class="ku-deadline"><div>${escapeHtml(extractPublishDate(item.source))}</div>${item.deadline ? `<strong>${escapeHtml(item.deadline)}</strong>` : ''}</div></div>`).join('')}
        </section>
      </div>`;
  }

  function renderMessages(view) {
    const filteredRows = view.rows.filter((row) => {
      if (!state.messageSearch) return true;
      const q = state.messageSearch.toLowerCase();
      return [row.sender, row.userId, row.subject].join(' ').toLowerCase().includes(q);
    });
    return `
      <div class="ku-sidebar-shell">
        ${renderSidebar('messages')}
        <section class="ku-card ku-main-card">
          <div class="ku-main-card-header"><h1 class="ku-page-title">メッセージ</h1></div>
          <div style="padding:0 20px 18px">
            <div class="ku-search-row">
              <div class="ku-actions-bar">
                <button class="ku-button" data-action="message-delete">削除</button>
                <button class="ku-button" data-action="message-read">既読にする</button>
                <button class="ku-button" data-action="message-download">ダウンロード</button>
              </div>
              <div class="ku-search-wrap"><span class="ku-search-icon">${icon('search')}</span><input class="ku-search" data-action="message-search" type="search" value="${escapeAttr(state.messageSearch)}" placeholder="メッセージを検索"></div>
              <div class="ku-pagination">${renderMessagePagination(view.pagination)}</div>
            </div>
          </div>
          <div class="ku-message-table">
            <div class="ku-message-head"><div><input class="ku-checkbox" type="checkbox" data-action="message-select-all" ${allSelected(filteredRows) ? 'checked' : ''}></div><div>差出人</div><div>ユーザID</div><div>件名</div><div>添付ファイル</div><div>日付</div></div>
            ${filteredRows.map((row) => `<div class="ku-message-row"><div><input class="ku-checkbox" type="checkbox" data-action="message-select" data-id="${escapeAttr(row.id)}" ${state.messageSelection.has(row.id) ? 'checked' : ''}></div><div>${escapeHtml(row.sender)}</div><div>${escapeHtml(row.userId)}</div><div><a class="ku-table-link" href="${escapeAttr(row.href)}">${escapeHtml(truncate(row.subject, 78))}</a></div><div>${escapeHtml(row.attachments || '—')}</div><div>${escapeHtml(row.date)}</div></div>`).join('')}
          </div>
          <div style="padding:16px 20px 4px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div class="ku-mini-meta">${escapeHtml(view.pagination.pageText || `${filteredRows.length} 件`)}</div><div class="ku-inline"><span class="ku-mini-meta">1 ページあたり</span><select class="ku-page-size"><option>20件</option></select></div></div>
        </section>
      </div>`;
  }

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

  function renderSidebar(active) {
    const messageLinks = [
      { key: 'messages', label: '受信箱', href: state.currentContext.links.messages, badge: state.currentView?.rows?.length || state.currentView?.messages?.total || 0 },
      { key: 'messages-out', label: '送信済箱', href: absoluteUrl('/webclass/msg_editor.php?msgappmode=outbox') },
      { key: 'messages-trash', label: 'ゴミ箱', href: absoluteUrl('/webclass/msg_editor.php?msgappmode=recyclebox') }
    ];
    const noticeLinks = [
      { key: 'notifications', label: '一覧', href: state.currentContext.links.notifications }
    ];
    return `
      <aside class="ku-card ku-sidebar-card">
        <h2 class="ku-card-title">メッセージ</h2>
        <ul class="ku-sidebar-nav">${messageLinks.map((item) => `<li><a class="ku-sidebar-link ${active === 'messages' && item.key === 'messages' ? 'active' : ''}" href="${escapeAttr(item.href)}"><span>${icon(item.key === 'messages' ? 'mail' : item.key === 'messages-out' ? 'send' : 'trash')}</span><span style="flex:1">${escapeHtml(item.label)}</span>${item.key === 'messages' && item.badge ? `<span class="ku-mini-badge">${item.badge}</span>` : ''}</a></li>`).join('')}</ul>
        <div class="ku-sidebar-section">
          <h2 class="ku-card-title">お知らせ</h2>
          <ul class="ku-sidebar-nav">${noticeLinks.map((item) => `<li><a class="ku-sidebar-link ${active === 'notifications' ? 'active' : ''}" href="${escapeAttr(item.href)}"><span>${icon('list')}</span><span style="flex:1">${escapeHtml(item.label)}</span></a></li>`).join('')}</ul>
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

  function bindInteractiveHandlers(root, route, view) {
    root.querySelectorAll('[data-action="home-search"]').forEach((input) => {
      input.addEventListener('input', (event) => {
        state.homeSearch = event.target.value;
        rerender();
      });
    });
    root.querySelectorAll('[data-action="select-year"]').forEach((select) => {
      select.addEventListener('change', (event) => submitHomeFilters(event.target.value, root.querySelector('[data-action="select-semester"]')?.value || view.filters.semester));
    });
    root.querySelectorAll('[data-action="select-semester"]').forEach((select) => {
      select.addEventListener('change', (event) => submitHomeFilters(root.querySelector('[data-action="select-year"]')?.value || view.filters.year, event.target.value));
    });
    root.querySelectorAll('[data-action="message-search"]').forEach((input) => {
      input.addEventListener('input', (event) => {
        state.messageSearch = event.target.value;
        rerender();
      });
    });
    root.querySelectorAll('[data-action="today-week"]').forEach((button) => button.addEventListener('click', () => { state.weekOffset = 0; state.currentView.week = getWeekDays(new Date(), state.weekOffset); rerender(); }));
    root.querySelectorAll('[data-action="week-prev"]').forEach((button) => button.addEventListener('click', () => { state.weekOffset -= 1; state.currentView.week = getWeekDays(new Date(), state.weekOffset); rerender(); }));
    root.querySelectorAll('[data-action="week-next"]').forEach((button) => button.addEventListener('click', () => { state.weekOffset += 1; state.currentView.week = getWeekDays(new Date(), state.weekOffset); rerender(); }));
    root.querySelectorAll('[data-action="toggle-settings"]').forEach((button) => button.addEventListener('click', () => { state.showSettings = !state.showSettings; rerender(); }));
    root.querySelectorAll('[data-setting-key]').forEach((checkbox) => checkbox.addEventListener('change', (event) => {
      state.myReportColumns[event.target.dataset.settingKey] = event.target.checked;
      rerender();
    }));
    root.querySelectorAll('[data-action="message-select"]').forEach((checkbox) => checkbox.addEventListener('change', (event) => {
      const id = event.target.dataset.id;
      if (event.target.checked) state.messageSelection.add(id); else state.messageSelection.delete(id);
      syncNativeMessageSelection(view);
      rerender();
    }));
    root.querySelectorAll('[data-action="message-select-all"]').forEach((checkbox) => checkbox.addEventListener('change', (event) => {
      const checked = event.target.checked;
      if (checked) {
        view.rows.forEach((row) => state.messageSelection.add(row.id));
      } else {
        state.messageSelection.clear();
      }
      syncNativeMessageSelection(view);
      rerender();
    }));
    root.querySelectorAll('[data-action="message-delete"]').forEach((button) => button.addEventListener('click', () => triggerNativeMessageAction('COMFIRM_SELECTED', view)));
    root.querySelectorAll('[data-action="message-read"]').forEach((button) => button.addEventListener('click', () => triggerNativeMessageAction('UNSET_UNREADFLAG', view)));
    root.querySelectorAll('[data-action="message-download"]').forEach((button) => button.addEventListener('click', () => triggerNativeMessageAction('downloadmsg', view)));
    root.querySelectorAll('[data-message-js]').forEach((anchor) => anchor.addEventListener('click', (event) => {
      event.preventDefault();
      executeMessageHref(anchor.dataset.messageJs, view);
    }));
    root.querySelectorAll('.ku-rightnav-link[href^="#"]').forEach((anchor) => anchor.addEventListener('click', (event) => {
      event.preventDefault();
      const target = document.getElementById(anchor.getAttribute('href').slice(1));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    root.querySelectorAll('[data-syllabus-title]').forEach((anchor) => anchor.addEventListener('click', async (event) => {
      event.preventDefault();
      await handleSyllabusNavigation(anchor);
    }));
  }

  function triggerNativeMessageAction(name, view) {
    syncNativeMessageSelection(view);
    const form = view.form;
    if (!form) return;
    const button = form.querySelector(`[name="${name}"]`);
    if (!button) return;
    if (!state.messageSelection.size) {
      window.alert('メッセージを選択してください');
      return;
    }
    button.click();
  }

  function executeMessageHref(href, view) {
    const matchSort = href.match(/sortMessageListTable\('([^']+)'\)/);
    if (matchSort && typeof window.sortMessageListTable === 'function') {
      window.sortMessageListTable(matchSort[1]);
      return;
    }
    const matchChangePage = href.match(/changePage\('([^']+)'\)/);
    if (matchChangePage && typeof window.changePage === 'function') {
      window.changePage(matchChangePage[1]);
      return;
    }
    if (href && href !== '#') window.location.href = href;
  }

  function submitHomeFilters(year, semester) {
    const form = document.forms.condition;
    if (!form) return;
    const yearSelect = form.querySelector('select[name="year"]');
    const semesterSelect = form.querySelector('select[name="semester"]');
    if (yearSelect) yearSelect.value = year;
    if (semesterSelect) semesterSelect.value = semester;
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.submit();
  }

  function syncNativeMessageSelection(view) {
    if (!view.form) return;
    view.rows.forEach((row) => {
      const input = view.form.elements[row.inputName];
      if (input) input.checked = state.messageSelection.has(row.id);
    });
    const master = view.form.elements.autochecker;
    if (master) master.checked = allSelected(view.rows);
  }

  function loadSupplementalDocument(url) {
    const normalized = absoluteUrl(url || '/webclass/');
    if (state.supplementalCache.has(normalized)) {
      return Promise.resolve(cloneDocument(state.supplementalCache.get(normalized)));
    }
    state.supplementalCache.queue = ((state.supplementalCache.queue || Promise.resolve()).catch(() => undefined)).then(async () => {
      const response = await fetch(normalized, {
        credentials: 'include',
        redirect: 'follow',
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });
      const html = await response.text();
      if (/コース利用中に、別のコースへのアクセスがリクエストされました/.test(html)) {
        throw new Error(`supplemental course conflict: ${normalized}`);
      }
      if (/window\.top\.location\.href="\/webclass\/login\.php"/.test(html)) {
        throw new Error(`supplemental login redirect: ${normalized}`);
      }
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      state.supplementalCache.set(normalized, parsed);
      return cloneDocument(parsed);
    });
    return state.supplementalCache.queue;
  }

  function cloneDocument(doc) {
    return new DOMParser().parseFromString(doc.documentElement.outerHTML, 'text/html');
  }

  function findTextHref(doc, text) {
    const anchor = Array.from(doc.querySelectorAll('a')).find((a) => a.textContent.includes(text));
    return anchor ? anchor.getAttribute('href') || '' : '';
  }

  function parseAvailabilityEnd(text) {
    const normalized = String(text || '')
      .replace(/[～〜‐‑‒–—―]/g, '-')
      .replace(/\u3000/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const matches = Array.from(normalized.matchAll(/(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s*\([^)]*\))?\s*(\d{1,2})?:(\d{2})?/g));
    const last = matches[matches.length - 1];
    if (!last) return null;
    const [, year, month, day, hour = '23', minute = '59'] = last;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  }

  function getWeekDays(baseDate, offset) {
    const date = new Date(baseDate);
    const day = date.getDay();
    const mondayDistance = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + mondayDistance + offset * 7);
    return DAY_LABELS.map((label, index) => {
      const current = new Date(date);
      current.setDate(date.getDate() + index);
      return {
        date: current,
        monthDay: `${current.getMonth() + 1}/${current.getDate()}`
      };
    });
  }

  function renderWeekLabel(week) {
    const first = week[0].date;
    const last = week[week.length - 1].date;
    return `${first.getFullYear()}/${pad(first.getMonth() + 1)}/${pad(first.getDate())} 〜 ${pad(last.getMonth() + 1)}/${pad(last.getDate())}`;
  }

  function formatDate(date) {
    if (!date) return '—';
    return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}（${DAY_LABELS[(date.getDay() + 6) % 7] || ''}） ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function extractPublishDate(text) {
    const match = text.match(/(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2})/);
    return match ? match[1] : text;
  }

  function filterOtherCourses(groups, query) {
    if (!query) return groups;
    const lower = query.toLowerCase();
    return groups.map((group) => ({
      ...group,
      items: group.items.filter((item) => `${item.title} ${item.meta}`.toLowerCase().includes(lower))
    })).filter((group) => group.items.length);
  }

  function routeLabel(name) {
    return ({
      home: 'ホーム',
      'course-materials': '教材',
      'course-myreports': 'マイレポート',
      notifications: 'お知らせ',
      'messages-inbox': 'メッセージ',
      manual: 'マニュアル'
    })[name] || 'ページ';
  }

  function isActiveNav(routeName, itemKey) {
    if (routeName === 'course-materials' || routeName === 'course-myreports') return itemKey === 'courses';
    if (routeName === 'manual') return itemKey === 'manual';
    return routeName === itemKey;
  }

  function allSelected(rows) {
    return rows.length > 0 && rows.every((row) => state.messageSelection.has(row.id));
  }

  function pickPalette(text) {
    const palettes = ['blue', 'green', 'orange', 'red', 'purple'];
    let total = 0;
    for (const char of text) total += char.charCodeAt(0);
    return palettes[total % palettes.length];
  }

  function inferMaterialType(title) {
    if (/LTI/.test(title)) return 'LTIツール';
    if (/自習/.test(title)) return '自習';
    if (/テスト|小テスト|試験/.test(title)) return '試験';
    if (/レポート|課題|提出/.test(title)) return '課題';
    if (/アンケート/.test(title)) return 'アンケート';
    if (/資料|スライド|補足|動画/.test(title)) return '資料';
    return '';
  }

  function materialTypeToken(type = '', title = '') {
    const normalizedType = String(type || '').trim();
    const normalizedTitle = String(title || '').trim();
    if (/LTI/.test(normalizedType)) return { key: 'lti', icon: 'link', tone: 'purple', label: 'LTIツール' };
    if (/自習/.test(normalizedType)) return { key: 'selfstudy', icon: 'book', tone: 'neutral', label: '自習' };
    if (/試験|小テスト/.test(normalizedType)) return { key: 'exam', icon: 'badge-check', tone: 'red', label: '試験' };
    if (/レポート|課題|提出/.test(normalizedType)) return { key: 'report', icon: 'clipboard', tone: 'orange', label: /課題/.test(normalizedType) ? '課題' : 'レポート' };
    if (/アンケート/.test(normalizedType)) return { key: 'survey', icon: 'list', tone: 'green', label: 'アンケート' };
    if (/資料/.test(normalizedType)) return { key: 'material', icon: 'file', tone: 'blue', label: '資料' };
    if (/LTI/.test(normalizedTitle)) return { key: 'lti', icon: 'link', tone: 'purple', label: 'LTIツール' };
    if (/自習/.test(normalizedTitle)) return { key: 'selfstudy', icon: 'book', tone: 'neutral', label: '自習' };
    if (/試験|テスト|小テスト/.test(normalizedTitle)) return { key: 'exam', icon: 'badge-check', tone: 'red', label: '試験' };
    if (/レポート|課題|提出/.test(normalizedTitle)) return { key: 'report', icon: 'clipboard', tone: 'orange', label: /課題/.test(normalizedTitle) ? '課題' : 'レポート' };
    if (/アンケート/.test(normalizedTitle)) return { key: 'survey', icon: 'list', tone: 'green', label: 'アンケート' };
    if (/資料|スライド|補足|動画/.test(normalizedTitle)) return { key: 'material', icon: 'file', tone: 'blue', label: '資料' };
    return { key: 'generic', icon: 'note', tone: 'neutral', label: type || '教材' };
  }

  function materialTypeTone(type = '', title = '') {
    return materialTypeToken(type, title).tone;
  }

  function shortenCourseTitle(title) {
    return title.replace(/\(\d{4}-.+?\)/, '').replace(/\[\s*\d+\]/, '').trim();
  }

  function sanitizeCourseItemTitle(text) {
    const normalized = String(text || '').replace(/\s+/g, ' ').replace(/New/g, '').trim();
    if (!normalized) return '';
    if (/^(詳細|履歴|利用回数\s*\d+)$/.test(normalized)) return '';
    return normalized;
  }

  function extractPrimaryTitleText(node) {
    if (!node) return '';
    const clone = node.cloneNode(true);
    clone.querySelectorAll('.cl-contentsList_new, .cl-contentsList_categoryLabel, .cm-contentsList_contentDetailListItem, .cl-contentsList_contentDetailListItem').forEach((element) => element.remove());
    return clone.textContent || '';
  }

  function extractCourseId(input = '') {
    const value = String(input || '');
    const match = value.match(/\/webclass\/course\.php\/([^/?#]+)/) || value.match(/^([^/?#]+)$/);
    return match ? match[1] : '';
  }

  function deriveSyllabusCourseCode(input = '') {
    const courseId = extractCourseId(input);
    if (!/^\d{5,}$/.test(courseId)) return '';
    return courseId.slice(-5);
  }

  function canonicalizeCourseMaterialsHref(href) {
    const courseId = extractCourseId(href);
    if (!courseId) return absoluteUrl(href);
    const source = new URL(absoluteUrl(href), window.location.origin);
    const normalized = new URL(`/webclass/course.php/${courseId}/`, window.location.origin);
    normalized.search = source.search;
    return normalized.toString();
  }

  async function fetchCourseTimeline(courseId = '') {
    if (!courseId) return { items: [], error: false };
    try {
      const response = await fetch(absoluteUrl(`/webclass/course.php/${courseId}/api/timeline/messages?head=1&filter=false`), {
        credentials: 'include'
      });
      const text = await response.text();
      if (/window\.top\.location\.href="\/webclass\/login\.php"/.test(text)) {
        return { items: [], error: true };
      }
      const data = JSON.parse(text);
      const records = Array.isArray(data?.records) ? data.records : [];
      return {
        items: records.slice(0, 8).map((record) => mapTimelineRecord(record, courseId)).filter((item) => item.title),
        error: false
      };
    } catch (error) {
      console.warn('[KU Redesign] timeline fetch failed', courseId, error);
      return { items: [], error: true };
    }
  }

  function mapTimelineRecord(record, courseId) {
    const linkedContents = Array.isArray(record?.message_info?.contents)
      ? record.message_info.contents.filter((content) => content && content.type && content.type !== 'string' && content.type !== 'deleted')
      : [];
    const primaryContent = linkedContents[0] || null;
    const contentTitle = primaryContent?.text || sanitizeCourseItemTitle(record?.message_info?.text || record?.message || '');
    const contentType = mapTimelineContentType(primaryContent?.type || '');
    return {
      title: contentTitle || record?.realname || 'タイムライン',
      subtitle: primaryContent ? (contentType || '教材更新') : (record?.realname || '投稿'),
      label: primaryContent ? (contentType || '更新') : '投稿',
      recency: formatTimelineTimestamp(record?.datetime),
      href: primaryContent ? buildTimelineContentHref(primaryContent, courseId) : ''
    };
  }

  function mapTimelineContentType(type = '') {
    const normalized = String(type || '').trim();
    if (/test|examine/.test(normalized)) return '試験';
    if (/report/.test(normalized)) return '課題';
    if (/enquete|clicker|anonymous_enquete/.test(normalized)) return 'アンケート';
    if (/selfstudy/.test(normalized)) return '自習';
    if (/text|scenario|wiki|scorm|bbs|qanda/.test(normalized)) return '資料';
    if (/chat/.test(normalized)) return 'チャット';
    if (/epcontainer/.test(normalized)) return 'LTIツール';
    return '';
  }

  function buildTimelineContentHref(content, courseId) {
    const contentId = content?.id ? encodeURIComponent(content.id) : '';
    if (!contentId || !courseId) return '';
    const type = String(content.type || '');
    if (/epcontainer/.test(type)) return absoluteUrl(`/webclass/eportfolio.php/containers/view/${contentId}/`);
    if (/scenario|bbs|wiki|scorm|selfstudy|examine|qanda|anonymous_enquete|enquete|test|clicker|chat|report|text/.test(type)) {
      return absoluteUrl(`/webclass/course.php/${encodeURIComponent(courseId)}/contents/${contentId}/exec`);
    }
    return '';
  }

  function formatTimelineTimestamp(timestamp) {
    const value = Number(timestamp || 0);
    if (!value) return '—';
    return formatDate(new Date(value * 1000));
  }

  function parseUpcomingFromAnnouncements(items, scheduleEntries, year = '') {
    const currentYear = Number(year) || new Date().getFullYear();
    return (items || []).map((item) => {
      const matchedCourse = scheduleEntries.find((entry) => {
        const shortTitle = shortenCourseTitle(entry.title);
        return shortTitle && ((item.source || '').includes(shortTitle) || item.title.includes(shortTitle));
      });
      if (!matchedCourse) return null;
      const dueDate = parseAnnouncementDueDate(item.title, currentYear);
      if (!dueDate) return null;
      return {
        title: item.title,
        type: inferMaterialType(item.title) || '課題',
        availability: '',
        dueDate,
        href: item.href,
        detailHref: item.href,
        historyHref: '',
        courseHref: matchedCourse.href,
        courseTitle: shortenCourseTitle(matchedCourse.title),
        usageText: '',
        usageCount: 0,
        hasUsage: false
      };
    }).filter(Boolean);
  }

  function parseAnnouncementDueDate(title, year) {
    const compact = String(title || '').replace(/\s+/g, ' ').trim();
    const match = compact.match(/(\d{1,2})\/(\d{1,2})\s*(\d{1,2}):?(\d{2})?\s*[-–〜~]\s*(\d{1,2}):?(\d{2})/);
    if (!match) return null;
    const [, month, day, startHour, startMinute = '00', endHour, endMinute] = match;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(endHour), Number(endMinute));
  }

  function normalizeSyllabusQuery(title = '') {
    return shortenCourseTitle(String(title || '')).replace(/^»\s*/, '').replace(/\s+/g, ' ').trim();
  }

  function buildSyllabusFallbackHref(year = '') {
    const url = new URL('https://syllabus3.jm.kansai-u.ac.jp/syllabus/search/keyword/KeywordSearchTop.html');
    if (year) url.searchParams.set('selectedNendo', year);
    return url.toString();
  }

  function renderSyllabusChip({ title = '', href = '', year = '' } = {}) {
    const query = normalizeSyllabusQuery(title);
    if (!query) return '';
    return `<a class="ku-chip blue ku-chip-link ku-syllabus-chip" href="${escapeAttr(buildSyllabusFallbackHref(year))}" data-syllabus-title="${escapeAttr(query)}" data-syllabus-href="${escapeAttr(href || '')}" data-syllabus-year="${escapeAttr(year || '')}" title="シラバスを開く" aria-label="${escapeAttr(`${query} のシラバスを開く`)}">シ</a>`;
  }

  async function handleSyllabusNavigation(anchor) {
    if (anchor.dataset.loading === 'true') return;
    anchor.dataset.loading = 'true';
    const originalText = anchor.textContent;
    anchor.textContent = '…';
    try {
      const payload = {
        title: anchor.dataset.syllabusTitle || '',
        courseHref: anchor.dataset.syllabusHref || '',
        year: anchor.dataset.syllabusYear || ''
      };
      const resolved = await resolveSyllabusUrl(payload);
      if (resolved) {
        window.location.href = resolved;
      } else {
        await submitSyllabusSearchNavigation(payload);
      }
    } catch (error) {
      console.warn('[KU Redesign] syllabus lookup failed', error);
      window.location.href = anchor.href;
    } finally {
      anchor.dataset.loading = 'false';
      anchor.textContent = originalText;
    }
  }

  async function resolveSyllabusUrl({ title = '', courseHref = '', year = '' } = {}) {
    const direct = await resolveSyllabusFromCourseInfo(courseHref);
    if (direct) return direct;
    return '';
  }

  async function resolveSyllabusFromCourseInfo(courseHref = '') {
    const courseId = extractCourseId(courseHref);
    if (!courseId) return '';
    try {
      const infoDoc = await loadSupplementalDocument(absoluteUrl(`/webclass/course.php/${courseId}/info`));
      const syllabusLink = Array.from(infoDoc.querySelectorAll('a[href]')).find((link) => /シラバス/i.test(link.textContent || '') || /syllabus/i.test(link.getAttribute('href') || ''));
      return syllabusLink ? absoluteUrl(syllabusLink.getAttribute('href') || '') : '';
    } catch (error) {
      console.warn('[KU Redesign] course info syllabus lookup failed', courseHref, error);
      return '';
    }
  }

  async function resolveCourseInstructor(courseHref = '') {
    const courseId = extractCourseId(courseHref);
    if (!courseId) return '';
    try {
      const infoDoc = await loadSupplementalDocument(absoluteUrl(`/webclass/course.php/${courseId}/info`));
      const instructorLink = Array.from(infoDoc.querySelectorAll('a[href*="msg_editor.php?username="]')).find((link) => sanitizeCourseItemTitle(link.textContent || ''));
      return instructorLink?.textContent.replace(/\s+/g, ' ').trim() || '';
    } catch (error) {
      console.warn('[KU Redesign] course instructor lookup failed', courseHref, error);
      return '';
    }
  }

  async function submitSyllabusSearchNavigation({ title = '', courseHref = '', year = '' } = {}) {
    const query = normalizeSyllabusQuery(title);
    if (!query) {
      window.location.href = buildSyllabusFallbackHref(year || '');
      return;
    }
    const resolvedYear = year || state.currentView?.filters?.year || '';
    const instructor = await resolveCourseInstructor(courseHref);
    rememberPendingSyllabusNavigation({
      title: query,
      year: resolvedYear,
      instructor,
      courseCode: deriveSyllabusCourseCode(courseHref)
    });
    submitSyllabusSearchForm({ query, year: resolvedYear });
  }

  function rememberPendingSyllabusNavigation(payload) {
    try {
      window.name = `__KU_SYLLABUS_AUTO__${JSON.stringify(payload)}`;
    } catch (error) {
      console.warn('[KU Redesign] failed to store syllabus auto payload', error);
    }
  }

  function readPendingSyllabusNavigation() {
    const raw = String(window.name || '');
    if (!raw.startsWith('__KU_SYLLABUS_AUTO__')) return null;
    try {
      return JSON.parse(raw.slice('__KU_SYLLABUS_AUTO__'.length));
    } catch (error) {
      return null;
    }
  }

  function clearPendingSyllabusNavigation() {
    if (String(window.name || '').startsWith('__KU_SYLLABUS_AUTO__')) {
      window.name = '';
    }
  }

  function submitSyllabusSearchForm({ query = '', year = '' } = {}) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = 'https://syllabus3.jm.kansai-u.ac.jp/syllabus/Controller';
    form.style.display = 'none';
    const fields = {
      query,
      gaiyo: '0',
      tantousya: '0',
      kamoku: '1',
      biko: '0',
      daigaku_flg: '0',
      actionClass: 'syllabus.search.KeySearchUp',
      hidSelIdx: '',
      hideSelectNendo: year,
      hideNendo: year,
      hideSelectJyugyohouhou: '',
      G_USERKBN: 'IPPAN',
      G_USERID: '999999',
      G_USERKBNCD: 'I',
      tileNendo: year,
      Nendo: year
    };
    Object.entries(fields).forEach(([name, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value || '';
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  }

  function initSyllabusAssist() {
    const run = () => {
      document.documentElement.dataset.kuSyllabusAssist = 'booted';
      const pending = readPendingSyllabusNavigation();
      if (!pending) {
        document.documentElement.dataset.kuSyllabusAssist = 'no-pending';
        return;
      }
      if (/DetailKeySearchSt/.test(window.location.href)) {
        clearPendingSyllabusNavigation();
        document.documentElement.dataset.kuSyllabusAssist = 'detail';
        return;
      }
      const candidates = parseSyllabusResultCandidates(document);
      document.documentElement.dataset.kuSyllabusCandidateCount = String(candidates.length);
      if (!candidates.length) {
        document.documentElement.dataset.kuSyllabusAssist = 'no-candidates';
        return;
      }
      document.documentElement.dataset.kuSyllabusAssist = 'resolving';
      autoResolveSyllabusResult(pending, candidates).catch((error) => console.warn('[KU Redesign] syllabus result auto-resolve failed', error));
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
      run();
    }
  }

  async function autoResolveSyllabusResult(pending, candidates) {
    const normalizedTitle = normalizeSyllabusQuery(pending.title || '');
    const normalizedInstructor = normalizeSyllabusQuery(pending.instructor || '');
    const exactMatches = candidates.filter((candidate) => candidate.normalizedTitle === normalizedTitle);
    if (exactMatches.length === 1) {
      document.documentElement.dataset.kuSyllabusAssist = 'redirect-exact';
      clearPendingSyllabusNavigation();
      window.location.replace(buildSyllabusDetailUrl(exactMatches[0], pending.title, pending.year));
      return;
    }
    if (normalizedInstructor) {
      const instructorMatches = exactMatches.filter((candidate) => candidate.normalizedInstructor === normalizedInstructor);
      const instructorResolved = await resolveSyllabusCandidateByCourseCode(instructorMatches, pending);
      if (instructorResolved) {
        document.documentElement.dataset.kuSyllabusAssist = 'redirect-instructor-code';
        clearPendingSyllabusNavigation();
        window.location.replace(instructorResolved);
        return;
      }
    }
    const exactResolved = await resolveSyllabusCandidateByCourseCode(exactMatches, pending);
    if (exactResolved) {
      document.documentElement.dataset.kuSyllabusAssist = 'redirect-course-code';
      clearPendingSyllabusNavigation();
      window.location.replace(exactResolved);
      return;
    }
    document.documentElement.dataset.kuSyllabusAssist = 'unresolved';
  }

  function parseSyllabusResultCandidates(doc) {
    const candidates = [];
    const seen = new Set();
    doc.querySelectorAll('a[onclick*=\"linkSetGoSt\"], a[onkeydown*=\"linkSetGoSt\"]').forEach((anchor) => {
      const source = anchor.getAttribute('onclick') || anchor.getAttribute('onkeydown') || '';
      const match = source.match(/linkSetGoSt\('([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']*)'\)/);
      if (!match) return;
      const [, year, id, query] = match;
      const row = anchor.closest('tr');
      const cells = Array.from(row?.querySelectorAll('td') || []).map((cell) => cell.textContent.replace(/\s+/g, ' ').trim());
      const key = `${year}:${id}`;
      if (seen.has(key)) return;
      seen.add(key);
      const title = anchor.textContent.replace(/\s+/g, ' ').trim();
      candidates.push({
        year,
        id,
        query,
        title,
        faculty: cells[0] || '',
        instructor: cells[2] || '',
        normalizedTitle: normalizeSyllabusQuery(title),
        normalizedInstructor: normalizeSyllabusQuery(cells[2] || '')
      });
    });
    return candidates;
  }

  async function resolveSyllabusCandidateByCourseCode(candidates, pending) {
    const courseCode = String(pending.courseCode || '').trim();
    if (!courseCode || candidates.length < 2) return '';
    for (const candidate of candidates) {
      const detailUrl = buildSyllabusDetailUrl(candidate, pending.title, pending.year);
      const detailCode = await loadSyllabusCourseCodeViaFrame(detailUrl);
      if (detailCode === courseCode) {
        return detailUrl;
      }
    }
    return '';
  }

  async function loadSyllabusCourseCodeViaFrame(detailUrl) {
    return new Promise((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.onload = () => {
        try {
          const text = iframe.contentDocument?.body?.textContent || '';
          resolve(extractSyllabusCourseCodeFromText(text));
        } catch (error) {
          resolve('');
        } finally {
          iframe.remove();
        }
      };
      iframe.src = detailUrl;
      document.body.appendChild(iframe);
    });
  }

  function buildSyllabusDetailUrl(candidate, query = '', year = '') {
    return `https://syllabus3.jm.kansai-u.ac.jp/syllabus/Controller?UJikanwari_cd=${encodeURIComponent(candidate.id)}&actionClass=syllabus.search.DetailKeySearchSt&nendo=${encodeURIComponent(candidate.year || year || '')}&queryString=${encodeURIComponent(query || candidate.query || candidate.title || '')}&st=key`;
  }

  function extractSyllabusCourseCodeFromText(html = '') {
    const text = String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const match = text.match(/Course Code\s+([0-9A-Z]{4,})/i)
      || text.match(/時間割コード\s+Course Code\s+([0-9A-Z]{4,})/i)
      || text.match(/時間割コード\s+([0-9A-Z]{4,})/i);
    return match ? String(match[1] || '').trim() : '';
  }


  function truncate(text, length) {
    if (!text) return '';
    return text.length > length ? `${text.slice(0, length)}…` : text;
  }

  function absoluteUrl(path) {
    if (!path) return '';
    if (/^https?:/i.test(path)) return path;
    if (path.startsWith('javascript:')) return path;
    return new URL(path, window.location.origin).toString();
  }

  function normalizeNotificationsUrl(path) {
    if (!path) return '';
    const url = new URL(absoluteUrl(path));
    if (url.pathname.includes('/webclass/information.php/mbl')) {
      url.pathname = '/webclass/information.php/';
    }
    if (url.pathname === '/webclass/information.php') {
      url.pathname = '/webclass/information.php/';
    }
    return url.toString();
  }

  function normalizeManualUrl(path) {
    if (!path) return '';
    const url = new URL(absoluteUrl(path));
    if (url.pathname === '/webclass/user.php/manual') {
      url.searchParams.delete('popup');
    }
    return url.toString();
  }

  function uniqueBy(items, keyFn) {
    const seen = new Set();
    const output = [];
    items.forEach((item) => {
      const key = keyFn(item);
      if (!key || seen.has(key)) return;
      seen.add(key);
      output.push(item);
    });
    return output;
  }

  function slugify(value) {
    return value.toLowerCase().replace(/[^\w\u3040-\u30ff\u4e00-\u9faf]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
  }

  function pad(number) { return String(number).padStart(2, '0'); }
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function escapeAttr(value) { return escapeHtml(value); }

  function renderUnsupported() {
    return '<div class="ku-card ku-empty">このページはまだリデザイン対象外です。</div>';
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
      search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
      sliders: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h7M14 6h6M4 12h11M18 12h2M4 18h3M10 18h10"/><circle cx="12" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="18" r="2"/></svg>',
      send: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/></svg>',
      trash: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/></svg>'
    };
    return map[name] || '';
  }
})();
