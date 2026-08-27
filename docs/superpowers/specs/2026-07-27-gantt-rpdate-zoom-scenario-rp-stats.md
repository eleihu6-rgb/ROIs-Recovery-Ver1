# Gantt RPDate Zoom And Scenario RP Stats Fix

Date: 2026-07-27

## Problem

- Live and Scenario `GO TO RPDate` must expose the selected RP from its RP start day `00:00`. The month-stat `00:01` boundary bias is valid for resolving "which month am I in", but it must not make the user-visible RPDate start drift.
- After default/RP zoom, the viewport should show the intersection of the selected RP and the already-loaded Gantt range. The horizontal scrollbar must still represent the complete loaded range, so it can be dragged back to the loaded start.
- Right-click `GO TO RPDate` is navigation only. It must not widen `dateRange` or call `applyGanttFilters`; backend loads happen when the user changes the RP range selection or applies query filters.
- Scenario roster `RpCred` / `RpDO` must match Live: the client passes/uses a roster-period key (`YYYYRPnn`), and Scenario `crew_manday_*_period` stores period rows with the same `roster_period` key semantics as Live.

## Scope

- Gantt frontend stores and time-axis RPDate navigation.
- Scenario Gantt source roster panel stats mapping.
- Live-server Scenario Gantt crew stats payload shape if needed to expose roster-period keys.

No unrelated Gantt layout, filtering, pairing, solver, or rule-engine changes.

## Design

1. Preserve the month-zoom `00:01` bias for month navigation/stat membership only.
2. Add an RP viewport intersection so navigation to a partially loaded RP shows only its loaded portion, while the horizontal scrollbar continues to cover the complete loaded range.
3. Apply that clamp in both Live and Scenario RPDate navigation and Scenario default official-date initialization.
4. Make Scenario roster Rp stats resolve by the current leftmost roster period, matching Live:
   - use `rpForTimestamp` against `roster-period-store`
   - prefer `crewStats[crewId][rosterPeriod]`
   - fall back only for older payloads/tests where period keyed rows are absent
5. Keep Scenario manday period storage aligned with Live:
   - `scenario.crew_manday_fd_period` / `scenario.crew_manday_cc_am_period` aggregate from daily rows by joining live `roster_period`
   - Gantt DB payload reads those period tables by `roster_period`
   - seed Scenario views call the same Live stats service with a roster-period key, not `YYYY-MM`

## Impact / Risk

- GitNexus could not resolve `zoomToRp` or local `handleSelectRp` callback symbols because they are Zustand object properties / local callbacks; manual call-chain inspection shows they are only called from Live and Scenario time-axis RPDate menu paths plus existing store tests.
- GitNexus `useScenarioGanttSource` upstream impact: LOW, 5 impacted symbols, affected process `ScenarioGanttView`.
- GitNexus `computeScenarioCrewStats` upstream impact: LOW/0 direct, but route dynamic imports are not detected, so route tests must cover the payload behavior.

Risk is medium overall because this touches shared time geometry and Scenario header stats, but the intended behavior is narrow and testable.

## Verification Plan

- `npm --prefix gantt test -- src/stores/__tests__/gantt-view-store-zoom-rp.test.ts src/stores/__tests__/scenario-gantt-store.test.ts src/components/gantt/source/__tests__/scenario-gantt-source.test.ts --run`
- `npm --prefix live-server test -- src/__tests__/unit/scenario-gantt-route-seed-manday.test.ts src/services/scenario/__tests__/scenario-gantt-db-service.test.ts --run`
- `npm run check:ui` if frontend style files are touched; expected not needed for logic-only changes.
- Playwright real-UI coverage is required before claiming delivery; add or update the smallest Gantt E2E that opens Live/Scenario RPDate menu, selects an RP, and asserts the test hook leftmost time is `00:00` plus Scenario RpCred/RpDO are non-empty.
- For right-click `GO TO RPDate`, the E2E should also assert that no `/api/roster` request is fired by navigation alone.
