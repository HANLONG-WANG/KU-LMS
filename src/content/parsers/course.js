/* src/content/parsers/course.js */

function parseOtherCourses(doc) {
    const groups = [];
    const titles = Array.from(doc.querySelectorAll('.courseTree-levelTitle'));
    titles.forEach((titleEl) => {
      const group = { title: titleEl.textContent.trim(), items: [] };
      const list = titleEl.nextElementSibling?.querySelector('.courseList') || titleEl.parentElement?.querySelector('.courseList');
      if (list) {
        const courseBoxes = Array.from(list.querySelectorAll('.course-data-box-normal'));
        const parseTargets = courseBoxes.length ? courseBoxes : Array.from(list.querySelectorAll('.course-title'));
        parseTargets.forEach((courseBox) => {
          const titleBox = courseBox.querySelector('.course-title') || courseBox;
          const anchor = titleBox.querySelector('a[href]');
          if (!anchor) return;
          const meta = titleBox.querySelector('.course-info')?.textContent.replace(/\s+/g, ' ').trim() || '';
          const hasNativeDueReminder = !!courseBox.querySelector('.course-contents-info');
          const note = courseBox.querySelector('.course-contents-info')?.textContent.replace(/\s+/g, ' ').trim() || '';
          const rawHref = absoluteUrl(anchor.getAttribute('href'));
          group.items.push({ title: anchor.textContent.replace(/^»\s*/, '').trim(), href: rawHref, supplementalHref: rawHref, meta, note, hasNativeDueReminder });
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

function parseUpcomingFromCourse(doc, courseHref = '', { scheduleEntry = null } = {}) {
    const courseTitle = shortenCourseTitle(scheduleEntry?.title || parseCourseMeta(doc).title);
    const normalizedCourseHref = canonicalizeCourseMaterialsHref(courseHref);
    const now = Date.now();
    const items = [];
    const groups = Array.from(doc.querySelectorAll('.cl-contentsList_folder'));
    const sections = groups.length
      ? groups.map((folder) => ({
          sectionTitle: folder.querySelector('.panel-title')?.textContent.replace(/\s+/g, ' ').trim() || '',
          items: Array.from(folder.querySelectorAll('.cl-contentsList_listGroupItem'))
        }))
      : [{ sectionTitle: '', items: Array.from(doc.querySelectorAll('.cl-contentsList_listGroupItem')) }];
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
          usageKnown: true,
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
