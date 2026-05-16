# AI Docs Entrypoint

## Status
This file is the documentation entrypoint for AI agents working on the KU-LMS extension redesign. It was created in this task because the repository previously lacked the required entrypoint file.

## Read first
1. `docs/ku-lms-design-code.md` — binding UI design code for all future AI/frontend work.
2. `docs/ku-lms-extension-architecture.md` — current extension architecture, supported routes, takeover strategy, and design-system notes.
3. `docs/ku-lms-session-safety-analysis.md` — durable analysis of the homepage auto-loading / forced-logout risk and the binding session-safety rule for future agents.
4. `DESIGN.md` — repo-root design pointer to the canonical design contract.
5. `.omx/plans/prd-ku-lms-home-safe-refresh-deadlines.md` — current active-phase PRD for removing homepage auto-fetching, making course visits the authoritative cache writer, and adding validation-gated homepage refresh.
6. `.omx/plans/test-spec-ku-lms-home-safe-refresh-deadlines.md` — current active-phase verification requirements for cache pruning, refresh-state persistence, restoration, side-effect suppression, and live go/no-go validation.
7. `.omx/plans/prd-ku-lms-deadlines-syllabus-session-safety.md` — earlier deadline detail recovery / direct syllabus / session-safety PRD that remains relevant background.
8. `.omx/plans/test-spec-ku-lms-deadlines-syllabus-session-safety.md` — earlier verification requirements for that phase.
9. `.omx/plans/prd-ku-lms-home-upcoming-session-safety.md` — earlier homepage upcoming/session-safety PRD that remains relevant background.
10. `.omx/plans/test-spec-ku-lms-home-upcoming-session-safety.md` — earlier verification requirements for that phase.
11. `.omx/plans/prd-ku-lms-review-followups.md` — earlier post-review homepage/syllabus PRD that remains relevant background.
12. `.omx/plans/test-spec-ku-lms-review-followups.md` — earlier verification requirements for that phase.
13. `.omx/plans/prd-ku-lms-course-materials-syllabus-fixes.md` — earlier deadline/materials correctness and syllabus-jump PRD that remains relevant background.
14. `.omx/plans/test-spec-ku-lms-course-materials-syllabus-fixes.md` — earlier verification requirements for that phase.
15. `.omx/plans/prd-ku-lms-width-deadlines-materials.md` — prior width/deadline/materials PRD that remains relevant background.
16. `.omx/plans/test-spec-ku-lms-width-deadlines-materials.md` — prior verification requirements for that phase.
17. `.omx/plans/prd-ku-lms-refactor-fixes.md` — previous bug-fix / route-completion PRD that remains relevant background.
18. `.omx/plans/test-spec-ku-lms-refactor-fixes.md` — previous verification requirements that remain relevant background.
19. `.omx/plans/prd-ku-lms-redesign.md` — original redesign PRD that established the takeover baseline.
20. `.omx/plans/test-spec-ku-lms-redesign.md` — original redesign verification baseline.
21. `.omx/artifacts/visual-ralph/ku-lms-redesign/reference-manifest.json` — approved visual reference mapping.

## Update rules
- Add new stable implementation docs here when they become authoritative for future agents.
- Keep `.omx/` artifacts as phase/run evidence; summarize enduring knowledge in `docs/`.
