import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { read, readKulmsSource, extractFunction, assert } from './lib/content-source.mjs';

const source = readKulmsSource();
const fixtureManifest = JSON.parse(read('artifacts/fixtures/fixture-manifest.json'));

function createStorage() {
  const storage = new Map();
  return {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); },
    dump(key) { return storage.has(key) ? JSON.parse(storage.get(key)) : null; }
  };
}

function inspectFixture(relativePath) {
  const script = String.raw`
import json, sys
from pathlib import Path
from bs4 import BeautifulSoup
root = Path(sys.argv[1])
rel = sys.argv[2]
raw = (root / rel).read_text()
try:
    html = json.loads(raw)
except Exception:
    html = raw
soup = BeautifulSoup(html, 'html.parser')
anchors = [{'text': a.get_text(' ', strip=True), 'href': a.get('href', '')} for a in soup.select('a[href]')]
navi = [{'text': a.get_text(' ', strip=True), 'href': a.get('href', '')} for a in soup.select('.navi a[href]')]
title = soup.title.get_text(' ', strip=True) if soup.title else ''
print(json.dumps({'title': title, 'anchors': anchors, 'naviAnchors': navi}, ensure_ascii=False))
`;
  return JSON.parse(execFileSync('python', ['-c', script, process.cwd(), relativePath], { encoding: 'utf8' }));
}

function createAnchor(text, href) {
  return {
    textContent: text,
    getAttribute(name) {
      if (name === 'href') return href;
      return '';
    }
  };
}

function createDocFromFixture(fixture, referrer = '') {
  const anchors = (fixture.anchors || []).map((item) => createAnchor(item.text || '', item.href || ''));
  const naviAnchors = (fixture.naviAnchors || []).map((item) => createAnchor(item.text || '', item.href || ''));
  return {
    referrer,
    title: fixture.title || '',
    querySelectorAll(selector) {
      if (selector === 'a[href]') return anchors;
      if (selector === '.navi a[href]') return naviAnchors;
      if (selector === 'a, span') return anchors;
      return [];
    }
  };
}

function createRuntime() {
  const sourceWithoutEntrypoint = source.replace(/\/\* FILE: src\/content\/main\.js \*\/[\s\S]*$/m, '');
  const sessionStorage = createStorage();
  const context = {
    console,
    URL,
    URLSearchParams,
    AbortController,
    window: {
      location: {
        href: 'https://kulms.tl.kansai-u.ac.jp/webclass/',
        origin: 'https://kulms.tl.kansai-u.ac.jp',
        pathname: '/webclass/',
        search: ''
      },
      sessionStorage,
      addEventListener() {},
      removeEventListener() {}
    },
    document: { documentElement: { dataset: {} } },
    chrome: { runtime: { lastError: null, sendMessage() {} } }
  };
  context.location = context.window.location;
  vm.createContext(context);
  vm.runInContext(sourceWithoutEntrypoint, context);
  context.__sessionStorage = sessionStorage;
  context.__setLocation = (href) => {
    const url = new URL(href);
    context.window.location = {
      href: url.href,
      origin: url.origin,
      pathname: url.pathname,
      search: url.search
    };
    context.location = context.window.location;
  };
  return context;
}

const requiredRoutes = new Map((fixtureManifest.routes || []).map((entry) => [entry.route, entry.html]));
const courseMaterialsFixture = inspectFixture(requiredRoutes.get('course-materials'));
const courseMyReportsFixture = inspectFixture(requiredRoutes.get('course-myreports'));
const homeFixture = inspectFixture(requiredRoutes.get('home'));
const inboxFixture = inspectFixture(requiredRoutes.get('messages-inbox'));
const detailFixture = inspectFixture(requiredRoutes.get('messages-detail-inbox'));
const globalInboxDefault = 'https://kulms.tl.kansai-u.ac.jp/webclass/msg_editor.php?msgappmode=inbox';

const checks = [];
const record = (name, fn) => {
  fn();
  checks.push(name);
};

record('fixture manifest includes required message-context pages', () => {
  for (const route of ['course-materials', 'course-myreports', 'home', 'messages-inbox', 'messages-detail-inbox']) {
    assert(requiredRoutes.has(route), `Fixture manifest missing required route: ${route}`);
  }
});

record('owned source exposes explicit message-context contract fields', () => {
  const stateSource = extractFunction(source, 'normalizeMessageContextPayload');
  assert(stateSource.includes('globalInboxHref'), 'globalInboxHref field missing.');
  assert(stateSource.includes('contextualInboxHref'), 'contextualInboxHref field missing.');
  assert(stateSource.includes('contextSourceRoute'), 'contextSourceRoute field missing.');
  assert(stateSource.includes('canonicalMessageHref'), 'canonicalMessageHref field missing.');
});

record('course fixture keeps the topbar global while persisting contextual ownership', () => {
  const runtime = createRuntime();
  const doc = createDocFromFixture(courseMaterialsFixture);
  const links = runtime.parseTopLinks(doc, { name: 'course-materials' });
  const context = runtime.resolveMessageContext({ name: 'course-materials' }, links, doc);
  assert(links.globalInboxHref === globalInboxDefault, 'Course fixture should use the canonical global inbox default.');
  assert(links.messages === globalInboxDefault, 'Topbar/home compatibility link should stay globally stable on course routes.');
  assert(links.contextualInboxHref && links.contextualInboxHref !== globalInboxDefault, 'Course fixture should expose a separate contextual inbox href.');
  assert(context.contextualInboxHref === links.contextualInboxHref, 'Course route should persist its contextual inbox href.');
  assert(context.canonicalMessageHref === links.contextualInboxHref, 'Course route should canonicalize local message consumers to the contextual inbox.');
  assert(context.observedMobileMessageHref.includes('/mbl.php/messages/'), 'Observed mobile href should be retained defensively from the fixture.');
  assert(runtime.__sessionStorage.dump('KU_LMS_MESSAGE_CONTEXT_V1')?.contextualInboxHref === links.contextualInboxHref, 'Course context should persist in same-tab storage.');
});

record('fixture-backed course -> inbox -> detail flow preserves contextual precedence', () => {
  const runtime = createRuntime();
  const courseDoc = createDocFromFixture(courseMaterialsFixture);
  const courseLinks = runtime.parseTopLinks(courseDoc, { name: 'course-materials' });
  const courseContext = runtime.resolveMessageContext({ name: 'course-materials' }, courseLinks, courseDoc);

  const inboxDoc = createDocFromFixture(inboxFixture, 'https://kulms.tl.kansai-u.ac.jp/webclass/course.php/26170340?acs_=b5796562');
  const inboxLinks = runtime.parseTopLinks(inboxDoc, { name: 'messages-inbox' });
  runtime.__setLocation(inboxLinks.currentPageInboxHref);
  const inboxContext = runtime.resolveMessageRouteContext(
    { name: 'messages-inbox' },
    { globalInboxHref: inboxLinks.globalInboxHref, currentPageInboxHref: inboxLinks.currentPageInboxHref },
    inboxDoc
  );
  assert(inboxContext.contextualInboxHref === courseContext.contextualInboxHref, 'Inbox flow should preserve the originating contextual inbox from the course fixture.');
  assert(inboxContext.canonicalMessageHref === courseContext.contextualInboxHref, 'Inbox consumer precedence should continue to prefer the supported course context.');

  const detailDoc = createDocFromFixture(detailFixture, inboxLinks.currentPageInboxHref);
  const detailLinks = runtime.parseTopLinks(detailDoc, { name: 'messages-detail' });
  runtime.__setLocation('https://kulms.tl.kansai-u.ac.jp/webclass/msg_viewer.php?uomsgid=fixture-detail');
  const detailContext = runtime.resolveMessageRouteContext(
    { name: 'messages-detail' },
    { globalInboxHref: detailLinks.globalInboxHref, currentPageInboxHref: detailLinks.currentPageInboxHref },
    detailDoc
  );
  assert(detailContext.contextualInboxHref === courseContext.contextualInboxHref, 'Detail flow should preserve the originating contextual inbox from the course fixture.');
  assert(detailContext.canonicalMessageHref === courseContext.contextualInboxHref, 'Detail consumer precedence should continue to prefer the supported course context.');
});

record('fixture-backed direct-open detail and observed mbl routes downgrade to global context', () => {
  const runtime = createRuntime();
  const courseDoc = createDocFromFixture(courseMaterialsFixture);
  const courseLinks = runtime.parseTopLinks(courseDoc, { name: 'course-materials' });
  runtime.resolveMessageContext({ name: 'course-materials' }, courseLinks, courseDoc);

  const detailDoc = createDocFromFixture(detailFixture, '');
  const detailLinks = runtime.parseTopLinks(detailDoc, { name: 'messages-detail' });
  runtime.__setLocation('https://kulms.tl.kansai-u.ac.jp/webclass/msg_viewer.php?uomsgid=direct-open');
  const directOpen = runtime.resolveMessageRouteContext(
    { name: 'messages-detail' },
    { globalInboxHref: detailLinks.globalInboxHref, currentPageInboxHref: detailLinks.currentPageInboxHref },
    detailDoc
  );
  assert(directOpen.contextualInboxHref === '', 'Direct-open detail fixture should not synthesize course context.');
  assert(directOpen.canonicalMessageHref === globalInboxDefault, 'Direct-open detail fixture should fall back to the global inbox.');

  runtime.resolveMessageContext({ name: 'course-materials' }, courseLinks, courseDoc);
  const mobileObserved = runtime.resolveMessageRouteContext(
    { name: 'messages-detail' },
    { globalInboxHref: detailLinks.globalInboxHref, currentPageInboxHref: detailLinks.currentPageInboxHref },
    createDocFromFixture(detailFixture, courseLinks.observedMobileMessageHref)
  );
  assert(mobileObserved.contextualInboxHref === '', 'Observed mbl.php fixture paths must never remain authoritative.');
  assert(mobileObserved.canonicalMessageHref === globalInboxDefault, 'Observed mbl.php fixture paths should downgrade to the global inbox.');
});

record('fixture-backed course replacement, home reset, and sidebar precedence prevent bleed', () => {
  const runtime = createRuntime();
  const courseADoc = createDocFromFixture(courseMaterialsFixture);
  const courseAContext = runtime.resolveMessageContext(
    { name: 'course-materials' },
    runtime.parseTopLinks(courseADoc, { name: 'course-materials' }),
    courseADoc
  );
  const courseBDoc = createDocFromFixture(courseMyReportsFixture);
  const courseBLinks = runtime.parseTopLinks(courseBDoc, { name: 'course-myreports' });
  const courseBContext = runtime.resolveMessageContext(
    { name: 'course-myreports' },
    courseBLinks,
    courseBDoc
  );
  assert(courseAContext.contextualInboxHref !== courseBContext.contextualInboxHref, 'Course replacement fixtures should carry distinct contextual inbox hrefs.');
  assert(courseBContext.contextualInboxHref === courseBLinks.contextualInboxHref, 'Course B should replace Course A contextual ownership.');

  const homeDoc = createDocFromFixture(homeFixture);
  const homeContext = runtime.resolveMessageContext(
    { name: 'home' },
    runtime.parseTopLinks(homeDoc, { name: 'home' }),
    homeDoc
  );
  assert(homeContext.contextualInboxHref === '', 'Home/global fixture should clear stale course context.');
  assert(homeContext.globalInboxHref === globalInboxDefault, 'Home/global fixture should continue to advertise the global inbox default.');

  runtime.state.currentContext = {
    links: {
      messages: globalInboxDefault,
      globalInboxHref: globalInboxDefault,
      canonicalMessageHref: courseBContext.canonicalMessageHref
    },
    messageContext: courseBContext
  };
  runtime.state.currentView = { folders: [] };
  const folderLinks = runtime.resolveMessageFolderLinks();
  assert(folderLinks.inbox === courseBContext.canonicalMessageHref, 'Sidebar inbox consumer should prefer canonical contextual inbox when valid.');
});

console.log(JSON.stringify({ ok: true, checks }, null, 2));
