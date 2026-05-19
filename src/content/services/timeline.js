/* src/content/services/timeline.js */

async function fetchCourseTimeline(courseId = '') {
    if (!courseId) return { items: [], error: false };
    try {
      const response = await fetch(absoluteUrl(`/webclass/course.php/${courseId}/api/timeline/messages?head=1&filter=false`), {
        credentials: 'include',
        signal: getPageRequestSignal()
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
      if (isAbortError(error)) {
        return { items: [], error: false };
      }
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
