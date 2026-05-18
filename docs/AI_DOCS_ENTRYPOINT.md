# AI Docs Entrypoint

## Status
This file is the documentation entrypoint for AI agents working on the KU-LMS extension redesign. It was created in this task because the repository previously lacked the required entrypoint file.

## Read first
1. `docs/ku-lms-design-code.md` — binding UI design code for all future AI/frontend work.
2. `docs/ku-lms-extension-architecture.md` — current extension architecture, supported routes, takeover strategy, and design-system notes.
3. `docs/ku-lms-session-safety-analysis.md` — durable analysis of homepage/session invalidation risk and the binding session-safety rules for future agents.
4. `DESIGN.md` — repo-root design pointer to the canonical design contract.

## Durable subsystem map

### Auth terminal subsystem
- `.omx/plans/prd-ku-lms-login-page-redesign.md` — redesigned `login.php` route that keeps only login, inquiry/contact, and notice content while preserving native auth parity.
- `.omx/plans/test-spec-ku-lms-login-page-redesign.md` — verification requirements for login-route support, native form parity, retained-content limits, and fail-open fallback.
- `.omx/plans/prd-ku-lms-login-page-followups.md` — follow-up fix plan for duplicated login-route UI, support-card spillover, and async notice rendering.
- `.omx/plans/test-spec-ku-lms-login-page-followups.md` — verification requirements for single-source login UI, stripped hydrated form chrome, and DOM-only async notice sync.
- `.omx/plans/prd-ku-lms-logout-page-redesign.md` — redesigned `logout.php` route that preserves warning/farewell/actions while presenting a calm auth-terminal surface.
- `.omx/plans/test-spec-ku-lms-logout-page-redesign.md` — verification requirements for logout-route support, action parity, and refresh fail-closed separation.

### Homepage refresh safety subsystem
- `.omx/plans/prd-ku-lms-home-refresh-cross-page-overlay-persistence.md` — current focused PRD for reducing cross-page refresh-mask flicker via boot-time visual-only rehydration.
- `.omx/plans/test-spec-ku-lms-home-refresh-cross-page-overlay-persistence.md` — verification requirements for boot ordering, no-body startup safety, abort-taxonomy preservation, and early overlay cleanup.
- `.omx/plans/prd-ku-lms-home-refresh-login-loop-safety.md` — prior fail-closed refresh/login-loop safety PRD.
- `.omx/plans/test-spec-ku-lms-home-refresh-login-loop-safety.md` — verification requirements for terminal auth-invalid handling, loop breakers, and validation-gated refresh posture.
- `.omx/plans/prd-ku-lms-home-refresh-progress-overlay.md` — follow-up PRD for explicit wait/progress UI during manual refresh.
- `.omx/plans/test-spec-ku-lms-home-refresh-progress-overlay.md` — verification requirements for the refresh progress overlay.
- `.omx/plans/prd-ku-lms-home-refresh-overlay-typography-followup.md` — follow-up PRD for unifying refresh overlay typography with the initial wait title styling.
- `.omx/plans/test-spec-ku-lms-home-refresh-overlay-typography-followup.md` — verification requirements for explicit, consistent refresh overlay typography hooks.
- `.omx/plans/prd-ku-lms-home-refresh-overlay-visibility-fix.md` — follow-up PRD for keeping the refresh overlay visible through takeover hide rules.
- `.omx/plans/test-spec-ku-lms-home-refresh-overlay-visibility-fix.md` — verification requirements for that visibility contract.
- `.omx/plans/prd-ku-lms-home-safe-refresh-deadlines.md` — earlier refresh-state-machine baseline PRD.
- `.omx/plans/test-spec-ku-lms-home-safe-refresh-deadlines.md` — earlier verification baseline for that phase.
- `.omx/plans/prd-ku-lms-home-upcoming-session-safety.md` — earlier homepage upcoming/session-safety PRD.
- `.omx/plans/test-spec-ku-lms-home-upcoming-session-safety.md` — corresponding verification requirements.

### Deadline / syllabus / course-materials subsystem
- `.omx/plans/prd-ku-lms-deadlines-syllabus-session-safety.md` — deadline detail recovery / direct syllabus / session-safety PRD.
- `.omx/plans/test-spec-ku-lms-deadlines-syllabus-session-safety.md` — corresponding verification requirements.
- `.omx/plans/prd-ku-lms-review-followups.md` — post-review homepage/syllabus PRD.
- `.omx/plans/test-spec-ku-lms-review-followups.md` — corresponding verification requirements.
- `.omx/plans/prd-ku-lms-course-materials-syllabus-fixes.md` — course-materials deadline correctness and syllabus-jump PRD.
- `.omx/plans/test-spec-ku-lms-course-materials-syllabus-fixes.md` — corresponding verification requirements.
- `.omx/plans/prd-ku-lms-width-deadlines-materials.md` — prior width/deadline/materials PRD.
- `.omx/plans/test-spec-ku-lms-width-deadlines-materials.md` — corresponding verification requirements.

### Redesign baseline / maintenance subsystem
- `.omx/plans/prd-ku-lms-refactor-fixes.md` — previous bug-fix / route-completion PRD.
- `.omx/plans/test-spec-ku-lms-refactor-fixes.md` — corresponding verification requirements.
- `.omx/plans/prd-ku-lms-redesign.md` — original redesign baseline PRD.
- `.omx/plans/test-spec-ku-lms-redesign.md` — original redesign verification baseline.
- `.omx/artifacts/visual-ralph/ku-lms-redesign/reference-manifest.json` — approved visual reference mapping.

## Update rules
- Add new stable implementation docs here when they become authoritative for future agents.
- Keep `.omx/` artifacts as phase/run evidence; summarize enduring knowledge in `docs/`.
