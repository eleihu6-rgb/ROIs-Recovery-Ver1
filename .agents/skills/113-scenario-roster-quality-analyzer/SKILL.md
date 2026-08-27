---
name: 113-scenario-roster-quality-analyzer
description: Build/extend the SCENARIO-only Roster Quality Analyzer in the gantt — a roster-pane toolbar button that opens a per-crew quality table (lead-in / pre-assignment / solver credit + extensible quality findings such as standalone RES), computed client-side from the loaded optimization result. Use when adding quality criteria, touching the analyzer dialog/button, or wiring a new scenario-only roster-pane action behind an optional source hook.
---

# Scenario Roster Quality Analyzer

A scenario-only roster-pane toolbar button → popup table, one row per loaded crew. Added
2026-06-21 (branch `feat/gantt/crew-memo-pa-removal`, FRONTEND_VERSION 292). Surfaces roster
quality after an optimization result returns.

## What it shows (per crew) — 5 columns (simplified)
Crew ID (clickable → float to top) · Base/Rank · **Lead-in CRD** · **Awarded credit** (stacked
Before opt / After opt) · **Quality** (findings list). A check-standard description block sits
above the table (testid `quality-analysis-standards`) explaining the criteria.

Credit partition (from `ScenarioGanttData`, by `source`):
- **Lead-in CRD** = `groundItems` where `source='PA'` → `actCreditedMinutes`.
- **Awarded credit / Before opt** (`quality-preassign`) = pairings assigned `source='PA'` →
  Σ duty credit (dedupe by dutySeq) = pre-assignment credit.
- **Awarded credit / After opt** (`quality-solver`) = pairings with `source='CR'` → Σ credit
  (solver-assigned). NOTE: earlier draft had separate Pre-assign/Solver/Awarded-Pairings columns —
  simplified away; `solverPairingCount`/`awardedPairings` removed from `CrewQualityRow`.

**Quality findings** (array, extensible — both rendered generically OK ✓ / amber count). Each
finding carries a stable `key` AND a human naming `id` (**`Qlty-1001`+**, single-sourced from
`QUALITY_RULE_IDS: Record<QualityRuleKey,string>` in quality-analysis.ts — append the next id when
adding a criterion, never reuse). The id is shown mono-prefixed in the standards block AND on every
finding chip (OK + amber). Current criteria:
- **Qlty-1001 standalone RES** (`standalone-res`): a reserve/standby day with no adjacent reserve
  day (`RES + blank + RES`). Client wants ≥2 consecutive RES/standby → every length-1 run flags.
  Reserve = `assignmentGroup==='SBY' || assignment==='RES'` (+ reserve PAIRINGS `SBY`).
- **Qlty-1002 consecutive working > 6 days** (`consecutive-working`): maximal run of consecutive
  WORKING days whose length > `MAX_CONSECUTIVE_WORKING_DAYS` (=6). Working = flight (any assigned
  pairing) + sim (`assignmentGroup/assignment==='SIM'`) + reserve/standby. Multi-day pairings
  expand across all spanned days (`pairing.schStrDtUtc..schEndDtUtc`). Day-off/leave/training are
  NOT working. Thresholds exported as `MAX_CONSECUTIVE_WORKING_DAYS` / `MIN_CONSECUTIVE_RESERVE_DAYS`
  from quality-analysis.ts (dialog imports them for the description text).
- **Qlty-1003 day-off only** (`day-off-only`): crew whose ENTIRE roster is days off — **0 assigned
  pairings** (no flying/reserve), ≥1 DO ground item, and **no** other ground (no sim/leave/vac/trn).
  Likely a data issue (crew received no assignable work). Per-crew boolean → `count=1` when flagged,
  detail = `["N days off"]`; the amber header drops the leading count for this key. Day-off predicate
  `isDayOff = group==='OFF' || group==='DO' || assignment==='DO'` — **real output uses group `DO`**
  (not the color-map's `OFF`); validated vs scen 543 (crew 1824 = 46 DO days; also 2660/2854/13066/2839).

## Architecture (the reusable pattern — scenario-only roster action)
Gate scenario-only behaviour structurally, NOT with `if(live)` (§Gantt-Unify):
1. Add an OPTIONAL hook to `RosterPaneSource` in
   `gantt/src/components/gantt/source/gantt-pane-source.ts` (mirror `useAlertCenter?`):
   `useQualityAnalysis?: () => { rows: CrewQualityRow[] }`.
2. Implement it ONLY in `makeScenarioRosterPaneSource` (`scenario-gantt-source.ts`) — a
   `useMemo` over `useGanttStore(s=>s.data)` calling the pure `computeRosterQuality(data)`.
   The Live source omits it → the button never renders in Live.
3. `SharedRosterPane` (`panes/shared/roster-pane.tsx`): read `roster.useQualityAnalysis?.()`,
   add dialog open-state, render the dialog, pass `onQualityClick` + `qualityIssueCount` to the
   strip. The `?.()` is non-conditional because live-vs-scenario is fixed per source instance
   (same eslint-disable comment as `useAlertCenter`/`useLockMap`).
4. `PaneConditionStrip` (`panes/pane-condition-strip.tsx`): `onQualityClick?` prop → a `Gauge`
   button (testid `quality-analysis-button`) in the action cluster, with an amber count badge.

## Check-standard description (above the table)
The dialog renders a short `quality-analysis-standards` block above the table explaining both
criteria in plain English. Thresholds are single-sourced: `MAX_CONSECUTIVE_WORKING_DAYS` (6) and
`MIN_CONSECUTIVE_RESERVE_DAYS` (2) are EXPORTED from `quality-analysis.ts` and interpolated into the
text so it can't drift from the actual rule. Add a sentence here whenever you add a criterion.

## Files
- Pure core: `gantt/src/components/scenario-gantt/quality-analysis.ts`
  (`computeRosterQuality`, `findStandaloneReserveDays`, `findLongWorkingRuns`, `isReserveStandby`,
  exported thresholds `MAX_CONSECUTIVE_WORKING_DAYS` / `MIN_CONSECUTIVE_RESERVE_DAYS`, types
  `CrewQualityRow` / `QualityFinding`). NO React — unit-testable.
- Dialog: `gantt/src/components/panes/quality-analysis-dialog.tsx` (`AppDialog`, testid
  `quality-analysis-dialog`; rows `quality-analysis-row[data-crew-id]`; cells
  `quality-leadin/preassign/solver`; findings `quality-finding-<key>` with `data-ok`/`data-count`;
  `quality-issues-only` checkbox; `quality-crew-link`).
- Unit test: `gantt/src/components/scenario-gantt/__tests__/quality-analysis.test.ts` (13 cases).
- E2E: `e2e/tests/gantt/scenario-roster-quality-analyzer.spec.ts` (Scen-2080).

## Bring-crew-to-top (scenario)
In `SharedRosterPane`, with `scenarioId`+`paneId` in scope:
`getScenarioLayoutStore(scenarioId).getState().setFoundCrewIds(paneId,[crewId])` +
`.setScrollY(paneId,0)`. The scenario source's `tierRows` already floats `foundCrewIds` first
(after frozen). NOTE: `window.__ganttTest.foundIds()` reads the LIVE pane-store, NOT scenario —
assert scenario float via `__ganttTest.scenarioCrewViolationSeverities()[0].crewId` (rows are in
rendered/tiered order).

## Testing
- Unit: `cd gantt && npx vitest run src/components/scenario-gantt/__tests__/quality-analysis.test.ts`
- E2E (offline, deterministic): mock the open flow — `seedScenarioListMocks(page,6,name)` +
  route `**/api/scenario/6/gantt-data` and `/lock-status`; open via
  `scenario.scenarioRow(6,name)`. Do NOT rely on the live scenario-list search (the demo remote
  DB is pathologically slow → flaky; see skill `gantt-scenario-open-e2e`). Arrange ground items
  as `RES`(day X), `RES`(day X+2) for an isolated flag and two consecutive `PRAM`/`PRPM` for OK.
  Run: `cd e2e && GANTT_API_URL=http://127.0.0.1:3000 npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/scenario-roster-quality-analyzer.spec.ts --no-deps`
- Gates: `npx tsc --noEmit` (gantt) clean; root `npm run check:ui` PASS. Bump
  `gantt/src/version.ts` FRONTEND_VERSION on any change.

## Real-data behaviour (validated vs scen 537 + scen 6, 2026-06-21)
Both are snapshot scenarios (`leadinLive=0`) and tag **every** assignment/ground item
`source='CR'` — there is NO `PA` pre-assignment-tagged data. So `Lead-in CRD` and `Before opt`
(pre-assignment credit) are **0/— for all crew** in these scenarios — BY DESIGN, confirmed
correct by the user (keep credit-only). Those two columns only populate for scenarios fetched via
the live-refresh path (`leadinLive=1`) that carry genuine lead-in credit, or scenarios with
pre-assigned FLYING trips (which carry credit). Scen 6 DOES have VAC (87) + ILL (4) ground items,
but they're `source='CR'` AND uncredited, so they intentionally do NOT appear as pre-assignment
credit. The solver-credit / standalone-RES / working>6d outputs ARE meaningful on real data (e.g.
scen 6 crew 274 had three >6d working runs; scen 537 crew 813 a real 9-day run). Capture real
gantt-data via `GET /api/scenario/<id>/gantt-data` (slow: ~70-100s on the demo DB).

## Pre-existing noise (not regressions)
Full `vitest run` shows 5 test FILES failing at import collection with
`Cannot find package 'react' from packages/ui/node_modules/@radix-ui/react-slot` — a monorepo
hoisting artifact (anything importing `@rois/ui`), pre-existing. All test CASES pass.

## Extending Quality with a new criterion
Add a `QualityFinding` to the `findings` array inside `computeRosterQuality` (give it a stable
`key`); the dialog renders it generically (OK ✓ vs amber count) and the badge/`issues-only`
filter pick it up automatically. Add unit cases. No dialog/source signature changes needed.
