# KU-LMS Session Safety Analysis

## Status
- Active
- Last refreshed: 2026-05-16
- Purpose: durable reference for future agents about the forced-logout risk around homepage auto-loading and course navigation.

## Question answered
Why can the homepage appear normal, finish loading `期限が近い課題` / `最新のお知らせ` / `メッセージ`, and then send the user to `login.php` or show the multi-course warning when the user opens a course?

## Evidence

### Live browser evidence
- The redesigned logged-in homepage remained visible in Chrome MCP after the cards loaded.
- In the same browser context, opening a fresh KU-LMS home tab redirected immediately to `login.php`.
- The `login.php` response deleted `WCAC`, which is strong evidence that KU-LMS considered the active authenticated course context invalid.
- In the same browser context, opening a real course URL from the homepage also redirected immediately to `login.php` and again deleted `WCAC`.

### Repository evidence
- Homepage async enrichment runs only on the home route and starts three post-render branches:
  - notifications
  - messages
  - due-course enrichment
- Notifications and messages fetch only:
  - `/webclass/information.php/...`
  - `/webclass/msg_editor.php?msgappmode=inbox`
- The due-course branch:
  - reads timetable cells with `締切が近い課題があります`
  - preserves the native timetable anchor as `supplementalHref`
  - sends those entries to the extension service worker
  - the service worker fetches each `supplementalHref` with shared KU-LMS credentials
- Those native timetable supplemental URLs are course `login` URLs, not passive metadata endpoints.

## Conclusion
The best-supported explanation is:

> The homepage's hidden auto-probe for `期限が近い課題` is still touching real course `login` URLs in the background, and KU-LMS treats those requests as session-relevant enough to poison or invalidate the current course/auth context.

This makes the due-card background probing the main suspect. The `最新のお知らせ` and `メッセージ` cards are secondary suspects only because they also load after render, but the code evidence for them is much weaker: they do not touch course routes.

## Design rule for future work
Future agents should treat the following rule as binding unless the user explicitly overrides it:

- **Do not auto-fetch `/webclass/course.php/:courseId/login?...` from the homepage.**

Preferred safe homepage data sources:
- current-page DOM
- `information.php`
- `msg_editor.php?msgappmode=inbox`
- same-tab cache populated only after the user explicitly visits a course in that tab

Unsafe or unproven homepage strategies:
- hidden background probes to course `login` URLs
- hidden multi-course fan-out, even if serialized
- assuming service-worker fetches are safe just because they are not running in page JS

## Relationship to current architecture docs
`docs/ku-lms-extension-architecture.md` describes the current implementation shape. This analysis adds an important qualification: the current red-flag background course probing strategy is **not** proven session-safe and is the most likely cause of the forced logout behavior still seen in live KU-LMS.
