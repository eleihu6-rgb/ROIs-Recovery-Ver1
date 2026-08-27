# Gantt Row Zebra Contrast Design

Date: 2026-06-26
Scope: Gantt frontend row backgrounds for Live and Scenario views

## Goal

Improve row readability across the Gantt table by making alternating row backgrounds easier to distinguish and visually continuous from the left fixed details panel through the right timeline body.

The current Gantt supports five pane instances. This change applies to all five:

- Roster Main
- Roster Sub
- Pairing Main
- Pairing Sub
- Flight

It applies equally to Live Gantt and Scenario Gantt through the shared canvas rendering path. No Live-only or Scenario-only styling branch should be introduced.

## Current Behavior

The right timeline body paints an alternate row background using the shared Gantt alternate background color. The color is currently very light in the default theme, which makes adjacent rows hard to distinguish.

The left fixed details panel paints its own row backgrounds. When the body and header panel do not use the same effective stripe color, a row can feel visually disconnected across the splitter.

## Desired Behavior

All five pane instances should use one shared row-stripe decision:

- The same row index should receive the same alternate background in the left fixed panel and right timeline body.
- The alternate background should be darker than the current default light stripe, while remaining subtle enough that task blocks, row text, violation markers, locks, selection, frozen rows, today highlight, weekend highlight, and grid lines stay readable.
- Selection and frozen-row overlays remain visually stronger than the base stripe.
- Existing row parity remains stable. The implementation must not flip which rows are striped unless that is already required by the shared renderer.

## Recommended Implementation

Add or reuse a shared row-background helper in the Gantt canvas layer so the body renderer and header renderer consume the same effective alternate row color and parity logic.

The preferred implementation is:

- Extend the shared Gantt color model with a stronger alternate row color only if the existing `bgColorAlt` token is too broad for this purpose.
- Use the helper in `renderers/base-renderer.ts` for the timeline body.
- Use the same helper in `pane-header-canvas.tsx` for fixed-panel rows, including normal two-line rows and Pairing two-line rows.
- Keep the change source-neutral so Live and Scenario Gantt inherit the behavior through shared components.

Avoid:

- Separate Live vs Scenario branches.
- Separate Roster vs Pairing vs Flight one-off color constants.
- Changing unrelated task colors, grid geometry, row heights, or pane layout.

## Verification

Required checks after implementation:

- TypeScript check for the Gantt frontend.
- UI standards check because this is a frontend style change.
- Playwright or equivalent browser verification that Live and Scenario shared Gantt panes show continuous alternating row backgrounds across the left panel and timeline body.
- Confirm `FRONTEND_VERSION` is incremented.

## Risks

The main risk is reducing contrast for text or small markers in themed variants. The implementation should use theme-aware colors and preserve overlay layering so selected/frozen rows, warnings, and tasks remain readable.
