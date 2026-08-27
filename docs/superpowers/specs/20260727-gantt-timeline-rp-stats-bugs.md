# Gantt Timeline RP Navigation Regression Fix

## Problem

After using the Timeline context menu to go to a roster period:

1. Drag-to-zoom leaves the global horizontal scrollbar with invalid thumb geometry, so it cannot be dragged horizontally.
2. The Live Roster header loads the previous RP's `RpCredit`/`RpDO`/related manday values until the viewport is dragged several hours into the target day.

## Evidence

- `zoomToRp` stores `scrollWindowEndX` in pixels derived from the RP zoom level.
- `TimeAxis` drag-to-zoom directly changes `pxPerHour` and `scrollX` but leaves that pixel window unchanged.
- The scrollbar derives its thumb from the stale window, so its geometry no longer matches the current zoom.
- `live-gantt-source.ts` normalizes `xToTime(...)` with date-fns `startOfDay`, which uses the host timezone rather than the selected Gantt display timezone.

## Design

### 1. Keep scrollbar geometry consistent after manual zoom

Manual Timeline zoom is a normal viewport operation, not an RP-scoped navigation lock. When drag-to-zoom changes the scale, clear `scrollWindowStartX/scrollWindowEndX` and clamp the resulting `scrollX` against the full loaded range. This preserves the complete loaded range as draggable content and prevents stale pixel bounds.

The existing toolbar zoom actions should keep the same behavior. The change is limited to the Timeline drag-to-zoom path and shared store behavior needed to keep the state invariant.

### 2. Resolve the leftmost visible calendar day in display timezone

Add a small pure helper that converts the leftmost visible instant to the selected display-timezone calendar midnight using the existing `calendarDateToUtcMidnight` utility. Use it for the Live Roster viewport RP/statistics key. The stats endpoint receives the RP code (`2026RP07`), while the existing store field is historically named `crewStatsYearMonth`. The RP indicator already uses timestamp containment and remains unchanged.

This makes `2026-07-01 00:00` in the selected Gantt timezone resolve to RP07 immediately, independent of the browser's host timezone.

## Verification

- Store regression test: after `zoomToRp`, drag-style zoom state has no stale scroll window and the full loaded range remains scrollable.
- Pure timezone test: a leftmost instant around a North American local midnight resolves to the correct calendar day/RP.
- Playwright regression: right-click `GO TO 2026RP07`, verify the scrollbar remains draggable after Timeline drag-zoom, and verify the Roster header statistics switch at the target period's leftmost `00:00` without an extra-hour pan.
- Run `npm run check:ui` because the touched path is frontend code, plus focused Vitest and Playwright tests.

## Risks

- Clearing an RP window changes only the scrollbar's internal geometry; it does not widen backend data or change the selected date range.
- The selected display timezone must remain the single source for calendar-day boundaries.
