# Gantt Pairing Offscreen Date Jump Design

## Context

In the Pairing pane, users can see the left-side pairing rows while the timeline is horizontally scrolled to a date range where the pairing blocks are not visible. The current UI does not make it obvious whether a row's pairing starts before or after the visible Gantt window, so users cannot quickly jump to that pairing.

The requested behavior is explicitly scoped to the Pairing pane body, not the global time header. The original pairing row order must remain unchanged.

## Goal

For pairing rows whose scheduled start is outside the currently visible timeline window, show a date jump hint as the first visible row area in the Pairing pane. The hint displays the pairing start date with direction markers:

- `<< Date` when the pairing starts before the visible timeline window.
- `Date >>` when the pairing starts after the visible timeline window.

Clicking the hint horizontally scrolls the Gantt timeline so the visible window starts two days before the pairing start date. This makes the pairing visible while preserving a small amount of context before it begins. It does not change the pairing data order.

## Proposed UX

Add a lightweight synthetic top indicator row inside the Pairing pane's right-side Gantt timeline body, above normal pairing blocks and below the Pairing pane toolbar/filter strip. The label must not be rendered in the left Pairing row/header area.

When currently visible pairing rows are outside the horizontal viewport, the pane shows one jump hint per offscreen pairing row in the visible row band:

- If the pairing has ended left of the viewport, render `<< YYYY-MM-DD`.
- If the pairing starts right of the viewport, render `YYYY-MM-DD >>`.
- If all visible pairings overlap the viewport, do not render the indicator row.

The row is clickable and only changes shared horizontal timeline scroll (`scrollX`). The target date is `pairing.schStrDtUtc - 2 days`, clamped to the beginning of the loaded Gantt date range. Vertical scroll, sorting, filtering, frozen rows, and loaded pairing order remain unchanged.

## Implementation Notes

- Use `PairingPane` as the feature owner because it already knows:
  - `reorderedPairingItems`
  - current pane `scrollY`
  - `dateRange.start`
  - current `pxPerHour` and shared `scrollX`
  - `canvasContainerRef` width
- Derive the visible pairing row band from `scrollY / PAIRING_ROW_HEIGHT`, taking frozen rows into account conservatively.
- Scan that visible band and render a hint for every pairing whose full time span is offscreen.
- Compute pairing start X with existing `timeToX(parseIsoCached(pairing.schStrDtUtc), dateRange.start, pxPerHour, timezone)`.
- Compare against `[scrollX, scrollX + visibleTimelineWidth]`, where `visibleTimelineWidth` comes from the right-side canvas container width.
- On click, compute `targetDate = pairingStartDate - 2 days`, then call `useGanttViewStore.getState().setScrollX(targetX)` for that target date, clamped to `0`.
- Keep the normal arrays `reorderedPairingItems` and `reorderedPanelRows` unchanged. The hint is UI chrome, not a data row.

## Rendering Approach

Prefer a DOM overlay row in the right-side timeline area for the jump hint rather than inserting a fake row into canvas data:

- It avoids changing hit-test row indexes and context menu behavior.
- It avoids disturbing row order, selection, frozen rows, and rubber-band selection.
- It can sit visually as the first row in the Pairing pane without being part of the pairing list.

The overlay should be narrow and professional, matching existing Gantt colors and typography. It should not appear in the global header.

## Validation

- Run `cd gantt && npx tsc --noEmit`.
- Manual checks:
  - Scroll timeline away from visible pairings and confirm the Pairing pane shows `<< YYYY-MM-DD` or `YYYY-MM-DD >>`.
  - Click the hint and confirm only horizontal date position changes, with the Gantt window starting at pairing start date minus two days when possible.
  - Confirm pairing row sort/filter order is unchanged.
  - Confirm no hint appears when the first visible pairing start date is already visible.

## Open Decisions

The implemented target is each offscreen pairing among currently visible Pairing rows. This keeps the hint row-aligned and avoids requiring a selected or hovered row.
