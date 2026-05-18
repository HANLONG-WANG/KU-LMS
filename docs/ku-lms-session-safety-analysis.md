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

## Current implementation direction
- Direct top-level `https://kulms.tl.kansai-u.ac.jp/webclass/login.php` may be intentionally redesigned as a pre-auth route, but that does **not** change the rule that unexpected `login.php` landings during homepage refresh or other authenticated flows remain auth-invalid and fail-closed.
- Homepage automatic near-deadline rendering is now cache-first and reads only same-tab cached course data for course-specific task details.
- Explicit course visits remain the authoritative cache writer for near-deadline items.
- Homepage exposes a user-invoked refresh path for currently red-flagged courses, and that path is intentionally described as **session-safer / validation-gated**, not universally safe.
- That refresh path must use top-level same-tab navigation only; it must not use hidden content-script fetches or service-worker fetches to course login/material pages.
- If a refresh traversal lands on `login.php` or another auth-invalid route, the refresh workflow must fail closed and stop; it must not attempt endless home restoration while state remains active.
- If the user manually returns home, opens a different course than the current refresh target, or uses browser back/forward during refresh, the workflow must abort instead of continuing to steer navigation.
- Refresh state must carry an expiry bound so stale `sessionStorage` cannot reactivate itself on a later unrelated home/course visit.
- Once the user leaves a course/home page, any in-flight same-tab supplemental or timeline fetch that is no longer needed should abort so it does not overlap with the next course navigation and trip KU-LMS cross-course protection.
- The refresh flow must block user interaction with a full-screen mask while active and restore the supported home state when it completes or aborts.

## Relationship to current architecture docs
`docs/ku-lms-extension-architecture.md` describes the current implementation shape. This analysis remains the reason the codebase forbids homepage auto-fetching of course login pages and treats any cross-course refresh path as validation-gated until live KU-LMS evidence says otherwise.
