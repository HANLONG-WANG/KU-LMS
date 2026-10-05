import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

const read = file => fs.readFileSync(file, 'utf8');
const iconPath = 'assets/icons/icon128.png';
const iconUrl = `chrome-extension://fixture-extension/${iconPath}`;
const context = vm.createContext({
  chrome: { runtime: { getURL: path => `chrome-extension://fixture-extension/${path}` } },
  escapeAttr: String, escapeHtml: String, isActiveNav: () => false, getAvatarInitial: () => 'S'
});
vm.runInContext(read('src/content/render/shared.js') + '\n' + read('src/content/render/auth.js'), context);
const pages = [
  context.renderTopbar({ name: 'home' }, { links: { home: '/', courses: '/', notifications: '/', messages: '/', manual: '/', logout: '/' }, language: '日本語', userName: 'Student' }),
  context.renderLogin({ heading: '関大LMS', notices: { items: [] }, languages: [], support: {} }),
  context.renderLogout({ heading: 'ログアウト', actions: { loginHref: '/', loginLabel: 'ログイン', closeHref: '/', closeLabel: '閉じる' } })
];
for (const html of pages) {
  const { document } = parseHTML(`<html><body>${html}</body></html>`);
  const brand = document.querySelector('.ku-logo-mark');
  assert.equal(brand.querySelector('img')?.getAttribute('src'), iconUrl, 'every brand placement loads the extension artwork');
  assert.equal(brand.querySelector('svg'), null, 'the old wave mark must not remain');
  assert.equal(brand.querySelector('img').getAttribute('alt'), '', 'the adjacent brand text supplies the accessible name');
}
assert.match(context.icon('home'), /^<svg /, 'navigation icons retain their SVG rendering');
assert.equal(context.icon('unknown'), '');
const manifest = JSON.parse(read('manifest.json'));
const rule = manifest.web_accessible_resources?.find(entry => entry.resources.includes(iconPath));
assert.ok(rule, 'the artwork must be accessible from the LMS document');
for (const entry of manifest.content_scripts) {
  for (const match of entry.matches) {
    const origin = new URL(match).origin;
    assert.ok(rule.matches.includes(`${origin}/*`), `the brand resource is accessible on ${origin}`);
  }
}
assert.ok(fs.existsSync(iconPath));
console.log('PASS: header/login/logout share the extension artwork, navigation icons stay intact, and both LMS origins can load the image');
