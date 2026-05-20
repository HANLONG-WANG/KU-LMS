# AI Docs Entrypoint

## Status
This file is the documentation entrypoint for AI agents working on the KU-LMS extension redesign. It was created in this task because the repository previously lacked the required entrypoint file.

## Read first
1. `docs/ku-lms-design-code.md` — binding UI design code for all future AI/frontend work.
2. `docs/ku-lms-extension-architecture.md` — current extension architecture, supported routes, takeover strategy, and design-system notes.
3. `docs/ku-lms-content-subsystem-map.md` — current content-script file map, manifest load order, and safety-sensitive ownership boundaries after modularization.
4. `docs/ku-lms-session-safety-analysis.md` — durable analysis of homepage/session invalidation risk and the binding session-safety rules for future agents.
5. `DESIGN.md` — repo-root design pointer to the canonical design contract.

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
- `.omx/plans/prd-ku-lms-home-other-courses-deadline-reminder.md` — focused PRD for first-render parity of homepage `その他のコース` reminder chips via the native home DOM reminder field.
- `.omx/plans/test-spec-ku-lms-home-other-courses-deadline-reminder.md` — verification requirements for native other-course reminder parsing, row-level chip rendering, and refresh eligibility driven by native other-course reminders.
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
- `.omx/plans/prd-ku-lms-course-timeline-materials-parity.md` — focused PRD for timeline layout/html parity plus native materials clickability/link-target parity on the course materials page.
- `.omx/plans/test-spec-ku-lms-course-timeline-materials-parity.md` — verification requirements for timeline formatting/layout parity, native title launch parity, and inactive-material non-clickable state.
- `.omx/plans/prd-ku-lms-width-deadlines-materials.md` — prior width/deadline/materials PRD.
- `.omx/plans/test-spec-ku-lms-width-deadlines-materials.md` — corresponding verification requirements.

### Content subsystem modularization
- `.omx/plans/prd-ku-lms-content-script-modularization.md` — modularization program for splitting the content script into domain bootstraps plus runtime/parsers/render/hydrate/services/utils layers.
- `.omx/plans/test-spec-ku-lms-content-script-modularization.md` — verification requirements for modularized load order, route coverage, safety ownership, and verifier migration.
- `docs/ku-lms-content-subsystem-map.md` — durable content-subsystem ownership and load-order map for future agents.

### Redesign baseline / maintenance subsystem
- `.omx/plans/prd-ku-lms-message-pages-clarity-refresh.md` — current umbrella PRD for inbox/outbox/recyclebox alignment, compact message-ledger clarity, inline receipt-subject metadata, and message-detail hierarchy cleanup.
- `.omx/plans/test-spec-ku-lms-message-pages-clarity-refresh.md` — verification requirements for header/body track alignment, inline receipt-subject metadata, native message parity, and before/after Chrome evidence.
- `.omx/plans/prd-ku-lms-message-detail-outbox-layout.md` — PRD for redesigning `msg_viewer.php` inbox/outbox detail pages and reorganizing the sent-box list layout.
- `.omx/plans/test-spec-ku-lms-message-detail-outbox-layout.md` — verification requirements for message-detail route support, sent-box ledger layout, native action parity, and fixture evidence.
- `.omx/plans/prd-ku-lms-message-home-context-followups.md` — broader historical follow-up PRD for subject-first message detail hierarchy and course-context message navigation ownership; homepage `その他のコース` reminder behavior is now owned by the focused `prd-ku-lms-home-other-courses-deadline-reminder.md`.
- `.omx/plans/test-spec-ku-lms-message-home-context-followups.md` — verification requirements for those broader message/home follow-ups; homepage `その他のコース` reminder behavior is now verified by the focused native-reminder parity test spec.
- `.omx/plans/prd-ku-lms-message-detail-subtitle-guardrail.md` — narrow authoritative PRD for receipt-only hero subtitle rendering on redesigned `msg_viewer.php`; this supersedes broader non-receipt subtitle allowances for message detail.
- `.omx/plans/test-spec-ku-lms-message-detail-subtitle-guardrail.md` — verification requirements for that receipt-only hero subtitle contract.
- `.omx/plans/prd-ku-lms-notice-detail-outbox-recyclebox-redesign.md` — PRD for redesigning notice detail, sent box, and recycle box as first-class supported communication routes.
- `.omx/plans/test-spec-ku-lms-notice-detail-outbox-recyclebox-redesign.md` — verification requirements for those three communication surfaces, including route coverage, native action parity, and fixture evidence.
- `.omx/plans/prd-ku-lms-refactor-fixes.md` — previous bug-fix / route-completion PRD.
- `.omx/plans/test-spec-ku-lms-refactor-fixes.md` — corresponding verification requirements.
- `.omx/plans/prd-ku-lms-redesign.md` — original redesign baseline PRD.
- `.omx/plans/test-spec-ku-lms-redesign.md` — original redesign verification baseline.
- `.omx/artifacts/visual-ralph/ku-lms-redesign/reference-manifest.json` — approved visual reference mapping.

## Update rules
- Add new stable implementation docs here when they become authoritative for future agents.
- Keep `.omx/` artifacts as phase/run evidence; summarize enduring knowledge in `docs/`.
