(async () => {
  document.getElementById('current-id').textContent = chrome.runtime.id;
  document.getElementById('configured').textContent = chrome.runtime.getManifest().oauth2?.client_id ? 'OAuth 已配置，可以返回扩展连接账号' : '尚未应用 OAuth Client ID';
  try {
    const response = await fetch(chrome.runtime.getURL('config/google-sync.json'));
    if (!response.ok) throw Error('missing config');
    const config = await response.json();
    document.getElementById('extension-id').textContent = config.extensionId;
  } catch (_) { document.getElementById('extension-id').textContent = '请先在项目目录运行 node scripts/configure-google-sync.mjs --prepare'; }
})();
