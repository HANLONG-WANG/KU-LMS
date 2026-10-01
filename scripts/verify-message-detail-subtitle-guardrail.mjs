import vm from 'node:vm';
import { inspectFixture as inspectLocalFixture } from './lib/fixture-dom.mjs';
import { read, readKulmsSource, assert, writeArtifact } from './lib/content-source.mjs';

const source = readKulmsSource();
const architecture = read('docs/ku-lms-extension-architecture.md');
const designCode = read('docs/ku-lms-design-code.md');
const entrypoint = read('docs/AI_DOCS_ENTRYPOINT.md');

const checks = [];
const record = (name, fn) => { fn(); checks.push(name); };

function inspectFixture(relativePath) { return inspectLocalFixture(relativePath, 'message-detail'); }

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
    AbortController,
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
  assert(designCode.includes('the only supported second line on the message-detail hero is the receipt-style bracket metadata'), 'Design code should preserve the receipt-only exception.');
  assert(source.includes('ku-message-detail-hero') && source.includes('deriveMessageDetailHeadline'), 'Source should expose the hero and subject-first headline parser tested below.');
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
