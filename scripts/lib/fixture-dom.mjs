import fs from 'node:fs';
import path from 'node:path';
import { DOMParser } from 'linkedom';

// Parses local fixture markup only. Linkedom does not load resources or execute scripts.
export function readFixtureDocument(relativePath) {
  const raw = fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
  let html = raw;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'string') throw new TypeError(`Fixture must contain HTML or a JSON HTML string: ${relativePath}`);
    html = parsed;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  return new DOMParser().parseFromString(html, 'text/html');
}

export function fixtureText(node) {
  if (!node) return '';
  const parts = [];
  const visit = (current) => {
    if (current.nodeType === 3) { const text = current.textContent.trim(); if (text) parts.push(text); }
    else if (!/^(SCRIPT|STYLE)$/i.test(current.tagName || '')) Array.from(current.childNodes || []).forEach(visit);
  };
  visit(node);
  return parts.join(' ');
}

const attr = (node, name) => node?.getAttribute(name) || '';
const all = (root, selector) => Array.from(root?.querySelectorAll(selector) || []);
const anchors = (root, selector = 'a[href]') => all(root, selector).map((node) => ({ text: fixtureText(node), href: attr(node, 'href') }));
const folders = (doc) => anchors(doc, '.navi a').map((node) => ({ title: node.text.replace('» ', ''), href: node.href }));

export function inspectFixture(relativePath, kind = 'context') {
  const doc = readFixtureDocument(relativePath);
  if (kind === 'context') return { title: fixtureText(doc.querySelector('title')), anchors: anchors(doc), naviAnchors: anchors(doc, '.navi a[href]') };
  if (kind === 'messages') {
    const form = doc.querySelector('form[name="condition"]');
    return {
      heading: fixtureText(doc.querySelector('.msg h3')),
      warning: fixtureText(doc.querySelector('.msg h3 + div')),
      actions: all(form, 'input[type="submit"][name]').map((node) => ({ name: attr(node, 'name'), label: attr(node, 'value').trim(), onclick: attr(node, 'onclick') })),
      headers: all(doc, '#MsgListTable thead th').map((th) => ({ label: fixtureText(th).replace('▲', '').replace('▼', '').trim(), sortLinks: anchors(th) })),
      rows: all(doc, '#MsgListTable tr.odd, #MsgListTable tr.even').map((tr) => Array.from(tr.children).filter((node) => node.tagName === 'TD').map((td) => {
        const checkbox = td.querySelector('input[type="checkbox"]');
        return { text: fixtureText(td), href: attr(td.querySelector('a[href]'), 'href'), checkboxName: attr(checkbox, 'name'), checkboxValue: attr(checkbox, 'value') };
      })),
      folders: folders(doc), allAnchors: anchors(doc),
      pageText: all(doc, 'font').map(fixtureText).find((text) => text.includes('/')) || '',
      formAction: attr(form, 'action')
    };
  }
  if (kind === 'message-detail') {
    const table = doc.querySelector('#MessageData');
    const metadata = all(table, 'tr').flatMap((tr) => {
      const th = tr.querySelector('th'); const td = tr.querySelector('td');
      if (!th || !td || /messageHead/.test(attr(th, 'class')) || /MessageBody|messageBody|messageFoot/.test(attr(td, 'class'))) return [];
      return [{ label: fixtureText(th), text: fixtureText(td), href: attr(td.querySelector('a[href]'), 'href') }];
    });
    const form = all(doc, 'form').find((candidate) => attr(candidate, 'action').includes('msg_viewer.php'));
    const input = form?.querySelector('input[name="f_address"]'); const button = form?.querySelector('input[type="submit"][name]');
    return {
      title: fixtureText(doc.querySelector('title')),
      modeLabel: all(doc, '.content font b, .content b').map(fixtureText).find((text) => /受信メッセージ|送信メッセージ/.test(text)) || '',
      activeFolder: fixtureText(doc.querySelector('.navi dd.active a')).replace('» ', ''), folders: folders(doc),
      pagerItems: all(doc, '.pager li, .iterator li').map((li) => ({ text: fixtureText(li), href: attr(li.querySelector('a[href]'), 'href') })),
      closeHref: attr(doc.querySelector('a.uppernavi'), 'href'),
      forward: form && input && button ? { action: attr(form, 'action'), inputName: attr(input, 'name'), placeholder: attr(input, 'title'), buttonName: attr(button, 'name'), buttonLabel: attr(button, 'value').trim() } : null,
      downloadHref: anchors(doc).find((node) => node.text.includes('ダウンロード'))?.href || '',
      replyHref: attr(table?.querySelector('td.messageFoot a[href]'), 'href'), metadata,
      bodyHtml: table?.querySelector('td.MessageBody, td.messageBody')?.innerHTML || ''
    };
  }
  if (kind === 'notice') {
    const postBy = all(doc, '.info-detail-head .postBy').map(fixtureText);
    return {
      title: fixtureText(doc.querySelector('.info-detail-head h4') || doc.querySelector('.infopkg h4')),
      pageTitle: fixtureText(doc.querySelector('.infopkg h3')),
      errorMessage: fixtureText(doc.querySelector('.autoreportmsg td')),
      bodyHtml: doc.querySelector('.info-detail-body')?.outerHTML || '',
      issuer: postBy.find((text) => text.includes('発行元')) || '',
      publishedAt: postBy.find((text) => text.includes('発行日')) || '',
      updatedAt: postBy.find((text) => text.includes('更新日')) || '',
      deadline: fixtureText(doc.querySelector('.info-detail-head .closedAt')),
      audience: all(doc, '.info-detail-head .data > div').map(fixtureText).find((text) => text.includes('発行先')) || '',
      authorLabel: fixtureText(doc.querySelector('.info-detail-head .postBy a')),
      authorHref: attr(doc.querySelector('.info-detail-head .postBy a'), 'href'),
      navLinks: all(doc, '.pager a, .iterator a').map((node) => ({ text: fixtureText(node), href: attr(node, 'href'), title: attr(node, 'title') }))
    };
  }
  throw new Error(`Unknown local fixture kind: ${kind}`);
}
