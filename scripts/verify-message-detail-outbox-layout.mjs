import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { read, readKulmsSource, assert, writeArtifact } from './lib/content-source.mjs';

const source = readKulmsSource();
const architecture = read('docs/ku-lms-extension-architecture.md');
const designCode = read('docs/ku-lms-design-code.md');
const entrypoint = read('docs/AI_DOCS_ENTRYPOINT.md');
const prd = read('.omx/plans/prd-ku-lms-message-detail-outbox-layout.md');
const testSpec = read('.omx/plans/test-spec-ku-lms-message-detail-outbox-layout.md');
const fixtureManifest = JSON.parse(read('artifacts/fixtures/fixture-manifest.json'));

const checks = [];
const record = (name, fn) => { fn(); checks.push(name); };

function inspectFixture(relativePath, kind) {
  const script = String.raw`
import json, sys
from pathlib import Path
from bs4 import BeautifulSoup
root = Path(sys.argv[1])
rel = sys.argv[2]
kind = sys.argv[3]
raw = (root / rel).read_text()
try:
    html = json.loads(raw)
except Exception:
    html = raw
soup = BeautifulSoup(html, 'html.parser')
if kind == 'messages':
    form = soup.select_one('form[name="condition"]')
    header_cells = []
    for th in soup.select('#MsgListTable thead th'):
        header_cells.append({
          'label': th.get_text(' ', strip=True).replace('▲', '').replace('▼', '').strip(),
          'sortLinks': [{'text': a.get_text(' ', strip=True), 'href': a.get('href', '')} for a in th.select('a[href]')]
        })
    rows = []
    for tr in soup.select('#MsgListTable tr.odd, #MsgListTable tr.even'):
        row = []
        for td in tr.find_all('td', recursive=False):
            anchor = td.select_one('a[href]')
            checkbox = td.select_one('input[type="checkbox"]')
            row.append({
              'text': td.get_text(' ', strip=True),
              'href': anchor.get('href', '') if anchor else '',
              'checkboxName': checkbox.get('name', '') if checkbox else '',
              'checkboxValue': checkbox.get('value', '') if checkbox else ''
            })
        rows.append(row)
    data = {
      'heading': soup.select_one('.msg h3').get_text(' ', strip=True) if soup.select_one('.msg h3') else '',
      'warning': soup.select_one('.msg h3 + div').get_text(' ', strip=True) if soup.select_one('.msg h3 + div') else '',
      'actions': [{'name': node.get('name', ''), 'label': node.get('value', '').strip(), 'onclick': node.get('onclick', '')} for node in (form.select('input[type="submit"][name]') if form else [])],
      'headers': header_cells,
      'rows': rows,
      'folders': [{'title': a.get_text(' ', strip=True).replace('» ', ''), 'href': a.get('href', '')} for a in soup.select('.navi a')],
      'allAnchors': [{'text': a.get_text(' ', strip=True), 'href': a.get('href', '')} for a in soup.select('a[href]')],
      'pageText': next((node.get_text(' ', strip=True) for node in soup.select('font') if '/' in node.get_text(' ', strip=True)), ''),
      'formAction': form.get('action', '') if form else ''
    }
    print(json.dumps(data, ensure_ascii=False))
elif kind == 'message-detail':
    table = soup.select_one('#MessageData')
    metadata = []
    for tr in table.select('tr') if table else []:
        th = tr.select_one('th')
        td = tr.select_one('td')
        if not th or not td:
            continue
        classes = ' '.join(td.get('class', []))
        th_classes = ' '.join(th.get('class', []))
        if 'messageHead' in th_classes or 'MessageBody' in classes or 'messageBody' in classes or 'messageFoot' in classes:
            continue
        anchor = td.select_one('a[href]')
        metadata.append({
          'label': th.get_text(' ', strip=True),
          'text': td.get_text(' ', strip=True),
          'href': anchor.get('href', '') if anchor else ''
        })
    pager_items = []
    for li in soup.select('.pager li, .iterator li'):
        anchor = li.select_one('a[href]')
        pager_items.append({
          'text': li.get_text(' ', strip=True),
          'href': anchor.get('href', '') if anchor else ''
        })
    form = next((form for form in soup.select('form') if 'msg_viewer.php' in (form.get('action') or '')), None)
    forward_input = form.select_one('input[name="f_address"]') if form else None
    forward_button = form.select_one('input[type="submit"][name]') if form else None
    mode_label = next((node.get_text(' ', strip=True) for node in soup.select('.content font b, .content b') if '受信メッセージ' in node.get_text(' ', strip=True) or '送信メッセージ' in node.get_text(' ', strip=True)), '')
    active_folder = soup.select_one('.navi dd.active a')
    data = {
      'title': soup.title.get_text(' ', strip=True) if soup.title else '',
      'modeLabel': mode_label,
      'activeFolder': active_folder.get_text(' ', strip=True).replace('» ', '') if active_folder else '',
      'folders': [{'title': a.get_text(' ', strip=True).replace('» ', ''), 'href': a.get('href', '')} for a in soup.select('.navi a')],
      'pagerItems': pager_items,
      'closeHref': soup.select_one('a.uppernavi').get('href', '') if soup.select_one('a.uppernavi') else '',
      'forward': {
        'action': form.get('action', '') if form else '',
        'inputName': forward_input.get('name', '') if forward_input else '',
        'placeholder': forward_input.get('title', '') if forward_input else '',
        'buttonName': forward_button.get('name', '') if forward_button else '',
        'buttonLabel': forward_button.get('value', '').strip() if forward_button else ''
      } if form and forward_input and forward_button else None,
      'downloadHref': next((a.get('href', '') for a in soup.select('a[href]') if 'ダウンロード' in a.get_text(' ', strip=True)), ''),
      'replyHref': (table.select_one('td.messageFoot a[href]').get('href', '') if table and table.select_one('td.messageFoot a[href]') else ''),
      'metadata': metadata,
      'bodyHtml': (table.select_one('td.MessageBody') or table.select_one('td.messageBody')).decode_contents() if table and (table.select_one('td.MessageBody') or table.select_one('td.messageBody')) else '',
    }
    print(json.dumps(data, ensure_ascii=False))
else:
    raise SystemExit('unknown kind')
`;
  return JSON.parse(execFileSync('python', ['-c', script, process.cwd(), relativePath, kind], { encoding: 'utf8' }));
}

class StubNode {
  constructor({ text = '', attrs = {}, innerHTML = '', single = {}, many = {}, children = [] } = {}) {
    this._text = text;
    this.attrs = attrs;
    this.innerHTML = innerHTML;
    this.single = single;
    this.many = many;
    this.children = children;
    Object.entries(attrs).forEach(([key, value]) => { this[key] = value; });
  }
  get textContent() { return this._text; }
  querySelector(selector) { return this.single[selector] || null; }
  querySelectorAll(selector) { return this.many[selector] || []; }
  getAttribute(name) { return this.attrs[name] || ''; }
}

function createAnchor(link) {
  return new StubNode({ text: link.text || '', attrs: { href: link.href || '', title: link.title || '' } });
}

function createMessagesDoc(data) {
  const folderAnchors = data.folders.map((item) => createAnchor({ text: item.title, href: item.href }));
  const headerNodes = data.headers.map((header) => new StubNode({
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

function createMessageDetailDoc(data) {
  const folderAnchors = data.folders.map((item) => createAnchor({ text: item.title, href: item.href }));
  const activeFolder = folderAnchors.find((item) => item.textContent.includes(data.activeFolder || '')) || null;
  const pagerItems = (data.pagerItems || []).map((item) => new StubNode({
    text: item.text,
    single: { 'a[href]': item.href ? createAnchor(item) : null }
  }));
  const metadataRows = (data.metadata || []).map((item) => {
    const cell = new StubNode({
      text: item.text,
      attrs: { class: '' },
      single: { 'a[href]': item.href ? createAnchor({ text: item.text, href: item.href }) : null }
    });
    return new StubNode({
      single: {
        'th': new StubNode({ text: item.label, attrs: { class: '' } }),
        'td': cell
      }
    });
  });
  const bodyText = String(data.bodyHtml || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ');
  const bodyCell = new StubNode({ text: bodyText, innerHTML: data.bodyHtml || '', attrs: { class: 'messageBody' } });
  const footerReply = data.replyHref ? createAnchor({ text: '返事を書く', href: data.replyHref }) : null;
  const footCell = new StubNode({ text: '返事を書く', attrs: { class: 'messageFoot' }, single: { 'a[href]': footerReply } });
  const table = new StubNode({
    single: {
      'td.MessageBody': bodyCell,
      'td.messageBody': bodyCell,
      'td.messageFoot': footCell
    },
    many: {
      'tr': metadataRows
    }
  });
  const form = data.forward ? new StubNode({
    attrs: { action: data.forward.action || '' },
    single: {
      'input[name="f_address"]': new StubNode({ attrs: { name: data.forward.inputName || 'f_address', title: data.forward.placeholder || 'メールアドレス' } }),
      'input[type="submit"][name]': new StubNode({ attrs: { name: data.forward.buttonName || 'do_forward' }, text: data.forward.buttonLabel || 'メールへ転送' })
    }
  }) : null;
  const extraAnchors = [
    data.closeHref ? createAnchor({ text: '» このウィンドウを閉じる', href: data.closeHref }) : null,
    data.downloadHref ? createAnchor({ text: '» ダウンロード', href: data.downloadHref }) : null,
    footerReply
  ].filter(Boolean);
  return {
    title: data.title || '',
    querySelector(selector) {
      return {
        '.navi dd.active a': activeFolder,
        '#MessageData': table,
        'a.uppernavi[href]': extraAnchors[0] || null
      }[selector] || null;
    },
    querySelectorAll(selector) {
      if (selector === '.navi a') return folderAnchors;
      if (selector === '.pager li, .iterator li') return pagerItems;
      if (selector === '.content font b, .content b') return [new StubNode({ text: data.modeLabel || '' })];
      if (selector === 'form') return form ? [form] : [];
      if (selector === 'a[href]') return folderAnchors.concat(extraAnchors);
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
    setTimeout,
    clearTimeout,
    window: { location: { origin: 'https://kulms.tl.kansai-u.ac.jp', pathname: '/webclass/msg_viewer.php', href: 'https://kulms.tl.kansai-u.ac.jp/webclass/msg_viewer.php?uomsgid=fixture' }, alert() {} },
    document: { documentElement: { dataset: {} } },
    chrome: { runtime: { lastError: null, sendMessage() {} } }
  };
  context.location = context.window.location;
  vm.createContext(context);
  vm.runInContext(sourceWithoutEntrypoint, context);
  return context;
}

const inboxList = inspectFixture('artifacts/fixtures/messages-inbox.network-response', 'messages');
const outboxList = inspectFixture('artifacts/fixtures/messages-outbox.json', 'messages');
const recycleboxList = inspectFixture('artifacts/fixtures/messages-recyclebox.json', 'messages');
const inboxDetail = inspectFixture('artifacts/fixtures/messages-detail-inbox.json', 'message-detail');
const outboxDetail = inspectFixture('artifacts/fixtures/messages-detail-outbox.json', 'message-detail');

record('route support includes message detail', () => {
  const runtime = createRuntime();
  const detailRoute = runtime.detectRoute({ pathname: '/webclass/msg_viewer.php', search: '?uomsgid=abc' });
  assert(detailRoute.name === 'messages-detail' && detailRoute.supported, 'Message detail route detection failed.');
});

record('absoluteUrl normalizes message-relative php links under /webclass', () => {
  const runtime = createRuntime();
  assert(runtime.absoluteUrl('msg_editor.php?msgappmode=inbox&acs_=abc') === 'https://kulms.tl.kansai-u.ac.jp/webclass/msg_editor.php?msgappmode=inbox&acs_=abc', 'absoluteUrl should normalize relative message editor links under /webclass.');
  assert(runtime.absoluteUrl('msg_viewer.php?uomsgid=abc') === 'https://kulms.tl.kansai-u.ac.jp/webclass/msg_viewer.php?uomsgid=abc', 'absoluteUrl should normalize relative message detail links under /webclass.');
  assert(runtime.absoluteUrl('/webclass/msg_down.php?msg=1') === 'https://kulms.tl.kansai-u.ac.jp/webclass/msg_down.php?msg=1', 'absoluteUrl should preserve rooted download links.');
});

record('message detail parser detects inbox mode and actions', () => {
  const runtime = createRuntime();
  const view = runtime.parseMessageDetail(createMessageDetailDoc(inboxDetail));
  assert(view.kind === 'detail', 'Inbox detail should parse as detail.');
  assert(view.folder === 'inbox', 'Inbox detail folder detection failed.');
  assert(view.modeLabel.includes('受信メッセージ'), 'Inbox detail mode label missing.');
  assert(view.metadata.some((item) => item.key === 'subject'), 'Inbox detail subject missing.');
  assert(view.headline.includes('レポートを受け取りました'), 'Inbox detail headline missing.');
  assert(view.metadata.some((item) => item.key === 'sender'), 'Inbox detail sender missing.');
  assert(view.downloadHref.includes('msg_down.php'), 'Inbox detail download action missing.');
  assert(view.replyHref.includes('returnmsgid='), 'Inbox detail reply action missing.');
  assert(view.forward?.buttonName === 'do_forward', 'Inbox detail forward form missing.');
});

record('message detail parser detects outbox mode and actions', () => {
  const runtime = createRuntime();
  const view = runtime.parseMessageDetail(createMessageDetailDoc(outboxDetail));
  assert(view.kind === 'detail', 'Outbox detail should parse as detail.');
  assert(view.folder === 'outbox', 'Outbox detail folder detection failed.');
  assert(view.modeLabel.includes('送信メッセージ'), 'Outbox detail mode label missing.');
  assert(view.folderHref.includes('msgappmode=outbox'), 'Outbox detail folder link missing.');
});

record('message detail renderer preserves metadata and native actions', () => {
  const runtime = createRuntime();
  const view = runtime.parseMessageDetail(createMessageDetailDoc(inboxDetail));
  runtime.state.currentView = view;
  runtime.state.currentRoute = { name: 'messages-detail' };
  runtime.state.currentContext = { links: { messages: '/webclass/msg_editor.php?msgappmode=inbox', notifications: '/webclass/information.php/', manual: '/webclass/user.php/manual', home: '/webclass/', courses: '/webclass/', logout: '/webclass/logout.php' }, language: '日本語', userName: 'レビュー' };
  const html = runtime.renderMessages(view);
  assert(html.includes('メッセージ詳細'), 'Message detail render missing page title.');
  assert(html.includes('受信メッセージ'), 'Message detail render missing mode cue.');
  assert(html.includes('レポートを受け取りました'), 'Message detail render missing corrected headline.');
  assert(html.includes('ダウンロード') && html.includes('返事を書く'), 'Message detail render missing native action links.');
  assert(html.includes('メッセージ本文と関連メタデータを確認できます。') || html.includes('言語学'), 'Message detail render missing supporting structure.');
});

record('outbox renderer uses ledger layout markers and preserves scan fields', () => {
  const runtime = createRuntime();
  const view = runtime.parseMessagesTable(createMessagesDoc(outboxList), 'messages-outbox');
  runtime.state.currentView = view;
  runtime.state.currentRoute = { name: 'messages-outbox' };
  runtime.state.currentContext = { links: { messages: '/webclass/msg_editor.php?msgappmode=inbox', notifications: '/webclass/information.php/', manual: '/webclass/user.php/manual', home: '/webclass/', courses: '/webclass/', logout: '/webclass/logout.php' }, language: '日本語', userName: 'レビュー' };
  const html = runtime.renderMessages(view);
  assert(view.columns.map((item) => item.key).join(',') === 'select,recipient,subject,attachments,date', 'Outbox list columns parsed incorrectly.');
  assert(html.includes('data-message-layout="outbox-ledger"'), 'Outbox ledger layout marker missing.');
  assert(html.includes('ku-message-date-stack'), 'Outbox date stack marker missing.');
  assert(html.includes('ku-message-subject-link'), 'Outbox subject emphasis marker missing.');
  assert(html.includes('宛先') && html.includes('件名') && html.includes('添付ファイル') && html.includes('日付'), 'Outbox render lost truthful headers.');
});

record('existing inbox and recyclebox contracts still parse', () => {
  const runtime = createRuntime();
  const inboxView = runtime.parseMessagesTable(createMessagesDoc(inboxList), 'messages-inbox');
  const recycleView = runtime.parseMessagesTable(createMessagesDoc(recycleboxList), 'messages-recyclebox');
  assert(inboxView.folder === 'inbox', 'Inbox list folder parse regressed.');
  assert(recycleView.folder === 'recyclebox', 'Recyclebox list folder parse regressed.');
  assert(recycleView.actions.map((item) => item.name).join(',') === 'RETURN_SELECTED,COMFIRM_SELECTED,UNSET_UNREADFLAG,downloadmsg', 'Recyclebox actions regressed.');
});

record('durable docs and fixtures cover message detail phase', () => {
  const routes = new Set(fixtureManifest.routes.map((item) => item.route));
  for (const route of ['messages-detail-inbox', 'messages-detail-outbox', 'messages-outbox']) {
    assert(routes.has(route), `Fixture manifest missing route: ${route}`);
  }
  assert(architecture.includes('/webclass/msg_viewer.php'), 'Architecture doc missing message detail route.');
  assert(architecture.includes('infer folder context from the page content rather than the URL alone'), 'Architecture doc missing folder-authority contract.');
  assert(architecture.includes('Bare relative KU-LMS PHP links'), 'Architecture doc missing relative-PHP normalization note.');
  assert(designCode.includes('Messages detail page'), 'Design code missing message detail surface.');
  assert(entrypoint.includes('.omx/plans/prd-ku-lms-message-detail-outbox-layout.md'), 'AI docs entrypoint missing message-detail PRD.');
  assert(entrypoint.includes('.omx/plans/test-spec-ku-lms-message-detail-outbox-layout.md'), 'AI docs entrypoint missing message-detail test spec.');
  assert(prd.includes('Message Detail + Sent Box Layout Refresh'), 'New PRD title/content missing.');
  assert(prd.includes('authoritative subtype'), 'PRD missing detail subtype authority contract.');
  assert(prd.includes('first meaningful body line'), 'PRD missing headline heuristic contract.');
  assert(testSpec.includes('Message Detail + Sent Box Layout Refresh'), 'New test spec title/content missing.');
  assert(testSpec.includes('authoritative subtype'), 'Test spec missing subtype authority coverage.');
  assert(testSpec.includes('first meaningful body line'), 'Test spec missing headline heuristic coverage.');
});

const report = { ok: true, checks };
writeArtifact('.omx/artifacts/message-detail-outbox-layout-refresh', 'verification-report.json', report);
console.log(JSON.stringify(report, null, 2));
