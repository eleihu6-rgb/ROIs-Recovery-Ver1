# Gantt Memory Optimization AI Coding Plan

**Created**: 2026-06-14 22:49:13 America/Vancouver  
**Updated**: 2026-06-15 America/Vancouver
**Scope**: Live Gantt + Scenario Gantt first pass  
**Goal**: reduce Chrome RAM footprint when opening/using Gantt, reported near 3 GB  
**Audience**: next AI coder implementing the fix  
**Status**: superseded by scenario-focused re-check
**Current recommendation**: `docs/superpowers/specs/2026-06-15-120419-gantt-memory-optimization-scenario-focus-ai-coding.md`

## Correction

This note originally treated Live Flight/Composition preload as the top optimization target. That recommendation has been removed.

Live Flight and Composition preload is intentional for this product flow. It supports fast local-first cross-pane lookup, Flight Navi, Find by Flight, pairing detail, roster enrichment, and other Live Gantt interactions. Do not change that path in the first pass.

The current implementation target is Scenario Gantt memory retention, especially hidden scenario tabs that remain mounted by AppShell keep-alive.

## Current Problem

Opening Gantt can push Chrome memory close to 3 GB. Current code keeps useful local data for speed, but hidden Scenario Gantt tabs can retain too much UI and store state.

The first fix should target these memory multipliers:

1. AppShell keep-alive keeps every open tab mounted using `visibility:hidden`, so hidden Scenario Gantt tabs can keep canvases, resize observers, timers, and stores alive.
2. Scenario Gantt stores are per-scenario and remain alive while the tab is open.
3. Scenario Gantt views render heavy grid/canvas trees whenever data exists, even if the tab is hidden by the parent.
4. There is no idle-release policy for clean hidden scenario tabs.

## Key Evidence From Code

### Keep-alive tabs

File: `gantt/src/components/shell/app-shell.tsx`

- `ContentArea` maps every `openTabs` item into the DOM.
- Inactive tabs are hidden with `invisible pointer-events-none`, not unmounted.
- This preserves tab state but also preserves memory-heavy Scenario Gantt views.
- `ModuleView` does not pass active state into `ScenarioGanttView`.

### Scenario stores

File: `gantt/src/stores/scenario-gantt-store.ts`

- Per-scenario store registry keeps one store per scenario id.
- Store holds full `ScenarioGanttData | null`.
- `destroyScenarioGanttStore(scenarioId)` deletes from the registry, but it is only reached when the view unmounts.
- Hidden tabs do not unmount under the current AppShell keep-alive model.

### Scenario view rendering

File: `gantt/src/components/shell/scenario-gantt-view.tsx`

- The view renders `ScenarioLayoutGrid`, `ScenarioHorizontalScrollbar`, and `ScenarioStatusBar` whenever data exists.
- Hidden scenario tabs still retain that component tree because only the parent wrapper is CSS-hidden.
- Lock refresh polling runs for every mounted scenario tab.

## Target Outcome

After the first implementation pass:

- Hidden Scenario Gantt tabs should not keep canvas-heavy rendering active.
- Hidden clean Scenario Gantt data should be releasable after idle time.
- Dirty scenario tabs with unsaved edits must not release heavy data.
- Lock-owned scenario tabs must keep enough state to avoid silently losing edit ownership.
- Switching back to a released scenario tab should reload once and restore the UI.

## Implementation Plan

### Phase 1: Pass active state into ScenarioGanttView

**Potential enhance**: Required foundation.

**Files**:

- `gantt/src/components/shell/app-shell.tsx`
- `gantt/src/components/shell/scenario-gantt-view.tsx`

**Implement**:

- Update `ContentArea` to compute `const active = module === activeModule`.
- Update `ModuleView` to accept `{ module, active }`.
- Pass `active` into `ScenarioGanttView` for `scenario-gantt:<id>` modules.
- Keep non-scenario modules on their existing behavior.

**Acceptance**:

- Active scenario tab receives `active=true`.
- Hidden scenario tab receives `active=false`.
- Existing non-scenario modules still render normally.

### Phase 2: Suspend hidden Scenario canvas/grid rendering

**Potential enhance**: High. This directly removes hidden canvas/component memory.

**Files**:

- `gantt/src/components/shell/scenario-gantt-view.tsx`
- `gantt/src/components/scenario-gantt/scenario-layout-grid.tsx` only if direct gating is cleaner there.

**Implement**:

- When `active === false`, return a tiny hidden placeholder after required store/safety hooks.
- Do not render `ScenarioDragProvider`, `ScenarioLayoutGrid`, `ScenarioHorizontalScrollbar`, or `ScenarioStatusBar` while inactive.
- When active again, render the normal view from existing store data.

**Acceptance**:

- Switching away from a scenario tab removes its canvas elements from the DOM.
- Switching back restores rendering.
- No extra `/gantt-data` request happens only because the tab was suspended.

### Phase 3: Pause hidden scenario lock polling

**Potential enhance**: Medium. Reduces background work from hidden tabs.

**Files**:

- `gantt/src/components/shell/scenario-gantt-view.tsx`

**Implement**:

- Run lock status refresh only while `active === true`.
- Keep owner lock keepalive independent of active state unless product explicitly decides hidden edit locks should be released.

**Acceptance**:

- Hidden non-owner scenario tab does not poll lock status.
- Hidden owner scenario tab still keeps the edit lock alive.

### Phase 4: Add safe heavy-data release API

**Potential enhance**: High for users opening several large scenarios.

**Files**:

- `gantt/src/stores/scenario-gantt-store.ts`

**Implement**:

- Add `releasedAt: number | null`.
- Add `releaseHeavyData: () => void`.
- `releaseHeavyData` should return without changing data when:
  - `isDirty === true`
  - `pendingChanges.length > 0`
  - `saving === true`
  - `lockStatus?.isOwner === true`
- For clean inactive stores, clear only heavy scenario `data`, loading/error state as appropriate, and set `releasedAt`.
- Do not destroy `ScenarioLayoutStore`; preserve lightweight layout/scroll/filter state.

**Acceptance**:

- Clean store releases `data`.
- Dirty, saving, pending-change, or lock-owned stores keep `data`.

### Phase 5: Release clean hidden scenario data after idle timeout

**Potential enhance**: High after canvas suspension.

**Files**:

- `gantt/src/components/shell/scenario-gantt-view.tsx`
- `gantt/src/stores/scenario-gantt-store.ts`

**Implement**:

- Add a hidden idle timer, for example `5 * 60_000`.
- When `active === false`, schedule `releaseHeavyData`.
- Clear the timer if the tab becomes active again before timeout.
- Add a separate activation effect that reloads only when `active === true`, `data === null`, and `loading === false`.
- Do not add `active` to the existing mount-time `loadData` effect.

**Acceptance**:

- Clean hidden scenario tab releases heavy data after timeout.
- Returning to released tab reloads once.
- Quick tab switches do not reload data.
- Dirty or lock-owned tabs are not released.

### Phase 6: Add lightweight memory/debug instrumentation

**Potential enhance**: Medium. Helps prove whether the change worked.

**Files**:

- `gantt/src/utils/gantt-memory-debug.ts` new
- `gantt/src/stores/scenario-gantt-store.ts`
- `gantt/src/components/shell/scenario-gantt-view.tsx`

**Implement**:

- Gate logging behind `localStorage.roisGanttMemoryDebug === '1'`.
- Log `performance.memory.usedJSHeapSize` when available.
- Log scenario store count and whether each scenario store has data, is dirty, has pending changes, owns lock, or was released.
- Log active scenario id and number of open scenario tabs.

**Acceptance**:

- Debug log shows hidden scenario data released after timeout.
- Debug log shows active scenario reloaded once on return.

## Priority Order

1. Pass `active` into `ScenarioGanttView`.
2. Suspend hidden Scenario canvas/grid rendering.
3. Pause hidden lock polling while preserving owner keepalive.
4. Add guarded `releaseHeavyData` to scenario store.
5. Add hidden idle release and activation reload.
6. Add memory/debug instrumentation.

## Test Plan

### Unit / component tests

Add focused tests:

- `AppShell` passes active state into scenario views.
- Inactive Scenario Gantt does not render `ScenarioLayoutGrid` or canvases.
- Active Scenario Gantt renders the grid normally.
- Clean scenario store clears `data` through `releaseHeavyData`.
- Dirty, pending-change, saving, or lock-owned stores do not clear `data`.
- Re-activating a released tab calls `loadData` once.

### Browser verification

Use Chrome Task Manager or DevTools Memory.

1. Open Live Gantt.
2. Open two Scenario Gantt tabs.
3. Switch to Scenario A and confirm its canvases exist.
4. Switch to Scenario B and confirm Scenario A canvases are suspended.
5. Wait hidden release timeout.
6. Confirm Scenario A store has no heavy `data` if clean.
7. Switch back to Scenario A.
8. Confirm data reloads once and canvas rendering returns.

## Do Not Do In First Pass

- Do not rewrite the canvas engine.
- Do not silently close user tabs.
- Do not release scenario data with unsaved edits.
- Do not pause owner lock keepalive unless the product intentionally changes lock behavior.
- Do not add new dependencies for memory measurement.
- Do not edit `sql/` for this task.
- Do not change Live Flight/Composition preload in this pass.

## Expected Impact

The biggest immediate reduction should come from suspending hidden Scenario Gantt canvases and releasing clean hidden scenario data after idle time.

If memory remains near 3 GB after these changes, inspect heap snapshots for:

- duplicated roster DTO strings,
- render bucket structures,
- rule violation maps,
- scenario `data` payload size,
- retained detached canvas elements.
