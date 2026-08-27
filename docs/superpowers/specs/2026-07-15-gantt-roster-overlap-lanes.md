# Gantt Roster Overlap Lanes

Date: 2026-07-15
Module: `gantt`
Status: Approved and implemented

## Goal

Add a Roster Pane button for both Live and Scenario Gantt that toggles an overlap-lane display mode.
When enabled, overlapping duties for the same crew are drawn on separate visual lanes within that
crew row:

- Earlier duties take the first lane.
- Later overlapping duties are placed into the next available lane.
- Non-overlapping duties before or after the conflict reuse the first lane.
- A flight pairing is kept as one whole unit for lane placement.
- A ground duty is kept as one whole unit for lane placement.

## Scope

This is a shared Gantt feature and must be implemented once in the shared Live/Scenario Roster Pane
path:

- `gantt/src/components/panes/shared/roster-pane.tsx`
- `gantt/src/components/panes/pane-condition-strip.tsx`
- `gantt/src/components/gantt/renderers/roster-renderer.ts`

The button belongs in the pane toolbar action cluster, following `gantt/CLAUDE.md`
`§Pane-Toolbar-Home`. It must be an icon-only square button with a tooltip, not a new horizontal band.

## Proposed Behavior

Default mode stays unchanged.

When overlap lanes are enabled:

1. Build render groups per crew using the existing renderer grouping concept:
   - `pairingId !== null`: one lane unit spanning the whole pairing, including pickup/brief, all duty
     segments, dropoff, layover/rest where available.
   - `pairingId === null`: one lane unit spanning the ground duty, including rest where available.
2. Sort units by effective start time, then effective end time.
3. Assign each unit to the first lane whose previous unit ends before or at the new unit start.
4. If no lane is free, create a new lane.
5. Draw lane 0 at the normal row-center position; draw lane 1+ above/below with compact vertical
   offsets inside the same crew row.
6. If too many lanes exist for the fixed row height, cap visible lanes and keep a small overflow marker
   so the row remains readable.

The first implementation should keep the existing crew row height and row count unchanged. This avoids
changing scroll math, frozen row math, header-canvas alignment, row selection, and hit-testing contracts
in the same change.

## Non-Goals

- Do not create separate physical crew rows for each lane.
- Do not change roster data, assignment logic, or backend APIs.
- Do not fork Live and Scenario implementations.
- Do not change Pairing Pane or Flight Pane layout.

## Product Decision

The first implementation keeps the existing fixed crew row height. Lane blocks compress inside the row
so scrolling, frozen rows, left header alignment, and row selection keep their existing contracts.
Hit-testing uses the same lane layout map as rendering, so fully overlapping tasks can be selected from
the lane where they are displayed.

## Verification Plan

Automated:

- Add focused unit coverage for the lane assignment helper:
  - non-overlapping units all use lane 0
  - overlapping units use lane 0, lane 1, lane 2 in start-time order
  - later non-overlapping units return to lane 0
  - pairing units remain intact
  - ground duties remain intact
- Add or update Playwright coverage for Live/Scenario Roster Pane:
  - button is present in the pane condition strip
  - toggling it changes overlap display without changing row count
  - at least one controlled overlapping fixture renders separate lane positions

Manual/visual:

- Verify Live Roster and Scenario Roster both show the button in the same toolbar cluster.
- Verify normal mode is unchanged.
- Verify overlapping duties are visually separable and earlier duties occupy the first lane.

Required commands after implementation:

- `cd gantt && npx tsc --noEmit`
- `npm run check:ui`
- smallest touched Playwright test(s) for Roster Pane overlap lanes
