# Case 4 automatic discovery — verification
Target: http://localhost:5173/altair/, saved ET895/ET894 pairing 152689, ADD–BJM–ADD.
No roster Apply/Save, build, reset or fixture writes performed. Existing pairing retained.

## Behavior
Removed Find roster options. Opening saved pairing Recovery or loading the result of Build
automatically discovers all three staffing strategies for the first open rank. Changing rank
or ruleset refreshes. Shared cost tiers/table/cost/details/preview retained.
Preview crew floating and method switching do not restart discovery. Generation guards
discard outdated searches; detail-load completion cannot clear a newer search's busy state.
Help and skill145 updated; delegated test edits reviewed by primary.

## Receipts
- PASS: cd gantt && npx vitest run src/components/recovery/__tests__/recovery-plan-tree.test.tsx src/services/__tests__/open-recovery-presentation.test.ts src/services/__tests__/recovery-candidates.test.ts — 32 tests.
- PASS: cd e2e && npx playwright test -c config/case4-standard.config.ts — 1 test; auto-open CA, CA→FO→CA, wrong-rank absence, three strategies, cost/detail/Preview/return.
- PASS: cd e2e && npx playwright test -c config/case4-gh-pool.config.ts — 1 test; seven executable standby candidates, USD0–326.25, costs and previews, zero drafts.
- PASS: cd e2e && RUN_CASES_1_3_READONLY=1 npx playwright test -c config/cases-1-3-readonly.config.ts — 3 tests.
- PASS: cd e2e && npx playwright test -c config/case4-help.config.ts — 1 test, automatic wording/obsolete wording absent/images loaded.
- PASS: npm run check:ui — 0 hard violations, 124 existing warnings.
- PASS: git diff --check.
- PASS: node .local/case4/gh-pool-verify.cjs — roster/manday deltas match, Cases1–3 protected snapshot unchanged.
- PASS: /tmp/rois-case4-skill-venv/bin/python /Users/kimi/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/145-crew-recovery-case-study.
- FAIL (existing unrelated): cd gantt && npx tsc --noEmit — three service-status-pill.tsx errors for ServiceEntry.livePort/SystemStatus.checkedAt; no recovery errors.
- FAIL (existing unrelated): node scripts/check-help-menu-coverage.mjs — Legality mapping and System/Interface topic gaps.
- Not rerun: write-gated Build/Apply/Save/reset E2E, to preserve the user-created pairing. Those selectors now await automatic discovery.

## Same-run evidence
Visually inspected:
- docs/assets/screenshots/crew-recovery/case4-auto-discovery-Ver1.png — populated methods/cost tiers, automatic message, no Find button.
- docs/assets/screenshots/crew-recovery/case4-gh-pool-C4006-cost-Ver2.png — USD326.25 actual GH breakdown.
- docs/assets/screenshots/crew-recovery/case4-standard-swap-duty-preview-Ver4.png — donor vacancy and Partial warning.
- docs/assets/screenshots/crew-recovery/case4-help-Ver9.png — Help renders correctly.
Help uses versioned copies recovery-case4-cost-tiers-Ver2.png and recovery-case4-standby-cost-Ver3.png.
