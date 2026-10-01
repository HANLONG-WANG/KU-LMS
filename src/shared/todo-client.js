/* Shared popup/content client. Storage is written only through the service worker. */
var KuTodoClient = {
  KEY: 'kuLmsTodosV1',
  uuid() { return globalThis.crypto.randomUUID(); },
  courseKey(href) {
    try {
      const url = new URL(href, 'https://kulms.tl.kansai-u.ac.jp');
      const match = url.pathname.match(/^\/webclass\/course\.php\/([a-zA-Z0-9_-]+)(?:\/|$)/);
      return url.origin === 'https://kulms.tl.kansai-u.ac.jp' && match ? `${url.origin}/webclass/course.php/${match[1]}/` : '';
    } catch (_) { return ''; }
  },
  request(action, payload = {}) {
    return new Promise((resolve, reject) => {
      try {
        if (!globalThis.chrome?.runtime?.sendMessage) throw new Error('TODO 不可用，请重新加载扩展与页面。');
        chrome.runtime.sendMessage({ ...payload, type: 'ku:todo', action }, result => {
          if (chrome.runtime.lastError || !result) { reject(new Error('无法连接 TODO。请重新打开页面；未确认保存的输入请先复制。')); return; }
          if (!result.ok) { const e = new Error(result.error); e.code = result.code; reject(e); return; }
          resolve(result.data);
        });
      } catch (error) { reject(error); }
    });
  },
  subscribe(callback) {
    const listener = (changes, area) => { if (area === 'local' && changes[KuTodoClient.KEY]) callback(); };
    chrome.storage?.onChanged?.addListener(listener);
    return () => chrome.storage?.onChanged?.removeListener(listener);
  }
};
