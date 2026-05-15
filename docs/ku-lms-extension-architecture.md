# KU-LMS Extension Architecture

## Goal
Rebuild selected KU-LMS pages with a Chrome MV3 extension that overlays a modern UI while keeping real KU-LMS navigation, links, and data sources intact.

## Supported routes
- `/webclass/`
- `/webclass/course.php/:courseId/`
- `/webclass/course.php/:courseId/my-reports`
- `/webclass/information.php/`
- `/webclass/msg_editor.php?msgappmode=inbox`

## Takeover strategy
- Inject static content scripts at `document_start`.
- Apply critical CSS immediately to suppress the original visible UI.
- Mount an extension root and render route-specific UI from normalized DOM data.
- Keep same URL/origin/session instead of redirecting to an extension page.

## Data strategy
- Prefer current-page DOM parsing for initial render.
- Reuse native links and same-origin endpoints for counts/actions where needed.
- Preserve original href targets for detail pages and downloads.

## Safety / fallback
- If route is unsupported or adapter parsing fails, release the suppression and show native KU-LMS.
- Avoid multi-tab analysis assumptions; KU-LMS warns that simultaneous tabs may cause session inconsistency.

## Design system direction
- Desktop-first 1448x1086 layout tuned to the approved references.
- Shared top nav, white cards, blue active accents, subtle borders/shadows, and route-specific content panels.
