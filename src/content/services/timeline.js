/* src/content/services/timeline.js */

async function fetchCourseTimeline(courseId = '') {
    if (!courseId) return { items: [], error: false };
    try {
      const { text } = await fetchLmsResource(absoluteUrl(`/webclass/course.php/${encodeURIComponent(courseId)}/api/timeline/messages?head=1&filter=false`));
      const data = JSON.parse(text);
      if (!data || !Array.isArray(data.records) || data.error || data.success === false) {
        throw new Error('Unexpected timeline response');
      }
      return {
        items: data.records.slice(0, 8).map((record) => mapTimelineRecord(record, courseId)).filter((item) => item.title),
        error: false
      };
    } catch (error) {
      if (isAbortError(error)) return { items: [], error: false };
      console.warn('[KU Redesign] timeline fetch failed', courseId, error);
      return { items: [], error: true };
    }
  }

function mapTimelineRecord(record, courseId) {
    const linkedContents = Array.isArray(record?.message_info?.contents)
      ? record.message_info.contents.filter((content) => content && content.type && content.type !== 'string' && content.type !== 'deleted')
      : [];
    const primaryContent = linkedContents[0] || null;
    const plainMessage = String(record?.message || '').replace(/\r\n/g, '\n').trim();
    const fallbackBodyText = plainMessage || normalizeTimelineBodyText(record?.message_info?.text || '');
    const contentTitle = primaryContent?.text || sanitizeCourseItemTitle(fallbackBodyText || '');
    const contentType = mapTimelineContentType(primaryContent?.type || '');
    const attachmentName = String(record?.attache_name || '').trim();
    const attachmentUrl = String(record?.attache_download_url || '').trim();
    let attachmentHref = '';
    if (attachmentName && attachmentUrl) {
      try {
        const url = new URL(absoluteUrl(attachmentUrl));
        if (url.origin === window.location.origin && /^https?:$/.test(url.protocol) && /^\/webclass\/download\.php(?:\/|$)/.test(url.pathname)) {
          attachmentHref = url.href;
        }
      } catch { /* Keep the filename visible when the download URL is invalid. */ }
    }
    return {
      title: contentTitle || attachmentName || record?.realname || 'タイムライン',
      bodyText: primaryContent ? '' : fallbackBodyText,
      subtitle: primaryContent ? (contentType || '教材更新') : (record?.realname || '投稿'),
      label: primaryContent ? (contentType || '更新') : '投稿',
      recency: formatTimelineTimestamp(record?.datetime),
      href: primaryContent ? buildTimelineContentHref(primaryContent, courseId) : '',
      attachment: attachmentName ? { name: attachmentName, href: attachmentHref } : null
    };
  }

function normalizeTimelineBodyText(text = '') {
    return String(text || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(?:p|div|li|ul|ol)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
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
