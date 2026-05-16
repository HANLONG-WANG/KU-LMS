# KU-LMS Extension Architecture

## Goal
Rebuild selected KU-LMS pages with a Chrome MV3 extension that overlays a modern UI while keeping real KU-LMS navigation, links, and data sources intact.

## Supported routes
- `/webclass/`
- `/webclass/index.php`
- `/webclass/course.php/:courseId/`
- `/webclass/course.php/:courseId/my-reports`
- `/webclass/course.php/:courseId/contents/*`, `/history`, and `/info` are intentionally left native so original KU-LMS detail-style pages remain usable.
- `/webclass/information.php/`
- `/webclass/information.php/mbl/` (canonicalized to `/webclass/information.php/` before redesigned rendering)
- `/webclass/msg_editor.php?msgappmode=inbox`
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
- Prefer current-page DOM parsing for initial render and avoid non-home route background fetches back to `/webclass/` during context boot.
- Reuse native links and same-origin endpoints for counts/actions where needed.
- Prefer session-safe same-origin `fetch()` for supplemental documents instead of hidden iframe course preloads.
- On the homepage, render immediately from the current page DOM (`schedule`, `homeNotices`, filters, and course links), then asynchronously enrich the three right-column panels (`announcements`, `messages`, `upcoming`).
- Homepage announcements enrichment fetches `/webclass/information.php/`, parses notification rows across pagination, and uses that full feed for the visible `最新のお知らせ` panel.
- The concrete `期限が近い課題` card now focuses on timetable courses already marked with `締切が近い課題があります`.
- Current implementation background-fetches only red-flag timetable courses for concrete deadline detail. Those fetches run through the extension background worker, use the native supplemental/login href when available, and remain strictly serial.
- However, the 2026-05-16 session-safety analysis indicates that even this serialized background probing of native course `login` URLs is still a likely forced-logout trigger on live KU-LMS. Treat this as a known risk in the current implementation, not as a proven-safe pattern to extend.
- Background-fetched course items are shown only when they are still inside their `利用可能期間`, have no `利用回数`, and their due date is within 7 days.
- Same-tab session cache is still used as a secondary source so a course the user already opened can repopulate the homepage even if a later background probe stops or is skipped.
- Course-detail parsing skips `締め切り後提出` items and keeps only real future-due task rows; no `コース内で確認` placeholder is allowed.
- Final upcoming ordering remains: red-flag course items first, then unknown/no-usage before used, then nearest due date, then title.
- For homepage year / semester controls, mirror the native `condition` form options and submit the native form in the same tab.
- For the homepage deadline CTA, target the first aggregated upcoming item's `courseHref`, and fall back to the native course list when no upcoming item resolves.
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
- Avoid multi-tab analysis assumptions; KU-LMS warns that simultaneous tabs may cause session inconsistency.
- Avoid multi-course hidden prefetch bursts from the homepage; they risk triggering KU-LMS cross-course/session warnings.
- Avoid treating service-worker background fetches to `/webclass/course.php/:courseId/login?...` as session-safe just because they are serialized or off-page; live evidence suggests they can still poison session state.
- Preferred future direction: homepage automatic enrichment should stay on current-page DOM, `information.php`, `msg_editor.php?msgappmode=inbox`, and same-tab cache written after explicit user course visits, unless a server-supported batch-safe course endpoint is discovered.

## Design system direction
- Desktop-first layout tuned to the approved references, with 1448x1086 as the baseline reference and wider desktop expansion allowed when it improves information density.
- Shared top nav, white cards, blue active accents, subtle borders/shadows, and route-specific content panels.
