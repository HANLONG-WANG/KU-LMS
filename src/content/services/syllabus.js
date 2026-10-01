/* src/content/services/syllabus.js */

var SYLLABUS_DETAIL_CACHE_KEY = 'ku-redesign-syllabus-detail-v1';
var MAX_REMEMBERED_SYLLABUS_DETAILS = 32;
var SYLLABUS_WINDOW_STATE_PREFIX = '__KU_SYLLABUS_STATE__';
var SYLLABUS_PENDING_PREFIX = '__KU_SYLLABUS_AUTO__';
var SYLLABUS_DETAIL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
var syllabusPendingAbortController = new AbortController();

async function handleSyllabusNavigation(anchor) {
    if (anchor.dataset.loading === 'true') return;
    resumeSyllabusPendingWork();
    const signal = syllabusPendingAbortController.signal;
    anchor.dataset.loading = 'true';
    const originalText = anchor.textContent;
    anchor.textContent = '…';
    try {
      const payload = {
        title: anchor.dataset.syllabusTitle || '',
        courseHref: anchor.dataset.syllabusHref || '',
        year: anchor.dataset.syllabusYear || ''
      };
      const remembered = await readRememberedSyllabusDetail(payload);
      if (signal.aborted || state.extensionSettings?.enabled === false) return;
      if (remembered) {
        window.location.href = remembered;
        return;
      }
      const resolved = await resolveSyllabusUrl(payload);
      if (signal.aborted || state.extensionSettings?.enabled === false) return;
      if (resolved) {
        await rememberSyllabusDetail(payload, resolved);
        if (!signal.aborted && state.extensionSettings?.enabled !== false) window.location.href = resolved;
      } else {
        await submitSyllabusSearchNavigation(payload);
      }
    } catch (error) {
      console.warn('[KU Redesign] syllabus lookup failed', error);
      if (!signal.aborted && state.extensionSettings?.enabled !== false) window.location.href = anchor.href;
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

function buildSyllabusResolvedDetailKey({ title = '', courseHref = '', year = '', courseCode = '' } = {}) {
    const query = normalizeSyllabusCourseQuery(title);
    const courseId = extractCourseId(courseHref);
    const normalizedCourseCode = cleanText(courseCode) || deriveSyllabusCourseCode(courseHref);
    const normalizedYear = String(year || '').trim();
    const identity = normalizedCourseCode || courseId;
    return query && identity ? `${normalizedYear}::${identity}::${query}` : '';
  }

function readSyllabusResolvedDetails() {
    try {
      const stored = JSON.parse(window.sessionStorage?.getItem(SYLLABUS_DETAIL_CACHE_KEY) || '{}');
      const remembered = readSyllabusWindowState().remembered;
      return Object.keys(stored || {}).length ? stored : (remembered || {});
    } catch (error) {
      return readSyllabusWindowState().remembered || {};
    }
  }

function writeSyllabusResolvedDetails(cache) {
    try {
      window.sessionStorage?.setItem(SYLLABUS_DETAIL_CACHE_KEY, JSON.stringify(cache || {}));
    } catch (error) {
      console.warn('[KU Redesign] failed to persist remembered syllabus detail', error);
    }
    const statePayload = readSyllabusWindowState();
    writeSyllabusWindowState({
      pending: statePayload.pending,
      remembered: cache || {}
    });
  }

async function readRememberedSyllabusDetail(payload = {}) {
    const key = buildSyllabusResolvedDetailKey(payload);
    if (!key) return '';
    const entry = readSyllabusResolvedDetails()[key];
    const age = Date.now() - Date.parse(entry?.storedAt || '');
    if (entry?.version === 2 && Number.isFinite(age) && age >= 0 && age < SYLLABUS_DETAIL_CACHE_TTL_MS
      && isRememberedSyllabusDetailUrl(entry.url)) return entry.url;
    return await readRememberedSyllabusDetailFromBackground(key);
  }

async function rememberSyllabusDetail(payload = {}, detailUrl = '') {
    if (!isRememberedSyllabusDetailUrl(detailUrl)) return;
    const key = buildSyllabusResolvedDetailKey(payload);
    if (!key) return;
    const cache = readSyllabusResolvedDetails();
    cache[key] = {
      version: 2,
      url: detailUrl,
      storedAt: new Date().toISOString()
    };
    const entries = Object.entries(cache);
    if (entries.length > MAX_REMEMBERED_SYLLABUS_DETAILS) {
      entries
        .sort(([, a], [, b]) => String(a?.storedAt || '').localeCompare(String(b?.storedAt || '')))
        .slice(0, entries.length - MAX_REMEMBERED_SYLLABUS_DETAILS)
        .forEach(([staleKey]) => delete cache[staleKey]);
    }
    writeSyllabusResolvedDetails(cache);
    await rememberSyllabusDetailInBackground(key, detailUrl);
  }

function isRememberedSyllabusDetailUrl(url = '') {
    try {
      const parsed = new URL(String(url || ''), window.location.origin);
      return parsed.origin === 'https://syllabus3.jm.kansai-u.ac.jp'
        && parsed.pathname.startsWith('/syllabus/')
        && parsed.searchParams.get('actionClass') === 'syllabus.search.DetailKeySearchSt'
        && !!cleanText(parsed.searchParams.get('UJikanwari_cd') || '');
    } catch (error) {
      return false;
    }
  }

async function lookupSyllabusDirectUrl(payload) {
    const response = await sendSyllabusRuntimeMessage('ku:lms:lookup-syllabus', payload, 12000);
    return isRememberedSyllabusDetailUrl(response?.url || '') ? response.url : '';
  }

async function readRememberedSyllabusDetailFromBackground(key = '') {
    if (!key) return '';
    const response = await sendSyllabusRuntimeMessage('ku:lms:read-remembered-syllabus-detail', { key }, 1500);
    return isRememberedSyllabusDetailUrl(response?.url || '') ? response.url : '';
  }

async function rememberSyllabusDetailInBackground(key = '', detailUrl = '') {
    if (!key || !isRememberedSyllabusDetailUrl(detailUrl)) return;
    await sendSyllabusRuntimeMessage('ku:lms:remember-syllabus-detail', { key, url: detailUrl }, 1500);
  }

function cancelSyllabusPendingWork() {
    syllabusPendingAbortController.abort('cancelled');
  }

function resumeSyllabusPendingWork() {
    cancelSyllabusPendingWork();
    syllabusPendingAbortController = new AbortController();
  }

function isSyllabusNativeViewRequested() {
    return new URL(window.location.href).searchParams.get('ku-native') === '1';
  }

function sendSyllabusRuntimeMessage(type, payload, timeoutMs) {
    if (!globalThis.chrome?.runtime?.sendMessage) return Promise.resolve(null);
    const signal = syllabusPendingAbortController.signal;
    return new Promise((resolve) => {
      let timer;
      const finish = (response = null) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        resolve(response);
      };
      const onAbort = () => finish();
      if (signal.aborted) {
        finish();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => finish(), timeoutMs);
      try {
        chrome.runtime.sendMessage({ type, payload }, (response) => {
          const failed = chrome.runtime.lastError;
          finish(failed ? null : response);
        });
      } catch (error) {
        finish();
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
    const statePayload = readSyllabusWindowState();
    writeSyllabusWindowState({
      pending: { ...payload, createdAt: new Date().toISOString() },
      remembered: statePayload.remembered
    });
  }

function readPendingSyllabusNavigation() {
    const pending = readSyllabusWindowState().pending;
    if (!pending) return null;
    const age = Date.now() - Date.parse(pending.createdAt || '');
    if (!Number.isFinite(age) || age < 0 || age >= 5 * 60 * 1000) {
      clearPendingSyllabusNavigation();
      return null;
    }
    return pending;
  }

function clearPendingSyllabusNavigation() {
    const statePayload = readSyllabusWindowState();
    writeSyllabusWindowState({
      pending: null,
      remembered: statePayload.remembered
    });
  }

function readSyllabusWindowState() {
    const raw = String(window.name || '');
    if (raw.startsWith(SYLLABUS_WINDOW_STATE_PREFIX)) {
      try {
        const parsed = JSON.parse(raw.slice(SYLLABUS_WINDOW_STATE_PREFIX.length));
        return {
          pending: parsed?.pending || null,
          remembered: parsed?.remembered || {}
        };
      } catch (error) {
        return { pending: null, remembered: {} };
      }
    }
    if (raw.startsWith(SYLLABUS_PENDING_PREFIX)) {
      try {
        return {
          pending: JSON.parse(raw.slice(SYLLABUS_PENDING_PREFIX.length)),
          remembered: {}
        };
      } catch (error) {
        return { pending: null, remembered: {} };
      }
    }
    return { pending: null, remembered: {} };
  }

function writeSyllabusWindowState({ pending = null, remembered = {} } = {}) {
    const hasPending = !!pending;
    const hasRemembered = !!Object.keys(remembered || {}).length;
    try {
      if (!hasPending && !hasRemembered) {
        window.name = '';
        return;
      }
      window.name = `${SYLLABUS_WINDOW_STATE_PREFIX}${JSON.stringify({
        pending: hasPending ? pending : null,
        remembered: hasRemembered ? remembered : {}
      })}`;
    } catch (error) {
      console.warn('[KU Redesign] failed to store syllabus window state', error);
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
    if (isSyllabusNativeViewRequested()) {
      releaseSyllabusDetailRedesign();
      return;
    }
    const root = ensureSyllabusRoot();
    hideNativePageForExtension(SYLLABUS_ROOT_ID);
    root.innerHTML = '<div class="ku-app ku-syllabus-app"><main class="ku-page ku-syllabus-page"><div class="ku-card ku-loading"><div class="ku-spinner"></div><div>シラバス詳細を読み込み中…</div></div></main></div>';
  }

function releaseSyllabusDetailRedesign() {
    cancelSyllabusPendingWork();
    if (typeof cleanupRouteHydration === 'function') cleanupRouteHydration();
    restoreNativePageForExtension(SYLLABUS_ROOT_ID);
    delete document.documentElement.dataset.kuSyllabusRedesignState;
    const root = document.getElementById(SYLLABUS_ROOT_ID);
    if (root) root.remove();
  }

function initSyllabusDetailRedesign() {
    try {
      if (isSyllabusNativeViewRequested() || state.extensionSettings?.enabled === false) {
        clearSyllabusAssistOverlay();
        releaseSyllabusDetailRedesign();
        return;
      }
      const view = parseSyllabusDetailDocument(document);
      if (!view) {
        releaseSyllabusDetailRedesign();
        return;
      }
      clearPendingSyllabusNavigation();
      clearSyllabusAssistOverlay();
      document.documentElement.dataset.kuSyllabusAssist = 'detail';
      const root = ensureSyllabusRoot();
      hideNativePageForExtension(SYLLABUS_ROOT_ID);
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
      if (isSyllabusNativeViewRequested() || state.extensionSettings?.enabled === false) {
        clearSyllabusAssistOverlay();
        releaseSyllabusDetailRedesign();
        return;
      }
      resumeSyllabusPendingWork();
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
    const controller = syllabusPendingAbortController;
    const signal = controller.signal;
    const timer = setTimeout(() => controller.abort('timeout'), 12000);
    try {
      const normalizedTitle = normalizeSyllabusCourseQuery(pending.title || '');
      const exactMatches = candidates.filter((candidate) => candidate.normalizedTitle === normalizedTitle);
      let resolved = '';
      let reason = 'redirect-course-code';
      if (!pending.courseCode && exactMatches.length === 1) {
        resolved = buildSyllabusDetailUrl(exactMatches[0], pending.title, pending.year);
        reason = 'redirect-exact';
      } else {
        resolved = await resolveSyllabusCandidateByCourseCode(exactMatches, pending);
      }
      if (signal.aborted || state.extensionSettings?.enabled === false || isSyllabusNativeViewRequested()) return;
      if (resolved) {
        await rememberSyllabusDetail(pending, resolved);
        if (signal.aborted || state.extensionSettings?.enabled === false) return;
        document.documentElement.dataset.kuSyllabusAssist = reason;
        clearPendingSyllabusNavigation();
        window.location.replace(resolved);
        return;
      }
      document.documentElement.dataset.kuSyllabusAssist = 'unresolved';
    } finally {
      clearTimeout(timer);
      if (controller === syllabusPendingAbortController) clearSyllabusAssistOverlay();
    }
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
    const signal = syllabusPendingAbortController.signal;
    const courseCode = String(pending.courseCode || '').trim();
    if (!courseCode || !candidates.length) return '';
    for (const candidate of candidates) {
      if (signal.aborted) return '';
      const detailUrl = buildSyllabusDetailUrl(candidate, pending.title, pending.year);
      const detailCode = await loadSyllabusCourseCodeViaFrame(detailUrl, signal);
      if (detailCode === courseCode) return detailUrl;
    }
    return '';
  }

async function loadSyllabusCourseCodeViaFrame(detailUrl, signal = syllabusPendingAbortController.signal) {
    if (signal.aborted || !isRememberedSyllabusDetailUrl(detailUrl)) return '';
    return new Promise((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      let timer;
      let settled = false;
      const finish = (value = '') => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        window.removeEventListener('pagehide', onAbort);
        iframe.onload = null;
        iframe.onerror = null;
        iframe.remove();
        resolve(value);
      };
      const onAbort = () => finish();
      signal.addEventListener('abort', onAbort, { once: true });
      window.addEventListener('pagehide', onAbort, { once: true });
      timer = setTimeout(() => finish(), 5000);
      iframe.onerror = () => finish();
      iframe.onload = () => {
        try {
          finish(extractSyllabusCourseCodeFromText(iframe.contentDocument?.body?.textContent || ''));
        } catch (error) {
          finish();
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
