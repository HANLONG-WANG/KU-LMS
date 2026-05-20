/* src/content/utils/core.js */

function dueSoonReminderText() {
  return '締切が近い課題があります。';
}

function getAvatarInitial(name) {
    const source = (name || '').trim();
    if (!source) return 'U';
    return source.replace(/\s+/g, '').charAt(0).toUpperCase();
  }

function isDueFlagNote(note = '') {
  const normalized = String(note || '').replace(/\s+/g, ' ').trim();
  const canonical = dueSoonReminderText();
  return normalized === canonical || normalized === canonical.replace(/。$/, '');
}

function parseAvailabilityEnd(text) {
    return parseAvailabilityRange(text).end;
  }

function parseAvailabilityRange(text) {
    const normalized = String(text || '')
      .replace(/[～〜‐‑‒–—―]/g, '-')
      .replace(/\u3000/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const matches = Array.from(normalized.matchAll(/(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s*\([^)]*\))?\s*(\d{1,2})?:(\d{2})?/g));
    const first = matches[0];
    const last = matches[matches.length - 1];
    if (!first || !last) return { start: null, end: null };
    const [, startYear, startMonth, startDay, startHour = '00', startMinute = '00'] = first;
    const [, endYear, endMonth, endDay, endHour = '23', endMinute = '59'] = last;
    return {
      start: new Date(Number(startYear), Number(startMonth) - 1, Number(startDay), Number(startHour), Number(startMinute)),
      end: new Date(Number(endYear), Number(endMonth) - 1, Number(endDay), Number(endHour), Number(endMinute))
    };
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

function upcomingPriorityRank(item) {
    if (item?.hasCourseDueFlag) return 0;
    if (item?.hasUsage) return 2;
    return 1;
  }

function compareUpcomingItems(a, b) {
    const rankDiff = upcomingPriorityRank(a) - upcomingPriorityRank(b);
    if (rankDiff !== 0) return rankDiff;
    const aDue = typeof a?.dueDate?.getTime === 'function' ? a.dueDate.getTime() : NaN;
    const bDue = typeof b?.dueDate?.getTime === 'function' ? b.dueDate.getTime() : NaN;
    const aHasDue = Number.isFinite(aDue);
    const bHasDue = Number.isFinite(bDue);
    if (aHasDue !== bHasDue) return aHasDue ? -1 : 1;
    if (aHasDue && bHasDue && aDue !== bDue) return aDue - bDue;
    if (!aHasDue && !bHasDue) {
      const aScheduleIndex = a?.scheduleIndex ?? Number.MAX_SAFE_INTEGER;
      const bScheduleIndex = b?.scheduleIndex ?? Number.MAX_SAFE_INTEGER;
      if (aScheduleIndex !== bScheduleIndex) return aScheduleIndex - bScheduleIndex;
    }
    return a.title.localeCompare(b.title, 'ja');
  }

function buildUpcomingSubtitle(item) {
    const parts = [item.courseTitle];
    if (item.courseNote) parts.push(item.courseNote);
    if (item.usageText) parts.push(item.usageText);
    else if (item.usageKnown === true && !item.hasUsage) parts.push('未利用');
    return parts.filter(Boolean).join(' · ');
  }

function extractPublishDate(text) {
    const match = text.match(/(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2})/);
    return match ? match[1] : text;
  }

function isUpcomingDueSoonUnused(item) {
    const dueDate = item?.dueDate;
    if (!dueDate || Number.isNaN(dueDate.getTime())) return false;
    if (item?.hasUsage) return false;
    const range = parseAvailabilityRange(item?.availability || '');
    const now = Date.now();
    if (!range.start || !range.end) return false;
    if (now < range.start.getTime() || now > range.end.getTime()) return false;
    const remaining = dueDate.getTime() - now;
    return remaining >= 0 && remaining <= 7 * 86400000;
  }

function filterOtherCourses(groups, query) {
    if (!query) return groups;
    const lower = query.toLowerCase();
    return groups.map((group) => ({
      ...group,
      items: group.items.filter((item) => `${item.title} ${item.meta}`.toLowerCase().includes(lower))
    })).filter((group) => group.items.length);
  }

function allSelected(rows, view = state.currentView) {
    const selection = getMessageSelection(view);
    return rows.length > 0 && rows.every((row) => selection.has(row.id));
  }

function getMessageSelectionScope(view = state.currentView) {
    return view?.selectionScope || state.currentRoute?.name || 'messages-inbox';
  }

function getMessageSelection(view = state.currentView) {
    const scope = getMessageSelectionScope(view);
    if (!state.messageSelectionScopes.has(scope)) {
      state.messageSelectionScopes.set(scope, new Set());
    }
    const selection = state.messageSelectionScopes.get(scope);
    state.messageSelection = selection;
    return selection;
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

function buildCourseCacheKey(href = '') {
    const courseId = extractCourseId(href);
    if (!courseId) return '';
    return absoluteUrl(`/webclass/course.php/${courseId}/`);
  }

function canonicalizeCourseMaterialsHref(href) {
    const courseId = extractCourseId(href);
    if (!courseId) return absoluteUrl(href);
    const source = new URL(absoluteUrl(href), window.location.origin);
    const normalized = new URL(`/webclass/course.php/${courseId}/`, window.location.origin);
    normalized.search = source.search;
    return normalized.toString();
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
        courseNote: matchedCourse.note || '',
        hasCourseDueFlag: isDueFlagNote(matchedCourse.note),
        usageText: '',
        usageCount: 0,
        hasUsage: false,
        usageKnown: false,
        scheduleIndex: matchedCourse.sortIndex ?? Number.MAX_SAFE_INTEGER,
        isCourseAlert: false
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

function normalizeSyllabusCourseQuery(title = '') {
    return String(title || '')
      .replace(/^»\s*/, '')
      .replace(/[\u3000\s]+/g, ' ')
      .replace(/[\(（]\d{4}-.+?[\)）]\s*$/g, '')
      .replace(/(?:\s*(?:＜[^＞]{1,8}＞|<[^>]{1,8}>))+\s*$/g, '')
      .replace(/(?:\s*\[[^\]]{1,8}\])+\s*$/g, '')
      .replace(/[\u3000\s]+/g, ' ')
      .trim();
  }

function buildSyllabusFallbackHref(year = '') {
    const url = new URL('https://syllabus3.jm.kansai-u.ac.jp/syllabus/search/keyword/KeywordSearchTop.html');
    if (year) url.searchParams.set('selectedNendo', year);
    return url.toString();
  }

function truncate(text, length) {
    if (!text) return '';
    return text.length > length ? `${text.slice(0, length)}…` : text;
  }

function normalizeMessageSubject(text = '') {
    const normalized = cleanText(text);
    const receiptMatch = normalized.match(/^(レポートを受け取りました)\s*\[.*\]$/);
    if (receiptMatch) return receiptMatch[1];
    return normalized;
  }

function absoluteUrl(path) {
    if (!path) return '';
    if (/^https?:/i.test(path)) return path;
    if (path.startsWith('javascript:')) return path;
    if (/^[^/][^?#]*\.php(?:[?#].*)?$/i.test(path)) {
      return new URL(`/webclass/${path.replace(/^\.?\//, '')}`, window.location.origin).toString();
    }
    return new URL(path, window.location.href || window.location.origin).toString();
  }

function normalizeNotificationsUrl(path) {
    if (!path) return '';
    const url = new URL(absoluteUrl(path));
    if (url.pathname.includes('/webclass/information.php/mbl')) {
      url.pathname = url.pathname.replace('/webclass/information.php/mbl', '/webclass/information.php');
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

function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
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

function loginLanguageLabel(code = '') {
    return ({
      JAPANESE: '日本語',
      ENGLISH: 'English',
      KOREAN: '한국어',
      CHINESE: '简体中文',
      'CHINESE-TW': '正體中文'
    })[String(code || '').toUpperCase()] || '日本語';
  }
