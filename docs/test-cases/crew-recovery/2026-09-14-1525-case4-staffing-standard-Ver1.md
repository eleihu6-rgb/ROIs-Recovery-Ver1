# Case 4 — shared staffing UI standard

## Delivered

Standby, Available Crew and Move-up / Roster Transfer now use the same PlanGroup,
RecoveryDetailDialog and cost breakdown as Cases 1–3. Compact preview summary is a
shared RecoveryPreviewDock. Includes execution checkbox, All/Executable/Filtered,
crew name/rank, Cancel/Add/Stability/Cost, row Preview/Detail, GH notes and library
breakdown. Open-seat presentation adapter preserves no displaced source crew,
retained standby and explicit vacant donor seat. Same loaded-roster scope is used
for stability comparison. Checks use the selected legality ruleset.

Delegation: supporting agent authored the adapter and three tests. Primary reviewed
and corrected the roster grouping/weighted stability scope, added real two-leg test
coverage, and implemented/reviewed shared UI integration and screenshots.

## Verification receipts

From `gantt`:

- `npx vitest run src/services/__tests__/open-recovery-presentation.test.ts src/services/__tests__/open-pairing-recovery.test.ts src/services/__tests__/recovery-candidates.test.ts src/components/recovery/__tests__/recovery-cost-breakdown-dialog.test.tsx` — PASS, 49 tests.
- Existing cost test expected no decimal places; corrected stale expectation to the
  current two-decimal currency display and reran successfully.
- `npx tsc --noEmit` — FAIL, only the three existing service-status-pill.tsx missing
  ServiceEntry.livePort / SystemStatus.checkedAt errors. No recovery errors.

From `e2e`:

- `npx playwright test -c config/case4-standard.config.ts` — PASS, one test exercising
  all three strategies, cost/GH breakdown, full before/after details, Preview,
  Apply eligibility, donor Partial warning and zero final draft operations.
- `RUN_CASES_1_3_READONLY=1 npx playwright test -c config/cases-1-3-readonly.config.ts`
  — PASS, all three legacy entries and costed standby options.
- `npx playwright test -c config/case4-help.config.ts` — PASS, standard text and images.

From root:

- `npm run check:ui` — PASS, 0 hard violations / 124 existing warnings.
- `git diff --check` — PASS.
- `/tmp/rois-case4-skill-venv/bin/python /Users/kimi/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/145-crew-recovery-case-study` — PASS.
- `node scripts/check-help-menu-coverage.mjs` — FAIL, existing missing System/Interface
  help topic and Legality helpTopicSlug gap, unrelated to Case 4.

## Evidence visually inspected

Under `docs/assets/screenshots/crew-recovery/`:

- `case4-standard-standby-options-Ver3.png` (shared table and GH notes)
- `case4-standard-standby-cost-Ver2.png` (authoritative GH breakdown)
- `case4-standard-roster-options-Ver1.png` (Available Crew table)
- `case4-standard-swap-duty-options-Ver2.png` (donor warning)
- `case4-standard-swap-duty-detail-Ver1.png` (two-leg donor release / target addition)
- `case4-standard-swap-duty-preview-Ver2.png` (shared preview and Partial warning)
- Legacy: J4002/152056 Ver5, T2001/152675 Ver6, L3002/152227 Ver6 screenshots.
- `case4-help-Ver5.png`.

All strategy cost/detail/preview captures are retained under `case4-standard-*`.
First UI attempt failed on a test-only nested locator; corrected the relative row
locator and reran successfully. No product failure was hidden.

## Data and remaining limits

Read-only replay used the user's existing saved pairing **152689**, ET895/ET894
ADD–BJM–ADD Sep17, 738. Compared C4002 standby (USD0), C4001 available (USD410),
C4009 move-up (USD2470). Prices are observed estimates, not fixed tariffs.
No flight/pairing/roster writes, seeds, Apply, Save or reset were performed.
The user's pairing remains intact. Cases 1–3 business data was not mutated.
No fresh whole-DB protection-hash comparison is claimed. Historical reset manifests
remain unsafe against shared-data drift. Save was not rerun in this presentation-only
follow-up; prior execution evidence remains in the original Case4 delivery report.

Help and recovery skill updated. No commit or push.
