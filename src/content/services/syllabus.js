/* src/content/services/syllabus.js */

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
    const direct = await lookupSyllabusDirectUrl({
      title,
      year,
      courseCode: deriveSyllabusCourseCode(courseHref)
    });
    if (direct) return direct;
    return '';
  }

async function lookupSyllabusDirectUrl(payload) {
    if (!chrome?.runtime?.sendMessage) return '';
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'ku:lms:lookup-syllabus', payload }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('[KU Redesign] syllabus runtime lookup failed', chrome.runtime.lastError.message);
            resolve('');
            return;
          }
          resolve(response?.url || '');
        });
      } catch (error) {
        console.warn('[KU Redesign] syllabus runtime message threw', error);
        resolve('');
      }
    });
  }

async function submitSyllabusSearchNavigation({ title = '', courseHref = '', year = '' } = {}) {
    const query = normalizeSyllabusCourseQuery(title);
    if (!query) {
      window.location.href = buildSyllabusFallbackHref(year || '');
      return;
    }
    const resolvedYear = year || state.currentView?.filters?.year || '';
    rememberPendingSyllabusNavigation({
      title: query,
      year: resolvedYear,
      instructor: '',
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

function mountSyllabusAssistOverlay() {
    if (!readPendingSyllabusNavigation()) return;
    if (!document.getElementById('ku-syllabus-assist-style')) {
      const style = document.createElement('style');
      style.id = 'ku-syllabus-assist-style';
      style.textContent = `
        #ku-syllabus-assist-overlay {
          position: fixed;
          inset: 0;
          z-index: 2147483647;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(245, 248, 254, 0.96);
          color: #1D2940;
          font: 800 18px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          letter-spacing: 0.01em;
        }
        #ku-syllabus-assist-overlay .ku-syllabus-assist-box {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          padding: 16px 22px;
          border: 1px solid #E6EBF5;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.98);
          box-shadow: 0 16px 40px rgba(38, 65, 139, 0.08);
        }
        #ku-syllabus-assist-overlay .ku-syllabus-assist-dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: #2F6BFF;
          box-shadow: 0 0 0 6px rgba(47, 107, 255, 0.14);
        }
      `;
      (document.head || document.documentElement).appendChild(style);
    }
    if (document.getElementById('ku-syllabus-assist-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'ku-syllabus-assist-overlay';
    overlay.innerHTML = '<div class=\"ku-syllabus-assist-box\"><span class=\"ku-syllabus-assist-dot\"></span><span>シラバスを検索中…</span></div>';
    (document.body || document.documentElement).appendChild(overlay);
  }

function clearSyllabusAssistOverlay() {
    document.getElementById('ku-syllabus-assist-overlay')?.remove();
  }

function ensureSyllabusRoot() {
    let root = document.getElementById(SYLLABUS_ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = SYLLABUS_ROOT_ID;
      (document.body || document.documentElement).appendChild(root);
    }
    return root;
  }

function mountSyllabusDetailBootShell() {
    const root = ensureSyllabusRoot();
    root.innerHTML = '<div class="ku-app ku-syllabus-app"><main class="ku-page ku-syllabus-page"><div class="ku-card ku-loading"><div class="ku-spinner"></div><div>シラバス詳細を読み込み中…</div></div></main></div>';
  }

function releaseSyllabusDetailRedesign() {
    delete document.documentElement.dataset.kuSyllabusRedesignState;
    const root = document.getElementById(SYLLABUS_ROOT_ID);
    if (root) root.remove();
  }

function initSyllabusDetailRedesign() {
    try {
      const view = parseSyllabusDetailDocument(document);
      if (!view) {
        releaseSyllabusDetailRedesign();
        return;
      }
      clearPendingSyllabusNavigation();
      clearSyllabusAssistOverlay();
      document.documentElement.dataset.kuSyllabusAssist = 'detail';
      const root = ensureSyllabusRoot();
      root.innerHTML = renderSyllabusDetailPage(view);
      hydrateSyllabusDetail(root);
      document.documentElement.dataset.kuSyllabusRedesignState = 'ready';
    } catch (error) {
      console.warn('[KU Redesign] syllabus detail redesign failed', error);
      releaseSyllabusDetailRedesign();
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
        clearSyllabusAssistOverlay();
        return;
      }
      if (/DetailKeySearchSt/.test(window.location.href)) {
        clearPendingSyllabusNavigation();
        document.documentElement.dataset.kuSyllabusAssist = 'detail';
        clearSyllabusAssistOverlay();
        return;
      }
      const candidates = parseSyllabusResultCandidates(document);
      document.documentElement.dataset.kuSyllabusCandidateCount = String(candidates.length);
      if (!candidates.length) {
        document.documentElement.dataset.kuSyllabusAssist = 'no-candidates';
        clearSyllabusAssistOverlay();
        return;
      }
      document.documentElement.dataset.kuSyllabusAssist = 'resolving';
      autoResolveSyllabusResult(pending, candidates).catch((error) => {
        clearSyllabusAssistOverlay();
        console.warn('[KU Redesign] syllabus result auto-resolve failed', error);
      });
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
      run();
    }
  }

async function autoResolveSyllabusResult(pending, candidates) {
    const normalizedTitle = normalizeSyllabusCourseQuery(pending.title || '');
    const exactMatches = candidates.filter((candidate) => candidate.normalizedTitle === normalizedTitle);
    if (exactMatches.length === 1) {
      document.documentElement.dataset.kuSyllabusAssist = 'redirect-exact';
      clearPendingSyllabusNavigation();
      window.location.replace(buildSyllabusDetailUrl(exactMatches[0], pending.title, pending.year));
      return;
    }
    const exactResolved = await resolveSyllabusCandidateByCourseCode(exactMatches, pending);
    if (exactResolved) {
      document.documentElement.dataset.kuSyllabusAssist = 'redirect-course-code';
      clearPendingSyllabusNavigation();
      window.location.replace(exactResolved);
      return;
    }
    document.documentElement.dataset.kuSyllabusAssist = 'unresolved';
    clearSyllabusAssistOverlay();
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
        normalizedTitle: normalizeSyllabusCourseQuery(title)
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
