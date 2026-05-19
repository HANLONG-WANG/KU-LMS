import { readKulmsSource, extractFunction, assert } from './lib/content-source.mjs';

const source = readKulmsSource();
const required = [
  'parseLoginView', 'parseLogoutView', 'parseHomeFilters', 'parseSchedule', 'parseHomeAnnouncements',
  'parseCourseMeta', 'parseCourseDocument', 'parseUpcomingFromCourse', 'parseMyReports', 'parseNotificationsList', 'parseNotificationDetail',
  'parseMessagesTable', 'parseMessagePreview', 'parseManualSections', 'parseTopLinks', 'parseUserName', 'parseLanguage'
];
for (const name of required) {
  assert(extractFunction(source, name).length > 0, `Parser missing from content subsystem: ${name}`);
}
assert(extractFunction(source, 'parseSchedule').includes('const period = `${rowIndex + 1}限`;'), 'parseSchedule() should preserve canonical period derivation.');
assert(extractFunction(source, 'parseUpcomingFromCourse').includes('/締め切り後提出/.test(sectionTitle)'), 'Course parser should still skip late-submission sections.');
assert(extractFunction(source, 'parseMessagesTable').includes("const form = doc.forms.condition;"), 'Messages parser should still preserve native form access.');
console.log(JSON.stringify({ ok: true, checks: ['route-parser-cluster-present', 'schedule-contract-preserved', 'course-late-section-filter-preserved', 'messages-form-contract-preserved'] }, null, 2));
