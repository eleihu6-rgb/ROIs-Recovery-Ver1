# Gantt Schedule Details and Daily Task Calendar Corrections

## Status

Awaiting user approval before implementation.

## Scope

Correct and redesign the existing Live/Scenario Roster Gantt dialogs:

- `Schedule Details`
- `Daily Task Calendar`

The dialogs remain shared user-facing features. Live/Scenario data and selection differences stay behind small source helpers, following `§Gantt-Unify`.

## Confirmed Problems

### Schedule Details

1. RP07 can show a task whose displayed start date is June 30.
2. The Label suffix currently shows `Flight <fltId>` instead of `pairing.pairing_label`.
3. Rows do not select the corresponding Roster task on the Gantt.
4. The query strip and table need a denser professional redesign.

### Daily Task Calendar

1. A multi-day ground task is repeated on every overlapping day instead of belonging to its start day.
2. Live month switching must fetch one crew's data from live-server by the selected RP period.
3. Calendar task blocks do not select the corresponding Roster task on the Gantt.
4. Credit does not match the Roster Header `RpCred`.
5. The query strip, calendar, and statistics rail need a denser professional redesign.

## Root Causes

1. `schedule-details.ts` uses overlap filtering and parses RP boundaries as UTC midnights. A task that starts on June 30 and ends on July 1 is therefore included in RP07.
2. `scheduleLabelForItem()` builds the suffix from `fltId`; `RosterItem` does not currently expose `pairingLabel`.
3. `daily-task-view.ts` enumerates every date between task start and end, so ground tasks repeat across days.
4. Daily Calendar sums credit by roster item id. Flying duty credit repeats on every segment, and Header `RpCred` is an authoritative manday period aggregate, not a raw roster-row sum.
5. Daily Calendar passes full ISO timestamps to `/api/roster`, but the live-server route contract is date-only `YYYY-MM-DD`; the service appends its own UTC day boundaries.

## Date and RP Semantics

### One ownership rule

A roster task belongs to the RP/calendar day containing its **scheduled start date** in the selected display timezone.

- Do not include a task merely because its end overlaps the selected RP.
- Do not spread a ground task across every day until its end.
- Flying roster segments also appear on their own segment start date; a multi-day pairing naturally appears through its separate segment rows.

This exact client-side start-date check is applied after the backend's padded/UTC query result so a previous local calendar day cannot leak into the selected RP.

### Live period switching

The Daily Calendar `Month` control navigates the ordered `roster_period` options:

- Display: `<rp.name> · <rp.rosterPeriod>`.
- Fetch: `rosterApi.getView([crewId], rp.rpStart, rp.rpEnd)`.
- Request values remain date-only strings.
- Cache fetched rows locally by `crewId + rosterPeriod`; do not mutate/reload the full Gantt store.
- Loaded Gantt rows may be reused, but the same start-date-in-RP filter is always applied.

`Schedule Details` continues to use its RP dropdown and applies the same exact ownership rule. If its selected RP is outside the loaded window, it may reuse the same one-crew/RP loader rather than showing incomplete rows.

### Scenario period

Scenario stays fixed to the optimization RP/scenario official period:

- No previous/next period navigation.
- Use loaded Scenario data only.
- Filter tasks by scheduled start date within the official scenario/RP range.

### Timezone behavior

- `Gantt TZ` / `UTC` changes displayed timestamps and day ownership.
- RP request boundaries remain the date-only `rpStart/rpEnd` contract.
- Changing timezone reruns the exact client-side start-date filter but does not broaden the backend request.

## Pairing Label Data

Add optional `pairingLabel` to `RosterItem`.

### Live

Extend `rosterService.getView()`:

- Join `pairing` by `roster_flight.pairing_id`.
- Return `pairingLabel` in the trimmed Gantt DTO.
- Bump the roster chunk cache namespace/version so old cached DTOs without `pairingLabel` are not reused.

### Scenario

`buildScenarioRosterItems()` copies `pairing.pairingLabel` onto every flying roster item.

### Schedule Details display

- Flying label: existing segment/task label followed by `· <pairingLabel>`.
- Do not show `Flight <fltId>` in the Label column.
- Ground task label remains `label → assignment → assignmentGroup`.

## Gantt Task Selection

Create one shared imperative helper for both dialogs:

`selectRosterTaskFromDialog(items, taskId, scenarioId?)`

Behavior mirrors direct Canvas selection:

- Flying item: select all item ids for the same crew + pairing.
- Ground item: select only that task id.
- Live: write through `useGanttViewStore.selectTasks/selectTask`.
- Scenario: write through `getScenarioRosterSelectionStore(scenarioId).setTasks(...)`.
- Keep the dialog open.
- Selected rows/blocks receive an internal selected treatment so the click has immediate visible feedback.

Schedule rows:

- `cursor-pointer`
- restrained hover background
- keyboard activation with Enter/Space
- selected left-edge/accent treatment

Calendar blocks:

- render as real buttons
- pointer cursor and tooltip
- selected outline/ring without replacing the assignment color

## Credit Source

The Daily Calendar `Credit` statistic must use the same authoritative value as Header `RpCred`.

### Live

On crew/RP change, fetch:

`crewApi.getCrewStats([crewId], selectedRp.rosterPeriod)`

Display `stats[crewId].mcred`.

This is a scoped background request after dialog open and does not affect Gantt first paint.

### Scenario

Read:

`scenarioData.crewStats[crewId][selectedRosterPeriod].mcred`

with the existing compatibility fallback to `.credit`.

### Failure/absence

- Show an em dash/loading state rather than a derived roster-row total.
- Do not use a raw roster sum as an authoritative fallback because guarantee bands and server ruletool logic can differ.

Other calendar counts and consecutive-day statistics remain client-derived from the displayed day model.

## Shared UI Redesign

Use a common dense dialog query strip/component for both dialogs.

### Query strip

- Single compact full-width band below the AppDialog title.
- Consistent control heights and label alignment.
- Crew selector is the flexible primary control.
- Period control follows it:
  - Schedule Details: RP dropdown.
  - Live Daily Calendar: previous button + current Month/RP display + next button.
  - Scenario Daily Calendar: read-only RP badge/text.
- Timezone is a compact segmented control aligned at the right.
- Loading/error feedback is inline and does not create a permanent extra toolbar row.

### Schedule Details table

- Wider dialog, approximately 1040px max width.
- Sticky table header with clearer column grouping.
- Compact operational row height.
- Start/End/Credit/Pairing use tabular numbers.
- Label receives the flexible width.
- Alternating/hover treatment remains subtle and token-based.
- Optional small result count in the query strip, not a separate card.

### Daily Task Calendar

- Wider dialog, approximately 1120px max width.
- Calendar keeps stable seven-column geometry.
- Day cells use a restrained header/date area and denser task stack.
- Task buttons retain Gantt assignment colors.
- Statistics move into a flat right rail with grouped rows rather than many floating mini-cards.
- `RpCred` is the primary statistic and visually aligned with Header terminology.
- Loading state appears next to the period control/stat label.
- No nested cards and no decorative gradients/orbs.

## Expected Code Changes

### Frontend

- `gantt/src/types/roster.ts`
- `gantt/src/components/roster/schedule-details-dialog.tsx`
- `gantt/src/components/roster/daily-task-calendar-dialog.tsx`
- `gantt/src/components/scenario-gantt/build-scenario-roster-items.ts`
- `gantt/src/utils/schedule-details.ts`
- `gantt/src/utils/daily-task-view.ts`
- New shared dialog toolbar/data/selection helper only if it removes confirmed duplication.
- Focused Vitest tests.
- Focused Live and Scenario Playwright tests.

### Backend

- `live-server/src/services/roster/roster-service.ts`
- `live-server/src/__tests__/services/roster/roster-service.test.ts`

No new endpoint is required.

## Test Coverage

### Vitest

1. RP07 excludes a task whose selected-timezone start date is June 30 even if it ends July 1.
2. A task beginning July 1 is included.
3. Schedule label uses `pairingLabel`, not `fltId`.
4. Ground task appears only on its start day.
5. Flying segment appears on its start day.
6. Live/Scenario selection helper selects pairing-group ids and single ground-task ids.
7. Scenario builder carries `pairingLabel`.
8. Roster service DTO returns `pairingLabel`.

### Playwright

1. Live Schedule Details:
   - selected RP excludes previous-day row;
   - row hover/click selects the Gantt roster task;
   - pairing label is displayed.
2. Scenario Schedule Details:
   - row click selects Scenario roster task.
3. Live Daily Calendar:
   - period navigation requests one crew with date-only RP bounds;
   - ground task appears once;
   - task click selects Gantt roster pairing/ground task;
   - Credit equals Header `RpCred`.
4. Scenario Daily Calendar:
   - fixed optimization RP;
   - task click selects Scenario roster task;
   - Credit equals Scenario Header `RpCred`.

## Verification

- `cd gantt && npx tsc --noEmit`
- Focused Gantt Vitest files
- Focused live-server roster service Vitest
- `cd live-server && npm run build`
- `npm run check:ui`
- Focused Live/Scenario Playwright specs
- Visual inspection at desktop and compact viewport for both dialogs

## Non-Goals

- No full Gantt reload when switching the Daily Calendar period.
- No Scenario period navigation.
- No new credit arithmetic in the frontend.
- No changes to manday/ruletool business calculation.
- No change to Canvas task selection semantics.
