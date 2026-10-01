import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseHTML } from 'linkedom';
import { loadOfflineKulmsInto } from './lib/offline-content-vm.mjs';

const now = new Date('2026-10-01T09:00:00+09:00').getTime();
class FixedDate extends Date { static now() { return now; } }
const sandbox = { Date: FixedDate };
loadOfflineKulmsInto(sandbox);
const day = 86400000;
const item = (days) => ({
  title: `Due ${days}`, type: '課題', dueDate: new Date(now + days * day),
  href: `/assignment-${days}`, courseHref: '/course-a/', courseTitle: 'A',
  usageKnown: true, hasUsage: false,
  availability: '2026/09/01 00:00 ～ 2026/11/01 23:59'
});
assert.equal(sandbox.isUpcomingDueSoonUnused(item(5)), true);
assert.equal(sandbox.isUpcomingDueSoonUnused(item(6)), true);
assert.equal(sandbox.isUpcomingDueSoonUnused(item(7)), true);
assert.equal(sandbox.isUpcomingDueSoonUnused(item(7.001)), false);
assert.equal(sandbox.isUpcomingDueSoonUnused(item(-1)), false);
assert.equal(sandbox.isUpcomingDueSoonUnused({ ...item(6), hasUsage: true }), false);
assert.equal(sandbox.isUpcomingDueSoonUnused({ ...item(6), usageKnown: false }), true);
sandbox.parseUpcomingFromCourse = () => [item(-1), item(5), item(6), item(7), item(7.001)];
assert.deepEqual(Array.from(sandbox.collectAllUpcomingCourseItems({}, {}), x => x.title), ['Due 5', 'Due 6', 'Due 7']);
sandbox.parseHomeFilters = () => ({ label: '2026 秋' });
sandbox.readAllUpcomingState = () => ({ phase: 'completed', items: sandbox.parseUpcomingFromCourse().map(sandbox.serializeAllUpcomingItem) });
const view = sandbox.buildHomeAllUpcomingView({}, {});
assert.deepEqual(Array.from(view.items, x => x.title), ['Due 5', 'Due 6', 'Due 7']);
assert.match(view.subtitle, /7日以内/);
assert.match(view.emptyMessage, /7日以内/);
assert.match(sandbox.renderAllUpcoming(view), /7日以内/);
const week = sandbox.getWeekDays(new Date(now), 0);
assert.equal(week.length, 5);
assert.equal(week[0].date.getDay(), 1);
assert.equal(week[4].date.getDay(), 5);
assert.deepEqual(Object.values(sandbox.PERIOD_TIMES), ['09:00–10:30', '10:40–12:10', '13:00–14:30', '14:40–16:10', '16:20–17:50']);
const entries = [
  { period: '1限', weekdayIndex: 0, weekday: '月曜日', title: '短い講義', href: '#short' },
  { period: '1限', weekdayIndex: 1, weekday: '火曜日', title: '非常に長い講義名でカードの高さと幅が変わらないことを確認する授業', href: '#long' },
  { period: '2限', weekdayIndex: 2, weekday: '水曜日', title: 'CourseWithoutSpaces'.repeat(4), href: '#unbroken' },
  { period: '6限', weekdayIndex: 0, title: 'Excluded sixth period', href: '#six' },
  { period: '1限', weekdayIndex: 5, title: 'Excluded Saturday', href: '#sat' }
];
const html = sandbox.renderSchedule({ entries }, week);
const { document } = parseHTML(html);
assert.equal(document.querySelectorAll('.ku-schedule-head').length, 6);
assert.equal(document.querySelectorAll('.ku-schedule-period').length, 5);
assert.equal(document.querySelectorAll('.ku-schedule-cell').length, 25);
assert.equal(document.querySelectorAll('.ku-class-card').length, 3);
assert.doesNotMatch(html, /Excluded/);
fs.writeFileSync('/tmp/ku-lms-schedule-preview.html', `<!doctype html><meta charset="utf-8"><style>${fs.readFileSync('src/content/critical.css', 'utf8')}</style><div id="ku-redesign-root"><div class="ku-app"><main class="ku-page">${html}</main></div></div>`);
console.log('PASS: seven-day home and collection/results, five weekday periods');
