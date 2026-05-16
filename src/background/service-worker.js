chrome.runtime.onInstalled.addListener(() => {
  console.log('[KU-LMS Redesign] service worker installed');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'ku:lms:lookup-syllabus') {
    lookupSyllabusDetailUrl(message.payload || {})
      .then((url) => sendResponse({ url }))
      .catch((error) => {
        console.warn('[KU-LMS Redesign] syllabus lookup failed', error);
        sendResponse({ url: '' });
      });
    return true;
  }
  return undefined;
});

async function lookupSyllabusDetailUrl({ title = '', year = '', courseCode = '' } = {}) {
  const nendo = String(year || new Date().getFullYear());
  for (const query of buildQueryVariants(title)) {
    const candidates = parseSyllabusCandidates(await searchSyllabus({ query, nendo, tantousya: '0', kamoku: '1' }));
    if (!candidates.length) continue;
    const normalizedQuery = normalizeQuery(query);
    const exactMatches = candidates.filter((candidate) => candidate.normalizedTitle === normalizedQuery);
    if (exactMatches.length === 1) {
      return buildSyllabusDetailUrl(exactMatches[0], query, nendo);
    }
    const exactResolved = await resolveCandidateByCourseCode(exactMatches, query, nendo, courseCode);
    if (exactResolved) {
      return exactResolved;
    }
  }
  return '';
}

async function searchSyllabus({ query, nendo, tantousya, kamoku }) {
  const response = await fetch('https://syllabus3.jm.kansai-u.ac.jp/syllabus/Controller', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: new URLSearchParams({
      query,
      gaiyo: '0',
      tantousya,
      kamoku,
      biko: '0',
      daigaku_flg: '0',
      actionClass: 'syllabus.search.KeySearchUp',
      hidSelIdx: '',
      hideSelectNendo: nendo,
      hideNendo: nendo,
      hideSelectJyugyohouhou: '',
      G_USERKBN: 'IPPAN',
      G_USERID: '999999',
      G_USERKBNCD: 'I',
      tileNendo: nendo,
      Nendo: nendo
    })
  });
  return response.text();
}

function parseSyllabusCandidates(html = '') {
  const regex = /<tr[^>]*>[\s\S]*?<a[^>]+linkSetGoSt\('([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']*)'\)[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/tr>/g;
  const candidates = [];
  let match;
  while ((match = regex.exec(html))) {
    const [rowHtml, year, id, query, innerHtml] = match;
    const title = stripHtml(innerHtml);
    if (!title) continue;
    const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => stripHtml(cell[1]));
    candidates.push({
      year,
      id,
      query,
      title,
      faculty: cells[0] || '',
      instructor: cells[2] || '',
      normalizedTitle: normalizeQuery(title)
    });
  }
  return uniqueBy(candidates, (candidate) => `${candidate.year}:${candidate.id}`);
}

function stripHtml(value = '') {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeQuery(value = '') {
  return String(value || '')
    .replace(/^»\s*/, '')
    .replace(/[\u3000\s]+/g, ' ')
    .replace(/[\(（]\d{4}-.+?[\)）]\s*$/g, '')
    .replace(/(?:\s*(?:＜[^＞]{1,8}＞|<[^>]{1,8}>))+\s*$/g, '')
    .replace(/(?:\s*\[[^\]]{1,8}\])+\s*$/g, '')
    .replace(/[\u3000\s]+/g, ' ')
    .trim();
}

function buildQueryVariants(title = '') {
  return uniqueBy([normalizeQuery(title)], (item) => item).filter(Boolean);
}

function buildSyllabusDetailUrl(candidate, query, nendo) {
  return `https://syllabus3.jm.kansai-u.ac.jp/syllabus/Controller?UJikanwari_cd=${encodeURIComponent(candidate.id)}&actionClass=syllabus.search.DetailKeySearchSt&nendo=${encodeURIComponent(candidate.year || nendo)}&queryString=${encodeURIComponent(query)}&st=key`;
}

async function resolveCandidateByCourseCode(candidates, query, nendo, courseCode = '') {
  if (!courseCode || candidates.length < 2) return '';
  for (const candidate of candidates) {
    const detailUrl = buildSyllabusDetailUrl(candidate, query, nendo);
    const detailCode = await fetchSyllabusCourseCode(detailUrl);
    if (detailCode && detailCode === courseCode) {
      return detailUrl;
    }
  }
  return '';
}

async function fetchSyllabusCourseCode(detailUrl) {
  const response = await fetch(detailUrl);
  const html = await response.text();
  return extractSyllabusCourseCode(html);
}

function extractSyllabusCourseCode(html = '') {
  const text = stripHtml(html);
  const match = text.match(/Course Code\s+([0-9A-Z]{4,})/i)
    || text.match(/時間割コード\s+Course Code\s+([0-9A-Z]{4,})/i)
    || text.match(/時間割コード\s+([0-9A-Z]{4,})/i);
  return match ? String(match[1] || '').trim() : '';
}

function uniqueBy(items, selector) {
  const seen = new Set();
  return items.filter((item) => {
    const key = selector(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
