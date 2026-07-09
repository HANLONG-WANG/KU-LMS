import { read, readJson, getKulmsScript, getSyllabusScript, assert, extractFunction } from './lib/content-source.mjs';

const manifest = readJson('manifest.json');
const kulms = getKulmsScript();
const syllabus = getSyllabusScript();
const settingsSource = read('src/shared/settings.js');
const bootKulms = read('src/content/runtime/boot-kulms.js');
const bootSyllabus = read('src/content/runtime/boot-syllabus.js');
const hydrateAuth = read('src/content/hydrate/auth.js');
const popupHtml = read('src/popup/popup.html');
const popupJs = read('src/popup/popup.js');

const checks = [];
const record = (name, fn) => { fn(); checks.push(name); };

record('manifest exposes popup and storage permission', () => {
  assert(manifest.permissions?.includes('storage'), 'manifest must request storage permission.');
  assert(manifest.action?.default_popup === 'src/popup/popup.html', 'manifest action popup is missing.');
});

record('shared settings load before content runtime', () => {
  assert(kulms.js[0] === 'src/shared/settings.js', 'KU-LMS settings helper must load first.');
  assert(syllabus.js[0] === 'src/shared/settings.js', 'Syllabus settings helper must load first.');
});

record('settings use chrome.storage.local only', () => {
  assert(settingsSource.includes("var KU_LMS_SETTINGS_STORAGE_KEY = 'kuLmsSettingsV1';"), 'settings key changed unexpectedly.');
  assert(settingsSource.includes('chrome.storage.local.get'), 'settings read must use chrome.storage.local.');
  assert(settingsSource.includes('chrome.storage.local.set'), 'settings write must use chrome.storage.local.');
  assert(!settingsSource.includes('chrome.storage.sync'), 'credentials must not be synced through chrome.storage.sync.');
});

record('KU-LMS boot honors enabled setting', () => {
  const fn = extractFunction(bootKulms, 'bootKulms');
  assert(fn.includes('await kuReadExtensionSettings()'), 'bootKulms must read extension settings before booting.');
  assert(fn.includes('!state.extensionSettings.enabled'), 'bootKulms must check enabled=false.');
  assert(fn.includes('releaseNative();'), 'bootKulms must release native page when disabled.');
});

record('Syllabus boot honors enabled setting', () => {
  const fn = extractFunction(bootSyllabus, 'bootSyllabus');
  assert(fn.includes('await kuReadExtensionSettings()'), 'bootSyllabus must read extension settings before booting.');
  assert(fn.includes('releaseSyllabusDetailRedesign();'), 'bootSyllabus must release detail redesign when disabled.');
  assert(fn.includes('clearSyllabusAssistOverlay();'), 'bootSyllabus must clear assist overlay when disabled.');
});

record('login hydrate fills and submits with loop guard', () => {
  assert(hydrateAuth.includes('fillAndMaybeSubmitLoginForm(nativeForm);'), 'login hydrate must invoke auto-login.');
  assert(hydrateAuth.includes('input[name="username"]'), 'auto-login must target username input.');
  assert(hydrateAuth.includes('input[name="val"]'), 'auto-login must target KU-LMS password field.');
  assert(hydrateAuth.includes('parseLoginAlert(document, form)'), 'auto-login must avoid submitting on login error pages.');
  assert(hydrateAuth.includes('KU_LMS_AUTO_LOGIN_ATTEMPTED_V1'), 'auto-login must use a session loop guard.');
  assert(hydrateAuth.includes('if (!markAutoLoginAttempted()) return;'), 'auto-login must fail closed if loop guard cannot be written.');
  assert(hydrateAuth.includes('form.requestSubmit'), 'auto-login should prefer requestSubmit for native behavior.');
});

record('popup persists settings without inline script', () => {
  assert(popupHtml.includes('id="enabled"'), 'popup enabled control is missing.');
  assert(popupHtml.includes('id="username"'), 'popup username control is missing.');
  assert(popupHtml.includes('id="password"'), 'popup password control is missing.');
  assert(popupHtml.includes('../shared/settings.js'), 'popup must use shared settings helper.');
  assert(!/<script(?![^>]+src=)/i.test(popupHtml), 'popup must not use inline script.');
  assert(popupJs.includes('kuWriteExtensionSettings'), 'popup must persist settings.');
});

console.log(JSON.stringify({ ok: true, checks }, null, 2));
