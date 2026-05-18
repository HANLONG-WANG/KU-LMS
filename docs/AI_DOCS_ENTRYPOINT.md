# AI Docs Entrypoint

## Status
This file is the documentation entrypoint for AI agents working on the KU-LMS extension redesign. It was created in this task because the repository previously lacked the required entrypoint file.

## Read first
1. `docs/ku-lms-design-code.md` — binding UI design code for all future AI/frontend work.
2. `docs/ku-lms-extension-architecture.md` — current extension architecture, supported routes, takeover strategy, and design-system notes.
3. `docs/ku-lms-session-safety-analysis.md` — durable analysis of homepage/session invalidation risk and the binding session-safety rules for future agents.
4. `DESIGN.md` — repo-root design pointer to the canonical design contract.

### Current active-phase artifacts
- `.omx/plans/prd-ku-lms-login-page-redesign.md` — current active-phase PRD for adding a redesigned `login.php` route that keeps only login, inquiry/contact, and notice content while preserving native auth parity.
- `.omx/plans/test-spec-ku-lms-login-page-redesign.md` — current active-phase verification requirements for login-route support, native form parity, retained-content limits, and fail-open fallback.

### Background planning artifacts
5. `.omx/plans/prd-ku-lms-home-refresh-login-loop-safety.md` — earlier active-phase PRD for stopping refresh/login bounce loops while preserving the explicit manual refresh affordance under fail-closed, validation-gated rules.
6. `.omx/plans/test-spec-ku-lms-home-refresh-login-loop-safety.md` — earlier active-phase verification requirements for terminal auth-invalid handling, loop breakers, cache-safe aborts, and the visible-but-validation-gated refresh posture.
7. `.omx/plans/prd-ku-lms-home-refresh-progress-overlay.md` — focused follow-up PRD for making the validation-gated homepage refresh mask explicitly tell the user to wait and show visible progress.
8. `.omx/plans/test-spec-ku-lms-home-refresh-progress-overlay.md` — focused verification requirements for that refresh overlay/progress follow-up.
9. `.omx/plans/prd-ku-lms-home-refresh-overlay-visibility-fix.md` — focused follow-up PRD for ensuring the refresh overlay stays visible through redesign takeover hide rules.
10. `.omx/plans/test-spec-ku-lms-home-refresh-overlay-visibility-fix.md` — focused verification requirements for that visibility-contract fix.
11. `.omx/plans/prd-ku-lms-home-safe-refresh-deadlines.md` — earlier refresh-state-machine PRD that remains important background, but is superseded as the active phase by the login-loop safety plan.
12. `.omx/plans/test-spec-ku-lms-home-safe-refresh-deadlines.md` — earlier verification requirements for that phase.
13. `.omx/plans/prd-ku-lms-deadlines-syllabus-session-safety.md` — earlier deadline detail recovery / direct syllabus / session-safety PRD that remains relevant background.
14. `.omx/plans/test-spec-ku-lms-deadlines-syllabus-session-safety.md` — earlier verification requirements for that phase.
15. `.omx/plans/prd-ku-lms-home-upcoming-session-safety.md` — earlier homepage upcoming/session-safety PRD that remains relevant background.
16. `.omx/plans/test-spec-ku-lms-home-upcoming-session-safety.md` — earlier verification requirements for that phase.
17. `.omx/plans/prd-ku-lms-review-followups.md` — earlier post-review homepage/syllabus PRD that remains relevant background.
18. `.omx/plans/test-spec-ku-lms-review-followups.md` — earlier verification requirements for that phase.
19. `.omx/plans/prd-ku-lms-course-materials-syllabus-fixes.md` — earlier deadline/materials correctness and syllabus-jump PRD that remains relevant background.
20. `.omx/plans/test-spec-ku-lms-course-materials-syllabus-fixes.md` — earlier verification requirements for that phase.
21. `.omx/plans/prd-ku-lms-width-deadlines-materials.md` — prior width/deadline/materials PRD that remains relevant background.
22. `.omx/plans/test-spec-ku-lms-width-deadlines-materials.md` — prior verification requirements for that phase.
23. `.omx/plans/prd-ku-lms-refactor-fixes.md` — previous bug-fix / route-completion PRD that remains relevant background.
24. `.omx/plans/test-spec-ku-lms-refactor-fixes.md` — previous verification requirements that remain relevant background.
25. `.omx/plans/prd-ku-lms-redesign.md` — original redesign PRD that established the takeover baseline.
26. `.omx/plans/test-spec-ku-lms-redesign.md` — original redesign verification baseline.
27. `.omx/artifacts/visual-ralph/ku-lms-redesign/reference-manifest.json` — approved visual reference mapping.

## Update rules
- Add new stable implementation docs here when they become authoritative for future agents.
- Keep `.omx/` artifacts as phase/run evidence; summarize enduring knowledge in `docs/`.
