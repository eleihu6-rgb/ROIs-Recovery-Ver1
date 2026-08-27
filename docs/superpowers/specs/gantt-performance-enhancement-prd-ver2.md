# PRD v2: Gantt Performance Enhancement Quick Wins

> Module: `gantt` frontend and `live-server` roster API  
> Date: 2026-05-30  
> Source PRD: `docs/superpowers/specs/gantt-performance-enhancement-prd.md`  
> Purpose: AI-readable follow-up list after reviewing the PRD and current worktree state.

---

## 0. AI Reading Guide

Use this document as the execution map for remaining low-risk performance work.

Recommended order:

1. Confirm current status in section 1.
2. Implement P0 quick wins in section 2.
3. Use section 3 task cards for scoped implementation.
4. Use section 4 for tests and proof.

Do not assume an item is incomplete only because it exists in the original PRD. Some items have already been implemented or partially implemented in the current worktree.

---

## 1. Current Status Snapshot

### 1.1 Original PRD Items Already Done Or Partly Done

| Original item | Current status | Evidence |
|---|---:|---|
| R1 HTTP compression | Done | `live-server/src/index.ts` registers `@fastify/compress` with br/gzip/deflate and Brotli quality 5. |
| R2 roster render hot loop | Partly done | `RosterPane` builds `itemsByCrew`; `renderRosterTasks` consumes it; `parseIsoCached` exists. |
| R3 `roster_flight` indexes | Done in migration, still needs EXPLAIN proof | `sql/migration/2026-05-30-roster-flight-perf-indexes.sql`. |
| R4 DTO trim | Partly done | `roster-service.ts` maps a reduced response DTO instead of returning every roster column. |
| R5 loadMore delta fetch | Done | `use-gantt-viewport.ts` calls `appendRoster` with only newly added crew ids. |
| R6 fast-json-stringify | Not done | Still only worth doing after measuring serialization cost. |
| R7 HTTP/2 / keep-alive / edge | Not in repo | Infra-level; measure after compression. |

### 1.2 Main Remaining Problem Shape

The biggest remaining quick wins are no longer about "add virtualization" or "enable compression." Those are already addressed or partially addressed.

Remaining hot spots are mostly:

- render invalidation is too broad;
- roster render still sorts and groups visible buckets every frame;
- date math is cached but still object/date-fns based instead of epoch-number based;
- panel and interaction paths still do O(total items) scans;
- Pairing and Flight panes still have local `parseISO` hot spots.

---

## 2. Prioritized Additional Quick Wins

### P0-QW1: Make Canvas Dirty State Pane-Scoped

**Problem**

`useGanttViewStore` has a single global `dirty` boolean. `PaneCanvas` instances subscribe to it. Any scroll, hover, or selection can schedule render work across multiple canvases, even when only one pane changed.

**Evidence**

- `gantt/src/stores/gantt-view-store.ts`: global `dirty`, `markDirty`, `markClean`.
- `gantt/src/components/gantt/pane-canvas.tsx`: every pane subscribes to the same `dirty`.

**Change**

Replace or supplement the global dirty flag with pane-scoped invalidation:

- Add `dirtyPaneIds: Set<string>` or `dirtyVersionByPaneId: Map<string, number>`.
- Add `markPaneDirty(paneId)`.
- Add `markAllPanesDirty()` for zoom/date-range/theme/global changes.
- `PaneCanvas` should render when its own dirty token changes, not when an unrelated pane changes.

**Expected impact**

High. This can remove redundant canvas renders during vertical scroll and hover.

**Risk**

Medium. Must make global changes like zoom, date range, theme, selection, hover overlay, and timezone still redraw the panes that need redraw.

---

### P0-QW2: Pre-Sort And Pre-Group Roster Buckets Once

**Problem**

`itemsByCrew` exists, but render still sorts each visible crew's items and rebuilds pairing/duty group structures during every draw.

**Evidence**

- `RosterPane` builds `itemsByCrew` in `useMemo`.
- `renderRosterTasks` still does `const sortedItems = [...crewItems].sort(...)`.
- `drawSegmentGroup` also sorts again and calls `groupByDuty`.

**Change**

Build a render-ready structure when `items` changes:

```ts
type RosterRenderBucket = {
  crewId: string
  sortedItems: RosterItem[]
  pairingGroups: Array<{
    pairingId: number | null
    items: RosterItem[]
    dutyGroups?: Array<{ dutySeq: number | null; items: RosterItem[] }>
  }>
}
```

Then the per-frame renderer only:

1. determines visible crew ids;
2. fetches the bucket;
3. draws already-sorted groups.

**Expected impact**

High for scroll smoothness. It removes repeated allocation, sort, and Map construction from the draw loop.

**Risk**

Low to medium. Must preserve current draw order and segment-mode behavior.

---

### P0-QW3: Use Epoch Millisecond Fields In Render Math

**Problem**

`parseIsoCached` avoids repeated parsing, but every draw still performs `Date` and date-fns based calculations through `timeToX`.

**Evidence**

- `gantt-utils.ts` defines `parseIsoCached`.
- `roster-renderer.ts` repeatedly calls `timeToX(parseIsoCached(...), ...)`.

**Change**

Normalize roster items once when they enter the store:

```ts
type RosterRenderItem = RosterItem & {
  schStartMs: number | null
  schEndMs: number | null
  pickupStartMs?: number | null
  pickupEndMs?: number | null
  briefStartMs?: number | null
  debriefEndMs?: number | null
  dropoffStartMs?: number | null
  dropoffEndMs?: number | null
}
```

In UTC mode:

```ts
const x = ((item.schStartMs - rangeStartMs) / 3_600_000) * pxPerHour - scrollX
```

Keep `timeToX` for timezone-specific or non-hot paths unless profiling shows more work is needed.

**Expected impact**

High. Number math is cheaper and more predictable than repeated `Date` object access and date-fns calls.

**Risk**

Medium. Timezone rendering must be preserved. Start with UTC-only hot-path helpers and fallback to existing `timeToX` for non-UTC if needed.

---

### P1-QW4: Reuse Maps For Left Panel And Interactions

**Problem**

Some non-render paths still scan all items repeatedly.

**Evidence**

- `unsortedPanelRows` does `items.filter((i) => i.crewId === cid)` inside `selectedCrewIds.map(...)`.
- `hitTestTask` filters all items for one crew on each hit test.
- `hitTestTasksInRect` loops all items and uses `crewIds.indexOf(item.crewId)`.
- Interaction callbacks use `items.find(...)` and `items.filter(...)`.

**Change**

Create and reuse these memoized structures:

```ts
itemsByCrew: Map<string, RosterRenderItem[]>
taskById: Map<number, RosterRenderItem>
rowIndexByCrewId: Map<string, number>
pairingTaskIdsByCrewAndPairing: Map<string, number[]>
```

Then:

- panel rows use `itemsByCrew.get(cid)`;
- hit testing uses only the clicked row's bucket;
- rubber-band selection uses visible row range first, then row buckets;
- click/double-click/context menu use `taskById`.

**Expected impact**

Medium to high. Especially useful during mousemove, rubber-band selection, and large crew counts.

**Risk**

Low. Mostly replacing repeated scans with existing derived maps.

---

### P1-QW5: Avoid No-Op Hover State Updates

**Problem**

`setHoveredTask` always sets state and marks dirty, even when the hovered task did not change.

**Evidence**

- `gantt-view-store.ts` `setHoveredTask` always creates an update with `dirty: true`.
- Roster hover path calls it from mouse interactions.

**Change**

Add early return:

```ts
setHoveredTask: (taskId, clientX, clientY) => {
  const state = get()
  if (
    state.hoveredTaskId === taskId &&
    state.hoveredCrewId === null &&
    clientX !== undefined &&
    clientY !== undefined &&
    Math.abs(state.hoverPosition.x - clientX) < 2 &&
    Math.abs(state.hoverPosition.y - clientY) < 2
  ) {
    return
  }
  ...
}
```

Alternative: update hover position outside the render-dirty path if only tooltip position changed.

**Expected impact**

Medium. Reduces render churn during mousemove.

**Risk**

Low. Validate tooltip position still feels responsive.

---

### P1-QW6: Apply Cached Or Epoch Time To Pairing And Flight Pane Hit Tests

**Problem**

Pairing and Flight panes still use raw `parseISO` in hit testing and rubber-band selection.

**Evidence**

- `gantt/src/components/panes/pairing-pane.tsx` uses `parseISO` in hit testing and rubber-band selection.
- `gantt/src/components/panes/flight-pane.tsx` uses `parseISO` in hit testing and rubber-band selection.

**Change**

Use `parseIsoCached` immediately, or derive `startMs/endMs` for Pairing/Flight rows in their stores.

**Expected impact**

Medium. Smaller than roster, but easy and consistent.

**Risk**

Low.

---

### P2-QW7: Remove Scroll-Path Debug Logging

**Problem**

`console.log` exists inside the roster loadMore scroll trigger path.

**Evidence**

- `gantt/src/components/panes/roster-pane.tsx` logs `[RosterPane] triggering loadMore`.

**Change**

Remove the log or guard it behind a dev-only debug flag.

**Expected impact**

Low but basically free.

**Risk**

Very low.

---

### P2-QW8: Add Lightweight Performance Marks Around Render

**Problem**

Current PRD requires proof, but the code has limited low-friction timing visibility.

**Change**

Add optional dev/test-only marks:

```ts
performance.mark(`${paneId}:render:start`)
...
performance.mark(`${paneId}:render:end`)
performance.measure(`${paneId}:render`, `${paneId}:render:start`, `${paneId}:render:end`)
```

Only enable under test/dev flag to avoid production overhead.

**Expected impact**

Low direct performance impact; high diagnostic value.

**Risk**

Low if gated.

---

## 3. Implementation Task Cards

### Task A: Pane-Scoped Render Invalidation

**Priority:** P0  
**Files likely touched:**

- `gantt/src/stores/gantt-view-store.ts`
- `gantt/src/components/gantt/pane-canvas.tsx`
- pane scroll handlers in `gantt/src/components/panes/*-pane.tsx`

**Steps**

1. Add pane-scoped dirty state and actions.
2. Update scroll handlers to mark only the active pane dirty.
3. Update global actions to mark all visible panes dirty when necessary.
4. Update `PaneCanvas` to subscribe to its own dirty token.
5. Validate Roster, Pairing, Flight all redraw on scroll, zoom, selection, hover, timezone change.

**Acceptance**

- Scrolling one pane does not schedule renders for unrelated panes.
- Zoom still redraws all timeline panes.
- Selection and hover visuals still update.

---

### Task B: Render-Ready Roster Buckets

**Priority:** P0  
**Files likely touched:**

- `gantt/src/components/panes/roster-pane.tsx`
- `gantt/src/components/gantt/renderers/roster-renderer.ts`

**Steps**

1. Replace `itemsByCrew: Map<string, RosterItem[]>` with render-ready buckets.
2. Sort each crew bucket once in `useMemo`.
3. Build pairing groups once.
4. Build duty groups once for segment groups.
5. Update renderer to consume prebuilt groups.

**Acceptance**

- No `sort()` calls remain in per-frame roster draw path.
- No per-frame pairing/duty Map construction for unchanged items.
- Visual output matches before/after screenshots.

---

### Task C: Epoch Time Normalization

**Priority:** P0  
**Files likely touched:**

- `gantt/src/stores/roster-store.ts`
- `gantt/src/types/roster` or `gantt/src/types`
- `gantt/src/components/gantt/renderers/roster-renderer.ts`
- `gantt/src/components/gantt/gantt-utils.ts`

**Steps**

1. Add a normalized render item type.
2. Normalize API items immediately after fetch and append.
3. Use epoch fields in hot renderer paths.
4. Keep original ISO fields for display, API mutations, and dialogs.
5. Preserve fallback behavior for null timestamps.

**Acceptance**

- Roster draw path avoids `parseISO`/`parseIsoCached` for scheduled start/end x-position in UTC mode.
- Time labels and dialogs still show the same values.

---

### Task D: Reusable Interaction Maps

**Priority:** P1  
**Files likely touched:**

- `gantt/src/components/panes/roster-pane.tsx`
- `gantt/src/components/gantt/gantt-utils.ts`

**Steps**

1. Build `taskById`, `rowIndexByCrewId`, and `pairingTaskIdsByCrewAndPairing`.
2. Update click, double-click, context menu, and hover paths.
3. Update `hitTestTask` or add a bucket-based replacement.
4. Update rubber-band selection to iterate visible rows first.

**Acceptance**

- No `items.find(...)` in high-frequency roster interaction callbacks.
- No `items.filter(...)` in per-hover hit testing.
- Rubber-band selection still selects the same tasks.

---

### Task E: Pairing/Flight Time Cache

**Priority:** P1  
**Files likely touched:**

- `gantt/src/components/panes/pairing-pane.tsx`
- `gantt/src/components/panes/flight-pane.tsx`
- optionally `gantt/src/stores/pairing-store.ts`
- optionally `gantt/src/stores/flight-store.ts`

**Steps**

1. Replace direct `parseISO` calls in interaction paths with `parseIsoCached`, or store epoch fields.
2. Prefer epoch fields if already doing Task C.

**Acceptance**

- Pairing/Flight hit tests have no direct `parseISO` imports in hot paths.
- Click and rubber-band behavior remains unchanged.

---

## 4. Test And Proof Requirements

### 4.1 Required Before/After Evidence

For each implemented quick win, capture:

- Performance profile before/after for vertical scroll and horizontal scroll.
- Render timing summary if Task P2-QW8 is implemented.
- Playwright regression PASS summary for the touched pane.

### 4.2 Suggested Commands

```bash
cd gantt
npx tsc --noEmit
```

```bash
npx playwright test e2e/tests/gantt/roster-pane.spec.ts --reporter=list
```

For Pairing/Flight changes:

```bash
npx playwright test e2e/tests/gantt/pairing-pane.spec.ts e2e/tests/gantt/flight-pane.spec.ts --reporter=list
```

For live-server changes:

```bash
cd live-server
npm test -- --run
```

### 4.3 Manual Checks

- Roster vertical scroll remains smooth at 5000 crew rows.
- Horizontal scroll does not freeze with 2-month date range.
- Hover, selection, context menu, double-click, drag, and rubber-band selection still work.
- Pairing and Flight panes still render and hit-test correctly.
- LoadMore does not re-download already loaded crew roster items.

---

## 5. Non-Goals For This Quick-Win Pass

Do not do these unless profiling proves the quick wins are insufficient:

- rewrite Canvas renderer;
- introduce WebGL;
- introduce a third-party Gantt/grid library;
- add viewport-windowed backend API;
- add Asia read replica or edge cache;
- implement `fast-json-stringify` without measuring serialization as a bottleneck.

---

## 6. AI Implementation Notes

- Keep changes small and measurable.
- Do not modify existing `sql/schema/` files for index work; use `sql/migration/`.
- Keep original ISO timestamp fields for API compatibility and UI display.
- Add derived render fields rather than changing server DTO contracts unless explicitly approved.
- Preserve existing pane behavior before optimizing internals.
- Use existing stores and renderer boundaries; avoid introducing new global state systems.
- If a performance task changes behavior or touches multiple files, follow the repository brainstorming/spec approval workflow before implementation.

---

## 7. Final Priority Order

1. P0-QW1 pane-scoped dirty render invalidation.
2. P0-QW2 pre-sort and pre-group roster render buckets.
3. P0-QW3 epoch millisecond render fields.
4. P1-QW4 reusable maps for panel and interactions.
5. P1-QW5 no-op hover update guard.
6. P1-QW6 Pairing/Flight parse cache or epoch fields.
7. P2-QW7 remove scroll-path debug logging.
8. P2-QW8 optional render performance marks.

