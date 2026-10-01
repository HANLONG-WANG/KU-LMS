import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Small offline DOM fixture adapter: no browser, fetch, form submission or LMS session.
// The current courseList/manual shapes come from the 2026-09-30 audit evidence.
const escape = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const decode = (text) => text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ');
class Node {
  constructor(tag, attributes = {}) { this.tagName = tag.toUpperCase(); this.attrs = { ...attributes }; this.childNodes = []; this.parentElement = null; }
  get children() { return this.childNodes.filter((node) => node instanceof Node); }
  get attributes() { return Object.entries(this.attrs).map(([name, value]) => ({ name, value })); }
  get textContent() { return this.childNodes.map((node) => node instanceof Node ? node.textContent : node).join(''); }
  get innerText() { return this.textContent; }
  get classList() { return { contains: (name) => (this.attrs.class || '').split(/\s+/).includes(name) }; }
  get nextElementSibling() { const siblings = this.parentElement?.children || []; return siblings[siblings.indexOf(this) + 1] || null; }
  get previousElementSibling() { const siblings = this.parentElement?.children || []; return siblings[siblings.indexOf(this) - 1] || null; }
  get outerHTML() { return `<${this.tagName.toLowerCase()}${Object.entries(this.attrs).map(([key, value]) => ` ${key}="${escape(value)}"`).join('')}>${this.childNodes.map((node) => node instanceof Node ? node.outerHTML : escape(node)).join('')}</${this.tagName.toLowerCase()}>`; }
  getAttribute(name) { return this.attrs[name] ?? null; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  hasAttribute(name) { return name in this.attrs; }
  removeAttribute(name) { delete this.attrs[name]; }
  append(node) { if (node instanceof Node) node.parentElement = this; this.childNodes.push(node); }
  remove() { if (this.parentElement) this.parentElement.childNodes = this.parentElement.childNodes.filter((node) => node !== this); }
  cloneNode(deep) { const copy = new Node(this.tagName, this.attrs); if (deep) this.childNodes.forEach((node) => copy.append(node instanceof Node ? node.cloneNode(true) : node)); return copy; }
  matches(selector) {
    return selector.split(',').some((part) => {
      const tokens = part.trim().match(/(?:\[[^\]]+\]|[^\s])+/g) || [];
      const simple = (node, token) => {
        const head = token.replace(/\[[^\]]*\]/g, '');
        const tag = head.match(/^[a-z][\w-]*/i)?.[0];
        if (tag && node.tagName !== tag.toUpperCase()) return false;
        for (const match of head.matchAll(/\.([\w-]+)/g)) if (!node.classList.contains(match[1])) return false;
        const id = head.match(/#([\w-]+)/)?.[1];
        if (id && node.attrs.id !== id) return false;
        for (const match of token.matchAll(/\[([\w-]+)(?:(\*=|=)["']?([^"'\]]*)["']?)?\]/g)) {
          const [, key, operator, value] = match;
          if (!(key in node.attrs)) return false;
          if (operator === '=' && node.attrs[key] !== value) return false;
          if (operator === '*=' && !node.attrs[key].includes(value)) return false;
        }
        return true;
      };
      if (!tokens.length || !simple(this, tokens.pop())) return false;
      let ancestor = this.parentElement;
      while (tokens.length) { const token = tokens.pop(); while (ancestor && !simple(ancestor, token)) ancestor = ancestor.parentElement; if (!ancestor) return false; ancestor = ancestor.parentElement; }
      return true;
    });
  }
  closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
  querySelectorAll(selector) { return this.children.flatMap((node) => [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
function documentFrom(html) {
  const root = new Node('document');
  const stack = [root];
  for (const match of html.matchAll(/<!--[\s\S]*?-->|<\/([^>]+)>|<([\w-]+)([^>]*)>|([^<]+)/g)) {
    if (match[1]) { if (stack.length > 1) stack.pop(); continue; }
    if (match[2]) {
      const attributes = {};
      for (const attr of match[3].matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attributes[attr[1]] = decode(attr[2] ?? attr[3] ?? attr[4] ?? '');
      const node = new Node(match[2], attributes);
      stack.at(-1).append(node);
      if (!/^(?:input|img|br|hr|meta|link)$/i.test(match[2])) stack.push(node);
    } else if (match[4]) stack.at(-1).append(decode(match[4]));
  }
  root.body = root.querySelector('body') || root;
  root.title = 'Example course - 関大LMS';
  return root;
}
const runtime = {
  URL, URLSearchParams, console,
  window: { location: { origin: 'https://kulms.tl.kansai-u.ac.jp', href: 'https://kulms.tl.kansai-u.ac.jp/webclass/course.php/26170478/', pathname: '/webclass/course.php/26170478/' } },
  state: { homeSearch: '', myReportColumns: { preview: true, attachments: true, comments: true, score: true }, currentContext: { links: { home: '/webclass/', courses: '/webclass/', messages: '/webclass/msg_editor.php?msgappmode=inbox', notifications: '/webclass/information.php/' } }, courseCollapsedSections: new Set() }
};
vm.createContext(runtime);
for (const path of ['src/content/runtime/constants.js', 'src/content/utils/core.js', 'src/content/parsers/home.js', 'src/content/parsers/shared.js', 'src/content/parsers/course.js', 'src/content/parsers/manual.js', 'src/content/render/shared.js', 'src/content/render/home.js', 'src/content/render/course.js', 'src/content/render/manual.js']) vm.runInContext(fs.readFileSync(path, 'utf8'), runtime, { filename: path });
runtime.renderSyllabusChip = () => '';
runtime.readHomeRefreshState = () => null;
runtime.isHomeRefreshActive = () => false;
runtime.mergeUpcomingSources = (...sources) => sources.flat();
runtime.loadDisplayUpcomingFromOtherCourses = () => [];
const checks = [];
function check(name, run) { run(); checks.push(name); }

check('current ungrouped courseList retains all nonnumeric course IDs and reminders', () => {
  const ids = ['202210_kokusai004', '202302_kokusai009', '202602_career17', 'd5a241124d626611bf115b213f9c50b2'];
  const doc = documentFrom(`<body><div id="ku-redesign-root"><ul class="courseList"><li class="course-title"><a href="/webclass/course.php/fake/">extension</a></li></ul></div><main id="js-main"><ul class="courseTree courseList">${ids.map((id, index) => `<li><div class="course-data-box-normal"><div class="course-title"><a href="/webclass/course.php/${id}/login">» Course ${index}</a><span class="course-info">2026 通年</span></div>${index === 0 ? '<span class="course-contents-info">締切が近い課題があります。</span>' : ''}</div></li>`).join('')}</ul></main></body>`);
  const groups = runtime.parseOtherCourses(doc);
  assert.equal(groups.flatMap((group) => group.items).length, 4);
  assert.equal(groups[0].items[0].hasNativeDueReminder, true);
  assert.match(groups[0].items[3].href, new RegExp(ids[3]));
});
check('account identity ignores course brand and extension identity, unknown stays empty', () => {
  const doc = documentFrom('<body><div id="ku-redesign-root"><a title="アカウントメニュー">Fake Identity</a></div><a href="/webclass/course.php/26170478/">Example course (2026-秋学期-水曜日-3限-70478)</a><a title="アカウントメニュー">Student Example</a></body>');
  assert.equal(runtime.parseUserName(doc), 'Student Example');
  assert.equal(runtime.parseUserName(documentFrom('<body><a>Example course (2026-秋学期-水曜日-3限-70478)</a></body>')), '');
});
check('course code is not a classroom and native course logout return is preserved', () => {
  const doc = documentFrom('<body><a href="/webclass/course.php/26170478/">Example course (2026-秋学期-水曜日-3限-70478)</a><a href="/webclass/course.php/26170478/logout?acs_=fixture">コースリスト</a></body>');
  const course = runtime.parseCourseMeta(doc);
  assert.equal(course.meta.room, '');
  assert.equal(course.meta.courseCode, '70478');
  const header = runtime.renderCourseHeader(course, 'materials');
  assert.match(header, /科目コード: 70478/);
  assert.doesNotMatch(header, /教室:/);
  assert.match(header, /26170478\/logout\?acs_=fixture/);
});
check('same-cell multiple classes and explicit period labels survive parse and render', () => {
  const doc = documentFrom('<table id="schedule-table"><tbody><tr><th>時限</th><th>月</th></tr><tr><th>3限</th><td><a href="/webclass/course.php/A/login">Course A</a><a href="/webclass/course.php/B/login">Course B</a></td></tr></tbody></table>');
  const schedule = runtime.parseSchedule(doc);
  assert.equal(schedule.entries.length, 2);
  assert.equal(schedule.entries[0].period, '3限');
  const html = runtime.renderSchedule(schedule, runtime.getWeekDays(new Date(), 0), '2026');
  assert.match(html, /Course A/); assert.match(html, /Course B/); assert.match(html, /ku-schedule-scroll/);
});
check('availability formats reject invalid dates and do not invent open-ended deadlines', () => {
  const dateOnly = runtime.parseAvailabilityRange('2026/09/01 ～ 2026/10/10');
  assert.equal(dateOnly.end.getDate(), 10); assert.equal(dateOnly.end.getHours(), 23);
  assert.equal(runtime.parseAvailabilityRange('2026/09/01 00:00 ～').end, null);
  assert.equal(runtime.parseAvailabilityRange('～ 2026/10/10 13:00').start, null);
  assert.equal(runtime.parseAvailabilityRange('2026/02/30 ～ 2026/02/31').end, null);
  assert.equal(runtime.parseAvailabilityRange('２０２６年９月１日 ～ ２０２６年１０月１０日').end.getMonth(), 9);
  assert.equal(runtime.extractPublishDate('発行元 - 2026/09/14 - 公開期限 : 2027/03/21 23:59'), '2026/09/14');
});
check('independent materials and same-title folders stay distinct with unique anchors', () => {
  const item = (title) => `<div class="cl-contentsList_listGroupItem"><h4 class="cl-contentsList_contentName">${title}</h4></div>`;
  const doc = documentFrom(`<body><course-learning-index><div class="cl-contentsList_folder"><div class="panel-title">A B</div>${item('One')}</div><div class="cl-contentsList_folder"><div class="panel-title">A-B</div>${item('Two')}</div><div class="cl-contentsList_folder"><div class="panel-title">A B</div>${item('Three')}</div>${item('Independent')}</course-learning-index></body>`);
  const course = runtime.parseCourseDocument(doc);
  assert.equal(course.sections.length, 4);
  assert.equal(new Set(course.anchors.map((anchor) => anchor.target)).size, 4);
  assert.equal(course.sections.at(-1).items[0].title, 'Independent');
  assert.equal(course.sections[0].items[0].usageKnown, false);
  assert.equal(course.sections[0].items[0].usageCount, null);
  const html = runtime.renderCourseMaterials({ course, currentTab: 'materials' });
  assert.match(html, /data-action="course-section-toggle"/);
  assert.match(html, /aria-expanded="true"/);
});
check('missing usage stays unknown in upcoming items and never claims unused', () => {
  const doc = documentFrom('<body><div class="cl-contentsList_listGroupItem"><h4 class="cl-contentsList_contentName">Upcoming task</h4><div><span class="cl-contentsList_contentDetailListItemLabel">利用可能期間</span><span>2020/01/01 00:00 ～ 2050/01/01 23:59</span></div></div></body>');
  const items = runtime.parseUpcomingFromCourse(doc, '/webclass/course.php/26170478/');
  assert.equal(items.length, 1);
  assert.equal(items[0].usageKnown, false);
  assert.doesNotMatch(runtime.buildUpcomingSubtitle(items[0]), /未利用|未提出/);
  const soon = { dueDate: new Date(Date.now() + 3600000), availability: '2020/01/01 00:00 ～ 2050/01/01 23:59', hasUsage: false };
  assert.equal(runtime.isUpcomingDueSoonUnused({ ...soon, usageKnown: false }), false);
  assert.equal(runtime.isUpcomingDueSoonUnused({ ...soon, usageKnown: true }), true);
});
check('report native column order, extra column, long preview and multiple attachments remain visible', () => {
  const preview = 'Full report text '.repeat(30);
  const doc = documentFrom(`<body><table class="table table-striped"><tr><th>課題名</th><th>提出日</th><th>添付ファイル</th><th>本文プレビュー</th><th>追加情報</th></tr><tr><td><a href="/task">Task</a></td><td>2026/09/30</td><td><a href="/a.pdf">A.pdf</a><a href="/b.pdf">B.pdf</a></td><td>${preview}</td><td>Extra native value</td></tr></table></body>`);
  const reports = runtime.parseMyReports(doc);
  assert.equal(reports.columns.length, 5);
  assert.equal(reports.rows[0].attachments.length, 2);
  const course = { title: 'Course', meta: {}, links: {} };
  const html = runtime.renderMyReports({ course, reports, currentTab: 'myreports' });
  assert.match(html, /A\.pdf/); assert.match(html, /B\.pdf/); assert.match(html, /Extra native value/);
  assert.ok(html.includes(preview.trim()));
  runtime.state.myReportColumns.preview = false;
  const hidden = runtime.renderMyReports({ course, reports, currentTab: 'myreports' });
  assert.match(hidden, /aria-colcount="4"/); assert.doesNotMatch(hidden, /Full report text/);
  runtime.state.myReportColumns.preview = true;
  assert.match(runtime.renderMyReports({ course, reports: { rows: [], columns: [] }, currentTab: 'myreports' }), /提出したレポートはありません/);
  assert.match(runtime.renderScoreGroup({ title: 'Scores', rows: [{ cells: [{ text: 'Task' }, { text: '10' }, { text: '8' }, { text: 'Extra score' }] }] }, ['教材', '得点', '平均', '追加']), /Extra score/);
});
check('manual reads native main, retains all paragraphs, lists, direct links and warning', () => {
  const doc = documentFrom('<body><div id="ku-redesign-root"><main><h2>Fake section</h2><p>Not native</p></main></div><main id="js-main"><h2>教材実行時の注意点</h2><p class="text-danger">複数の教材を同時に実行しないでください。</p><p>Paragraph 2</p><p>Paragraph 3</p><p>Paragraph 4</p><ul><li>Browser support</li></ul><a href="/manual.pdf">Direct PDF</a><p onclick="unsafe()">Last paragraph</p></main></body>');
  const sections = runtime.parseManualSections(doc);
  assert.equal(sections.length, 1);
  assert.ok(sections[0].description.length > 3);
  assert.equal(sections[0].links.length, 1);
  assert.match(sections[0].links[0].href, /manual\.pdf/);
  assert.match(sections[0].bodyHtml, /<ul>/); assert.doesNotMatch(sections[0].bodyHtml, /onclick/);
  const html = runtime.renderManual({ title: 'マニュアル', subtitle: '', sections });
  assert.match(html, /Paragraph 4/); assert.match(html, /複数の教材/); assert.doesNotMatch(html, /Not native/);
});
check('home empty/error copy preserves uncertainty and icon buttons have names', () => {
  const view = { filters: { year: '2026', yearOptions: [], semesterOptions: [], label: '' }, schedule: { entries: [{ title: 'Flagged Course', href: '/webclass/course.php/Example/login', note: '締切が近い課題があります。', weekdayIndex: 0, period: '1限' }] }, otherCourses: [], week: runtime.getWeekDays(new Date(), 0), upcoming: { loading: false, items: [] }, messages: { loading: false, items: [] }, announcements: { items: [] }, homeNotices: [] };
  const html = runtime.renderHome(view);
  assert.match(html, /コースを開いて詳細を確認/); assert.match(html, /aria-label="前の週"/); assert.match(html, /aria-label="次の週"/);
  assert.doesNotMatch(html, /同一タブキャッシュ|fail-closed|週表示/);
  view.messages.error = true; view.upcoming.error = true;
  const failed = runtime.renderHome(view);
  assert.match(failed, /メッセージを読み込めません/); assert.match(failed, /締切情報を読み込めません/);
});
console.log(JSON.stringify({ ok: true, checks, scope: 'offline synthetic/current-structure fixtures; zero network and browser actions' }, null, 2));
