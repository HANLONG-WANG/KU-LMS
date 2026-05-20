# KU-LMS Extension Architecture

## Goal
Rebuild selected KU-LMS pages with a Chrome MV3 extension that overlays a modern UI while keeping real KU-LMS navigation, links, and data sources intact.

## Supported routes
- `/webclass/login.php`
- `/webclass/logout.php`
- `/webclass/`
- `/webclass/index.php`
- `/webclass/course.php/:courseId/`
- `/webclass/course.php/:courseId/login` is treated as an internal same-tab refresh-transport alias for the course-materials route, not as a separate user-facing surface.
- `/webclass/course.php/:courseId/my-reports`
- `/webclass/course.php/:courseId/contents/*`, `/history`, and `/info` are intentionally left native so original KU-LMS detail-style pages remain usable.
- `/webclass/information.php/`
- `/webclass/information.php/mbl/` (canonicalized to `/webclass/information.php/` before redesigned rendering)
- `/webclass/information.php/post/:noticeId`
- `/webclass/msg_editor.php?msgappmode=inbox`
- `/webclass/msg_editor.php?msgappmode=outbox`
- `/webclass/msg_editor.php?msgappmode=recyclebox`
- `/webclass/msg_viewer.php`
- `/webclass/user.php/manual`
- `https://syllabus3.jm.kansai-u.ac.jp/syllabus/*` is not visually redesigned, but the same content script is allowed to run there in assist-only mode for syllabus-result auto-resolution.

## Takeover strategy
- Inject static content scripts at `document_start`.
- Apply critical CSS immediately to suppress the original visible UI.
- Mount an extension root and render route-specific UI from normalized DOM data.
- Keep same URL/origin/session instead of redirecting to an extension page.
- Lock native page scrolling while takeover is active so the redesign owns the only usable scroll container.
- On wide desktop screens, allow the redesign content shell to expand beyond the original 1448px cap so the workspace uses available width more effectively.

## Data strategy
- On `login.php`, treat the current page as the only required source of truth for login, inquiry/contact, and notice content; preserve native form action/method/hidden inputs and keep the rendered surface limited to those groups.
- On `logout.php`, treat the current page as the only required source of truth for the post-session warning/farewell/actions surface; preserve the native login-return href and close-window action exactly while keeping the rendered surface limited to warning/status/next-step content.
- Prefer current-page DOM parsing for initial render and avoid non-home route background fetches back to `/webclass/` during context boot.
- On notice detail routes, treat the current detail page DOM as the authoritative source for metadata, body content, and prev/list/next navigation; preserve native author/list/detail links.
- On message folder routes (`inbox`, `outbox`, `recyclebox`), treat the current page form, native submit button names, folder links, sort links, pagination links, and checkbox names as the authoritative action contract; do not synthesize folder semantics.
- On message detail routes (`msg_viewer.php`), treat the current detail DOM as the authoritative source for mode label, navigation controls, forward/download/reply actions, metadata fields, and message body; preserve native action links/forms and infer folder context from the page content rather than the URL alone.
- Message detail rendering is subject-first: the native `件名` is the primary title, ordinary non-receipt details must not render a hero subtitle line beneath that title, receipt-style `レポートを受け取りました [...]` details may render only the bracket payload as the second line, and the secondary metadata grid must not repeat the subject once the hero already expresses it.
- Message navigation distinguishes a stable global inbox destination for topbar/home IA from a same-tab contextual inbox destination used only for supported course-originated message flows.
- That contextual message destination is same-tab-scoped runtime state; it may survive supported `course -> msg_editor.php -> msg_viewer.php` flows, but it must reset on global surfaces and direct-open/global message entry so course context does not bleed.
- Observed `mbl.php` / mobile message routes are non-canonical for redesigned message navigation and must never become the authoritative source of contextual message state.
- Bare relative KU-LMS PHP links (for example `msg_editor.php?...`) should normalize back under `/webclass/` so message-detail return/navigation links do not escape the supported route tree.
- Reuse native links and same-origin endpoints for counts/actions where needed.
- Prefer session-safe same-origin `fetch()` for supplemental documents instead of hidden iframe course preloads.
- On the homepage, render immediately from the current page DOM (`schedule`, `homeNotices`, filters, and course links), then asynchronously enrich the three right-column panels (`announcements`, `messages`, `upcoming`).
- Homepage announcements enrichment fetches `/webclass/information.php/`, parses notification rows across pagination, and uses that full feed for the visible `最新のお知らせ` panel.
- The concrete `期限が近い課題` card now focuses on timetable courses already marked with `締切が近い課題があります`.
- Homepage automatic near-deadline rendering is now cache-first: it reads same-tab course cache only and does not fetch course login/material pages during automatic homepage enrichment.
- Homepage `その他のコース` row-level reminder chips should mirror the native homepage `.course-contents-info` field when it exists, so those chips appear on first render without requiring a prior course visit.
- Same-tab cache may still supplement the right-column `期限が近い課題` card with detailed other-course items, but row-level `その他のコース` reminder chips must not depend on cache hydration.
- Homepage refresh targeting now includes timetable red-flag rows plus `その他のコース` rows whose native homepage `.course-contents-info` reminder is present.
- Cache-only other-course detailed items remain supplemental and must not create refresh targets by themselves.
- Same-tab session cache is the authoritative homepage source for course-specific near-deadline details; explicit course visits update that cache automatically.
- Homepage cached course items are shown only when they are still inside their `利用可能期間`, have no `利用回数`, and their due date is within 7 days.
- Homepage exposes an explicit validation-gated refresh control for near-deadline tasks. That refresh must actually re-fetch the latest data for timetable red-flag rows plus `その他のコース` rows whose native homepage reminder is already present, through top-level same-tab navigation using the native course-entry URLs rather than hidden content-script or service-worker fetches.
- While that manual refresh is active, the UI must show a full-screen blocking mask with a clear wait message and visible progress so users do not interact with the shell mid-refresh.
- That refresh overlay must explicitly remain visible through the takeover hide rules; it is not allowed to be hidden as an ordinary `body` sibling during `booting`/`ready` redesign state.
- To reduce cross-page flicker during that manual refresh, the overlay should be rehydrated during `document_start` boot immediately after `dataset='booting'` and before the generic boot shell mounts; this early sync is visual-only, while route/auth decisions still belong to the later `init()` path after the existing `DOMContentLoaded` gate.
- The refresh flow is intentionally treated as session-safer rather than proven-safe until live KU-LMS validation confirms the narrowed contract.
- Course-detail parsing skips `締め切り後提出` items and keeps only real future-due task rows; no `コース内で確認` placeholder is allowed.
- Final upcoming ordering remains: red-flag course items first, then unknown/no-usage before used, then nearest due date, then title.
- For homepage year / semester controls, mirror the native `condition` form options and submit the native form in the same tab.
- For the homepage deadline CTA, target the first aggregated upcoming item's `courseHref`, and fall back to the native course list when no upcoming item resolves.
- Refresh-mode course visits must suppress nonessential side effects such as timeline/API enrichment so the traversal stays focused on cache refresh and restoration.
- Preserve original href targets for detail pages and downloads.
- For syllabus jumping, do not fetch KU-LMS `/course.php/:courseId/info` during chip-click handling.
- Instead, send the current course title / year / courseCode to the extension service worker and resolve the public syllabus detail URL in the background first by fetching the public search/detail pages there; when that succeeds, navigate the current tab directly to the detail page so the user never sees the intermediate search page.
- Syllabus query normalization must strip timetable suffixes such as `(2026-春学期-...-70399)`, trailing section tags like `[A 1]`, and trailing marker tags such as `＜M＞＜S＞＜C＞`, while preserving meaningful subject text like `（著作権）`.
- The visible public search/results page remains only as an ambiguity fallback when background resolution cannot prove a unique detail target; while that fallback auto-resolution is still pending, the syllabus page should be masked by a lightweight `シラバスを検索中…` overlay rather than exposing the raw search UI flash.
- On the syllabus domain, assist mode still serves as the fallback resolver: inspect search-result candidates and only auto-redirect when the result is either:
  - a unique exact title match, or
  - an exact-title candidate set that can be disambiguated by comparing KU-LMS course code against the public syllabus detail page.
- If the candidate set remains ambiguous, fall back to the public search/results page instead of guessing.

## Safety / fallback
- If route is unsupported or adapter parsing fails, release the suppression and show native KU-LMS.
- `login.php` is now an intentionally supported route, but only in its direct pre-auth context; during unrelated flows such as homepage refresh traversal, landing on `login.php` still means auth-invalid and must fail closed.
- `logout.php` is now an intentionally supported auth-terminal route, but only in its direct top-level context; during unrelated flows such as homepage refresh traversal, landing on `logout.php` still means the refresh must fail closed and stop.
- The redesigned login route must not show authenticated top navigation or perform hidden/background auth probing; it may only preserve native login, inquiry/contact, and notice content.
- The redesigned logout route must not show authenticated top navigation or invent post-logout dashboard content; it may only preserve native warning/status text and the real next-step actions.
- Avoid multi-tab analysis assumptions; KU-LMS warns that simultaneous tabs may cause session inconsistency.
- Avoid multi-course hidden prefetch bursts from the homepage; they risk triggering KU-LMS cross-course/session warnings.
- Avoid treating service-worker background fetches to `/webclass/course.php/:courseId/login?...` as session-safe just because they are serialized or off-page; live evidence suggests they can still poison session state.
- Homepage refresh must not use hidden content-script fetches or service-worker fetches to course login/material pages; if refresh is enabled, it must use top-level same-tab navigation only and remain validation-gated.
- If refresh lands on `login.php`, `logout.php`, a conflict page, or any unexpected route while active, it must fail closed, clear or tombstone refresh state, and stop auto-navigation instead of bouncing back to `homeUrl`.
- If the user manually interrupts refresh by returning home, moving to a non-target course, or traversing browser history, refresh must abort instead of reclaiming navigation control.
- Persisted refresh state must expire automatically; stale refresh state may not revive itself on a later unrelated navigation.
- Same-tab supplemental/timeline fetches that are no longer needed after navigation must be abortable so a just-left course page cannot keep competing with the next course navigation.
- Until fresh live validation proves that same-tab refresh no longer falls into `login.php`/conflict, the refresh control may remain visible only as an explicit user-invoked, validation-gated path with fail-closed behavior and no “proven-safe” claim.
- Preferred future direction: homepage automatic enrichment should stay on current-page DOM, `information.php`, `msg_editor.php?msgappmode=inbox`, and same-tab cache written after explicit user course visits. Any cross-course refresh remains subject to live go/no-go validation.

## Content subsystem map
- KU-LMS routes now boot through `src/content/main.js`, which is a thin manifest-facing bootstrap shim.
- Syllabus routes now boot through `src/content/syllabus-main.js`, which is a thin assist-only bootstrap shim.
- Files loaded before those final bootstrap shims are definition-only and must not perform top-level DOM mutation, fetch, navigation, listener registration, or timer registration.
- Current content ownership layers are:
  - `runtime/*` — boot sequence, shared state, route detection
  - `parsers/*` — DOM parsing only
  - `render/*` — string-generation/view rendering only
  - `hydrate/*` — event binding and native-form hydration
  - `services/*` — fetch/cache/refresh/syllabus flows
  - `utils/*` — pure shared helpers
- The refresh FSM remains owned by `src/content/services/refresh.js`; it is still the only content-side owner of refresh sessionStorage state and overlay synchronization.
- The syllabus assist flow remains owned by `src/content/services/syllabus.js`; syllabus pages must stay assist-only and must not render the KU-LMS redesign shell.

## Design system direction
- Desktop-first layout tuned to the approved references, with 1448x1086 as the baseline reference and wider desktop expansion allowed when it improves information density.
- Shared top nav, white cards, blue active accents, subtle borders/shadows, and route-specific content panels.
