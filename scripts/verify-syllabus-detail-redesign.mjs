import { read, readSyllabusSource, getSyllabusScript, extractFunction, assert } from './lib/content-source.mjs';
import vm from 'node:vm';
import { DOMParser } from 'linkedom';

const source = readSyllabusSource();
const script = getSyllabusScript();
const criticalCss = read('src/content/critical.css');
const detailFixture = read('artifacts/fixtures/syllabus-detail-public-session.html');
const searchFixture = read('artifacts/fixtures/syllabus-search-public.html');

const checks = [];
const record = (name, fn) => { fn(); checks.push(name); };

function assertAny(patterns, message) {
  assert(patterns.some((pattern) => pattern.test(source)), message);
}

function stripHtml(html = '') {
  return String(html).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractFixtureCourseCode(html) {
  const text = stripHtml(html);
  const match = text.match(/Course Code\s+([0-9A-Z]{4,})/) || text.match(/時間割コード\s+Course Code\s+([0-9A-Z]{4,})/);
  return match ? match[1] : '';
}

record('public syllabus fixtures describe search and direct-open detail pages', () => {
  assert(searchFixture.includes('function linkSetGoSt') && searchFixture.includes('syllabus.search.DetailKeySearchSt'), 'Search fixture must include the public detail opener contract.');
  assert(detailFixture.includes('tableblock04') && detailFixture.includes('tableblock05'), 'Detail fixture must include native public syllabus detail blocks.');
  assert(extractFixtureCourseCode(detailFixture) === '70427', 'Detail fixture course code extraction failed.');
  assert(stripHtml(detailFixture).includes('知的財産法（著作権）'), 'Detail fixture title text missing.');
  assert(stripHtml(detailFixture).includes('Course Description'), 'Detail fixture body section missing.');
});

record('syllabus manifest remains standalone and never loads the KU-LMS shell', () => {
  assert(script.matches.includes('https://syllabus3.jm.kansai-u.ac.jp/syllabus/*'), 'Syllabus content script match must stay scoped to the public syllabus path.');
  assert(script.js.includes('src/content/runtime/boot-syllabus.js'), 'Syllabus content script must boot through boot-syllabus.js.');
  assert(script.js.at(-1) === 'src/content/syllabus-main.js', 'Syllabus content script entrypoint must stay last.');
  assert(!script.js.includes('src/content/runtime/boot-kulms.js'), 'Syllabus content script must not include the KU-LMS boot runtime.');
  assert(!script.js.includes('src/content/main.js'), 'Syllabus content script must not include the KU-LMS app entrypoint.');
  assert(!source.includes('bootKulms();'), 'Syllabus ordered source must not call bootKulms().');
});

record('direct-open detail rendering is booted without pending resolver state', () => {
  const boot = extractFunction(source, 'bootSyllabus');
  assert(/DetailKeySearchSt|SyllabusDetail|syllabus-detail|tableblock04/.test(boot), 'bootSyllabus() must include a direct-open detail rendering path.');
  assert(/init|boot|mount|render/i.test(boot) && /detail/i.test(boot), 'bootSyllabus() must invoke a detail-specific renderer/initializer.');
  assert(!/readPendingSyllabusNavigation\(\)[\s\S]{0,120}(DetailKeySearchSt|SyllabusDetail|syllabus-detail)/.test(boot), 'Direct detail rendering must not depend on pending resolver window.name state.');
});

record('detail-only takeover is guarded to public detail pages', () => {
  assertAny([/DetailKeySearchSt/, /actionClass[^\n]+DetailKeySearchSt/, /is[^\n]{0,80}Syllabus[^\n]{0,80}Detail/i], 'Missing public syllabus detail-page detector.');
  assertAny([/ku-syllabus-detail/, /data-ku-syllabus-detail/, /SyllabusDetail/], 'Missing dedicated syllabus detail takeover marker/classes.');
  assertAny([/replaceChildren\(/, /innerHTML\s*=|insertAdjacentHTML\(/, /appendChild\(/], 'Missing DOM takeover/render insertion path for detail pages.');
  assert(/DetailKeySearchSt/.test(source) && /KeySearchUp|parseSyllabusResultCandidates|linkSetGoSt/.test(source), 'Detail takeover must coexist with search/result-page assist instead of replacing the resolver path.');
});

record('resolver-first ambiguity checks are preserved', () => {
  const autoResolve = extractFunction(source, 'autoResolveSyllabusResult');
  assert(autoResolve.includes("document.documentElement.dataset.kuSyllabusAssist = 'unresolved';"), 'Ambiguous syllabus results must still be marked unresolved.');
  assert(autoResolve.includes('resolveSyllabusCandidateByCourseCode'), 'Ambiguous exact-title matches must still attempt course-code resolution before fallback.');
  assert(!/exactMatches\.length\s*>\s*1[\s\S]{0,180}window\.location\.replace/.test(autoResolve), 'Multiple exact-title matches must not redirect by guessing.');
});

record('detail parser contract targets stable native fixture labels', () => {
  assertAny([/tableblock04/, /Course Code/, /時間割コード/], 'Detail parser must read the native summary block/course-code label.');
  assertAny([/tableblock05/, /Course Description/, /授業概要/], 'Detail parser must read the native body/content block.');
  assertAny([/Course title/, /科目名/, /#kamoku|kamoku/], 'Detail parser must read the native course title field.');
  assertAny([/#gaiyo|gaiyo/, /Course Objectives|到達目標/, /Teaching Types|授業種別/], 'Detail parser must preserve important syllabus body sections.');
  assertAny([/sanitizeSyllabusBodyText/, /renderSyllabusTextBody/], 'Detail pipeline must normalize public syllabus body content as text, not raw HTML passthrough.');
  assert(stripHtml(detailFixture).includes('Textbooks') && stripHtml(detailFixture).includes('References'), 'Detail fixture must include direct-text materials sections.');
  assert(stripHtml(detailFixture).includes('Feedback Method') && stripHtml(detailFixture).includes('Contacts'), 'Detail fixture must include direct-text support/contact sections.');
});

record('native fallback contract is explicit and fail-open', () => {
  assertAny([/try\s*{[\s\S]{0,600}(render|mount|init|boot)[^}]*Syllabus[^}]*Detail/i, /catch\s*\([^)]*\)\s*{[\s\S]{0,400}(restore|release|fallback|dataset)/i], 'Detail takeover must be protected by an explicit fallback path.');
  assertAny([/native[^\n]{0,80}fallback/i, /fallback[^\n]{0,80}native/i, /restore[^\n]{0,80}native/i, /release[^\n]{0,80}native/i, /kuSyllabusNativeFallback/], 'Fallback path must be named/marked as native fallback.');
  assert(!/document\.body\.(?:innerHTML\s*=\s*['"]|textContent\s*=\s*['"])/.test(source), 'Detail takeover must not blank the native body before rendering can fail open.');
});

record('syllabus detail table-of-contents hydration is explicit', () => {
  const hydrate = extractFunction(source, 'hydrateSyllabusDetail');
  assert(hydrate.includes('bindSectionNavigation(root)'), 'Syllabus detail hydration must delegate TOC links to the shared navigation helper.');
  const document = new DOMParser().parseFromString('<html><body><div id="root"><a class="ku-rightnav-link" href="#one">One</a><a class="ku-rightnav-link" href="#two">Two</a><section id="one"></section><section id="two"></section></div></body></html>', 'text/html');
  const root = document.querySelector('#root');
  root.getBoundingClientRect = () => ({ top: 0 });
  let scrolled = '';
  for (const [index, section] of Array.from(root.querySelectorAll('section')).entries()) {
    section.getBoundingClientRect = () => ({ top: index * 600 });
    section.scrollIntoView = () => { scrolled = section.id; };
  }
  let disconnected = false;
  const observed = [];
  const events = new Map();
  const context = { CSS: { escape: (value) => value }, window: { addEventListener(name, fn) { events.set(name, fn); }, removeEventListener(name) { events.delete(name); } },
    IntersectionObserver: class { constructor(callback) { this.callback = callback; } observe(section) { observed.push(section.id); } disconnect() { disconnected = true; } } };
  vm.createContext(context);
  vm.runInContext(extractFunction(source, 'bindSectionNavigation'), context);
  const cleanup = context.bindSectionNavigation(root);
  const links = Array.from(root.querySelectorAll('a'));
  assert(links[0].classList.contains('active') && links[0].getAttribute('aria-current') === 'location', 'Initial TOC state should identify the first visible section.');
  links[1].dispatchEvent(new document.defaultView.Event('click', { cancelable: true }));
  assert(scrolled === 'two' && links[1].classList.contains('active') && !links[0].classList.contains('active'), 'TOC click must scroll and update exclusive active state.');
  document.querySelector('#two').getBoundingClientRect = () => ({ top: 20 });
  root.dispatchEvent(new document.defaultView.Event('scroll'));
  assert(links[1].getAttribute('aria-current') === 'location', 'Scroll updates must retain accessible current-section state.');
  assert(observed.length === 2, 'The shared helper must observe all TOC sections.');
  cleanup();
  assert(disconnected && !events.has('resize'), 'Navigation cleanup must disconnect the observer and remove global listeners.');
});

record('shared syllabus css stays ku-scoped or dataset-gated', () => {
  assert(criticalCss.includes('data-ku-syllabus-redesign-state'), 'Shared CSS must gate syllabus takeover through an explicit syllabus state selector.');
  assert(!/\nbody\s*{/.test(criticalCss), 'Shared CSS must not contain an ungated body selector.');
  assert(!/\nhtml\s*{/.test(criticalCss), 'Shared CSS must not contain an ungated html selector.');
  assert(!/\n(?:main|section|article|div|p|a)\s*{/.test(criticalCss), 'Shared CSS must not contain broad ungated element selectors that could style native public syllabus pages.');
});

console.log(JSON.stringify({ ok: true, checks }, null, 2));
