/* src/content/runtime/routes.js */

function detectRoute(locationObj) {
    const pathname = locationObj.pathname;
    const query = new URLSearchParams(locationObj.search);
    const normalized = pathname.replace(/\/$/, '');
    if (normalized === '/webclass') return { supported: true, name: 'home' };
    if (normalized === '/webclass/index.php') return { supported: true, name: 'home' };
    if (normalized === '/webclass/login.php') return { supported: true, name: 'login' };
    if (normalized === '/webclass/logout.php') return { supported: true, name: 'logout' };
    if (/\/webclass\/course\.php\/[^/]+\/my-reports$/.test(normalized)) return { supported: true, name: 'course-myreports' };
    if (/\/webclass\/course\.php\/[^/]+(?:\/login)?$/.test(normalized)) return { supported: true, name: 'course-materials' };
    if (normalized === '/webclass/information.php' || normalized === '/webclass/information.php/mbl') return { supported: true, name: 'notifications' };
    if (/\/webclass\/information\.php(?:\/mbl)?\/post\/[^/]+$/.test(normalized)) return { supported: true, name: 'notifications-detail' };
    if (normalized === '/webclass/msg_editor.php' && query.get('msgappmode') === 'inbox') return { supported: true, name: 'messages-inbox' };
    if (normalized === '/webclass/msg_editor.php' && query.get('msgappmode') === 'outbox') return { supported: true, name: 'messages-outbox' };
    if (normalized === '/webclass/msg_editor.php' && query.get('msgappmode') === 'recyclebox') return { supported: true, name: 'messages-recyclebox' };
    if (normalized === '/webclass/user.php/manual') return { supported: true, name: 'manual' };
    return { supported: false, name: 'unsupported' };
  }

function routeLabel(name) {
    return ({
      login: 'ログイン',
      logout: 'ログアウト',
      home: 'ホーム',
      'course-materials': '教材',
      'course-myreports': 'マイレポート',
      notifications: 'お知らせ',
      'notifications-detail': 'お知らせ',
      'messages-inbox': 'メッセージ',
      'messages-outbox': '送信済箱',
      'messages-recyclebox': 'ゴミ箱',
      manual: 'マニュアル'
    })[name] || 'ページ';
  }

function isActiveNav(routeName, itemKey) {
    if (routeName === 'course-materials' || routeName === 'course-myreports') return itemKey === 'courses';
    if (routeName === 'manual') return itemKey === 'manual';
    if (routeName === 'notifications-detail') return itemKey === 'notifications';
    if (routeName === 'messages-outbox' || routeName === 'messages-recyclebox') return itemKey === 'messages-inbox';
    return routeName === itemKey;
  }
