import { readKulmsSource, extractFunction, assert } from './lib/content-source.mjs';

const source = readKulmsSource();
for (const name of ['renderPage', 'renderShell', 'renderLogin', 'renderLogout', 'renderHome', 'renderCourseMaterials', 'renderMyReports', 'renderNotifications', 'renderNotificationDetail', 'renderMessages', 'renderManual', 'hydrateRouteDom', 'hydrateLoginForm', 'bindInteractiveHandlers']) {
  assert(extractFunction(source, name).length > 0, `Render/hydrate function missing: ${name}`);
}
assert(source.includes('data-ku-login-native-form-host'), 'Login native form host contract should remain intact.');
assert(source.includes('data-action="refresh-upcoming"'), 'Home refresh action selector should remain intact.');
assert(source.includes('data-action="message-select"'), 'Message selection selector should remain intact.');
assert(source.includes('data-action="message-native-action"'), 'Mode-aware native message action selector should remain intact.');
assert(source.includes('data-syllabus-title'), 'Syllabus chip selector should remain intact.');
console.log(JSON.stringify({ ok: true, checks: ['render-cluster-present', 'hydrate-cluster-present', 'login-host-selector-preserved', 'interactive-selectors-preserved'] }, null, 2));
