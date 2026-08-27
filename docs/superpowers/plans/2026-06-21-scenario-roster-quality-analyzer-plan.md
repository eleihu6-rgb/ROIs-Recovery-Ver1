# Scenario Roster Quality Analyzer — Plan

> 2026-06-21 · branch `feat/gantt/crew-memo-pa-removal`
> Feature: a **scenario-only** roster-pane toolbar button that opens a per-crew
> roster-quality table after an optimization result returns.

## Goal (from the request)

When a scenario optimization result is open in the Scenario Gantt, the planner can
click a **Quality Analyzer** button in the roster pane toolbar to open a popup table.
One row per loaded crew:

| Column | Meaning | Source |
|---|---|---|
| Crew ID | crew code (clickable → bring that crew to the **top** row of the gantt) | `data.crew[].crewId` |
| Base/Rank | e.g. `YEG/CA` | `crew.base` / `crew.rank` |
| Lead-in CRD | credited hrs of **lead-in ground** duties carried into the scenario | `groundItems` where `source='leadin'` → `actCreditedMinutes` |
| Pre-assign CRD | credited hrs of **pre-assigned pairings** (locked before solve) | `assignments` where `source='leadin'` → Σ duty credit |
| Solver Assigned | `n / HH:MM` = solver pairing count / total credit | `assignments` where `source='CR'` |
| Awarded Pairings | the solver pairings + each pairing's credit | `pairings` + `pairingSegments` |
| Quality | extensible quality findings; first criterion = **standalone RES** | reserve/standby duties |

> The request says Quality may add more criteria later, so the Quality cell is an
> **array of findings**, not a single value.

### Quality criterion #1 — standalone RES

Client expects a minimum of **two consecutive** RES/standby days. A reserve/standby day
that is isolated (`RES + blank + RES`, i.e. a maximal consecutive run of length 1) is a
quality flag. The dialog shows the count + the isolated dates.

- A duty is reserve/standby when `assignmentGroup === 'SBY'` (the backend's own group
  classification — data-driven, not a hard-coded code list) **or** the assignment code is
  exactly `RES` (the code the client named). Reserve **pairings** (`pairing.assignmentGroup
  === 'SBY'`) count too.
- Day key = UTC date of the duty start (`schStrDtUtc.slice(0,10)`). Build the sorted unique
  day set per crew, split into maximal consecutive-calendar-day runs, count runs of length 1.

## Architecture (respects §Gantt-Unify / §Minimal-First / §Surgical)

- **Scenario-only** is structural, not an `if(live)` branch: add an OPTIONAL
  `useQualityAnalysis?: () => { rows: CrewQualityRow[] }` to `RosterPaneSource`
  (mirrors the existing optional `useAlertCenter?`). Only the **scenario** source
  implements it; the Live source omits it → the button never renders in Live. This is
  the established capability-gating pattern, allowed because the spec writes the Live/
  Scenario difference explicitly.
- **No backend / no new network** (§First-Paint): the table is computed client-side,
  lazily on dialog open, from the already-loaded `ScenarioGanttData`. O(crew × items).
- **Pure core**: `computeRosterQuality(data)` in `quality-analysis.ts` — unit-tested
  with vitest (deterministic proof of the RES algorithm), independent of React.

## Files

1. `gantt/src/components/scenario-gantt/quality-analysis.ts` — pure compute + types (NEW)
2. `gantt/src/components/scenario-gantt/__tests__/quality-analysis.test.ts` — vitest (NEW)
3. `gantt/src/components/panes/quality-analysis-dialog.tsx` — AppDialog table (NEW)
4. `gantt/src/components/gantt/source/gantt-pane-source.ts` — add `useQualityAnalysis?`
5. `gantt/src/components/gantt/source/scenario-gantt-source.ts` — implement it (scenario only)
6. `gantt/src/components/panes/pane-condition-strip.tsx` — `onQualityClick?` + button
7. `gantt/src/components/panes/shared/roster-pane.tsx` — dialog + bring-crew-to-top callback
8. `gantt/src/version.ts` — FRONTEND_VERSION +1
9. `e2e/tests/gantt/scenario-roster-quality-analyzer.spec.ts` — Playwright (NEW, Scen-2080)

## Bring-crew-to-top (scenario)

Reuse the existing scenario "found" tier: `getScenarioLayoutStore(scenarioId)
.setFoundCrewIds(paneId, [crewId])` + `.setScrollY(paneId, 0)`. The scenario roster
source already floats `foundCrewIds` to the top (after frozen) in `tierRows`. The
callback is built in `SharedRosterPane` where both `scenarioId` and `paneId` are in scope.

## Tests (§Playwright-Required + §No-Illusion)

- **Unit**: standalone-RES runs (isolated vs 2-consecutive vs 3-run), credit partition by `source`.
- **E2E**: mock `/api/scenario/:id/gantt-data` (the demo engine 502s) with crew + leadin/CR
  assignments + RES ground items arranged as `RES, blank, RES` → open scenario → click the
  quality button → assert the row's credits + `1 standalone RES` + clicking Crew ID floats it
  to row 0 (via `window.__ganttTest`).
