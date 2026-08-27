# Scenario drag-assign — PaneCanvas ready churn fix

> **For agentic workers:** Execute task-by-task. Each task ends with verification.

**Goal:** Keep canvas interaction + drop registration attached for the canvas lifetime so Scenario pairing→roster drag assign works under edit lock.

**Architecture:** Ref-stabilize PaneCanvas ready/destroy; ref-stabilize roster (and pairing) interaction callbacks; ScenarioDragProvider execute via ref.

## Task 1: PaneCanvas ready/destroy refs

**File:** `gantt/src/components/gantt/pane-canvas.tsx`

- Store `onCanvasReady` / `onCanvasDestroy` in refs updated every render.
- Effect deps: `[canvasRef, size.width]` only.
- Cleanup still calls current destroy ref.

## Task 2: ScenarioDragProvider execute ref

**File:** `gantt/src/components/scenario-gantt/scenario-drag-provider.tsx`

- `executeRef.current = executeDragOperation` each render.
- Handler `onDragComplete` calls `executeRef.current(operation)`.

## Task 3: Shared roster stable interaction callbacks

**File:** `gantt/src/components/panes/shared/roster-pane.tsx`

- Mirror pairing-pane: `interactionCallbacksRef` + `stableInteractionCallbacks` (empty deps).
- `handleCanvasReady` uses stable callbacks; keep registerPane.

## Task 4: Shared pairing getHitTest ref (optional harden)

**File:** `gantt/src/components/panes/shared/pairing-pane.tsx`

- Stable `getHitTest` wrapper via ref so `handleCanvasReady` deps stay empty of churny values where practical.

## Task 5: Verify

- Vitest: scenario-edit-controller (unchanged behavior).
- Playwright: `Scen-2015` in `e2e/tests/gantt/scenario-roster-edit.spec.ts`.
