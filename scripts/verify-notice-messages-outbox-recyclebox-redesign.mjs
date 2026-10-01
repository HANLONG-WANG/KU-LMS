import vm from 'node:vm';
import { inspectFixture as inspectLocalFixture } from './lib/fixture-dom.mjs';
import { read, readKulmsSource, assert, writeArtifact } from './lib/content-source.mjs';

const source = readKulmsSource();
const css = read('src/content/critical.css');
const architecture = read('docs/ku-lms-extension-architecture.md');
const designCode = read('docs/ku-lms-design-code.md');
const entrypoint = read('docs/AI_DOCS_ENTRYPOINT.md');
const fixtureManifest = JSON.parse(read('artifacts/fixtures/fixture-manifest.json'));

const checks = [];
const record = (name, fn) => { fn(); checks.push(name); };

function inspectFixture(relativePath, kind) { return inspectLocalFixture(relativePath, kind); }

class StubNode {
  constructor({ text = '', attrs = {}, innerHTML = '', single = {}, many = {}, children = [] } = {}) {
    this._text = text;
    this.attrs = attrs;
    Object.entries(attrs).forEach(([key, value]) => { this[key] = value; });
    this.innerHTML = innerHTML;
    this.single = single;
    this.many = many;
    this.children = children;
  }
  get textContent() { return this._text; }
  querySelector(selector) { return this.single[selector] || null; }
  querySelectorAll(selector) { return this.many[selector] || []; }
  getAttribute(name) { return this.attrs[name] || ''; }
}

function createAnchor(link) {
  return new StubNode({ text: link.text || '', attrs: { href: link.href || '', title: link.title || '' } });
}

function createNoticeDoc(data) {
  const authorLink = data.authorLabel ? new StubNode({ text: data.authorLabel, attrs: { href: data.authorHref || '' } }) : null;
  const postByNodes = [data.issuer, data.publishedAt].filter(Boolean).map((text, index) => new StubNode({ text, single: index === 1 && authorLink ? { 'a[href]': authorLink } : {} }));
  const audienceNode = data.audience ? new StubNode({ text: data.audience }) : null;
  const detailHead = new StubNode({
    single: {
      'h4': new StubNode({ text: data.title }),
      '.closedAt': data.deadline ? new StubNode({ text: data.deadline }) : null,
      '.postBy a[href]': authorLink
    },
    many: {
      '.postBy': postByNodes,
      '.data > div': audienceNode ? [audienceNode] : []
    }
  });
  const bodyNode = data.bodyHtml ? new StubNode({ innerHTML: data.bodyHtml.replace(/^<div class="info-detail-body">|<\/div>$/g, ''), text: 'body' }) : null;
  const navAnchors = data.navLinks.map(createAnchor);
  return {
    forms: {},
    querySelector(selector) {
      return {
        '.autoreportmsg td': data.errorMessage ? new StubNode({ text: data.errorMessage }) : null,
        '.info-detail-head': data.title || data.issuer || data.publishedAt ? detailHead : null,
        '.infopkg h4': data.title ? new StubNode({ text: data.title }) : null,
        '.info-detail-body': bodyNode,
        '.infopkg h3': data.pageTitle ? new StubNode({ text: data.pageTitle }) : null
      }[selector] || null;
    },
    querySelectorAll(selector) {
      if (selector === '.pager a, .iterator a') return navAnchors;
      if (selector === 'a') return navAnchors.concat(authorLink ? [authorLink] : []);
      return [];
    }
  };
}

function createMessagesDoc(data) {
  const folderAnchors = data.folders.map((item) => createAnchor({ text: item.title, href: item.href }));
  const headerNodes = data.headers.map((header, index) => new StubNode({
    text: header.label,
    many: { 'a[href]': (header.sortLinks || []).map(createAnchor) }
  }));
  const rowNodes = data.rows.map((row) => new StubNode({
    children: row.map((cell, index) => new StubNode({
      text: cell.text,
      single: {
        'input[type="checkbox"]': index === 0 && cell.checkboxName ? new StubNode({ attrs: { name: cell.checkboxName, value: cell.checkboxValue || '' } }) : null,
        'a[href]': cell.href ? new StubNode({ text: cell.text, attrs: { href: cell.href } }) : null
      }
    }))
  }));
  const allAnchors = data.allAnchors.map(createAnchor);
  const form = new StubNode({
    attrs: { action: data.formAction || '' },
    many: {
      'input[type="submit"][name]': (data.actions || []).map((action) => new StubNode({ attrs: { name: action.name, onclick: action.onclick || '' }, text: action.label }))
    }
  });
  return {
    forms: { condition: form },
    querySelector(selector) {
      return {
        '#MsgListTable': new StubNode({
          many: {
            'tr.odd, tr.even': rowNodes,
            'thead th': headerNodes
          }
        }),
        '.msg h3 + div': data.warning ? new StubNode({ text: data.warning }) : null,
        '.msg h3': data.heading ? new StubNode({ text: data.heading }) : null,
        'h3': data.heading ? new StubNode({ text: data.heading }) : null
      }[selector] || null;
    },
    querySelectorAll(selector) {
      if (selector === '.navi a') return folderAnchors;
      if (selector === 'a') return allAnchors;
      if (selector === 'font') return data.pageText ? [new StubNode({ text: data.pageText })] : [];
      return [];
    }
  };
}

function createRuntime() {
  const sourceWithoutEntrypoint = source.replace(/\/\* FILE: src\/content\/main\.js \*\/[\s\S]*$/m, '');
  const context = {
    console,
    URL,
    URLSearchParams,
    AbortController,
    setTimeout,
    clearTimeout,
    window: { location: { origin: 'https://kulms.tl.kansai-u.ac.jp', pathname: '/webclass/' }, alert() {} },
    document: { documentElement: { dataset: {} } },
    chrome: { runtime: { lastError: null, sendMessage() {} } }
  };
  context.location = context.window.location;
  vm.createContext(context);
  vm.runInContext(sourceWithoutEntrypoint, context);
  return context;
}

const noticeValid = inspectFixture('artifacts/fixtures/notifications-detail-valid.json', 'notice');
const noticeMissing = inspectFixture('artifacts/fixtures/notifications-detail-missing.json', 'notice');
const outbox = inspectFixture('artifacts/fixtures/messages-outbox.json', 'messages');
const recyclebox = inspectFixture('artifacts/fixtures/messages-recyclebox.json', 'messages');

record('route support includes notice detail, outbox, recyclebox', () => {
  const runtime = createRuntime();
  const detailRoute = runtime.detectRoute({ pathname: '/webclass/information.php/post/69849/', search: '' });
  const outboxRoute = runtime.detectRoute({ pathname: '/webclass/msg_editor.php', search: '?msgappmode=outbox' });
  const recycleRoute = runtime.detectRoute({ pathname: '/webclass/msg_editor.php', search: '?msgappmode=recyclebox' });
  assert(detailRoute.name === 'notifications-detail' && detailRoute.supported, 'Detail route detection failed.');
  assert(outboxRoute.name === 'messages-outbox' && outboxRoute.supported, 'Outbox route detection failed.');
  assert(recycleRoute.name === 'messages-recyclebox' && recycleRoute.supported, 'Recyclebox route detection failed.');
});

record('notice detail parser and renderer behave on valid fixture', () => {
  const runtime = createRuntime();
  const view = runtime.parseNotificationDetail(createNoticeDoc(noticeValid));
  runtime.state.currentView = view;
  runtime.state.currentRoute = { name: 'notifications-detail' };
  runtime.state.currentContext = { links: { messages: '/webclass/msg_editor.php?msgappmode=inbox', notifications: '/webclass/information.php/', manual: '/webclass/user.php/manual', home: '/webclass/', courses: '/webclass/', logout: '/webclass/logout.php' }, language: '日本語', userName: 'レビュー' };
  const html = runtime.renderNotificationDetail(view);
  assert(view.kind === 'detail', 'Valid notice fixture should parse as detail.');
  assert(view.title.includes('関大LMSから授業動画が見られない時は'), 'Notice title missing from parsed view.');
  assert(view.metadata.deadline.includes('公開期限'), 'Notice deadline missing from parsed view.');
  assert(html.includes('お知らせ詳細') && html.includes('一覧に戻る'), 'Notice detail render missing navigation/UI contract.');
  assert(html.includes('発行元') && html.includes('発行日'), 'Notice detail render missing metadata labels.');
});

record('notice detail parser and renderer behave on missing/error fixture', () => {
  const runtime = createRuntime();
  const view = runtime.parseNotificationDetail(createNoticeDoc(noticeMissing));
  runtime.state.currentView = view;
  runtime.state.currentRoute = { name: 'notifications-detail' };
  runtime.state.currentContext = { links: { messages: '/webclass/msg_editor.php?msgappmode=inbox', notifications: '/webclass/information.php/', manual: '/webclass/user.php/manual', home: '/webclass/', courses: '/webclass/', logout: '/webclass/logout.php' }, language: '日本語', userName: 'レビュー' };
  const html = runtime.renderNotificationDetail(view);
  assert(view.kind === 'error', 'Missing notice fixture should parse as error.');
  assert(view.errorMessage.includes('見つかりませんでした'), 'Error message missing from parsed error view.');
  assert(html.includes('表示エラー') && html.includes('見つかりませんでした'), 'Error render missing degraded-state contract.');
});

record('outbox parser and renderer preserve mode-specific columns and actions', () => {
  const runtime = createRuntime();
  const view = runtime.parseMessagesTable(createMessagesDoc(outbox), 'messages-outbox');
  runtime.state.currentView = view;
  runtime.state.currentRoute = { name: 'messages-outbox' };
  runtime.state.currentContext = { links: { messages: '/webclass/msg_editor.php?msgappmode=inbox', notifications: '/webclass/information.php/', manual: '/webclass/user.php/manual', home: '/webclass/', courses: '/webclass/', logout: '/webclass/logout.php' }, language: '日本語', userName: 'レビュー' };
  const html = runtime.renderMessages(view);
  assert(view.folder === 'outbox', 'Outbox folder parse failed.');
  assert(view.selectionScope === 'messages-outbox', 'Outbox selection scope is not explicit.');
  assert(view.columns.map((item) => item.key).join(',') === 'select,recipient,subject,attachments,date', 'Outbox columns parsed incorrectly.');
  assert(view.actions.map((item) => item.name).join(',') === 'COMFIRM_SELECTED,downloadmsg', 'Outbox actions parsed incorrectly.');
  assert(html.includes('送信済箱') && html.includes('ダウンロード') && html.includes('宛先'), 'Outbox render missing mode-specific UI.');
});

record('recyclebox parser and renderer preserve warning, actions, and columns', () => {
  const runtime = createRuntime();
  const view = runtime.parseMessagesTable(createMessagesDoc(recyclebox), 'messages-recyclebox');
  runtime.state.currentView = view;
  runtime.state.currentRoute = { name: 'messages-recyclebox' };
  runtime.state.currentContext = { links: { messages: '/webclass/msg_editor.php?msgappmode=inbox', notifications: '/webclass/information.php/', manual: '/webclass/user.php/manual', home: '/webclass/', courses: '/webclass/', logout: '/webclass/logout.php' }, language: '日本語', userName: 'レビュー' };
  const html = runtime.renderMessages(view);
  assert(view.folder === 'recyclebox', 'Recyclebox folder parse failed.');
  assert(view.columns.map((item) => item.key).join(',') === 'select,sender,userId,recipient,subject,attachments,date', 'Recyclebox columns parsed incorrectly.');
  assert(view.actions.map((item) => item.name).join(',') === 'RETURN_SELECTED,COMFIRM_SELECTED,UNSET_UNREADFLAG,downloadmsg', 'Recyclebox actions parsed incorrectly.');
  assert(html.includes('ここでさらに削除したメッセージは、復元できなくなります。'), 'Recyclebox warning missing from render.');
  assert(html.includes('元に戻す') && html.includes('既読にする'), 'Recyclebox render missing native actions.');
});

record('message grid layout is derived per parsed column order', () => {
  const runtime = createRuntime();
  const outboxView = runtime.parseMessagesTable(createMessagesDoc(outbox), 'messages-outbox');
  const recycleView = runtime.parseMessagesTable(createMessagesDoc(recyclebox), 'messages-recyclebox');
  const outboxGrid = runtime.messageGridTemplate(outboxView.columns);
  const recycleGrid = runtime.messageGridTemplate(recycleView.columns);
  assert(outboxGrid.split(' ').length === outboxView.columns.length, 'Outbox grid tracks do not match parsed column count.');
  assert(recycleGrid.split(' ').length === recycleView.columns.length, 'Recyclebox grid tracks do not match parsed column count.');
});

record('durable docs and fixtures cover the expanded communication routes', () => {
  const routes = new Set(fixtureManifest.routes.map((item) => item.route));
  for (const route of ['notifications-detail', 'messages-outbox', 'messages-recyclebox']) {
    assert(routes.has(route), `Fixture manifest missing route: ${route}`);
  }
  assert(routes.has('notifications-detail-missing'), 'Fixture manifest missing invalid notice-detail route.');
  for (const token of [
    '/webclass/information.php/post/:noticeId',
    '/webclass/msg_editor.php?msgappmode=outbox',
    '/webclass/msg_editor.php?msgappmode=recyclebox'
  ]) {
    assert(architecture.includes(token), `Architecture doc missing token: ${token}`);
  }
  for (const token of ['Notice detail page', 'Messages sent box page', 'Messages recycle box page', 'Communication-route guidance']) {
    assert(designCode.includes(token), `Design code missing token: ${token}`);
  }
  for (const token of ['docs/ku-lms-design-code.md', 'docs/ku-lms-extension-architecture.md']) {
    assert(entrypoint.includes(token), `AI docs entrypoint missing token: ${token}`);
  }
  assert(designCode.includes('folder semantics') && designCode.includes('Recycle box warning copy must be clearly visible'), 'Versioned design contract should preserve folder-specific semantics and warning prominence.');
});

const report = { ok: true, checks };
writeArtifact('.omx/artifacts/notice-messages-outbox-recyclebox-redesign', 'verification-report.json', report);
console.log(JSON.stringify(report, null, 2));
