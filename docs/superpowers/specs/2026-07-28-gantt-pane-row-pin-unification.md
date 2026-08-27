# Gantt Pane Row Pin Unification

Date: 2026-07-28

## Problem

Live/Scenario row pinning is inconsistent across panes:

- Pairing Pane pin-to-top can hide the right-side Gantt blocks after pinning.
- Pairing left header pin icon cannot reliably unpin, especially in Scenario.
- Flight Pane rows cannot be selected from the left header and cannot be pinned from the right-click menu.
- Pin behavior is currently treated as pane-specific wiring, while product behavior should be common: selected pane rows can be pinned to the top, pinned rows stay visible on the right canvas, and the header pin icon unpins that row.

## Root Cause From Code Reading

- `PaneCanvas` uses shared frozen-row rendering, but `drawFrozenOverlay` still has stale pairing-sensitive geometry and comments from the old blank-overlay behavior.
- `SharedPairingPane` reads optional row-freeze source members, but `makeScenarioPairingPaneSource` only exposes row selection, not `useFrozenRowCount`, `unfreezeRow`, or `markDirty`.
- `SharedFlightPane` already computes selected row indices from optional `useSelectedRowIds`, but it always passes `frozenRowCount={0}` and does not wire `onRowClick`, `onRowRightClick`, or `onUnfreezeRow`.
- `FlightPaneSource` lacks the same row-freeze capability shape that `PairingPaneSource` already has.
- Scenario context menu only supports Scenario Roster pinning; Live context menu already has generic `usePaneStore` pin/unpin, so Scenario should be extended to pane-store backed `scenario-pairing` / `scenario-flight` rows.

GitNexus note: the current Codex tool environment exposes no GitNexus MCP tools, so required `impact()` / `detect_changes()` cannot be run from this session. Local code tracing is the fallback.

## Desired Behavior

- Roster, Pairing, and Flight panes share one row pin mental model.
- Left header row click selects rows in Flight and Pairing, in both Live and Scenario.
- Right-click on a selected Flight or Pairing row exposes `Pin N Selected Row(s)`.
- Pinned rows are moved to the top and remain visible in both the left header and right canvas.
- Clicking the pin icon on a frozen left-header row unpins that row.
- `Unpin All (N)` is available when a pane has frozen rows.
- Pinning remains a view-only action. It does not create draft edits and does not write backend data.

## Implementation Plan

1. Fix shared frozen overlay geometry:
   - Use `getHeaderHeight(rc)` in `drawFrozenOverlay` separator calculations so Pairing's taller header is respected.
   - Keep the existing non-destructive overlay behavior: tint and separators only, no blanking of row content.

2. Make row pinning a common source capability:
   - Add `useFrozenRowCount`, `selectRow`, `toggleRowSelection`, `selectRowRange`, `unfreezeRow`, and `markDirty` to `FlightPaneSource`, mirroring Pairing.
   - Implement those members in Live Flight source using `usePaneStore('flight')`.
   - Implement those members in Scenario Flight source using `getPaneStore(scenarioId)` with `scenario-flight`.

3. Complete Pairing Scenario parity:
   - In Scenario Pairing source, reorder rows as frozen first, then found rows, then the rest.
   - Expose `useFrozenRowCount`, `unfreezeRow`, and `markDirty` for `scenario-pairing`.

4. Wire `SharedFlightPane` to the common row-freeze behavior:
   - Compute frozen row count from source.
   - Make hit-testing and rubber-band row math frozen-aware, matching Pairing.
   - Pass frozen count to `PaneHeaderCanvas` and `PaneCanvas`.
   - Wire left-header row click, right-click, and pin-icon unfreeze handlers.

5. Extend Scenario context menu:
   - Keep Scenario Roster's existing local layout-store pin behavior.
   - Add pane-store-backed pin/unpin for `pairing` and `flight` scenario menu entries, mapped to `scenario-pairing` and `scenario-flight`.

## Verification

Minimum expected commands after implementation:

- `cd gantt && npx tsc --noEmit`
- `npm run check:ui`
- Focused Playwright coverage for Live/Scenario Pairing and Flight row pin/unpin through the real UI.

If remote/demo data or server availability blocks E2E execution, the final delivery must state the blocker and residual risk.
