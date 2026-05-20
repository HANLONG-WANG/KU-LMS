# KU-LMS Content Subsystem Map

## Status
- Active
- Last refreshed: 2026-05-19
- Purpose: durable map of the modularized content-script subsystem, including manifest load order, domain entrypoints, and safety-sensitive ownership boundaries.

## Final entrypoints
- **KU-LMS routes** boot through `src/content/main.js`.
- **Syllabus routes** boot through `src/content/syllabus-main.js`.
- Both entrypoints are loaded at `document_start` via `manifest.json` and are intentionally thin bootstrap shims.

## Load-order contract
1. Files listed before the final bootstrap file are **definition-only**.
2. Pre-bootstrap files may define constants, state containers, and functions.
3. Pre-bootstrap files must not perform top-level DOM mutation, fetch, navigation, listener registration, timer registration, or runtime message sends.
4. Only the final bootstrap file for each domain may start execution.

## Current module layout

```text
src/content/
  runtime/
    constants.js
    state.js
    routes.js
    boot-kulms.js
    boot-syllabus.js
  parsers/
    auth.js
    shared.js
    home.js
    course.js
    notifications.js
    messages.js
    manual.js
  render/
    shared.js
    auth.js
    home.js
    course.js
    notifications.js
    messages.js
    manual.js
  hydrate/
    auth.js
    shared.js
  services/
    documents.js
    cache.js
    timeline.js
    syllabus.js
    refresh.js
  utils/
    core.js
  main.js
  syllabus-main.js
  critical.css
```

## Ownership rules
- `runtime/state.js` owns shared mutable in-memory state (`state`, page lifecycle guards, cached DOM/form references).
- `runtime/state.js` also owns the same-tab persisted message-context slot that separates global inbox routing from course-context inbox routing.
- `runtime/boot-kulms.js` owns KU-LMS boot sequencing and the single rerender loop.
- `runtime/boot-syllabus.js` owns syllabus-domain assist boot only.
- `parsers/*` stay DOM-in / normalized-data-out and must remain side-effect free.
- `render/*` stay string-generation only and must not perform I/O or storage writes.
- `hydrate/*` may bind events and request rerenders, but should not own fetch/session-storage policy.
- `services/refresh.js` is the only content-side owner of refresh sessionStorage state and refresh overlay synchronization.
- `services/cache.js` may expose display-only cache helpers for homepage deadline hinting, but it must not absorb refresh-state ownership or widen refresh eligibility.
- `services/syllabus.js` owns syllabus chip navigation, pending marker state, and assist-page auto-resolution.
- `services/documents.js` and `services/timeline.js` own same-tab fetches and must preserve abortable request behavior.
- `utils/core.js` owns pure cross-cutting helpers.

## Safety-sensitive rules
- The refresh FSM remains validation-gated, same-tab only, and fail-closed on `login.php`, `logout.php`, conflict pages, unexpected routes, manual interruption, and stale state.
- The early boot refresh overlay sync remains **visual-only** and must not absorb route/auth branching.
- Syllabus pages remain assist-only; they must not render the KU-LMS redesign shell.
- The retired background upcoming-course fan-out path must not be reintroduced.

## Verification surface
- Existing route/safety verifiers now inspect the ordered KU-LMS content-script subsystem instead of assuming all logic lives in `src/content/main.js`.
- Modularization-specific verifiers live under `scripts/verify-content-*.mjs`, including dedicated load-order and syllabus-contract checks for the assist-only domain.
