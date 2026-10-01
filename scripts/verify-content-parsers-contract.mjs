import { readKulmsSource, extractFunction, assert } from './lib/content-source.mjs';
import vm from 'node:vm';
import { DOMParser } from 'linkedom';

const source = readKulmsSource();
const required = [
  'parseLoginView', 'parseLogoutView', 'parseHomeFilters', 'parseSchedule', 'parseHomeAnnouncements',
  'parseCourseMeta', 'parseCourseDocument', 'parseUpcomingFromCourse', 'parseMyReports', 'parseNotificationsList', 'parseNotificationDetail',
  'parseMessagesTable', 'parseMessagePreview', 'parseManualSections', 'parseTopLinks', 'parseUserName', 'parseLanguage'
];
for (const name of required) {
  assert(extractFunction(source, name).length > 0, `Parser missing from content subsystem: ${name}`);
}
const runtime = { console, URL, URLSearchParams, AbortController,
  window: { location: { origin: 'https://kulms.tl.kansai-u.ac.jp', href: 'https://kulms.tl.kansai-u.ac.jp/webclass/', pathname: '/webclass/' } } };
vm.createContext(runtime);
vm.runInContext(source.replace(/\/\* FILE: src\/content\/main\.js \*\/[\s\S]*$/m, ''), runtime);
const fixture = new DOMParser().parseFromString('<html><body><table id="schedule-table"><tbody><tr><th>時限</th><th>月</th></tr><tr><th>3限</th><td><a href="/webclass/course.php/ExampleA/login">Example A</a><a href="/webclass/course.php/ExampleB/login">Example B</a></td></tr><tr><th>5限</th><td><a href="/webclass/course.php/ExampleC/login">Example C</a></td></tr></tbody></table></body></html>', 'text/html');
const entries = runtime.parseSchedule(fixture).entries;
assert(entries.length === 3 && entries[0].period === '3限' && entries[1].period === '3限' && entries[2].period === '5限', 'Schedule parser should preserve explicit periods and all same-cell course links, without counting the header row.');
assert(extractFunction(source, 'parseUpcomingFromCourse').includes('/締め切り後提出/.test(sectionTitle)'), 'Course parser should still skip late-submission sections.');
assert(extractFunction(source, 'parseMessagesTable').includes("const form = doc.forms.condition;"), 'Messages parser should still preserve native form access.');
console.log(JSON.stringify({ ok: true, checks: ['route-parser-cluster-present', 'schedule-contract-preserved', 'course-late-section-filter-preserved', 'messages-form-contract-preserved'] }, null, 2));
