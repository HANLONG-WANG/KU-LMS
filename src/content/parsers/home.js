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
    const table = doc.querySelector('#schedule-table');
    const entries = [];
    if (!table) return { entries, weekdays: DAY_NAMES };
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    rows.forEach((row, rowIndex) => {
      const period = `${rowIndex + 1}限`;
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
          sortIndex: entries.length,
          weekday: DAY_NAMES[cellIndex],
          title: fullText.replace(dueFlag, '').replace(/^»\s*/, '').trim(),
          href: rawHref,
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
