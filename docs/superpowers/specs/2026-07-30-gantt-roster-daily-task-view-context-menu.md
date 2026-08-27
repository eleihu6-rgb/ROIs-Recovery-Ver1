# Gantt Roster Daily Task View Context Menu

## Goal

Add a `Daily Task Calendar` right-click action on both Live and Scenario Roster Gantt.

The action opens a crew-level daily calendar dialog inspired by the Report reference in:

- `/home/rois/Flair_PBS_Optimization_Report/src/frontend/src/unittest/ScheduleGantt.tsx`
- `/home/rois/Flair_PBS_Optimization_Report/src/frontend/src/unittest/CrewCalendar.tsx`
- `/home/rois/Flair_PBS_Optimization_Report/src/frontend/src/unittest/calendarModel.ts`

The ROIS version should show actual task blocks inside calendar days, with colors close to the Roster Gantt blocks.

## User Requirements

- Add the right-click menu on Live Roster Gantt and Scenario Roster Gantt.
- Menu label: `Daily Task Calendar`.
- Reference the Report calendar shown when clicking the left side of the Gantt crew row/header.
- Show a daily calendar with task blocks and statistics.
- Task colors should stay close to Gantt task colors.
- Live: support previous/next month switching.
- Scenario: default to the optimization RP period.

## Existing Context

Recent related feature:

- `Schedule Details` already adds a Live/Scenario Roster context-menu dialog.
- It stores dialog state in `gantt/src/stores/ui-store.ts`.
- It builds Live/Scenario roster rows from already-loaded data and avoids first-paint blocking.
- It has Live and Scenario Playwright coverage.

Current relevant files:

- Live context menu: `gantt/src/components/roster/context-menu.tsx`
- Scenario context menu: `gantt/src/components/scenario-gantt/scenario-context-menu.tsx`
- Shared shell dialog mount: `gantt/src/components/shell/app-shell.tsx`
- Roster data model builder: `gantt/src/components/scenario-gantt/build-scenario-roster-items.ts`
- RP selector/store: `gantt/src/components/common/rp-select.tsx`, `gantt/src/stores/roster-period-store.ts`
- Assignment colors: `gantt/src/stores/assignment-store.ts`

## Proposed UX

### Menu Placement

Show `Daily Task Calendar` only for Roster context menus:

- Live roster task/puck right-click
- Live roster empty row/header right-click
- Scenario roster task/puck right-click
- Scenario roster empty row/header right-click

Do not show it in Pairing or Flight pane context menus.

Use a calendar icon, for example lucide `CalendarRange` / `CalendarDays`.

### Dialog

Create a new `DailyTaskCalendarDialog` under `gantt/src/components/roster/`, mounted once in `AppShell`.

Use `@rois/ui` `AppDialog`.

Dialog title:

- `Daily Task Calendar - <crewId>`

Toolbar:

- Crew selector, same source as `ScheduleDetailsDialog`.
- Timezone toggle: current Gantt timezone / UTC.
- Live mode:
  - month label
  - previous month button
  - next month button
  - optional `This Month` / `Viewport Month` reset button if compact enough
- Scenario mode:
  - RP label such as `2026RP07 · 2026-07-01 to 2026-07-31`
  - no previous/next month switching in first version

Layout:

- Calendar grid on the left.
- Statistics panel on the right.
- Keep density appropriate for operational UI, not a large marketing-style calendar.

Calendar:

- Monday-start weekly grid.
- Each day cell shows:
  - date number
  - up to 2-3 visible compact task blocks
  - overflow indicator such as `+2` when more tasks overlap that day
- Empty day cells show an understated open/blank state.
- Current selected period/month cells only; no large spillover months unless needed to complete the week grid.

Task blocks:

- Label preference:
  - flying: pairing label or flight label; include `DHD` when applicable
  - ground: `label`, then `assignment`, then `assignmentGroup`
- Tooltip/title includes start/end in selected timezone and source/pairing when available.
- Color:
  - use `useAssignmentStore.getState().getAssignmentColor(item.assignment, item.assignmentGroup)` for task block fill
  - fallback to group color
  - for normal `FLT`, this should align with Roster Gantt's blue flight blocks
  - for standby/ground/reserve, this should align with assignment-specific colors

Statistics:

- Count days by primary status:
  - Flight
  - Reserve / Standby
  - Ground / Pre-assign
  - Day Off
  - Open
- Count total task blocks in the displayed window.
- Show max consecutive runs:
  - Work
  - Off/Open
  - Reserve/Standby
- Show total credit for displayed tasks using the same credit fallback as Schedule Details:
  - `dutyActCreditedMinutes`
  - `actCreditedMinutes`
  - `schCreditedMinutes`

## Data Strategy

### Shared Helper Model

Add a pure utility, likely `gantt/src/utils/daily-task-view.ts`, that converts loaded `RosterItem[]` into:

- calendar days
- per-day overlapping task blocks
- primary daily status
- stats
- month/RP bounds

This should build on existing `schedule-details.ts` ideas but produce daily cells rather than table rows.

### Live

Use loaded Live roster data from the same pane as the context menu source:

- `roster-main` → `useRosterStore.getState().main.rosterItems`
- `roster-sub` → `useRosterStore.getState().sub.rosterItems`

Default displayed month:

- month containing the viewport leftmost visible date in the current Gantt timezone.

Month switching:

- Previous/next changes only the dialog's month filter.
- It does not move the Gantt viewport.
- If the selected month is outside the currently loaded Live Gantt range, fetch only that selected crew's roster for the chosen month in the background.
- The fetch must be scoped to one crew and one calendar month, not a full Gantt reload.

### Scenario

Use loaded Scenario data from `getScenarioGanttStore(scenarioId)` and `buildScenarioRosterItems()`.

Default displayed range:

- optimization RP period when resolvable from `roster_period` / viewport RP.
- fallback to `scenarioStrDt` / `scenarioEndDt` if RP options are not loaded or no match exists.

No month switching in first version.

### First-Paint Rule

The dialog must compute calendar rows only after opening.

No new backend calls on Gantt first paint.

## Implementation Plan

1. Extend `ui-store` with daily task calendar dialog open state:
   - `dailyTaskCalendarOpen`
   - `dailyTaskCalendarCrewId`
   - `dailyTaskCalendarScenarioId`
   - `dailyTaskCalendarPane`
2. Add pure utility for:
   - month/RP bounds
   - local-day enumeration
   - task/day overlap
   - primary day status
   - task block labels/colors/stats
3. Add `DailyTaskCalendarDialog`.
4. Add `Daily Task Calendar` to Live Roster context menu.
5. Add `Daily Task Calendar` to Scenario Roster context menu.
6. Mount the dialog in `AppShell`.
7. Add focused Vitest coverage for:
   - task-to-day overlap
   - primary status priority
   - Live month bounds
   - RP bounds
   - stats/counts/credit
8. Add Playwright coverage:
   - Live: right-click roster row → `Daily Task Calendar` → dialog opens for selected crew → month nav works and can fetch the next month for one crew.
   - Scenario: right-click scenario roster row/puck → `Daily Task Calendar` → dialog opens for selected crew and RP.

## Expected Files Touched

- `gantt/src/stores/ui-store.ts`
- `gantt/src/components/roster/context-menu.tsx`
- `gantt/src/components/scenario-gantt/scenario-context-menu.tsx`
- `gantt/src/components/shell/app-shell.tsx`
- `gantt/src/components/roster/daily-task-calendar-dialog.tsx`
- `gantt/src/utils/daily-task-view.ts`
- `gantt/src/utils/__tests__/daily-task-view.test.ts`
- `e2e/tests/gantt/daily-task-calendar-dialog.spec.ts`
- `e2e/tests/gantt/scenario-context-menu.spec.ts` or a focused scenario daily-task spec

## Verification Plan

- `cd gantt && npx tsc --noEmit`
- `cd gantt && npx vitest run src/utils/__tests__/daily-task-view.test.ts`
- `npm run check:ui`
- focused Playwright specs for Live and Scenario Daily Task Calendar

## Risks

- Live month switching must avoid broad reloads. Fetch only the selected crew/month when the requested month is outside the loaded range.
- Scenario RP matching depends on `roster-period-store` being loaded. The dialog should load/reuse `RpSelect`/store data or fall back to scenario dates.
- Calendar day boundaries must use the selected display timezone, not host browser timezone.
- Colors should use assignment-store colors to match the current Canvas renderer; avoid hard-coded duplicate palettes.

## Open Questions

1. For Live month switching outside the loaded Gantt range, should the dialog fetch that crew/month on demand, or is showing only loaded data acceptable for first version?

Confirmed:

- fetch only that selected crew/month in the background.

2. Should Scenario support switching between multiple RPs if the scenario loaded range spans lead-in/out into adjacent RPs?

Confirmed:

- no. Scenario displays only the optimization RP / scenario period.
