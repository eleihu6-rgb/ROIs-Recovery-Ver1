# Gantt Month Quick Jump Full-Month Coverage Design

## Context

The Live Gantt time axis has a right-click `Go to Month` menu implemented by
`gantt/src/components/gantt/time-axis-menu.tsx`. Selecting a month currently calls
`useGanttViewStore.zoomToMonth()`, which is intended to make the chosen calendar month fill the
timeline viewport. The Help page already promises this behavior.

The missing edge case is a month that is only partially covered by the current loaded date range.
For example, if the loaded range starts on May 21 and the user chooses May 2026, the quick jump
must show the full month, not just the visible/loaded May 21 onward portion.

## Requirement

When a user selects a month from the Live Gantt time-axis quick-jump menu, the timeline must show
the full selected calendar month from its display-timezone month start through the next month start.

This applies to:

- A month fully inside the current loaded range.
- A month fully outside the current loaded range.
- A month partially inside the current loaded range, including when the range starts mid-month or
  ends before the month finishes.

For partial and outside months, the quick jump must expand the loaded range to include the full
selected month before applying the month-fit zoom. The expansion must preserve any already-loaded
range outside the target month.

## Approach

Use the existing Live Gantt quick-jump path and make its coverage check stricter.

1. In `TimeAxisMenu`, compute target month boundaries using the existing display-timezone helpers:
   `calendarDateToUtcMidnight()` for the first day and `endOfCalendarDayUtc()` for the last day.
2. Treat a month as covered only when the current filter date range fully contains both boundaries.
   Partial overlap is not covered.
3. On click, if the month is not fully covered, widen the filter date range to:
   - `min(currentStart, monthStart)`
   - `max(currentEnd, monthEnd)`
4. Keep the existing `applyGanttFilters()` reload path so data streams in through the same first-paint
   and pane-loading flow used today.
5. Keep the existing `zoomToMonth(year, month, rangeStart, viewportWidth)` implementation for the
   actual viewport fit.

## Out Of Scope

- No new date picker UI.
- No change to Scenario Gantt quick jump unless the same bug is separately confirmed there.
- No change to month label rendering, pane layout, or toolbar placement.
- No backend or database changes.

## Testing

Update Live Gantt Playwright coverage in `e2e/tests/gantt/timeline-month-quicknav.spec.ts`.

Add a regression case that:

1. Sets the Live Gantt date range to start mid-month while still including part of that month.
2. Opens the time-axis `Go to Month` menu.
3. Selects that partially covered month.
4. Asserts the stored date range expands to include the full month start and month end.
5. Asserts the visible timeline window fully covers the selected month.

Existing quick-jump tests for out-of-range months and month-fit behavior should remain valid.

## Verification

Implementation verification must include:

- `cd gantt && npx tsc --noEmit`
- `cd gantt && npm run check:ui` if frontend style files are changed
- Targeted Playwright run for the month quick-jump spec

Because this is a frontend runtime change, `gantt/src/version.ts` must increment
`FRONTEND_VERSION` during implementation.
