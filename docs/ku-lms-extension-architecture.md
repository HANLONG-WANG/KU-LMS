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
- Prefer current-page DOM parsing for initial render.
- Reuse native links and same-origin endpoints for counts/actions where needed.
- Prefer session-safe same-origin `fetch()` for supplemental documents instead of hidden iframe course preloads.
- On the homepage, render immediately from the current page DOM (`schedule`, `homeNotices`, filters, and course links), then asynchronously enrich the three right-column panels (`announcements`, `messages`, `upcoming`).
- Homepage announcements enrichment fetches `/webclass/information.php/`, parses the notification rows, and uses that list both for the visible notice preview and as the source data for deadline aggregation.
- Homepage upcoming-deadline aggregation must use the full fetched notification list before the visible announcements preview is capped; only the rendered notice preview and rendered upcoming card list are truncated to five items.
- Homepage upcoming-deadline aggregation no longer crawls course materials pages; it derives candidate items from notification titles, extracts due datetimes from the notice text, matches each notice back to a timetable course by shortened course title, sorts by nearest due date, and shows the first five results with computed `daysLeft` values.
- For homepage year / semester controls, mirror the native `condition` form options and submit the native form in the same tab.
- For the homepage deadline CTA, target the first aggregated upcoming item's `courseHref`, and fall back to the native course list when no upcoming item resolves.
- Preserve original href targets for detail pages and downloads.
- For syllabus jumping, try extracting a direct syllabus link from the same-origin course-info page first.
- If no direct syllabus link exists, submit the public Kansai University syllabus keyword search in the current tab, persist pending course metadata (`title`, `year`, `instructor`, `courseCode`), and let the content script assist on the syllabus domain.
- On the syllabus domain, assist mode must inspect search-result candidates and only auto-redirect when the result is either:
  - a unique exact title match,
  - an exact-title candidate set that becomes unique after matching the KU-LMS instructor, or
  - an exact-title candidate set that can be disambiguated by comparing KU-LMS course code against the public syllabus detail page.
- Because direct `fetch(detailUrl)` on the syllabus site can return a generic system-error page, course-code disambiguation should use same-origin document navigation (for example a hidden iframe) rather than assuming detail `fetch()` is reliable.
- If the candidate set remains ambiguous, fall back to the public search/results page instead of guessing.

## Safety / fallback
- If route is unsupported or adapter parsing fails, release the suppression and show native KU-LMS.
- Avoid multi-tab analysis assumptions; KU-LMS warns that simultaneous tabs may cause session inconsistency.
- Avoid multi-course hidden prefetch bursts from the homepage; they risk triggering KU-LMS cross-course/session warnings.

## Design system direction
- Desktop-first layout tuned to the approved references, with 1448x1086 as the baseline reference and wider desktop expansion allowed when it improves information density.
- Shared top nav, white cards, blue active accents, subtle borders/shadows, and route-specific content panels.
