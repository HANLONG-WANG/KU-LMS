/* src/content/parsers/auth.js */

function parseLoginView(doc) {
    const form = doc.forms.login || doc.querySelector('form[name="login"], form[action*="/webclass/login.php"]');
    if (!form) return null;
    const usernameInput = form.querySelector('input[name="username"]');
    const passwordInput = form.querySelector('input[name="val"], input[type="password"]');
    const submitInput = form.querySelector('input[type="submit"], button[type="submit"], input[name="login"], button[name="login"]');
    if (!usernameInput || !passwordInput || !submitInput) return null;
    const languageCode = parseLoginLanguageCode(doc, form);
    return {
      heading: cleanText(doc.querySelector('#welcome, h1, h2, .page-header')?.textContent) || 'Welcome to KU-LMS',
      intro: parseLoginIntro(doc, form),
      alert: parseLoginAlert(doc, form),
      languageCode,
      languages: parseLoginLanguageOptions(doc, languageCode),
      form: {
        action: absoluteUrl(form.getAttribute('action') || window.location.href),
        method: String(form.getAttribute('method') || 'post').toUpperCase(),
        username: {
          name: usernameInput.getAttribute('name') || 'username',
          type: usernameInput.getAttribute('type') || 'text',
          autocomplete: usernameInput.getAttribute('autocomplete') || 'username',
          placeholder: usernameInput.getAttribute('placeholder') || '',
          value: usernameInput.value || '',
          maxlength: usernameInput.getAttribute('maxlength') || ''
        },
        password: {
          name: passwordInput.getAttribute('name') || 'val',
          type: passwordInput.getAttribute('type') || 'password',
          autocomplete: passwordInput.getAttribute('autocomplete') || 'current-password',
          placeholder: passwordInput.getAttribute('placeholder') || '',
          value: passwordInput.value || '',
          maxlength: passwordInput.getAttribute('maxlength') || ''
        },
        submit: {
          name: submitInput.getAttribute('name') || '',
          value: submitInput.value || cleanText(submitInput.textContent) || 'ログイン'
        },
        hiddenInputs: Array.from(form.querySelectorAll('input[type="hidden"]')).map((input) => ({
          name: input.getAttribute('name') || '',
          value: input.value || ''
        })).filter((item) => item.name)
      },
      support: parseLoginSupport(doc),
      notices: parseLoginNotices(doc),
      version: parseLoginVersion(doc)
    };
  }

function parseLoginIntro(doc, form) {
    const scope = form.closest('.col-sm-5, .col-md-4, .container, main') || form.parentElement || doc.body;
    const candidates = Array.from(scope.querySelectorAll('p, .description'))
      .map((node) => cleanText(node.textContent))
      .filter((text) => text.length > 16 && !/問い合わせ|お問い合わ|Powered by|通告|Ver\./i.test(text));
    return candidates[0] || '';
  }

function parseLoginAlert(doc, form) {
    const scope = form.closest('.col-sm-5, .col-md-4, .container, main') || doc.body;
    const candidates = Array.from(scope.querySelectorAll('.alert, .text-danger, .text-warning, .error, .loginFeedback, .help-block'))
      .map((node) => cleanText(node.textContent))
      .filter((text) => text && /パスワード|ログイン|invalid|wrong|失敗|错误|エラー/i.test(text));
    return candidates[0] || '';
  }

function parseLoginLanguageCode(doc, form = null) {
    const formElement = form || doc.forms.login;
    const hiddenValue = formElement?.querySelector('input[name="language"]')?.value || '';
    const queryValue = new URLSearchParams(window.location.search).get('language') || '';
    return String(hiddenValue || queryValue || 'JAPANESE').trim().toUpperCase();
  }

function parseLoginLanguageLabel(doc) {
    return loginLanguageLabel(parseLoginLanguageCode(doc));
  }

function parseLoginLanguageOptions(doc, currentCode) {
    const seen = new Set();
    return Array.from(doc.querySelectorAll('a[href*="login.php?language="]')).map((anchor) => {
      const href = absoluteUrl(anchor.getAttribute('href') || '');
      const code = new URL(href, window.location.origin).searchParams.get('language') || '';
      if (!code || seen.has(code.toUpperCase())) return null;
      seen.add(code.toUpperCase());
      return {
        code: code.toUpperCase(),
        label: cleanText(anchor.textContent) || loginLanguageLabel(code),
        href,
        active: code.toUpperCase() === currentCode
      };
    }).filter(Boolean);
  }

function parseLoginSupport(doc) {
    const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
    const emailMatch = doc.body.textContent.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    const inquiryAnchor = Array.from(doc.querySelectorAll('a[href]')).find((anchor) => /問い合わせ|お問い合わ/.test(cleanText(anchor.textContent)));
    const emailNode = Array.from(doc.querySelectorAll('div, p, span, li'))
      .map((node) => ({ node, text: cleanText(node.textContent) }))
      .filter((entry) => emailPattern.test(entry.text))
      .sort((a, b) => a.text.length - b.text.length)[0]?.node || null;
    const inquiryText = inquiryAnchor ? cleanText(inquiryAnchor.textContent) : '';
    const inquiryContainer = inquiryAnchor?.closest('div, p, span, li') || null;
    const emailLabel = cleanLoginSupportLabel(
      cleanText(emailNode?.textContent || '').replace(emailMatch?.[0] || '', ''),
      '関大LMS問い合わせ先'
    );
    const inquiryLabel = cleanLoginSupportLabel(
      cleanText(inquiryContainer?.textContent || '').replace(inquiryText, ''),
      '関大LMSお問い合わせ受付フォーム'
    );
    return {
      emailLabel,
      email: emailMatch?.[0] || '',
      inquiryLabel,
      inquiryHref: inquiryAnchor ? absoluteUrl(inquiryAnchor.getAttribute('href') || '') : '',
      inquiryText
    };
  }

function cleanLoginSupportLabel(text, fallback) {
    const normalized = cleanText(text).replace(/[：:]\s*$/, '').trim();
    return normalized || fallback;
  }

function parseLoginNotices(doc) {
    const items = Array.from(doc.querySelectorAll('#AjaxInfoBox li, #AnnounceBlock li')).map((row) => {
      const link = row.querySelector('a[href]');
      if (!link) return null;
      const title = cleanText(row.querySelector('.title')?.textContent) || cleanText(link.textContent);
      if (!title || /^»\s*通告/.test(title) || title === '通告') return null;
      const metaText = cleanText(row.querySelector('.data')?.textContent);
      const [source = '', deadline = ''] = metaText.split(/\s+-\s+/, 2);
      return {
        title,
        href: absoluteUrl(link.getAttribute('href') || ''),
        source,
        deadline: deadline || extractPublishDate(metaText),
        important: !!row.querySelector('.mark1') || /^【重要】/.test(title)
      };
    }).filter(Boolean);
    const moreAnchor = Array.from(doc.querySelectorAll('a[href]')).find((anchor) => /^»\s*(通告|お知らせ画面)/.test(cleanText(anchor.textContent)));
    return {
      items,
      moreHref: moreAnchor ? absoluteUrl(moreAnchor.getAttribute('href') || '') : ''
    };
  }

function parseLoginVersion(doc) {
    const match = doc.body.textContent.match(/Ver\.[0-9.]+/i);
    return match ? match[0] : '';
  }

function parseLogoutView(doc) {
    const bodyText = cleanText(doc?.body?.innerText || '');
    const warningTitle = extractFirstMatch(bodyText, /コース利用中に、別のコースへのアクセスがリクエストされました。/);
    const warningBody = extractFirstMatch(bodyText, /関大LMSの他のウインドウやタブをすべて閉じ、複数同時に開いて操作しないでください。/);
    const summaryBlock = findShortestMatchingText(doc, /おつかれ様でした。/);
    const summarySource = summaryBlock || bodyText;
    const farewellText = extractFirstMatch(summarySource, /.*?おつかれ様でした。/);
    const durationText = extractFirstMatch(summarySource, /今回の利用時間は .*? でした。/);
    const loginAnchor = Array.from(doc.querySelectorAll('a[href]')).find((anchor) => (anchor.getAttribute('href') || '').includes('/webclass/login.php'));
    const closeAnchor = Array.from(doc.querySelectorAll('a[href]')).find((anchor) => /window\.close\(\)/i.test(anchor.getAttribute('href') || ''));
    return {
      heading: farewellText || 'ご利用ありがとうございました。',
      subtitle: durationText,
      warningTitle,
      warningBody,
      warningTone: warningTitle || warningBody ? 'orange' : 'blue',
      statusLabel: warningTitle || warningBody ? '多重アクセス警告' : 'ログアウト完了',
      actions: {
        loginHref: loginAnchor ? absoluteUrl(loginAnchor.getAttribute('href') || '') : '',
        loginLabel: loginAnchor ? cleanText(loginAnchor.textContent) : 'ログイン画面に戻る',
        closeHref: closeAnchor ? absoluteUrl(closeAnchor.getAttribute('href') || '') : '',
        closeLabel: closeAnchor ? cleanText(closeAnchor.textContent) : 'このウィンドウを閉じる'
      }
    };
  }

function findShortestMatchingText(doc, pattern, selectors = 'td, div, p, span, li') {
    return Array.from(doc.querySelectorAll(selectors))
      .map((node) => cleanText(node.textContent))
      .filter((text) => text && pattern.test(text))
      .sort((a, b) => a.length - b.length)[0] || '';
  }

function extractFirstMatch(text, pattern) {
    const match = String(text || '').match(pattern);
    return match ? cleanText(match[0]) : '';
  }
