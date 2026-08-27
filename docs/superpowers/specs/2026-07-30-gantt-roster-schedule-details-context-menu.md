# Gantt Roster Schedule Details Context Menu

## Goal

Add a `Schedule Details` right-click action on both Live and Scenario Roster Gantt.

The action opens a crew-level schedule table, using the Report reference implementation at:

`/home/rois/Flair_PBS_Optimization_Report/src/frontend/src/unittest/ScheduleDetails.tsx`

The ROIS implementation must preserve the existing Live/Scenario Gantt architecture:

- one user-facing behavior for both Live and Scenario
- context-specific data resolved behind existing stores/source adapters
- no first-paint blocking
- business dialogs use `@rois/ui` `AppDialog`

## Reference Behavior

The Report `ScheduleDetails` page:

- opens from a Gantt crew row with an initial crew selected
- shows a `Schedule details` dialog
- has a crew selector
- has a UTC vs base-local timezone segmented control when a base timezone is known
- excludes bid-only / wanted rows
- sorts actual schedule items chronologically
- shows row columns:
  - Type
  - Start
  - End
  - Credit hours
  - Label

## Existing ROIS Context

Live roster right-click is handled by:

- `gantt/src/components/roster/context-menu.tsx`
- `gantt/src/components/gantt/source/live-gantt-source.ts`
- `gantt/src/components/panes/roster-pane.tsx`

Scenario roster right-click is handled by:

- `gantt/src/components/scenario-gantt/scenario-context-menu.tsx`
- `gantt/src/components/gantt/source/scenario-gantt-source.ts`
- `gantt/src/components/panes/shared/roster-pane.tsx`

The current UI state host is:

- `gantt/src/stores/ui-store.ts`

Existing related dialogs:

- `MandayInfoDialog` already opens from Live and Scenario roster row context menus using `crewId` plus optional `scenarioId`.
- `PairingInfoDialog` and `FlightDetailDialog` already share Live/Scenario rendering through `scenarioId` in `ui-store`.

## Confirmed User Decisions

- Default range: the roster period containing the current viewport's leftmost visible date.
- Manual range switch: add an `RP Date` single-select dropdown in the dialog.
- Timezone switch: current Gantt display timezone / UTC.

## Proposed User Experience

### Menu Placement

Show `Schedule Details` in the Roster right-click menu for:

- right-clicking a roster task/puck
- right-clicking an empty area of a roster row / crew header row

The action should not appear in Pairing or Flight pane context menus.

Label:

- `Schedule Details`

Icon:

- `CalendarDays` or closest available lucide calendar/list icon.

### Dialog

Create a `ScheduleDetailsDialog` mounted near existing shared dialogs in `AppShell`, so it is available to Live and Scenario views.

Use `@rois/ui` `AppDialog`, not raw `DialogContent`.

Dialog title:

- `Schedule Details - <crewId>`

Dialog content:

- compact crew selector
- `RP Date` single-select dropdown
- timezone segmented control:
  - `UTC`
  - current Gantt display timezone label
- schedule table with sticky header and scroll body

Columns:

- `Type`
- `Start`
- `End`
- `Credit`
- `Label`
- `Pairing`
- `Source`

The extra `Pairing` and `Source` columns are useful in ROIS because `RosterItem` already carries those fields and planners distinguish `IMP` / `PA` / `MA` / `CR`.

Rows:

- all loaded roster items for selected crew
- exclude placeholder/context-menu mock rows (`id <= 0`)
- include only rows that overlap the selected RP Date's `[rpStart, rpEnd]` bounds
- sort by `schStrDtUtc`
- group only by visible roster item rows; do not call new backend APIs during first paint

Credit display:

- use `dutyActCreditedMinutes` first
- fallback to `actCreditedMinutes`
- fallback to `schCreditedMinutes`
- show `-` when absent
- format minutes as `HH:MM`

Type display:

- if `pairingId != null`, show `Pairing`
- otherwise show `assignmentGroup` / `assignment` / `label`, whichever is most specific

Time display:

- default to current Gantt display timezone, mirroring the main Gantt view
- allow switching to UTC
- use `Intl.DateTimeFormat`, no new dependency

## Data Strategy

### Live

Use already-loaded Live roster data from `useRosterStore`.

For the initial crew:

- task right-click: use `contextMenuTask.crewId`
- row/background right-click: use mock task `crewId`

For the crew selector:

- derive crew ids from currently loaded roster items and currently loaded panel rows when available
- do not trigger a full crew/roster load

For the RP selector:

- use `useRosterPeriodStore` / `RpSelect`
- default to `rpForTimestamp()` using the Live viewport leftmost time
- preserve the user's manual selection while the dialog remains open

### Scenario

Use already-loaded Scenario roster data from `getScenarioGanttStore(scenarioId).data` and/or the built roster model source.

For initial crew:

- task right-click: use `contextMenuTask.crewId`
- row/header right-click: use mock task `crewId`

Rows must include Scenario ground tasks as well as assigned pairings, using the same loaded Scenario Gantt data that already renders the Roster pane.

For the RP selector:

- use `useRosterPeriodStore` / `RpSelect`
- default to `rpForTimestamp()` using the Scenario viewport leftmost time
- preserve the user's manual selection while the dialog remains open

### No First-Paint Regression

The dialog builds rows only after the user opens it.

No backend request is needed for the first version unless implementation discovers Live loaded data is incomplete for the selected crew. If incomplete data is found, add an explicit loading state and fetch only the selected crew/date range after dialog open.

## Implementation Plan

1. Extend `ui-store` with `scheduleDetailsOpen`, `scheduleDetailsCrewId`, `scheduleDetailsScenarioId`, and open/close actions.
2. Add `ScheduleDetailsDialog` under `gantt/src/components/roster/`.
3. Build small pure helpers for:
   - converting loaded Live roster rows to schedule-detail rows
   - converting loaded Scenario rows to schedule-detail rows
   - formatting credit minutes
   - formatting UTC/display-zone datetimes
   - deriving the default viewport RP id for Live/Scenario
4. Add `Schedule Details` to Live roster context menu for roster task and roster row/background targets.
5. Add `Schedule Details` to Scenario roster context menu for roster task and roster row/header targets.
6. Mount the dialog in `gantt/src/components/shell/app-shell.tsx`.
7. Add focused unit/component tests for row mapping if local patterns exist.
8. Add Playwright coverage that drives the real UI:
   - Live: right-click roster row or puck, click `Schedule Details`, assert dialog opens with selected crew and schedule rows.
   - Scenario: open a scenario roster, right-click roster row or puck, click `Schedule Details`, assert dialog opens with selected crew and scenario schedule rows.
9. Run:
   - `cd gantt && npx tsc --noEmit`
   - `cd gantt && npm run check:ui`
   - focused Playwright specs for the new context-menu flow

## Impact / Blast Radius

Expected files touched:

- `gantt/src/stores/ui-store.ts`
- `gantt/src/components/roster/context-menu.tsx`
- `gantt/src/components/scenario-gantt/scenario-context-menu.tsx`
- `gantt/src/components/roster/schedule-details-dialog.tsx`
- `gantt/src/components/shell/app-shell.tsx`
- focused tests under `e2e/tests/gantt/` and/or component tests

Risk level:

- Medium, because it touches shared context-menu state and Live/Scenario Roster menus.
- Low data-write risk: this is read-only UI.
- Low first-paint risk if rows are computed lazily only while dialog is open.

GitNexus note:

- Project instructions require `impact()` before symbol edits, but the current Codex tool surface did not expose GitNexus tools via `tool_search`. Implementation should either use GitNexus if tools become available or proceed with explicit manual caller/callee tracing recorded in the final verification.

## Open Questions

- Should the dialog list only the current viewport month, like the Report reference, or all currently loaded roster rows in the Gantt date range?

Recommended default:

- all currently loaded rows in the Gantt date range, because Live/Scenario Gantt already lets the user choose an arbitrary range and this avoids hiding lead-in/out duties unexpectedly.

- Should timezone toggle use crew base-local time specifically, or the current Gantt display timezone?

Recommended default:

- current Gantt display timezone plus UTC, because the current Gantt has a user-selected display timezone and airport/base local mapping may be incomplete for some rows.
