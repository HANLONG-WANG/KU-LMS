import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const checks = [];
const escape = (text) => String(text ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const state = { messageSearch: '', homeSearch: '' };
let selected = new Set();
let alerts = 0;
const sandbox = {
  state, Set, WeakSet, URL, CSS: { escape: (text) => text }, ROOT_ID: 'ku-redesign-root', SYLLABUS_ROOT_ID: 'ku-syllabus-root',
  cleanText: (text) => String(text ?? '').replace(/\s+/g, ' ').trim(), escapeHtml: escape, escapeAttr: escape,
  absoluteUrl: (url) => url ? new URL(url, 'https://kulms.tl.kansai-u.ac.jp/webclass/').href : '',
  extractPublishDate: (text) => text.split(/\s+-\s+/).find((part) => /^\d{4}\//.test(part)) || '',
  getMessageSelection: () => selected, allSelected: (rows) => rows.length > 0 && rows.every((row) => selected.has(row.id)),
  renderSidebar: () => '', renderMessagePagination: () => '', icon: () => '',
  truncate: (text, length) => String(text).slice(0, length),
  rerender: () => { throw new Error('Search must not replace the focused input via full rerender.'); },
  renderHomeOtherCourses: () => `<p>${escape(state.homeSearch)}</p>`,
  window: { location: { href: 'https://syllabus3.jm.kansai-u.ac.jp/syllabus/detail?year=2026' }, alert: () => { alerts += 1; }, addEventListener() {}, removeEventListener() {} },
  document: { querySelectorAll: () => [] },
  withNativeInteraction: (_node, callback) => callback(),
  detectRoute: (url) => ({ supported: /\/webclass\/(?:course\.php|information\.php|$)/.test(url.pathname) })
};
vm.createContext(sandbox);
for (const relativePath of ['src/content/parsers/notifications.js', 'src/content/render/notifications.js', 'src/content/render/messages.js', 'src/content/hydrate/shared.js', 'src/content/parsers/syllabus.js', 'src/content/render/syllabus.js', 'src/content/hydrate/syllabus.js']) {
  vm.runInContext(fs.readFileSync(path.resolve(process.env.RENDER_AUDIT_SOURCE_ROOT || '.', relativePath), 'utf8'), sandbox, { filename: relativePath });
}

// The publication has no time while the expiry does; native mark1 must win over title words.
const noticeRows = [
  { title: 'Please confirm before emailing', important: true, source: 'Admin - 2026/09/14 - 公開期限 : 2027/03/21 23:59' },
  { title: '最新版 注意点', important: false, source: 'Admin - 2020/07/22' },
  { title: 'Course notice', important: false, source: '情報学部（2026-秋-火-1限-01739） - 2026/09/30 - 公開期限 : 2027/03/21 23:59' }
].map((item) => ({
  querySelector(selector) {
    if (selector === '.exhibitionInfo') return { textContent: item.source };
    if (selector === '.mark1') return item.important ? {} : null;
    return { textContent: item.title, getAttribute: () => '/webclass/information.php/post/1/' };
  }
}));
const notices = sandbox.parseNotificationsList({ querySelectorAll: (selector) => selector.startsWith('.info-list') ? noticeRows : [], querySelector: () => null });
assert.equal(notices.items[0].publishedAt, '2026/09/14');
assert.equal(notices.items[0].important, true);
assert.equal(notices.items[1].important, false);
assert.equal(notices.items[1].publishedAt, '2020/07/22');
assert.equal(notices.items[0].issuer, 'Admin');
assert.equal(notices.items[2].issuer, '情報学部（2026-秋-火-1限-01739）');
assert.equal(notices.items[0].source, 'Admin - 2026/09/14 - 公開期限 : 2027/03/21 23:59');
sandbox.renderPagination = () => '';
const noticeHtml = sandbox.renderNotifications(notices);
assert.match(noticeHtml, /<div>2026\/09\/14<\/div>/);
assert.doesNotMatch(noticeHtml, /<div>2027\/03\/21 23:59<\/div>/);
for (const item of notices.items) {
  const rowHtml = sandbox.renderNotifications({ items: [item], pagination: [], metaText: '' });
  assert.equal(rowHtml.split(item.publishedAt).length - 1, 1, 'Each notification publication date must occur only once in its row.');
  if (item.deadline) assert.equal(rowHtml.split(item.deadline).length - 1, 1, 'Each notification deadline must occur only once in its row.');
  assert.match(rowHtml, new RegExp('<div class="ku-mini-meta">' + escape(item.issuer).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '</div>'));
}
checks.push('date-only publication never takes expiry; native mark1 determines importance');

const meta = ['発行元 : Admin', '発行日 : 2026/09/14 00:00 by A', '更新日 : 2026/09/28 14:38 by B'].map((textContent) => ({ textContent }));
const detailHead = {
  querySelector(selector) { return selector === 'h4' ? { textContent: 'Notice' } : null; },
  querySelectorAll(selector) { return selector === '.postBy' ? meta : [{ textContent: '発行先 : user' }]; }
};
const detail = sandbox.parseNotificationDetail({
  querySelector(selector) { return selector === '.info-detail-head' ? detailHead : selector === '.info-detail-body' ? { innerHTML: '<p>Body</p>' } : null; },
  querySelectorAll: () => []
});
assert.equal(detail.metadata.issuer, 'Admin');
assert.equal(detail.metadata.updatedAt, '2026/09/28 14:38 by B');
const detailHtml = sandbox.renderNotificationDetail(detail);
assert.match(detailHtml, /<span>更新日<\/span><strong>2026\/09\/28 14:38 by B<\/strong>/);
assert.doesNotMatch(detailHtml, /<strong>発行元/);
checks.push('notice details retain updated date and remove duplicate labels');

const control = () => ({ handlers: {}, dataset: {}, addEventListener(name, handler) { this.handlers[name] = handler; } });
const search = control();
const master = control();
const homeSearch = control();
const results = { innerHTML: '', querySelectorAll: () => [] };
const homeResults = { innerHTML: '', querySelectorAll: () => [] };
const root = {
  querySelectorAll(selector) {
    return ({ '[data-action="message-search"]': [search], '[data-action="message-select-all"]': [master], '[data-action="home-search"]': [homeSearch] })[selector] || [];
  },
  querySelector(selector) { return selector === '[data-message-results]' ? results : selector === '[data-home-course-results]' ? homeResults : null; },
  closest: () => null, addEventListener() {}, removeEventListener() {}
};
const view = {
  rows: [{ id: 'visible', inputName: 'a', cells: [{ key: 'subject', text: '一致のメッセージ' }] }, { id: 'hidden', inputName: 'b', cells: [{ key: 'subject', text: 'Other message' }] }],
  columns: [{ key: 'subject', label: '件名', sortLinks: [] }], folder: 'inbox', pagination: {}, actions: [],
  form: { elements: { a: { checked: false }, b: { checked: false }, autochecker: { checked: false } } }
};
sandbox.bindInteractiveHandlers(root, { name: 'messages-inbox' }, view);
selected.add('hidden');
search.value = '一致';
search.handlers.input({ target: search, isComposing: true });
assert.equal(state.messageSearch, '一致');
assert.equal(selected.has('hidden'), false);
assert.equal(search.value, '一致');
master.handlers.change({ target: { checked: true } });
assert.deepEqual([...selected], ['visible']);
assert.equal(view.form.elements.b.checked, false);
assert.doesNotMatch(results.innerHTML, /Other message/);
homeSearch.value = '日文入力';
homeSearch.handlers.input({ target: homeSearch, isComposing: true });
assert.match(homeResults.innerHTML, /日文入力/);
assert.equal(homeSearch.value, '日文入力');
checks.push('search updates result DOM only during IME; select-all excludes hidden messages');

let forwarded = 0;
let reported = 0;
const forwardInput = { value: 'invalid', checkValidity: () => false, reportValidity: () => { reported += 1; } };
const nativeInput = { value: '' };
const forwardView = { forward: { inputName: 'f_address', buttonName: 'forward', form: { querySelector: (selector) => selector.includes('type="submit"') ? { click: () => { forwarded += 1; } } : nativeInput } } };
const forwardRoot = { querySelector: () => forwardInput };
sandbox.triggerMessageDetailForward(forwardRoot, forwardView);
assert.equal(forwarded, 0);
assert.equal(reported, 1);
forwardInput.value = ' valid@example.com ';
forwardInput.checkValidity = () => true;
sandbox.triggerMessageDetailForward(forwardRoot, forwardView);
assert.equal(forwarded, 1);
assert.equal(nativeInput.value, 'valid@example.com');
checks.push('invalid forward addresses cannot invoke native submission; valid addresses preserve native action');

let nativeClicked = 0;
const nativeAnchor = { getAttribute: () => "javascript:changePage('2')", closest: () => null, click: () => { nativeClicked += 1; } };
sandbox.document.querySelectorAll = () => [nativeAnchor];
sandbox.executeMessageHref("javascript:changePage('2')", view);
assert.equal(nativeClicked, 1);
sandbox.document.querySelectorAll = () => [];
const previousHref = sandbox.window.location.href;
sandbox.executeMessageHref('javascript:unknown()', view);
assert.equal(sandbox.window.location.href, previousHref);
checks.push('sorting/paging delegates to original native anchor without evaluating a JavaScript URL');

const toggler = control();
toggler.dataset.sectionTarget = 'section-items';
toggler.getAttribute = () => 'section-items';
toggler.setAttribute = (name, value) => { toggler[name] = value; };
const sectionBody = { hidden: false };
sandbox.bindCourseSectionToggles({ querySelectorAll: () => [toggler], querySelector: () => sectionBody });
toggler.handlers.click();
assert.equal(sectionBody.hidden, true);
assert.equal(toggler['aria-expanded'], 'false');
assert.equal(state.courseCollapsedSections.has('section-items'), true);
toggler.handlers.click();
assert.equal(sectionBody.hidden, false);
checks.push('course fold toggles content, aria-expanded and persistent section state');

let disconnected = 0;
let scrollHandler;
const navSections = [{ id: 'first', top: 0 }, { id: 'second', top: 500 }].map((section) => ({ ...section, getBoundingClientRect() { return { top: this.top }; }, scrollIntoView() {} }));
const navLinks = navSections.map((section) => ({
  handlers: {}, active: false, getAttribute: () => '#' + section.id,
  classList: { toggle(_name, value) { this.owner.active = value; } },
  setAttribute() {}, removeAttribute() {},
  addEventListener(name, handler) { this.handlers[name] = handler; },
  removeEventListener(name) { delete this.handlers[name]; }
}));
navLinks.forEach((link) => { link.classList.owner = link; });
sandbox.IntersectionObserver = class { observe() {} disconnect() { disconnected += 1; } };
const navRoot = {
  querySelectorAll: () => navLinks,
  querySelector: (selector) => navSections.find((section) => '#' + section.id === selector),
  getBoundingClientRect: () => ({ top: 0 }),
  addEventListener(_name, handler) { scrollHandler = handler; },
  removeEventListener() { scrollHandler = null; }
};
const cleanupNavigation = sandbox.bindSectionNavigation(navRoot);
assert.equal(navLinks[0].active, true);
navSections[0].top = -400;
navSections[1].top = 50;
scrollHandler();
assert.equal(navLinks[1].active, true);
cleanupNavigation();
assert.equal(disconnected, 1);
assert.equal(scrollHandler, null);
assert.equal(navLinks[0].handlers.click, undefined);
checks.push('right navigation follows scrolling and disposes observers plus listeners');

let captured;
let navigationClicks = 0;
let releaseWait;
sandbox.window.location.href = 'https://kulms.tl.kansai-u.ac.jp/webclass/';
sandbox.waitForLmsRequestsBeforeNavigation = () => new Promise((resolve) => { releaseWait = resolve; });
const navigationAnchor = { getAttribute: (name) => name === 'href' ? '/webclass/course.php/26170399' : null, closest() { return this; }, addEventListener() {}, removeEventListener() {}, click() { navigationClicks += 1; } };
const navigationRoot = { addEventListener(_name, handler) { captured = handler; }, removeEventListener() {}, querySelectorAll: () => [], contains: () => true };
sandbox.bindLmsLinkNavigation(navigationRoot);
const event = () => ({ target: navigationAnchor, button: 0, preventDefault() {}, stopImmediatePropagation() {} });
let navigation = captured(event());
assert.equal(navigationClicks, 0);
const firstWait = releaseWait;
await captured(event());
assert.equal(releaseWait, firstWait, 'A rapid second click must not start another navigation barrier.');
releaseWait(true);
await navigation;
assert.equal(navigationClicks, 1);
// A new page binding represents the next user's navigation after the successful one.
sandbox.bindLmsLinkNavigation(navigationRoot);
navigation = captured(event());
releaseWait(false);
await navigation;
assert.equal(navigationClicks, 1);
assert.ok(alerts > 0);
const disposeOldNavigation = sandbox.bindLmsLinkNavigation(navigationRoot);
navigation = captured(event());
navigationAnchor.isConnected = false;
const replacement = {
  href: 'https://kulms.tl.kansai-u.ac.jp/webclass/course.php/26170399',
  getAttribute: (name) => name === 'href' ? '/webclass/course.php/26170399' : null,
  closest() { return this; }, addEventListener() {}, removeEventListener() {},
  click() {
    const replayEvent = { ...event(), target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    captured(replayEvent);
    if (!replayEvent.defaultPrevented) navigationClicks += 1;
  }
};
navigationRoot.querySelectorAll = () => [replacement];
disposeOldNavigation();
sandbox.bindLmsLinkNavigation(navigationRoot);
releaseWait(true);
await navigation;
assert.equal(navigationClicks, 2, 'An enrichment rerender must replay the equivalent current link exactly once.');
sandbox.window.location.href = previousHref;
checks.push('LMS navigation serializes clicks, blocks failures and survives enrichment replacing its link');

// A small DOM model exercises the real sanitizer without a browser, network or dependency download.
class Element {
  constructor(tag, attrs = {}, children = []) { this.tagName = tag.toUpperCase(); this.attrs = { ...attrs }; this.childNodes = []; for (const child of children) this.appendChild(child); }
  get attributes() { return Object.entries(this.attrs).map(([name, value]) => ({ name, value })); }
  get children() { return this.childNodes.filter((node) => node instanceof Element); }
  get textContent() { return this.childNodes.map((node) => node.textContent).join(''); }
  get innerHTML() { return this.childNodes.map((node) => node instanceof Element ? `<${node.tagName.toLowerCase()}${Object.entries(node.attrs).map(([key, value]) => ` ${key}="${escape(value)}"`).join('')}>${node.innerHTML}</${node.tagName.toLowerCase()}>` : escape(node.textContent)).join(''); }
  appendChild(node) { node.parentNode = this; this.childNodes.push(node); return node; }
  getAttribute(key) { return this.attrs[key] ?? null; }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  removeAttribute(key) { delete this.attrs[key]; }
  cloneNode() { const copy = new Element(this.tagName, this.attrs, this.childNodes.map((node) => node instanceof Element ? node.cloneNode(true) : { textContent: node.textContent })); copy.ownerDocument = this.ownerDocument; copy.children.forEach((node) => { node.ownerDocument = copy.ownerDocument; }); return copy; }
  querySelectorAll(selector) { const all = []; const visit = (node) => node.children.forEach((child) => { all.push(child); visit(child); }); visit(this); return selector === '*' ? all : all.filter((node) => selector.split(',').map((name) => name.trim().toUpperCase()).includes(node.tagName)); }
  remove() { if (this.parentNode) this.parentNode.childNodes = this.parentNode.childNodes.filter((node) => node !== this); }
  replaceWith(...nodes) { const parent = this.parentNode; if (!parent) return; const index = parent.childNodes.indexOf(this); parent.childNodes.splice(index, 1, ...nodes); nodes.forEach((node) => { node.parentNode = parent; }); }
}
const text = (textContent) => ({ textContent });
const rich = new Element('dd', {}, [
  new Element('p', {}, [new Element('a', { href: '../reference.pdf', onclick: 'evil()' }, [text('Reference')])]),
  new Element('img', { src: 'images/chart.png', alt: 'Chart', onerror: 'evil()' }),
  new Element('table', {}, [new Element('tr', {}, [new Element('td', { colspan: '2' }, [text('Cell')])])]),
  new Element('script', {}, [text('evil()')]),
  new Element('a', { href: 'javascript:evil()' }, [text('Unsafe URL')]),
  new Element('math', {}, [new Element('mi', {}, [text('x')])])
]);
rich.ownerDocument = { baseURI: 'https://syllabus3.jm.kansai-u.ac.jp/syllabus/detail/', createTextNode: text };
const richHtml = sandbox.sanitizeSyllabusBodyHtml(rich);
assert.match(richHtml, /href="https:\/\/syllabus3.jm.kansai-u.ac.jp\/syllabus\/reference.pdf"/);
assert.match(richHtml, /src="https:\/\/syllabus3.jm.kansai-u.ac.jp\/syllabus\/detail\/images\/chart.png"/);
assert.match(richHtml, /<table>.*<td colspan="2">Cell<\/td>/);
assert.match(richHtml, /<math><mi>x<\/mi><\/math>/);
assert.doesNotMatch(richHtml, /script|javascript:|onclick|onerror|evil\(\)/);
const richRendered = sandbox.renderSyllabusSection({ target: 'reference', title: '参考資料', rows: [], text: 'Reference', html: richHtml });
assert.match(richRendered, /<table>/);
assert.match(richRendered, /<a href=/);
const syllabusPage = sandbox.renderSyllabusDetailPage({ heroMeta: {}, summaryItems: [], sections: [], anchors: [], sourceHref: sandbox.window.location.href });
assert.match(syllabusPage, /year=2026&amp;ku-native=1/);
checks.push('syllabus keeps safe links/images/tables/math, removes executable markup, and original link bypasses redesign');

console.log(JSON.stringify({ ok: true, checks }, null, 2));
