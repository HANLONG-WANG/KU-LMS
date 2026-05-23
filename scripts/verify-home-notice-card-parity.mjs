import { read, readKulmsSource, extractFunction, assert, writeArtifact } from './lib/content-source.mjs';

const source = readKulmsSource();
const architectureDoc = read('docs/ku-lms-extension-architecture.md');
const entrypointDoc = read('docs/AI_DOCS_ENTRYPOINT.md');
const homeFixture = read('artifacts/fixtures/home.network-response');
const notificationsFixture = read('artifacts/fixtures/notifications.network-response');

const parseHomeAnnouncementsSource = extractFunction(source, 'parseHomeAnnouncements');
assert(parseHomeAnnouncementsSource.includes('#NewestInformations'), 'Home notice parser should scope itself to the native homepage notice block.');
assert(parseHomeAnnouncementsSource.includes('.hidden-xs a[href*="information.php/post"]'), 'Home notice parser should prefer the native desktop notice links.');
assert(parseHomeAnnouncementsSource.includes('uniqueBy('), 'Home notice parser should deduplicate hidden/mobile duplicates.');
assert(parseHomeAnnouncementsSource.includes('normalizeNotificationsUrl('), 'Home notice parser should normalize notice URLs consistently.');
assert(parseHomeAnnouncementsSource.includes("anchor.classList.contains('mark1')"), 'Home notice parser should preserve the native mark1 importance marker.');

const buildHomeViewSource = extractFunction(source, 'buildHomeView');
assert(buildHomeViewSource.includes('normalizeHomeAnnouncementItems(parseHomeAnnouncements(doc))'), 'Home view should normalize native homepage notice items during initial build.');
assert(buildHomeViewSource.includes('announcements: { loading: false, items: homeNotices }'), 'Home view should expose native homepage notice items without a loading spinner.');

const enrichHomeAsyncSource = extractFunction(source, 'enrichHomeAsync');
assert(!enrichHomeAsyncSource.includes('loadNotificationFeed('), 'Home enrich should not replace the homepage notice card with the notifications feed.');
assert(enrichHomeAsyncSource.includes('announcements: view.announcements'), 'Home enrich should preserve the existing homepage notice-card dataset.');

const buildNotificationsViewSource = extractFunction(source, 'buildNotificationsView');
assert(buildNotificationsViewSource.includes('return parseNotificationsList(doc);'), 'Standalone notifications route should still build from parseNotificationsList(doc).');

const renderNotificationsSource = extractFunction(source, 'renderNotifications');
assert(renderNotificationsSource.includes('お知らせ一覧'), 'Notifications renderer should still render the notifications-list page title.');
assert(renderNotificationsSource.includes('view.metaText'), 'Notifications renderer should still expose parsed information.php pagination metadata.');

const renderHomeSource = extractFunction(source, 'renderHome');
assert(!renderHomeSource.includes('お知らせを読み込み中…'), 'Home notice card should not show a loading spinner once it is sourced directly from the native home DOM.');
assert(renderHomeSource.includes('normalizeHomeAnnouncementItems(view.homeNotices)'), 'Home render should still support the home notice fallback path.');

const homePreviewTitles = [...homeFixture.matchAll(/href="\/webclass\/information\.php\/post\/[^"]+"[^>]*title="([^"]+)"/g)].map((match) => match[1]).filter(Boolean).filter((title, index, all) => all.indexOf(title) === index).slice(0, 5);
const notificationsTitles = [...notificationsFixture.matchAll(/href="\/webclass\/information\.php\/post\/[^"]+"[^>]*>([^<]+)</g)].map((match) => match[1].trim()).filter(Boolean).slice(0, 5);
assert(homeFixture.includes('管理者からのお知らせ'), 'Home fixture should still contain the native homepage notice block.');
assert(homeFixture.includes('最新5件'), 'Home fixture should still advertise the native homepage preview count.');
assert(notificationsFixture.includes('お知らせ一覧'), 'Notifications fixture should still represent the standalone notifications list.');
assert(notificationsFixture.includes('ページ 1 / 2'), 'Notifications fixture should still carry information.php pagination semantics.');
assert(/class=\"title mark1\"[^>]*title=\"【学生の皆さんへ】メールで質問する前に、必ず確認してください。\"/.test(homeFixture), 'Home fixture should still contain a native mark1 notice whose title should remain visually emphasized.');
assert(JSON.stringify(homePreviewTitles) !== JSON.stringify(notificationsTitles), 'Fixtures should prove that the native homepage preview and notifications list can diverge.');

assert(architectureDoc.includes('Homepage notice-card rendering stays on the current home DOM preview'), 'Architecture doc should record the homepage notice-card source contract.');
assert(architectureDoc.includes('The standalone notifications list route remains backed by `/webclass/information.php/`'), 'Architecture doc should preserve the notifications-list contract.');
assert(entrypointDoc.includes('prd-ku-lms-home-notice-card-parity.md'), 'AI docs entrypoint should include the homepage notice-card parity PRD.');
assert(entrypointDoc.includes('test-spec-ku-lms-home-notice-card-parity.md'), 'AI docs entrypoint should include the homepage notice-card parity test spec.');

const report = {
  ok: true,
  checks: [
    'home-notice-card-stays-native-dom-backed',
    'home-build-renders-notices-without-announcements-spinner',
    'home-enrich-does-not-fetch-or-overwrite-notice-card',
    'docs-index-home-notice-card-parity-contract',
    'fixtures-prove-home-preview-and-notifications-list-can-diverge'
  ],
  evidence: {
    homePreviewTitles,
    notificationsTitles
  }
};

writeArtifact('.omx/artifacts/home-notice-card-parity', 'verification-report.json', report);
console.log(JSON.stringify(report, null, 2));
