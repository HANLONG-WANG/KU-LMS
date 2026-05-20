import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { read, readKulmsSource, assert, writeArtifact } from './lib/content-source.mjs';

const source = readKulmsSource();
const architecture = read('docs/ku-lms-extension-architecture.md');
const designCode = read('docs/ku-lms-design-code.md');
const entrypoint = read('docs/AI_DOCS_ENTRYPOINT.md');
const prd = read('.omx/plans/prd-ku-lms-message-detail-subtitle-guardrail.md');
const testSpec = read('.omx/plans/test-spec-ku-lms-message-detail-subtitle-guardrail.md');

const checks = [];
const record = (name, fn) => { fn(); checks.push(name); };

function inspectFixture(relativePath) {
  const script = String.raw`
import json, sys
from pathlib import Path
from bs4 import BeautifulSoup
root = Path(sys.argv[1])
rel = sys.argv[2]
raw = (root / rel).read_text()
try:
    html = json.loads(raw)
except Exception:
    html = raw
soup = BeautifulSoup(html, 'html.parser')
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
`;
  return JSON.parse(execFileSync('python', ['-c', script, process.cwd(), relativePath], { encoding: 'utf8' }));
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
        th: new StubNode({ text: item.label, attrs: { class: '' } }),
        td: cell
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
    many: { tr: metadataRows }
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

function extractHeroSection(html = '') {
  const match = String(html).match(/<section class="ku-message-detail-hero">([\s\S]*?)<\/section>/);
  return match ? match[1] : '';
}

const receiptDetail = inspectFixture('artifacts/fixtures/messages-detail-inbox.json');
const subjectFirstInboxDetail = inspectFixture('artifacts/fixtures/messages-detail-subject-first-inbox.html');
const subjectFirstOutboxDetail = inspectFixture('artifacts/fixtures/messages-detail-subject-first-outbox.html');

record('durable docs encode the no-non-receipt-subtitle contract', () => {
  assert(designCode.includes('ordinary message-detail heroes must not render a second subtitle line beneath the title'), 'Design code should encode the no-non-receipt-subtitle rule.');
  assert(architecture.includes('ordinary non-receipt details must not render a hero subtitle line beneath that title'), 'Architecture doc should encode the no-non-receipt-subtitle rule.');
  assert(entrypoint.includes('supersedes broader non-receipt subtitle allowances for message detail'), 'AI docs entrypoint should note guardrail precedence.');
  assert(prd.includes('render no subtitle node inside `.ku-message-detail-hero`'), 'PRD should encode the hero-scoped subtitle ban.');
  assert(testSpec.includes('dedicated phase-owned verifier'), 'Test spec should assign dedicated verifier ownership.');
});

record('receipt detail keeps the meta block under the hero title', () => {
  const runtime = createRuntime();
  const view = runtime.parseMessageDetail(createMessageDetailDoc(receiptDetail));
  runtime.state.currentView = view;
  runtime.state.currentRoute = { name: 'messages-detail' };
  runtime.state.currentContext = { links: { messages: '/webclass/msg_editor.php?msgappmode=inbox', notifications: '/webclass/information.php/', manual: '/webclass/user.php/manual', home: '/webclass/', courses: '/webclass/', logout: '/webclass/logout.php' }, language: '日本語', userName: 'レビュー' };
  const heroHtml = extractHeroSection(runtime.renderMessages(view));
  assert(heroHtml.includes('ku-message-article-title'), 'Receipt detail should render the hero title.');
  assert(heroHtml.includes('ku-message-headline-meta-block'), 'Receipt detail should render the receipt meta block.');
  assert(!heroHtml.includes('<p class="ku-page-subtitle">'), 'Receipt detail should not render a generic subtitle paragraph in the hero.');
});

record('non-receipt details keep parsed excerpt but render no hero subtitle node', () => {
  const runtime = createRuntime();
  const inboxView = runtime.parseMessageDetail(createMessageDetailDoc(subjectFirstInboxDetail));
  const outboxView = runtime.parseMessageDetail(createMessageDetailDoc(subjectFirstOutboxDetail));
  assert(inboxView.excerpt === '皆様', 'Inbox non-receipt fixture should still preserve parsed excerpt.');
  assert(outboxView.excerpt === '言語学の補足資料を共有します。', 'Outbox non-receipt fixture should still preserve parsed excerpt.');
  runtime.state.currentRoute = { name: 'messages-detail' };
  runtime.state.currentContext = { links: { messages: '/webclass/msg_editor.php?msgappmode=inbox', notifications: '/webclass/information.php/', manual: '/webclass/user.php/manual', home: '/webclass/', courses: '/webclass/', logout: '/webclass/logout.php' }, language: '日本語', userName: 'レビュー' };
  runtime.state.currentView = inboxView;
  const inboxHero = extractHeroSection(runtime.renderMessages(inboxView));
  runtime.state.currentView = outboxView;
  const outboxHero = extractHeroSection(runtime.renderMessages(outboxView));
  assert(inboxHero.includes('ku-message-article-title'), 'Inbox non-receipt detail should render the hero title.');
  assert(!inboxHero.includes('ku-message-headline-meta-block'), 'Inbox non-receipt detail should not render receipt meta block.');
  assert(!inboxHero.includes('<p class="ku-page-subtitle">'), 'Inbox non-receipt detail should not render a hero subtitle paragraph.');
  assert(outboxHero.includes('ku-message-article-title'), 'Outbox non-receipt detail should render the hero title.');
  assert(!outboxHero.includes('ku-message-headline-meta-block'), 'Outbox non-receipt detail should not render receipt meta block.');
  assert(!outboxHero.includes('<p class="ku-page-subtitle">'), 'Outbox non-receipt detail should not render a hero subtitle paragraph.');
});

const report = { ok: true, checks };
writeArtifact('.omx/artifacts/message-detail-subtitle-guardrail', 'dedicated-verification-report.json', report);
console.log(JSON.stringify(report, null, 2));
