import { existsSync } from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { read, readKulmsSource, assert, writeArtifact } from './lib/content-source.mjs';

const source = readKulmsSource();
const css = read('src/content/critical.css');
const architecture = read('docs/ku-lms-extension-architecture.md');
const designCode = read('docs/ku-lms-design-code.md');
const entrypoint = read('docs/AI_DOCS_ENTRYPOINT.md');
const prd = read('.omx/plans/prd-ku-lms-message-detail-subtitle-guardrail.md');
const testSpec = read('.omx/plans/test-spec-ku-lms-message-detail-subtitle-guardrail.md');
const fixtureManifest = JSON.parse(read('artifacts/fixtures/fixture-manifest.json'));
const requiredEvidencePaths = [
  'artifacts/analysis/live-messages-inbox-inline-meta-before.png',
  'artifacts/analysis/live-messages-inbox-inline-meta-after.png',
  'artifacts/analysis/live-messages-outbox-inline-meta-before.png',
  'artifacts/analysis/live-messages-outbox-inline-meta-after.png',
  'artifacts/analysis/live-messages-recyclebox-inline-meta-before.png',
  'artifacts/analysis/live-messages-recyclebox-inline-meta-after.png',
  'artifacts/analysis/live-message-viewer-inline-meta-before.png',
  'artifacts/analysis/live-message-viewer-inline-meta-after.png',
  'artifacts/analysis/live-messages-inbox-inline-meta-before.snapshot.txt',
  'artifacts/analysis/live-messages-inbox-inline-meta-after.snapshot.txt',
  'artifacts/analysis/live-messages-outbox-inline-meta-before.snapshot.txt',
  'artifacts/analysis/live-messages-outbox-inline-meta-after.snapshot.txt',
  'artifacts/analysis/live-messages-recyclebox-inline-meta-before.snapshot.txt',
  'artifacts/analysis/live-messages-recyclebox-inline-meta-after.snapshot.txt',
  'artifacts/analysis/live-message-viewer-inline-meta-before.snapshot.txt',
  'artifacts/analysis/live-message-viewer-inline-meta-after.snapshot.txt',
  'artifacts/analysis/message-inline-meta-inbox-before.json',
  'artifacts/analysis/message-inline-meta-inbox-after.json',
  'artifacts/analysis/message-inline-meta-outbox-before.json',
  'artifacts/analysis/message-inline-meta-outbox-after.json',
  'artifacts/analysis/message-inline-meta-inbox-before-dom.json',
  'artifacts/analysis/message-inline-meta-inbox-after-dom.json',
  'artifacts/analysis/message-inline-meta-outbox-before-dom.json',
  'artifacts/analysis/message-inline-meta-outbox-after-dom.json',
  'artifacts/analysis/message-inline-meta-detail-before-dom.json',
  'artifacts/analysis/message-inline-meta-detail-after-dom.json'
];
const hasCompleteLiveEvidence = requiredEvidencePaths.every((path) => existsSync(path));
const liveEvidence = hasCompleteLiveEvidence ? {
  inboxBeforeAlignment: JSON.parse(read('artifacts/analysis/message-inline-meta-inbox-before.json')),
  inboxAfterAlignment: JSON.parse(read('artifacts/analysis/message-inline-meta-inbox-after.json')),
  outboxBeforeAlignment: JSON.parse(read('artifacts/analysis/message-inline-meta-outbox-before.json')),
  outboxAfterAlignment: JSON.parse(read('artifacts/analysis/message-inline-meta-outbox-after.json')),
  inboxBeforeDom: JSON.parse(read('artifacts/analysis/message-inline-meta-inbox-before-dom.json')),
  inboxAfterDom: JSON.parse(read('artifacts/analysis/message-inline-meta-inbox-after-dom.json')),
  outboxBeforeDom: JSON.parse(read('artifacts/analysis/message-inline-meta-outbox-before-dom.json')),
  outboxAfterDom: JSON.parse(read('artifacts/analysis/message-inline-meta-outbox-after-dom.json')),
  detailBeforeDom: JSON.parse(read('artifacts/analysis/message-inline-meta-detail-before-dom.json')),
  detailAfterDom: JSON.parse(read('artifacts/analysis/message-inline-meta-detail-after-dom.json'))
} : null;

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
      'td.MessageBody, td.messageBody': bodyCell,
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

function escapeAttrForAssertion(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function assertRenderedSortLinks(runtime, view, label) {
  view.columns
    .filter((column) => column.key !== 'select')
    .forEach((column) => {
      const headerHtml = runtime.renderMessageHeaderCell(column, view.rows, view);
      assert(headerHtml.includes(`ku-message-cell-${column.key}`), `${label} header cell missing class for ${column.key}.`);
      (column.sortLinks || []).forEach((link) => {
        assert(headerHtml.includes(`data-message-js="${escapeAttrForAssertion(link.href)}"`), `${label} header lost sort link ${link.href}.`);
        assert(headerHtml.includes(`>${link.text}<`), `${label} header lost sort text ${link.text}.`);
      });
    });
}

function assertRenderedRowParity(runtime, view, label) {
  if (!view.rows.length) return;
  const firstRow = view.rows[0];
  const selectCell = firstRow.cells.find((cell) => cell.key === 'select');
  const selectHtml = runtime.renderMessageBodyCell(selectCell, firstRow, new Set(), view);
  assert(selectHtml.includes(`data-id="${escapeAttrForAssertion(firstRow.id)}"`), `${label} row checkbox identity missing from rendered output.`);
  if (firstRow.href) {
    const subjectCell = firstRow.cells.find((cell) => cell.key === 'subject') || firstRow.cells.find((cell) => cell.href);
    const subjectHtml = runtime.renderMessageBodyCell(subjectCell, firstRow, new Set(), view);
    assert(subjectHtml.includes(`href="${escapeAttrForAssertion(firstRow.href)}"`), `${label} subject href missing from rendered output.`);
  }
  const html = runtime.renderMessages(view);
  assert(html.includes(view.pagination.pageText), `${label} pagination page text missing from rendered output.`);
  for (const href of [view.pagination.prev, view.pagination.next, view.pagination.last].filter(Boolean)) {
    assert(html.includes(`data-message-js="${escapeAttrForAssertion(href)}"`), `${label} pagination link ${href} missing from rendered output.`);
  }
}

function rowsAlignWithHeaders(evidence) {
  return evidence.row.every((cell, index) => {
    const head = evidence.head[index];
    return head && cell.left === head.left && cell.right === head.right;
  });
}

function hasInlineMeta(evidence = {}) {
  if (typeof evidence.hasInlineMeta === 'boolean') return evidence.hasInlineMeta;
  return String(evidence.subjectHtml || '').includes('ku-message-subject-inline-meta');
}

function extractHeroSection(html = '') {
  const match = String(html).match(/<section class="ku-message-detail-hero">([\s\S]*?)<\/section>/);
  return match ? match[1] : '';
}

const inboxList = inspectFixture('artifacts/fixtures/messages-inbox.network-response', 'messages');
const outboxList = inspectFixture('artifacts/fixtures/messages-outbox.json', 'messages');
const recycleboxList = inspectFixture('artifacts/fixtures/messages-recyclebox.json', 'messages');
const inboxDetail = inspectFixture('artifacts/fixtures/messages-detail-inbox.json', 'message-detail');
const outboxDetail = inspectFixture('artifacts/fixtures/messages-detail-outbox.json', 'message-detail');
const subjectFirstInboxDetail = inspectFixture('artifacts/fixtures/messages-detail-subject-first-inbox.html', 'message-detail');
const subjectFirstOutboxDetail = inspectFixture('artifacts/fixtures/messages-detail-subject-first-outbox.html', 'message-detail');

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
  assert(view.headline === view.title, 'Inbox detail headline should match the native subject.');
  assert(view.title.includes('レポートを受け取りました ['), 'Inbox detail should preserve the native subject payload in parsed state.');
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
  const heroHtml = extractHeroSection(html);
  assert(html.includes('メッセージ詳細'), 'Message detail render missing page title.');
  assert(html.includes('受信メッセージ'), 'Message detail render missing mode cue.');
  assert(html.includes('レポートを受け取りました'), 'Message detail render missing subject headline.');
  assert(heroHtml.includes('ku-message-headline-meta-block'), 'Message detail render missing the receipt metadata block under the title.');
  assert(!html.includes('<span>件名</span>'), 'Message detail render should not duplicate the subject inside metadata tiles.');
  assert(!heroHtml.includes('ku-page-subtitle'), 'Receipt detail hero should not render a generic subtitle node.');
  assert(html.includes('ダウンロード') && html.includes('返事を書く'), 'Message detail render missing native action links.');
  assert(html.includes('ku-message-detail-topline'), 'Message detail render missing shared top-line action layout.');
});

record('subject-first regression fixtures prefer native subject over body-first copy', () => {
  const runtime = createRuntime();
  const inboxView = runtime.parseMessageDetail(createMessageDetailDoc(subjectFirstInboxDetail));
  const outboxView = runtime.parseMessageDetail(createMessageDetailDoc(subjectFirstOutboxDetail));
  assert(inboxView.headline === '本日の休講の確認', 'Inbox regression headline should use the native subject.');
  assert(inboxView.excerpt === '皆様', 'Inbox regression excerpt should demote body-derived copy instead of leading with it.');
  assert(outboxView.headline === '授業資料の更新について', 'Outbox regression headline should use the native subject.');
  assert(outboxView.excerpt === '言語学の補足資料を共有します。', 'Outbox regression excerpt should keep body copy secondary.');
  runtime.state.currentView = inboxView;
  runtime.state.currentRoute = { name: 'messages-detail' };
  runtime.state.currentContext = { links: { messages: '/webclass/msg_editor.php?msgappmode=inbox', notifications: '/webclass/information.php/', manual: '/webclass/user.php/manual', home: '/webclass/', courses: '/webclass/', logout: '/webclass/logout.php' }, language: '日本語', userName: 'レビュー' };
  const inboxHtml = runtime.renderMessages(inboxView);
  const inboxHeroHtml = extractHeroSection(inboxHtml);
  runtime.state.currentView = outboxView;
  const outboxHtml = runtime.renderMessages(outboxView);
  const outboxHeroHtml = extractHeroSection(outboxHtml);
  assert(inboxHtml.includes('本日の休講の確認'), 'Rendered inbox regression fixture should show the subject-first hero title.');
  assert(!inboxHeroHtml.includes('ku-page-subtitle'), 'Rendered inbox regression fixture should not render a hero subtitle node for non-receipt detail.');
  assert(!inboxHeroHtml.includes('ku-message-headline-meta-block'), 'Rendered inbox regression fixture should not render receipt meta for non-receipt detail.');
  assert(outboxHtml.includes('授業資料の更新について'), 'Rendered outbox regression fixture should show the subject-first hero title.');
  assert(!outboxHeroHtml.includes('ku-page-subtitle'), 'Rendered outbox regression fixture should not render a hero subtitle node for non-receipt detail.');
  assert(!outboxHeroHtml.includes('ku-message-headline-meta-block'), 'Rendered outbox regression fixture should not render receipt meta for non-receipt detail.');
  assert(!inboxHtml.includes('<span>件名</span>'), 'Rendered inbox regression fixture should remove duplicate subject metadata.');
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
  assert(html.includes('ku-message-date-inline-text'), 'Outbox one-line date marker missing.');
  assert(html.includes('ku-message-date-inline-separator'), 'Outbox date renderer should include a zero-width separator between date and time.');
  assert(html.includes('ku-message-subject-link'), 'Outbox subject emphasis marker missing.');
  assert(html.includes('ku-message-subject-inline-meta'), 'Outbox receipt subject should render inline gray metadata.');
  assert(html.includes('宛先') && html.includes('件名') && html.includes('添付ファイル') && html.includes('日付'), 'Outbox render lost truthful headers.');
  assertRenderedSortLinks(runtime, view, 'outbox');
  assertRenderedRowParity(runtime, view, 'outbox');
});

record('inbox renderer improves scanability without changing native columns', () => {
  const runtime = createRuntime();
  const view = runtime.parseMessagesTable(createMessagesDoc(inboxList), 'messages-inbox');
  runtime.state.currentView = view;
  runtime.state.currentRoute = { name: 'messages-inbox' };
  runtime.state.currentContext = { links: { messages: '/webclass/msg_editor.php?msgappmode=inbox', notifications: '/webclass/information.php/', manual: '/webclass/user.php/manual', home: '/webclass/', courses: '/webclass/', logout: '/webclass/logout.php' }, language: '日本語', userName: 'レビュー' };
  const html = runtime.renderMessages(view);
  assert(html.includes('data-message-layout="inbox-grid"'), 'Inbox layout marker missing.');
  assert(html.includes('ku-message-subject-link'), 'Inbox subject emphasis marker missing.');
  assert(html.includes('ku-message-date-stack'), 'Inbox date stack marker missing.');
  assert(html.includes('ku-message-subject-inline-meta'), 'Inbox receipt subject should render inline gray metadata.');
  assert(!html.includes('王 漢隆 (情25-0507) · 情25-0507 · 26/05/18 13:08'), 'Inbox subject should not render the old gray secondary metadata line.');
  assertRenderedSortLinks(runtime, view, 'inbox');
  assertRenderedRowParity(runtime, view, 'inbox');
});

record('recyclebox renderer keeps native warning/actions with clearer layout marker', () => {
  const runtime = createRuntime();
  const view = runtime.parseMessagesTable(createMessagesDoc(recycleboxList), 'messages-recyclebox');
  runtime.state.currentView = view;
  runtime.state.currentRoute = { name: 'messages-recyclebox' };
  runtime.state.currentContext = { links: { messages: '/webclass/msg_editor.php?msgappmode=inbox', notifications: '/webclass/information.php/', manual: '/webclass/user.php/manual', home: '/webclass/', courses: '/webclass/', logout: '/webclass/logout.php' }, language: '日本語', userName: 'レビュー' };
  const html = runtime.renderMessages(view);
  assert(html.includes('data-message-layout="recyclebox-grid"'), 'Recyclebox layout marker missing.');
  assert(html.includes('ここでさらに削除したメッセージは、復元できなくなります。'), 'Recyclebox warning should be preserved.');
  assert(view.actions.map((item) => item.name).join(',') === 'RETURN_SELECTED,COMFIRM_SELECTED,UNSET_UNREADFLAG,downloadmsg', 'Recyclebox actions regressed.');
  assertRenderedSortLinks(runtime, view, 'recyclebox');
  assertRenderedRowParity(runtime, view, 'recyclebox');
});

record('existing inbox and recyclebox contracts still parse', () => {
  const runtime = createRuntime();
  const inboxView = runtime.parseMessagesTable(createMessagesDoc(inboxList), 'messages-inbox');
  const recycleView = runtime.parseMessagesTable(createMessagesDoc(recycleboxList), 'messages-recyclebox');
  assert(inboxView.folder === 'inbox', 'Inbox list folder parse regressed.');
  assert(recycleView.folder === 'recyclebox', 'Recyclebox list folder parse regressed.');
  assert(recycleView.actions.map((item) => item.name).join(',') === 'RETURN_SELECTED,COMFIRM_SELECTED,UNSET_UNREADFLAG,downloadmsg', 'Recyclebox actions regressed.');
});

record('css contract keeps rows on the same grid tracks as headers', () => {
  assert(/\.ku-message-head,\s*\.ku-message-row,\s*\.ku-table-row/.test(css), 'CSS should keep message rows in the shared grid layout selector.');
  assert(css.includes('.ku-message-row {\n  padding: 0;') || css.includes('.ku-message-row {\r\n  padding: 0;'), 'CSS should remove row-level padding drift from message rows.');
  assert(css.includes('.ku-message-subject-inline-meta'), 'CSS should style inline receipt metadata.');
  assert(css.includes('.ku-message-detail-topline'), 'CSS should style the detail hero top-line action row.');
  assert(css.includes('.ku-message-headline-meta-block'), 'CSS should style the detail receipt metadata block.');
});

record('durable docs and fixtures cover message detail subtitle guardrail phase', () => {
  const routes = new Set(fixtureManifest.routes.map((item) => item.route));
  const prdLower = prd.toLowerCase();
  const testSpecLower = testSpec.toLowerCase();
  for (const route of ['messages-detail-inbox', 'messages-detail-outbox', 'messages-outbox']) {
    assert(routes.has(route), `Fixture manifest missing route: ${route}`);
  }
  assert(architecture.includes('/webclass/msg_viewer.php'), 'Architecture doc missing message detail route.');
  assert(architecture.includes('infer folder context from the page content rather than the URL alone'), 'Architecture doc missing folder-authority contract.');
  assert(architecture.includes('Bare relative KU-LMS PHP links'), 'Architecture doc missing relative-PHP normalization note.');
  assert(designCode.includes('Messages detail page'), 'Design code missing message detail surface.');
  assert(entrypoint.includes('.omx/plans/prd-ku-lms-message-detail-subtitle-guardrail.md'), 'AI docs entrypoint should reference the message-detail subtitle guardrail PRD.');
  assert(prdLower.includes('receipt') && prdLower.includes('no subtitle node inside `.ku-message-detail-hero`'.toLowerCase()), 'PRD should document the receipt-only hero subtitle contract.');
  assert(testSpecLower.includes('receipt') && testSpecLower.includes('no hero subtitle node is rendered beneath the title inside `.ku-message-detail-hero`'.toLowerCase()), 'Test spec should cover the hero-scoped subtitle suppression contract.');
});

record('required Chrome evidence artifacts exist and prove the live regression is fixed', () => {
  requiredEvidencePaths.forEach((path) => {
    assert(existsSync(path), `Missing required evidence artifact: ${path}`);
  });
  assert(rowsAlignWithHeaders(liveEvidence.inboxBeforeAlignment), 'Inbox baseline evidence should start from an aligned header/body state.');
  assert(rowsAlignWithHeaders(liveEvidence.inboxAfterAlignment), 'Inbox after evidence should preserve header/body alignment.');
  assert(rowsAlignWithHeaders(liveEvidence.outboxBeforeAlignment), 'Outbox baseline evidence should start from an aligned header/body state.');
  assert(rowsAlignWithHeaders(liveEvidence.outboxAfterAlignment), 'Outbox after evidence should preserve header/body alignment.');
  assert(liveEvidence.inboxBeforeDom.hasSecondaryMiniMeta, 'Inbox baseline DOM should capture the old gray subject subtitle line.');
  assert(!hasInlineMeta(liveEvidence.inboxBeforeDom), 'Inbox baseline DOM should not yet have inline receipt metadata.');
  assert(hasInlineMeta(liveEvidence.inboxAfterDom), 'Inbox after DOM should include inline receipt metadata.');
  assert(!liveEvidence.inboxAfterDom.hasSecondaryMiniMeta, 'Inbox after DOM should remove the old gray subject subtitle line.');
  assert(!hasInlineMeta(liveEvidence.outboxBeforeDom), 'Outbox baseline DOM should not yet have inline receipt metadata.');
  assert(hasInlineMeta(liveEvidence.outboxAfterDom), 'Outbox after DOM should include inline receipt metadata.');
  assert(liveEvidence.outboxBeforeDom.dateText.includes('\n') || liveEvidence.outboxBeforeDom.dateText.includes('13:08'), 'Outbox baseline DOM should capture the old date field.');
  assert(liveEvidence.outboxAfterDom.dateText === '26/05/18 13:08', 'Outbox after DOM should render the date on a single line like inbox.');
  assert(liveEvidence.outboxAfterDom.miniText === '13:08', 'Outbox after DOM should preserve the smaller time styling on the same line.');
  if (liveEvidence.inboxAfterDom.headerCellStyle?.paddingTop && liveEvidence.outboxAfterDom.headerCellStyle?.paddingTop) {
    assert(liveEvidence.inboxAfterDom.headerCellStyle.paddingTop === liveEvidence.outboxAfterDom.headerCellStyle.paddingTop, 'Inbox/outbox header top padding should match after the style-parity fix.');
  }
  if (liveEvidence.inboxAfterDom.headerCellStyle?.paddingBottom && liveEvidence.outboxAfterDom.headerCellStyle?.paddingBottom) {
    assert(liveEvidence.inboxAfterDom.headerCellStyle.paddingBottom === liveEvidence.outboxAfterDom.headerCellStyle.paddingBottom, 'Inbox/outbox header bottom padding should match after the style-parity fix.');
  }
  assert(liveEvidence.inboxAfterDom.recipientStyle?.fontSize === liveEvidence.outboxAfterDom.recipientStyle?.fontSize, 'Inbox/outbox primary identity text should use the same font size after the style-parity fix.');
  assert(liveEvidence.detailBeforeDom.excerptText.includes('王 漢隆 さんのレポートを受け取りました'), 'Detail baseline DOM should capture the old gray subtitle line.');
  assert(!liveEvidence.detailBeforeDom.hasHeadlineMeta, 'Detail baseline DOM should not yet have inline receipt title metadata.');
  assert(liveEvidence.detailAfterDom.hasHeadlineMeta, 'Detail after DOM should include receipt title metadata.');
  assert(!liveEvidence.detailAfterDom.excerptText, 'Detail after DOM should remove the old gray subtitle line.');
  assert(liveEvidence.detailAfterDom.actionsInTopline, 'Detail after DOM should place action buttons on the same top row as the folder-return button.');
  assert(liveEvidence.detailAfterDom.metaBlockClass?.includes('ku-message-headline-meta-block'), 'Detail after DOM should expose the block-level receipt metadata class.');
  assert(Boolean(liveEvidence.detailAfterDom.metaBlockText), 'Detail after DOM should expose receipt metadata below the title.');
  assert(liveEvidence.detailAfterDom.titleMainTop !== null && liveEvidence.detailAfterDom.metaBlockTop !== null && liveEvidence.detailAfterDom.metaBlockTop > liveEvidence.detailAfterDom.titleMainTop, 'Detail after DOM should place receipt metadata on the line below the large title.');
});

const report = {
  ok: true,
  checks,
  evidence: {
    requiredEvidencePaths,
    hasCompleteLiveEvidence,
    alignment: {
      inboxBeforeAligned: rowsAlignWithHeaders(liveEvidence.inboxBeforeAlignment),
      inboxAfterAligned: rowsAlignWithHeaders(liveEvidence.inboxAfterAlignment),
      outboxBeforeAligned: rowsAlignWithHeaders(liveEvidence.outboxBeforeAlignment),
      outboxAfterAligned: rowsAlignWithHeaders(liveEvidence.outboxAfterAlignment)
    }
  }
};
writeArtifact('.omx/artifacts/message-detail-subtitle-guardrail', 'verification-report.json', report);
console.log(JSON.stringify(report, null, 2));
