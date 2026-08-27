# Pane Row Resize Min-Height Design

Date: 2026-07-22
Scope: `gantt` Live + Scenario shared vertical pane resizing
Status: Draft for review

## Problem

The current shared vertical row-resize behavior only enforces a minimum height on the row above the dragged splitter. It does not reserve minimum visible space for the rows below.

Result:

- With `roster + pairing + flight` open, dragging the lower splitter downward can compress the bottom pane until it is effectively invisible.
- With `roster + pairing` open, dragging the upper splitter downward can compress the lower pane the same way.
- This affects both Live and Scenario because they share the same row-splitter interaction model.

Expected behavior:

- Every visible vertically stacked pane must keep a minimum visible height.
- Dragging should stop at the limit rather than pushing a lower pane out of the viewport.

## Decision

Use a shared resize constraint in the row-resize helper.

This extends the existing shared helper introduced for row-anchor stability so the helper now enforces both:

1. The dragged row keeps its own minimum height.
2. All visible rows below the dragged splitter retain enough total height to keep each row visible at the same minimum height.

This logic remains shared between Live and Scenario to preserve §Gantt-Unify.

## Approach

### Shared helper contract

The shared row-resize helper will be extended to accept enough geometry to clamp the dragged row against the available vertical space:

- current `rowHeights`
- measured heights of visible rendered rows
- dragged row index
- drag delta `dy`
- row minimum height
- total available layout height for the visible row stack
- splitter count or equivalent reserved vertical chrome needed between visible rows

### Resize rule

When dragging row `i`:

1. Materialize visible rows `0..i` from flex to measured px heights when needed, matching the already-approved anchor-stability behavior.
2. Compute the minimum reserved height for all visible rows below `i`.
3. Compute the maximum allowed height for row `i` so the remaining visible rows below still have at least their minimum height.
4. Clamp the dragged row between:
   - lower bound: `MIN_ROW_HEIGHT`
   - upper bound: `maxAllowedHeight`
5. Leave rows below as-is unless they are still flex rows participating in the normal layout fill.

### Visibility rule

If there are `n` visible rows below the dragged splitter, the helper must reserve at least:

`n * MIN_ROW_HEIGHT`

for those rows, plus any fixed splitter chrome height required by the layout container.

This means:

- the bottom `flight` pane can no longer be shrunk out of view
- the `pairing` pane can no longer be shrunk out of view in a two-row stack
- drag motion past the limit becomes a no-op instead of continuing to write impossible heights

## Affected Code

- `gantt/src/components/layout/row-resize.ts`
- `gantt/src/components/layout/layout-grid.tsx`
- `gantt/src/components/scenario-gantt/scenario-layout-grid.tsx`

Possible small touch points:

- `gantt/src/components/layout/grid-row.tsx`
- Live/Scenario tests only, if additional geometry hooks are needed

No data model, API, or business data behavior changes are involved.

## Testing

### Unit

Add shared-helper tests covering:

- three visible rows, drag lower splitter downward, bottom row remains at or above min height
- two visible rows, drag upper splitter downward, lower row remains at or above min height
- overshoot drag is clamped and does not continue increasing the upper row beyond the legal maximum

### Playwright

Update focused UI regressions for both Live and Scenario:

- with three panes open, repeatedly drag the lower splitter downward
- assert the bottom pane remains visible
- assert the bottom pane height stays above the minimum threshold

Existing anchor-stability assertions stay in place.

## Risks

- The main risk is miscounting reserved vertical space if row borders or splitter bars are omitted from the available-height calculation. That would show up as a small visual mismatch near the drag limit.
- To minimize risk, use the measured rendered container height and visible row count from the same DOM subtree that owns the splitter interaction.

## Out of Scope

- Changing the pane minimum height value itself
- Horizontal split behavior
- Pane open/close ordering
- Reworking layout storage shape beyond what is needed for the clamp

## Acceptance

- A visible lower pane cannot be dragged out of the viewport by vertical splitter movement.
- The clamp applies consistently in both Live and Scenario.
- Existing stable-order and stable-anchor behavior continues to pass.
