import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { loadOfflineKulmsInto } from './lib/offline-content-vm.mjs';

const now = Date.parse('2026-10-01T03:00:00Z');
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
const href = 'https://kulms.tl.kansai-u.ac.jp/webclass/course.php/26170478/';
const entry = { href, title: 'サウンド知覚情報処理', note: '締切が近い課題があります。' };
const { document } = parseHTML('<html><body><div class="cl-contentsList_listGroupItem"><h4 class="cl-contentsList_contentName">第１回出席ミニテスト</h4><div><span class="cl-contentsList_contentDetailListItemLabel">利用可能期間</span><span>2026/09/30 13:10 - 2026/10/06 13:00</span></div></div></body></html>');
const sandbox = {
  Date: FixedDate,
  parseCourseDocument: () => ({ course: { links: { materials: href }, courseId: '26170478' } }),
  fetchCourseTimeline: async () => ({ items: [], error: false })
};
loadOfflineKulmsInto(sandbox);
sandbox.syncCourseUpcomingCacheIdentity('offline-test');
// Actual course build parses the missing usage field and writes the shared cache.
await sandbox.buildCourseMaterialsView(document, {});
let items = await sandbox.loadUpcomingFromDueCourses([entry]);
assert.equal(items.length, 1, 'Manual course collection must retain unknown usage');
assert.equal(items[0].title, '第１回出席ミニテスト');
assert.equal(items[0].usageKnown, false);
assert.equal(items[0].usageCount, null);
assert.doesNotMatch(sandbox.buildUpcomingSubtitle(items[0]), /未利用|未提出/);
// Refresh target preparation also prunes cache; it must not erase the item.
assert.equal(sandbox.getRefreshEntries([entry]).length, 1);
items = await sandbox.loadUpcomingFromDueCourses([entry]);
assert.equal(items.length, 1, 'Refresh preparation must retain unknown usage');
assert.equal(items[0].usageKnown, false);
const base = items[0];
const day = 86400000;
for (const days of [0, 6, 7]) {
  assert.equal(sandbox.isUpcomingDueSoonUnused({ ...base, dueDate: new Date(now + days * day) }), true);
}
for (const days of [-0.001, 7.001]) {
  assert.equal(sandbox.isUpcomingDueSoonUnused({ ...base, dueDate: new Date(now + days * day) }), false);
}
assert.equal(sandbox.isUpcomingDueSoonUnused({ ...base, usageKnown: true, hasUsage: true }), false);
assert.equal(sandbox.isUpcomingDueSoonUnused({ ...base, availability: '2026/10/02 13:10 - 2026/10/06 13:00' }), false);
assert.equal(sandbox.isUpcomingDueSoonUnused({ ...base, dueDate: new Date(NaN) }), false);
console.log('PASS: unknown usage survives course collection, refresh preparation and cache reads without being labeled unused');
