import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { loadOfflineKulmsInto } from './lib/offline-content-vm.mjs';

// Attachment-only record observed on the live 26170621 course timeline.
const courseId = '26170621';
const record = {
  datetime: 1790228498,
  realname: '川島　励仁',
  message: '',
  attache_name: '2026textmining_マシン対応表.pdf',
  attache_download_url: '/webclass/download.php/2026textmining_%E3%83%9E%E3%82%B7%E3%83%B3%E5%AF%BE%E5%BF%9C%E8%A1%A8.pdf?forumattach=1&group_id=26170621&contents_id=6fd2736efe1192592a38ad6a1e9f44ce&file_name=2026textmining_%E3%83%9E%E3%82%B7%E3%83%B3%E5%AF%BE%E5%BF%9C%E8%A1%A8.pdf&file=6ab4b81216006',
  attache_url: '/webclass/data/course/26/26170621/bbs/attache_6fd2736efe1192592a38ad6a1e9f44ce/6ab4b81216006',
  message_info: { text: '', contents: [] }
};
const courseUrl = `https://kulms.tl.kansai-u.ac.jp/webclass/course.php/${courseId}/`;
const expectedHref = new URL(record.attache_download_url, courseUrl).href;
const requests = [];
const sandbox = loadOfflineKulmsInto({
  window: { location: { href: courseUrl } },
  renderCourseHeader: () => '',
  fetchLmsResource: async url => {
    requests.push(url);
    return { text: JSON.stringify({ status: 'OK', records: [record] }) };
  }
});
const renderBody = item => parseHTML(`<div id="body">${sandbox.renderTimelineBody(item)}</div>`).document.getElementById('body');
const timeline = await sandbox.fetchCourseTimeline(courseId);
assert.equal(timeline.error, false);
assert.equal(timeline.items.length, 1);
assert.match(requests[0], /26170621\/api\/timeline\/messages/);
const html = sandbox.renderCourseMaterials({
  currentTab: 'materials',
  course: { course: { title: 'テキストマイニング実習', links: { materials: courseUrl } }, timeline, sections: [], anchors: [] }
});
const document = parseHTML(html).document;
const attachment = document.querySelector('.ku-timeline-body a');
assert.ok(attachment, 'an attachment-only post must display a download link instead of repeating the author');
assert.equal(attachment.textContent, record.attache_name);
assert.equal(attachment.getAttribute('href'), expectedHref, 'preserve the native download endpoint and every query parameter');
assert.ok(attachment.hasAttribute('download'), 'download attachments without replacing the course page');
assert.equal(document.querySelector('.ku-timeline-kicker').textContent, record.realname);
assert.doesNotMatch(document.querySelector('.ku-timeline-body').textContent, /川島/);
assert.equal(document.querySelectorAll('.ku-timeline-item').length, 1);

const mixed = renderBody(sandbox.mapTimelineRecord({ ...record, message: '添付資料をご確認ください。\r\n次回使用します。' }, courseId));
assert.match(mixed.textContent, /添付資料をご確認ください。/);
assert.equal(mixed.querySelectorAll('br').length, 1);
assert.equal(mixed.querySelector('a').getAttribute('href'), expectedHref);

const plain = renderBody(sandbox.mapTimelineRecord({ message: '連絡です。\n二行目です。', realname: '先生' }, courseId));
assert.equal(plain.textContent, '連絡です。二行目です。');
assert.equal(plain.querySelectorAll('br').length, 1);
assert.equal(plain.querySelector('a'), null);
const htmlFallback = renderBody(sandbox.mapTimelineRecord({ message_info: { text: '<p>連絡</p><p>二行目</p>' } }, courseId));
assert.equal(htmlFallback.textContent, '連絡二行目');
assert.equal(htmlFallback.querySelectorAll('br').length, 2);

const content = { id: 'report-id', type: 'report', text: '課題のお知らせ' };
const update = renderBody(sandbox.mapTimelineRecord({ ...record, message_info: { contents: [content] } }, courseId));
assert.equal(update.querySelectorAll('a').length, 2, 'a material update and its attachment must both remain accessible');
assert.equal(update.querySelector('a').getAttribute('href'), `${courseUrl}contents/report-id/exec`);
const noAttachment = renderBody(sandbox.mapTimelineRecord({ message_info: { contents: [content] } }, courseId));
assert.equal(noAttachment.querySelectorAll('a').length, 1);
assert.equal(noAttachment.textContent, content.text);

const escaped = renderBody(sandbox.mapTimelineRecord({ ...record, message: '<img src=x onerror=alert(1)>', attache_name: '<script>alert(2)</script>.pdf' }, courseId));
assert.equal(escaped.querySelector('img,script'), null);
assert.equal(escaped.querySelector('a').textContent, '<script>alert(2)</script>.pdf');
for (const url of ['', 'javascript:alert(1)', 'data:text/html,unsafe', 'https://example.com/file.pdf', '//example.com/webclass/download.php/file.pdf', '/webclass/logout.php', 'https://[']) {
  const body = renderBody(sandbox.mapTimelineRecord({ ...record, attache_download_url: url }, courseId));
  assert.equal(body.textContent, record.attache_name, `keep the attachment name when its download URL is unusable: ${url}`);
  assert.equal(body.querySelector('a'), null, `do not create an unrelated or unsafe download link: ${url}`);
}
console.log('Course timeline attachment regression checks passed.');
