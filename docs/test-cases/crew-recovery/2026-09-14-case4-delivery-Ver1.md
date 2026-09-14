# Recovery Case 4 — delivery and replay evidence

Date: 14 September 2026. Environment: Mac local Live UI (`http://localhost:5173/altair/`), existing live-server on 3000, `f8_sit_live`. No commit or push.

## Delivered flow

Unpaired flight → right-click **Recovery** → **Pairing Options** → compare alternative complete rotations with timeline and duty/flight/rest details → **Build pairing (Save)** → saved pairing at row 1 → close/reopen **Recovery — open seats** → rank-specific **Standby Crew**, **Available Crew**, or **Move-up / Roster Transfer** → Cost breakdown → authoritative legality **Preview** → **Apply** draft → main **Save**.

Build is an immediate commit and survives closing Recovery. Existing pairing assignments remain in place while missing rank seats are filled. A donor vacancy is explicitly **Partial**, even when the target becomes fully staffed. Missing prices are **Unpriced**, not zero. The original alert-based Cases 1–3 implementation remains behind its existing branch.

## Prepared review case

- Search dates: **17–25 September 2026**. Airline ET, home base ADD, exact fleet 738.
- Start with **ET895 on 17 September**, flight **159578**, ADD–BJM, 07:15–10:00 UTC.
- First option returns on **ET894**, flight **159547**, BJM–ADD, 12:35–15:00 UTC. Total block 05:10, one duty, CA1/FO1. Search offers competing rotations rather than consuming flights while enumerating.
- Persisted, isolated demo cohort: **C4001–C4020**. Pilot division P; Crew ID filter brings matching crew to the top (it is not a hard crew filter). Loaded Live roster scope drives candidate generation.
- Available crew: **C4001 CA / C4011 FO**. Genuine saved historical flying supplies their calendar-month credit baseline.
- Standby: **C4002–C4008 CA / C4012–C4018 FO**, ASBY **04:00–12:00 UTC**. This covers the 05:15 report time, not just flight departure.
- Move-up: **C4009 CA / C4019 FO**, owned donor **152683**, ET807/ET806 ADD–KGL–ADD.
- Use Help → Recovery → **Case study 4 — build and staff an open pairing** for illustrated steps.

### Final restored state

The two target flights are **unpaired**, donor 152683 is staffed again in both ranks, and the 305 active prepared C4 roster rows match the baseline semantically. No Case 4 callout markers or target assignments remain. Final fresh UI proof has no draft operations and Save disabled.

The last UI-built target was 152686; it was deliberately soft-deleted for replay. The separately executed target 152685 and its deleted roster history were retained for audit. Normal planner Close does **not** delete a pairing: the reset is a separate test operation.

Private snapshots, identities, receipts and reset utilities remain under `.local/case4/`, not in this report. Reset restores donor assignments through the roster service; restored row IDs/audit stamps can change. Derived duty-timezone cache columns are excluded from semantic equality. Operational roster fields and exception markers are checked. Target soft deletion is scoped, locked and rejects active assignments; generic physical deletion would erase history, and the generic remove-flight guard currently rejects historical deleted roster rows.

## Isolation evidence

Protected manifest covers **159 crews, 402 pairings, 916 flights and 2,537 roster rows**, plus associated crew qualifications/base/rank and manday records. It includes all original case sources, reserves and linked records, not just the three headline pairing IDs.

Before/after comparisons repeatedly returned identical ordered records:

`a1ee222c67c0827bd3dee8419266367d86eaa52826df2648bc72439ec7239cf6`

No protected crew/flight/pairing was assigned, moved, seeded or reset by Case 4. Cases 1–3 were regression-tested without Apply/Save. Final protected comparison and C4 baseline verification passed after the final UI runs.

## Real UI results

Each roster method started from the same saved-open target and prepared roster baseline. Both CA and FO were assigned through Preview → Apply → Save, rank coverage was asserted, then a fresh Live load confirmed all four persisted flight assignments.

| Test | Final result | Observed selected per-person cost |
|---|---|---|
| Build, row 1, close and reopen directly at roster options | PASS | Pairing build is separate from roster costs |
| Available Crew, C4001 + C4011 | PASS | USD 410.00 each |
| Standby Crew, C4002 + C4018 | PASS | USD 0.00 / 343.75 |
| Move-up, C4009 + C4019 | PASS | USD 2,470.00 each; donor vacancy remains Partial |
| Final unpaired-flight alternatives/chart and no-draft state | PASS | No writes |
| Help lazy topic, text and all three embedded images | PASS | No writes |
| Case 1: Alert Center SL/FLY overlap → standby costs | PASS | No Apply/Save |
| Case 2: real roster right-click → standby costs | PASS | No Apply/Save |
| Case 3: L3002 real roster right-click → standby costs | PASS | No Apply/Save |

Prices are real Cost Library estimates for the saved fixture, not fixed tariffs or future guarantees. Calendar-month GH credit is not RP credit. The move-up database read confirmed the donor had no active crew after both transfers; the scoped reset restored both donor ranks afterward.

### Exact Playwright commands

From `e2e/`, with the isolated fixture and reset preflight present:

```sh
CASE4_RUN_WRITES=1 npx playwright test -c config/case4.config.ts --grep 'Build saves'
CASE4_RUN_WRITES=1 npx playwright test -c config/case4.config.ts --grep 'Available Crew'
CASE4_RUN_WRITES=1 npx playwright test -c config/case4.config.ts --grep 'Standby Crew'
CASE4_RUN_WRITES=1 npx playwright test -c config/case4.config.ts --grep 'Move-up'
npx playwright test -c config/case4.config.ts --grep 'read-only'
npx playwright test -c config/case4-help.config.ts
RUN_CASES_1_3_READONLY=1 npx playwright test -c config/cases-1-3-readonly.config.ts
```

All listed final commands passed. Do **not** run all write methods sequentially against an already staffed target. Between methods, from repository root:

```sh
node --import ./live-server/node_modules/tsx/dist/loader.mjs .local/case4/reset.cjs <current-ui-target-id> --keep-pairing
```

Final reset/verification (last target 152686):

```sh
node --import ./live-server/node_modules/tsx/dist/loader.mjs .local/case4/reset.cjs 152686
node --import ./live-server/node_modules/tsx/dist/loader.mjs .local/case4/reset.cjs --verify
node .local/case4/inventory.cjs --compare
```

PASS. The ID must be the actual receipt from the current UI build, not the donor or a prior deleted target.

## Screenshots reviewed

All under `docs/assets/screenshots/crew-recovery/`, captured by real UI tests and visually inspected:

- `case4-pairing-options-Ver1.png` — alternative list, timeline, route/duty details, Build and Close visible.
- `case4-saved-open-pairing-Ver1.png` — saved row 1 and reopened roster-only Recovery.
- `case4-C4001-reloaded-Ver1.png` — available-crew persisted result.
- `case4-C4002-reloaded-Ver1.png` — standby persisted result.
- `case4-C4018-cost-Ver2.png` — nonzero existing-library standby GH cost.
- `case4-C4019-preview-Ver1.png` — before/after and explicit donor vacancy warning.
- `case4-C4009-reloaded-Ver1.png` — move-up persisted result.
- `case4-restored-initial-Ver1.png` — final restored Live state, Save disabled.
- `case4-help-Ver2.png` — final illustrated Help topic.
- `cases-1-3-readonly-J4002-152056-Ver3.png`
- `cases-1-3-readonly-T2001-152675-Ver4.png`
- `cases-1-3-readonly-L3002-152227-Ver4.png`

Earlier debug captures are preserved with versioned names; they are not completion evidence.

## Focused automated checks

```sh
cd gantt
npx vitest run src/services/__tests__/open-pairing-recovery.test.ts src/services/__tests__/open-recovery-save-reconcile.test.ts src/services/__tests__/recovery-trigger.test.ts src/services/__tests__/recovery-draft.test.ts src/services/__tests__/recovery-candidates.test.ts
```

**PASS: 69 tests.** Covers staffing eligibility/rank deficits, real donor operations, preserved unrelated tasks, legacy trigger/draft/candidate contracts, and successful-save/undo/failure/list-race reconciliation.

```sh
cd live-server
npx vitest run src/__tests__/services/pairing/recovery-rotations.test.ts src/__tests__/services/pairing/roundtrip-build.test.ts src/__tests__/services/pairing/roundtrip-routes.test.ts src/services/recovery/open-pairing-gh-cost.test.ts src/routes/recovery/recovery-cost.test.ts
```

**PASS: 37 tests.** Covers anchor alternatives and boundaries, original writer/routes, GH pricing failures and preservation of existing standby/transfer dispatch.

Recovery skill validation: `/tmp/rois-case4-skill-venv/bin/python /Users/kimi/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/145-crew-recovery-case-study` — **PASS**. The system Python initially lacked PyYAML; validation used an isolated temporary venv.

From repository root: `npm run check:ui` — **PASS**, 0 hard violations, 124 existing warnings. `git diff --check` — **PASS**.

### Existing broad gates / limitations

- `cd gantt && npx tsc --noEmit` — **FAIL**, only existing `service-status-pill.tsx` references to `ServiceEntry.livePort` and `SystemStatus.checkedAt` (3 errors). No Case 4 TypeScript errors.
- `cd live-server && npx tsc --noEmit` — **FAIL**, existing test-fixture typing errors in `discretion-consent-service.test.ts` and `transfer-gh-cost.test.ts` (4 errors). No Case 4 TypeScript errors.
- `node scripts/check-help-menu-coverage.mjs` — **FAIL**, existing Legality menu mapping gaps and missing `system-interface` Help topic. Not altered to disguise the gap.
- Search is bounded and labels truncation; it does not claim mathematically exhaustive enumeration after the search cap. Staffing uses loaded crew/roster scope; unsupported or missing pricing inputs remain Unpriced.
- Concurrency failures/shape changes have server writer and preview/capacity guards plus focused tests; no production multi-controller stress run was performed.

## Fixes found during implementation

- Added an actual rotation chart and constrained option-list height so Build/Close remain visible.
- Fixed an undefined donor ID accidentally matching an unrelated unpaired roster task.
- The own-save WebSocket pairing-list request could finish after the authoritative detail request and restore an old FO vacancy. Case 4 now waits for that list request and refreshes only its affected pairing details. Legacy save/recovery paths were not changed.
- UI test setup uses real filters/canvas gestures; optional test-hook arguments only read geometry (no state-mutating menu/scroll hooks). Rechecks and actual source selection were distinguished from clicking an overlapping ground-task bar.
- Raw PostgreSQL timestamp-without-time-zone values were verified before changing fixture times; Mac JSON parsing initially made correct times look shifted.

Agents supported fixture inventory/preparation, tests, chart and Help drafting. Primary reviewed/corrected their changes, owned final UI execution, fixed the coverage race, inspected screenshots and verified restoration. Pre-existing unrelated worktree changes were preserved.
