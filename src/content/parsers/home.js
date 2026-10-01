/* src/content/parsers/home.js */

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
    const table = nativeQuerySelector(doc, '#schedule-table');
    const entries = [];
    if (!table) return { entries, weekdays: DAY_NAMES };
    let fallbackPeriod = 0;
    nativeQuerySelectorAll(table, 'tbody tr').forEach((row) => {
      const cells = Array.from(row.children || []);
      const periodText = cleanText(cells[0]?.textContent || '');
      if (!cells.length || cells.every((cell) => cell.tagName === 'TH') || !/\d|限/.test(periodText)) return;
      fallbackPeriod += 1;
      const period = `${periodText.match(/\d+/)?.[0] || fallbackPeriod}限`;
      let weekdayIndex = 0;
      cells.slice(1).forEach((cell) => {
        const anchors = nativeQuerySelectorAll(cell, 'a[href*="/course.php/"]');
        anchors.forEach((anchor) => {
          const box = anchor.closest?.('.course-data-box-normal') || anchor.parentElement || cell;
          const reminder = box.querySelector?.('.course-contents-info') || (anchors.length === 1 ? cell.querySelector?.('.course-contents-info') : null);
          const dueFlag = cleanText(reminder?.textContent || '');
          const href = absoluteUrl(anchor.getAttribute('href') || '');
          entries.push({ period, weekdayIndex, sortIndex: entries.length, weekday: DAY_NAMES[weekdayIndex],
            title: cleanText(anchor.textContent || '').replace(dueFlag, '').replace(/^»\s*/, '').trim(),
            href, supplementalHref: href, note: dueFlag });
        });
        weekdayIndex += Math.max(1, Number(cell.getAttribute?.('colspan')) || 1);
      });
    });
    return { entries, weekdays: DAY_NAMES };
  }

function parseHomeAnnouncements(doc) {
    const rows = Array.from(doc.querySelectorAll('#NewestInformations .info-short-list li, #NewestInformations .info-list.info-short-list li'));
    return uniqueBy(rows.map((row) => {
      if (row.classList.contains('head')) return null;
      const anchor = row.querySelector('.hidden-xs a[href*="information.php/post"], a.title[href*="information.php/post"]');
      if (!anchor) return null;
      const title = anchor.textContent.replace(/\s+/g, ' ').trim();
      const href = normalizeNotificationsUrl(anchor.getAttribute('href'));
      const meta = row.querySelector('.exhibitionInfo, .data')?.textContent.replace(/\s+/g, ' ').trim() || '';
      const important = anchor.classList.contains('mark1');
      return title && href ? { title, href, meta, important } : null;
    }).filter(Boolean), (item) => item.href || item.title).slice(0, 5);
  }

function normalizeHomeAnnouncementItems(items) {
    return (items || []).map((item) => ({
      ...item,
      source: item.source || item.meta || '',
      deadline: item.deadline || '',
      important: typeof item.important === 'boolean' ? item.important : /重要|テスト/.test(item.title || '')
    }));
  }

function mergeAnnouncementSources(homeItems, fetchedItems) {
    return uniqueBy([...(homeItems || []), ...(fetchedItems || [])], (item) => {
      const href = item?.href || '';
      const title = item?.title || '';
      return href || title ? `${href}::${title}` : '';
    });
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
