/* src/content/parsers/syllabus.js */

function isSyllabusDetailRoute(locationObj = window.location) {
    try {
      const url = locationObj instanceof URL ? locationObj : new URL(String(locationObj.href || locationObj), window.location.origin);
      return /\/syllabus\//.test(url.pathname)
        && url.searchParams.get('actionClass') === 'syllabus.search.DetailKeySearchSt'
        && !!cleanText(url.searchParams.get('UJikanwari_cd'));
    } catch (error) {
      return false;
    }
  }

function parseSyllabusDetailDocument(doc) {
    const metaRoot = doc.querySelector('.tableblock04');
    const sectionRoot = doc.querySelector('.tableblock05');
    if (!metaRoot || !sectionRoot) return null;

    const metaBlocks = getDirectChildrenByTag(metaRoot, 'DL');
    const titleBlock = metaBlocks[1] || null;
    const titlePayload = parseSyllabusTitleBlock(titleBlock);
    const nestedInfo = parseSyllabusNestedMeta(titleBlock);
    const sections = parseSyllabusSections(sectionRoot);
    const heroMeta = {
      faculty: readSyllabusMetaValue(metaRoot, /学部・研究科/),
      courseCode: readSyllabusMetaValue(metaRoot, /時間割コード/),
      title: titlePayload.title,
      subtitle: titlePayload.subtitle,
      termCredits: nestedInfo.termCredits,
      className: nestedInfo.className,
      instructor: readSyllabusMetaValue(metaRoot, /担任者名/),
      dayPeriod: readSyllabusMetaValue(metaRoot, /曜限/)
    };

    if (!cleanText(heroMeta.courseCode) || !cleanText(heroMeta.title) || !sections.length) {
      return null;
    }

    const summaryItems = [
      heroMeta.faculty ? { label: '学部・研究科', value: heroMeta.faculty } : null,
      heroMeta.courseCode ? { label: '時間割コード', value: heroMeta.courseCode } : null,
      heroMeta.termCredits ? { label: '授業形態/単位', value: heroMeta.termCredits } : null,
      heroMeta.className ? { label: 'クラス', value: heroMeta.className } : null,
      heroMeta.instructor ? { label: '担任者名', value: heroMeta.instructor } : null,
      heroMeta.dayPeriod ? { label: '曜限', value: heroMeta.dayPeriod } : null
    ].filter(Boolean);

    return {
      kind: 'detail',
      pageTitle: 'シラバス詳細',
      heroMeta,
      summaryItems,
      sections,
      anchors: sections.map((section) => ({ title: section.title, target: section.target })),
      sourceHref: window.location.href,
      copyrightText: cleanText(doc.querySelector('.copyright')?.textContent || '')
    };
  }

function readSyllabusMetaValue(root, labelPattern) {
    const dt = Array.from(root?.querySelectorAll('dt') || []).find((node) => labelPattern.test(cleanText(node.textContent || '')));
    if (!dt) return '';
    const dd = dt.nextElementSibling;
    return cleanText(dd?.textContent || '');
  }

function parseSyllabusTitleBlock(block) {
    const titleNode = getDirectChildrenByTag(block, 'DD')[0] || null;
    const lines = String(titleNode?.textContent || '')
      .split(/\n+/)
      .map((line) => cleanText(line))
      .filter(Boolean);
    return {
      title: lines[0] || '',
      subtitle: lines.slice(1).join(' / ')
    };
  }

function parseSyllabusNestedMeta(block) {
    const nestedValues = Array.from(block?.querySelectorAll('dd > dl > dd') || [])
      .map((node) => cleanText(node.textContent || ''));
    return {
      termCredits: nestedValues[0] || '',
      className: nestedValues[1] || ''
    };
  }

function parseSyllabusSections(root) {
    return getDirectChildrenByTag(root, 'DL')
      .map((section, index) => parseSyllabusSection(section, index))
      .filter((section) => section && (section.rows.length || section.text || section.html));
  }

function parseSyllabusSection(section, index) {
    const headingNode = getDirectChildrenByTag(section, 'DT')[0] || null;
    const bodyNode = getDirectChildrenByTag(section, 'DD')[0] || null;
    const title = normalizeSyllabusTopLevelSectionTitle(headingNode?.textContent || '');
    if (!title || !bodyNode) return null;
    const innerDl = getDirectChildrenByTag(bodyNode, 'DL')[0] || null;
    const rows = innerDl ? parseSyllabusSectionRows(innerDl) : [];
    return {
      title,
      target: slugify(`${index + 1}-${title}`),
      rows,
      text: rows.length ? '' : sanitizeSyllabusBodyText(bodyNode),
      html: rows.length ? '' : sanitizeSyllabusBodyHtml(bodyNode)
    };
  }

function normalizeSyllabusTopLevelSectionTitle(title = '') {
    const normalized = cleanText(title).replace(/\s*\/\s*/g, ' / ');
    if (!/[ぁ-んァ-ヶ一-龠々]/.test(normalized) || !/[A-Za-z]/.test(normalized)) return normalized;
    const englishMarkers = [
      'Course Description',
      'Course Objective',
      'Course Objectives',
      'Course Content',
      'Grading Policies / Evaluation Criteria',
      'Grading Policies',
      'Evaluation Criteria',
      'Textbooks',
      'References',
      'Feedback Method',
      'Contacts',
      'Other Comments'
    ];
    const englishStart = englishMarkers
      .map((marker) => normalized.indexOf(marker))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b)[0];
    if (typeof englishStart !== 'number') return normalized;
    const trimmed = cleanText(normalized.slice(0, englishStart)).replace(/[\/:：・\-]+$/g, '').trim();
    return trimmed || normalized;
  }

function parseSyllabusSectionRows(innerDl) {
    const rows = [];
    let currentLabel = '';
    Array.from(innerDl.children || []).forEach((node) => {
      if (node.tagName === 'DT') {
        currentLabel = cleanText(node.textContent || '').replace(/\s*\/\s*/g, ' / ');
        return;
      }
      if (node.tagName === 'DD') {
        const text = sanitizeSyllabusBodyText(node);
        const html = sanitizeSyllabusBodyHtml(node);
        if (!currentLabel || (!text && !html)) return;
        rows.push({ label: currentLabel, text, html });
      }
    });
    return rows;
  }

function sanitizeSyllabusBodyHtml(node) {
    if (!node) return '';
    const clone = node.cloneNode(true);
    clone.querySelectorAll('script, style, form, input, button, select, textarea, iframe, object, embed, meta, link, base, foreignObject, annotation-xml').forEach((element) => element.remove());
    const allowedTags = new Set('A ABBR B BLOCKQUOTE BR CAPTION CODE COL COLGROUP DD DEL DETAILS DIV DL DT EM FIGCAPTION FIGURE H1 H2 H3 H4 H5 H6 HR I IMG KBD LI MARK OL P PRE Q RP RT RUBY S SMALL SPAN STRONG SUB SUMMARY SUP TABLE TBODY TD TFOOT TH THEAD TR U UL MATH MI MN MO MROW MFRAC MSQRT MROOT MSUB MSUP MSUBSUP MTABLE MTR MTD MTEXT SEMANTICS ANNOTATION SVG G PATH CIRCLE RECT LINE POLYLINE POLYGON TEXT TSPAN ELLIPSE DEFS CLIPPATH'.split(' '));
    const safeUrl = (value, image = false) => {
      const raw = String(value || '').trim();
      if (!raw) return '';
      if (!image && raw.startsWith('#')) return '#ku-syllabus-content-' + encodeURIComponent(raw.slice(1));
      try {
        const url = new URL(raw, node.ownerDocument?.baseURI || window.location.href);
        return (image ? ['http:', 'https:'] : ['http:', 'https:', 'mailto:', 'tel:']).includes(url.protocol) ? url.href : '';
      } catch { return ''; }
    };
    Array.from(clone.querySelectorAll('*')).forEach((element) => {
      const tag = String(element.tagName).toUpperCase();
      if (!allowedTags.has(tag)) {
        element.replaceWith(...Array.from(element.childNodes));
        return;
      }
      const attributes = Array.from(element.attributes);
      attributes.forEach((attribute) => element.removeAttribute(attribute.name));
      attributes.forEach(({ name, value }) => {
        const key = name.toLowerCase();
        if (['title', 'lang', 'dir', 'alt'].includes(key)) element.setAttribute(name, value);
        else if (key === 'id') element.setAttribute('id', 'ku-syllabus-content-' + encodeURIComponent(value));
        else if ((tag === 'A' && key === 'href') || (tag === 'IMG' && key === 'src')) {
          const url = safeUrl(value, tag === 'IMG');
          if (url) element.setAttribute(name, url);
        } else if (tag === 'A' && key === 'target' && value === '_blank') {
          element.setAttribute('target', '_blank');
          element.setAttribute('rel', 'noopener noreferrer');
        } else if (['colspan', 'rowspan', 'span', 'width', 'height'].includes(key) && /^\d+(?:%|px)?$/.test(value)) {
          element.setAttribute(name, value);
        } else if (key === 'scope' && ['row', 'col', 'rowgroup', 'colgroup'].includes(value)) element.setAttribute(name, value);
        else if (['display', 'mathvariant', 'encoding'].includes(key) && /^[\w /.+-]+$/.test(value)) element.setAttribute(name, value);
        else if (['viewbox', 'd', 'points', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'stroke-width', 'transform'].includes(key) && /^[\w\d\s.,()+-]+$/.test(value)) element.setAttribute(name, value);
        else if (['fill', 'stroke'].includes(key) && /^(?:none|currentColor|[a-z]+|#[0-9a-f]{3,8})$/i.test(value)) element.setAttribute(name, value);
      });
      if (tag === 'IMG' && !element.getAttribute('src')) {
        element.replaceWith((clone.ownerDocument || document).createTextNode(element.getAttribute('alt') || ''));
      }
    });
    return clone.innerHTML.trim();
  }

function sanitizeSyllabusBodyText(node) {
    if (!node) return '';
    const clone = node.cloneNode(true);
    clone.querySelectorAll('script, style, form, input, button, iframe, object, embed, svg, math, meta, link').forEach((el) => el.remove());
    const ownerDocument = clone.ownerDocument || document;
    clone.querySelectorAll('br').forEach((el) => el.replaceWith(ownerDocument.createTextNode('\n')));
    clone.querySelectorAll('p, div, li, dt, dd, tr').forEach((el) => {
      if (el.lastChild?.textContent?.endsWith('\n')) return;
      el.appendChild(ownerDocument.createTextNode('\n'));
    });
    return String(clone.textContent || '')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

function getDirectChildrenByTag(node, tagName) {
    if (!node) return [];
    return Array.from(node.children || []).filter((child) => child.tagName === tagName);
  }
