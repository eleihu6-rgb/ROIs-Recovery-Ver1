# Scenario Gantt Timeline RP Navigation and Scrollbar Fix

## Problem

Scenario Gantt still showed two Timeline regressions after the Live fix in `8a93b764`:

1. After Timeline `GO TO RPDate`, RP07 must place the viewport left edge at the selected RP start, not at the padded lead-in range start.
2. After dragging on the Timeline to zoom following an RP jump, the horizontal scrollbar must use the new zoom scale instead of stale RP pixel bounds.

## Design

- Mirror Live's proven invariant: manual Timeline drag-to-zoom is a normal viewport operation, so it clears `scrollWindowStartX` to `0` and `scrollWindowEndX` to `null`.
- Keep `GO TO RPDate` viewport-only. It zooms to the intersection of the selected RP and the already loaded Scenario range; it does not widen the range or trigger backend reloads.
- Add focused store and Playwright regression coverage for Scenario, using mocked scenario data but real UI mouse/context-menu interactions.

## Verification Plan

- `npm --prefix gantt test -- src/stores/__tests__/scenario-gantt-store.test.ts --run`
- `npx tsc -b` in `gantt/`
- `cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/scenario-gantt-default-viewport.spec.ts --reporter=list`
- `npm run check:ui`

## Risk

The fix is limited to Scenario Timeline viewport state and regression hooks. It does not alter backend data loading, Scenario date range ownership, or Live behavior.
