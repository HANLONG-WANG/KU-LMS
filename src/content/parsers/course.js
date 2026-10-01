/* src/content/parsers/course.js */

function parseOtherCourses(doc) {
    const groups = [];
    const seen = new Set();
    nativeQuerySelectorAll(doc, '.courseList').forEach((list) => {
      const previous = list.previousElementSibling;
      const heading = previous?.matches?.('.courseTree-levelTitle') ? previous : list.parentElement?.querySelector?.('.courseTree-levelTitle');
      const group = { title: cleanText(heading?.textContent || ''), items: [] };
      nativeQuerySelectorAll(list, '.course-title').forEach((titleBox) => {
        const anchor = titleBox.querySelector('a[href*="/course.php/"]');
        if (!anchor) return;
        const rawHref = absoluteUrl(anchor.getAttribute('href') || '');
        const key = buildCourseCacheKey(rawHref) || rawHref;
        if (!key || seen.has(key)) return;
        seen.add(key);
        const courseBox = titleBox.closest?.('.course-data-box-normal') || titleBox.parentElement || titleBox;
        const noteNode = courseBox.querySelector?.('.course-contents-info');
        group.items.push({ title: cleanText(anchor.textContent || '').replace(/^»\s*/, ''), href: rawHref, supplementalHref: rawHref,
          meta: cleanText(titleBox.querySelector('.course-info')?.textContent || ''), note: cleanText(noteNode?.textContent || ''), hasNativeDueReminder: !!noteNode });
      });
      if (group.items.length) groups.push(group);
    });
    return groups;
  }

function parseCourseMeta(doc) {
    const anchors = nativeQuerySelectorAll(doc, 'a[href]');
    const courseId = extractCourseId(window.location.pathname);
    const brand = anchors.find((a) => /\(\d{4}-/.test(a.textContent || '') && (!courseId || extractCourseId(a.getAttribute('href') || '') === courseId));
    const title = cleanText(brand?.textContent || (doc.title || '').replace(' - 関大LMS', ''));
    const meta = deriveCourseMetaFromTitle(title);
    const linkByText = (pattern, fallback = '') => absoluteUrl(anchors.find((a) => pattern.test(cleanText(a.textContent || '')))?.getAttribute('href') || fallback);
    const materialAnchor = anchors.find((a) => extractCourseId(a.getAttribute('href') || '') === courseId && /#contents(?:$|&)|\/course\.php\/[^/?#]+\/?(?:\?[^#]*)?$/.test(a.getAttribute('href') || ''));
    const returnAnchor = anchors.find((a) => /\/course\.php\/[^/?#]+\/logout(?:[/?#]|$)/.test(a.getAttribute('href') || ''));
    const links = {
      materials: canonicalizeCourseMaterialsHref(materialAnchor?.getAttribute('href') || window.location.pathname),
      myreports: linkByText(/マイレポート/), scores: linkByText(/^集計$/), testResults: linkByText(/^テスト結果$/),
      attendance: linkByText(/出席/), manual: linkByText(/マニュアル/),
      info: linkByText(/開講情報/, courseId ? `/webclass/course.php/${courseId}/info` : ''),
      returnToCourses: absoluteUrl(returnAnchor?.getAttribute('href') || '')
    };
    return { title, meta, courseId, links };
  }

function deriveCourseMetaFromTitle(title) {
    const match = String(title || '').match(/\((\d{4})-([^-]+)-([^-]*)-([^-]*)-([^)]*)\)/);
    if (!match) return { year: '', semester: '', weekdayPeriod: '', courseCode: '', room: '' };
    return { year: match[1], semester: match[2], weekdayPeriod: [match[3], match[4]].filter(Boolean).join(' '), courseCode: match[5] || '', room: '' };
  }

function parseCourseDocument(doc) {
    const course = parseCourseMeta(doc);
    const root = nativeQuerySelector(doc, 'course-learning-index') || doc;
    const sections = [];
    const covered = new Set();
    nativeQuerySelectorAll(root, '.cl-contentsList_folder').forEach((folder) => {
      const nodes = nativeQuerySelectorAll(folder, '.cl-contentsList_listGroupItem').filter((item) => !covered.has(item));
      nodes.forEach((item) => covered.add(item));
      if (nodes.length) sections.push({ title: cleanText(folder.querySelector('.panel-title')?.textContent || '') || 'General', items: nodes.map(extractCourseItem) });
    });
    const independent = nativeQuerySelectorAll(root, '.cl-contentsList_listGroupItem').filter((item) => !covered.has(item));
    if (independent.length) sections.push({ title: 'General', items: independent.map(extractCourseItem) });
    sections.forEach((section, index) => { section.id = `course-${course.courseId || 'contents'}-section-${index + 1}-${slugify(section.title)}`; });
    const anchors = sections.map((section) => ({ title: section.title, target: section.id }));
    return { course, sections, timeline: { items: [], error: false }, anchors };
  }

function parseUpcomingFromCourse(doc, courseHref = '', { scheduleEntry = null } = {}) {
    const courseTitle = shortenCourseTitle(scheduleEntry?.title || parseCourseMeta(doc).title);
    const normalizedCourseHref = canonicalizeCourseMaterialsHref(courseHref);
    const now = Date.now();
    const items = [];
    const groups = nativeQuerySelectorAll(doc, '.cl-contentsList_folder');
    const sections = groups.length
      ? groups.map((folder) => ({
          sectionTitle: folder.querySelector('.panel-title')?.textContent.replace(/\s+/g, ' ').trim() || '',
          items: nativeQuerySelectorAll(folder, '.cl-contentsList_listGroupItem')
        }))
      : [{ sectionTitle: '', items: nativeQuerySelectorAll(doc, '.cl-contentsList_listGroupItem') }];
    if (groups.length) {
      const independent = nativeQuerySelectorAll(doc, '.cl-contentsList_listGroupItem').filter((item) => !item.closest?.('.cl-contentsList_folder'));
      if (independent.length) sections.push({ sectionTitle: '', items: independent });
    }
    sections.forEach(({ sectionTitle, items: sectionItems }) => {
      if (/締め切り後提出/.test(sectionTitle)) return;
      sectionItems.forEach((item) => {
        const courseItem = extractCourseItem(item);
        if (!courseItem.title || !courseItem.availability) return;
        if (/締め切り後提出/.test(courseItem.title)) return;
        const dueDate = parseAvailabilityEnd(courseItem.availability);
        if (!dueDate || dueDate.getTime() < now) return;
        items.push({
          title: courseItem.title,
          type: courseItem.type,
          availability: courseItem.availability,
          dueDate,
          href: courseItem.detailHref || normalizedCourseHref || courseItem.href,
          detailHref: courseItem.detailHref,
          historyHref: courseItem.historyHref,
          courseHref: normalizedCourseHref || canonicalizeCourseMaterialsHref(courseItem.href || courseItem.detailHref),
          courseTitle,
          courseNote: scheduleEntry?.note || '',
          hasCourseDueFlag: isDueFlagNote(scheduleEntry?.note),
          usageText: courseItem.usage,
          usageCount: courseItem.usageCount,
          hasUsage: courseItem.usageCount > 0,
          usageKnown: courseItem.usageKnown,
          scheduleIndex: scheduleEntry?.sortIndex ?? Number.MAX_SAFE_INTEGER,
          isCourseAlert: false
        });
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
    const titleLaunchHref = absoluteUrl(primaryTitleLink?.getAttribute('href') || '');
    const detailHref = absoluteUrl(detailLinks.find((link) => /\/contents\//.test(link.getAttribute('href') || '') || /詳細/.test(link.textContent || ''))?.getAttribute('href') || '');
    const historyHref = absoluteUrl(allLinks.find((link) => /\/history(?:[/?]|$)/.test(link.getAttribute('href') || ''))?.getAttribute('href') || '');
    const historyLabel = allLinks.find((link) => /利用回数|履歴/.test(link.textContent || ''))?.textContent.replace(/\s+/g, ' ').trim() || '';
    const usage = /利用回数/.test(historyLabel) ? historyLabel : '';
    const usageMatch = usage.match(/\d+/);
    const usageKnown = !!usageMatch;
    const usageCount = usageKnown ? Number(usageMatch[0]) : null;
    const categoryType = item.querySelector('.cl-contentsList_categoryLabel')?.textContent.replace(/\s+/g, ' ').trim() || '';
    const inferredType = inferMaterialType(rawTitle);
    const type = /試験/.test(inferredType) ? inferredType : (categoryType || inferredType);
    const href = absoluteUrl(detailHref || titleLaunchHref || '');
    return {
      title: rawTitle || '項目',
      isNew: !!item.querySelector('.cl-contentsList_new') || /(^|\s)New(\s|$)/.test(titleSource?.textContent || ''),
      type,
      availability: availabilityData,
      href,
      titleLaunchHref,
      isTitleClickable: !!titleLaunchHref,
      detailHref,
      historyHref,
      historyLabel,
      usage,
      usageCount,
      usageKnown
    };
  }

function parseMyReports(doc) {
    const tables = nativeQuerySelectorAll(doc, 'table.table.table-striped');
    const table = tables.find((candidate) => /課題|レポート|提出/.test(candidate.querySelector('tr')?.textContent || '')) || tables[0];
    if (!table) return { rows: [], columns: [] };
    const allRows = Array.from(table.querySelectorAll('tr'));
    const headerRow = allRows.find((row) => Array.from(row.children).some((cell) => cell.tagName === 'TH')) || allRows[0];
    const keys = [
      ['task', /課題|教材/], ['qno', /Q\.?\s*No/i], ['preview', /本文|プレビュー|レポート/],
      ['attachments', /添付|ファイル/], ['comments', /コメント/], ['date', /提出日|日時/],
      ['grade', /成績|評価/], ['score', /得点|配点/]
    ];
    const columns = Array.from(headerRow?.children || []).map((cell, index) => {
      const label = cleanText(cell.textContent || '');
      const key = keys.find(([, pattern]) => pattern.test(label))?.[0] || `column-${index}`;
      return { key, label, optional: ['preview', 'attachments', 'comments', 'score'].includes(key) };
    });
    const rows = allRows.filter((row) => row !== headerRow && !row.closest?.('thead')).map((tr) => {
      const cells = Array.from(tr.children).map((cell) => ({
        text: String(cell.textContent || '').trim(),
        links: Array.from(cell.querySelectorAll('a[href]')).map((anchor) => ({ label: cleanText(anchor.textContent || ''), href: absoluteUrl(anchor.getAttribute('href') || '') }))
      }));
      if (!cells.length || cells.length === 1 && Number(tr.children[0]?.getAttribute?.('colspan') || 1) > 1) return null;
      const row = { cells };
      columns.forEach((column, index) => {
        const cell = cells[index] || { text: '', links: [] };
        const key = column.key;
        row[key] = cell.text;
        if (key === 'task') { row.taskHref = cell.links[0]?.href || ''; }
        if (key === 'attachments') {
          row.attachments = cell.links;
          row.attachmentName = cell.text || '-';
          row.attachmentHref = cell.links[0]?.href || '';
        }
        if (key === 'score') row.scoreHref = cell.links[0]?.href || '';
      });
      return cells.some((cell) => cell.text || cell.links.length) ? row : null;
    }).filter(Boolean);
    return { rows, columns };
  }

function parseCourseScores(doc) {
    const form = doc.querySelector('form[action*="/scores"]') || Array.from(doc.forms || []).find((candidate) => /\/scores(?:[?#]|$)/.test(candidate.action || ''));
    const radios = Array.from(form?.querySelectorAll('input[type="radio"][name="showdata"]') || []);
    const hiddenFields = Array.from(form?.querySelectorAll('input[type="hidden"][name]') || []).map((input) => ({
      name: input.name || '',
      value: input.value || ''
    })).filter((field) => field.name);
    const submitControl = Array.from(form?.querySelectorAll('input[type="submit"], button[type="submit"]') || [])
      .map((control) => ({
        name: control.getAttribute('name') || '',
        value: control.getAttribute('value') || cleanText(control.textContent || '') || '再表示'
      }))
      .find((control) => control.value) || { name: 'search', value: '再表示' };
    const options = radios.map((radio) => ({
      value: radio.value || '',
      label: cleanText(radio.parentElement?.textContent || radio.closest('label')?.textContent || ''),
      checked: !!radio.checked
    })).filter((option) => option.label);
    const scoreOptions = options.filter((option) => /^score/.test(option.value));
    const progressOptions = options.filter((option) => !/^score/.test(option.value));
    const dateRangeStart = form?.querySelector('input[name="summaryOption[dateRangeStart]"]')?.value || '';
    const dateRangeEnd = form?.querySelector('input[name="summaryOption[dateRangeEnd]"]')?.value || '';
    const headings = Array.from(doc.querySelectorAll('main h3, main h4, main h5, h3.page-header, .page-header'))
      .map((node) => cleanText(node.textContent || ''))
      .filter(Boolean);
    const summaryHeading = Array.from(doc.querySelectorAll('main h3, h3.page-header'))
      .map((node) => cleanText(node.textContent || ''))
      .find((text) => text !== '集計' && /期間|得点|回数|時間/.test(text)) || '';
    const periodLabel = cleanText(summaryHeading.match(/期間\s*([^)]+)/)?.[1] || '');
    const table = nativeQuerySelector(doc, '#PersonalScoreSheet') || nativeQuerySelector(doc, 'table.table.table-striped.table-bordered');
    const headers = Array.from(table?.querySelectorAll('thead th') || []).map((node) => cleanText(node.textContent || '')).filter(Boolean);
    const groups = [];
    let currentGroup = null;
    Array.from(table?.querySelectorAll('tbody tr') || []).forEach((row) => {
      const cells = Array.from(row.children);
      if (!cells.length) return;
      if (row.classList.contains('unittitle')) {
        currentGroup = { title: cleanText(row.textContent || ''), rows: [], total: null };
        groups.push(currentGroup);
        return;
      }
      const entry = {
        cells: cells.map((cell) => ({ text: cleanText(cell.textContent || ''), href: absoluteUrl(cell.querySelector('a[href]')?.getAttribute('href') || '') })),
        title: cleanText(cells[0]?.textContent || ''),
        href: absoluteUrl(cells[0]?.querySelector('a[href]')?.getAttribute('href') || ''),
        valueText: cleanText(cells[1]?.textContent || ''),
        valueHref: absoluteUrl(cells[1]?.querySelector('a[href]')?.getAttribute('href') || ''),
        averageText: cleanText(cells[2]?.textContent || '')
      };
      if (!currentGroup) {
        currentGroup = { title: '集計', rows: [], total: null };
        groups.push(currentGroup);
      }
      if (row.classList.contains('foot')) {
        currentGroup.total = entry;
        return;
      }
      if (entry.title) currentGroup.rows.push(entry);
    });
    const notes = Array.from(doc.querySelectorAll('main *'))
      .map((node) => cleanText(node.textContent || ''))
      .filter((text, index, all) => text && /^¤/.test(text) && all.indexOf(text) === index);
    const selectedOption = options.find((option) => option.checked) || null;
    const rowCount = groups.reduce((total, group) => total + group.rows.length, 0);
    return {
      title: headings[0] || '集計',
      summaryHeading,
      metricLabel: selectedOption?.label || cleanText(summaryHeading.replace(/\(.*$/, '')) || '',
      periodLabel,
      formAction: form?.action || window.location.href,
      formMethod: String(form?.method || 'post').toLowerCase(),
      hiddenFields,
      submitControl,
      scoreOptions,
      progressOptions,
      selectedOption,
      dateRangeStart,
      dateRangeEnd,
      headers,
      groups,
      notes,
      sectionCount: groups.length,
      rowCount
    };
  }
