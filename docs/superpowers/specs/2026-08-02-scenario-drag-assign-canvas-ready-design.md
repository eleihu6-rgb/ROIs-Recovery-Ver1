# Scenario pairing→roster drag assign — PaneCanvas ready churn

## Problem

Scenario RO editing (lock held) still cannot assign via pairing→crew drag after gesture fixes `83f9b9fc` / `cde21d5e`. Drop fails silently: no patch, no toast.

## Root cause

`PaneCanvas` re-runs its ready/destroy effect whenever `onCanvasReady` / `onCanvasDestroy` identity changes. Cleanup calls `unregisterPane('scenario-roster')` and `detach()` (clears document-level pending drag).

Shared roster builds a new `interactionCallbacks` object every render, so any roster re-render during a pairing drag tears down the drop registration. Mouseup then hits no valid `scenario-roster` target → `onDragCancel`.

## Design (approach A — approved)

1. **PaneCanvas**: keep ready/destroy callbacks in refs; effect depends only on canvas presence + `size.width`. One attach per canvas instance.
2. **Shared roster** (and pairing belt-and-suspenders): stable interaction callback wrappers via refs so the long-lived handler never closes over stale selection.
3. **ScenarioDragProvider**: `executeDragOperation` via ref so `onDragComplete` always calls the latest execute (same pattern as Live intent).

## Non-goals

- No change to assign/preview/lock gating semantics.
- No new drop hit-test architecture.

## Success

- Ghost appears; drop on crew creates `add` pending patch (or legality confirm).
- `Scen-2015` PASS.
