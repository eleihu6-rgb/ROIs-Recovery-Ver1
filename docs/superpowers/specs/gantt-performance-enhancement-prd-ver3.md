# PRD v3: Gantt Performance Enhancement High-Impact Follow-Ups

> Module: `gantt` frontend and `live-server` roster API  
> Date: 2026-05-30  
> Source PRDs:  
> - `docs/superpowers/specs/gantt-performance-enhancement-prd.md`  
> - `docs/superpowers/specs/gantt-performance-enhancement-prd-ver2.md`  
> Goal: record current enhanced status and define the next suggestions that should produce meaningful performance improvement.

---

## 0. AI Reading Guide

This v3 document supersedes the "remaining quick wins" list in v2.

Use this order:

1. Read section 1 to avoid redoing already-enhanced items.
2. Treat section 2 as the new priority queue.
3. Use section 3 for implementation task cards.
4. Use section 4 for measurements and acceptance proof.

The items below intentionally avoid tiny micro-optimizations unless they remove repeated work from a hot path. Each recommendation should be measurable in scroll FPS, scripting time, transfer time, TTFB, or main-thread blocking.

---

## 1. Current Enhanced Status

### 1.1 Original PRD Items

| Item | Status after latest check | Evidence |
|---|---:|---|
| R1 HTTP compression | Done | `live-server/src/index.ts` registers `@fastify/compress`. |
| R2 roster hot-loop broad scan | Partly done | `RosterPane` builds `itemsByCrew`; `renderRosterTasks` consumes it. |
| R3 roster indexes | Migration present | `sql/migration/2026-05-30-roster-flight-perf-indexes.sql`. Still needs EXPLAIN proof. |
| R4 DTO trim | Partly done | `roster-service.ts` maps reduced roster DTO. |
| R5 loadMore delta fetch | Done | `use-gantt-viewport.ts` calls `appendRoster` with only new crew ids. |
| R6 fast-json-stringify | Not done | Still measurement-gated. |
| R7 HTTP/2 / edge | Not in repo | Infra-level. |

### 1.2 v2 Quick Wins Now Enhanced

| v2 item | Latest status | Evidence |
|---|---:|---|
| P1-QW4 reuse maps for panel/interactions | Partly enhanced | `RosterPane` now has `taskById`; left panel uses `itemsByCrew`; `hitTestTask` accepts `itemsByCrew`. |
| P1-QW6 Pairing/Flight parse cache | Enhanced | Pairing and Flight panes now import/use `parseIsoCached`. |
| P2-QW7 remove scroll-path debug log | Done | Roster loadMore scroll path no longer logs. |

### 1.3 Still Open From v2

| v2 item | Still relevant? | Why |
|---|---:|---|
| P0-QW1 pane-scoped dirty state | Yes, high impact | Global `dirty` still invalidates all `PaneCanvas` instances. |
| P0-QW2 pre-sort/pre-group roster buckets | Yes, high impact | `renderRosterTasks` still sorts and builds grouping maps during draw. |
| P0-QW3 epoch-ms render fields | Yes, high impact | Cached parse exists, but draw path still uses `Date`/date-fns based `timeToX`. |
| P1-QW5 no-op hover update guard | Yes, medium impact | `setHoveredTask` still always sets state and marks dirty. |
| P2-QW8 performance marks | Useful | Needed to prove wins cheaply. |

---

## 2. New Priority Queue

### P0-1: Pane-Scoped Render Invalidation

**Performance class:** frontend main-thread / redundant canvas draws  
**Expected gain:** high when multiple panes are open, especially during vertical scroll and hover.

**Current problem**

`useGanttViewStore` still has one global `dirty` boolean. Every `PaneCanvas` subscribes to it. A scroll in one pane can schedule render checks for all canvas panes.

**Evidence**

- `gantt/src/stores/gantt-view-store.ts`: `dirty`, `markDirty`, `markClean`.
- `gantt/src/components/gantt/pane-canvas.tsx`: `const dirty = useGanttViewStore((s) => s.dirty)`.

**Recommendation**

Introduce render invalidation tokens:

```ts
type DirtyTarget = 'all' | string

interface GanttViewStore {
  globalRenderVersion: number
  paneRenderVersions: Record<string, number>
  markPaneDirty: (paneId: string) => void
  markAllPanesDirty: () => void
}
```

`PaneCanvas` subscribes to:

- `globalRenderVersion`;
- `paneRenderVersions[paneId]`.

Use `markPaneDirty(paneId)` for vertical scroll and pane-local hover. Use `markAllPanesDirty()` for horizontal scroll, zoom, date range, timezone, theme, and global selection.

**Acceptance**

- Vertical scroll in one pane does not cause other panes to call their content renderer.
- Horizontal scroll still redraws all timeline panes.
- Hover/selection visuals stay correct.

---

### P0-2: Render-Ready Roster Buckets

**Performance class:** frontend scripting / allocation / sorting  
**Expected gain:** high for 5000 crew rows and dense rosters.

**Current problem**

The renderer avoids scanning all items, but still performs per-frame work for visible rows:

- creates `crewItemsMap`;
- sorts each visible crew bucket;
- groups by pairing;
- sorts again inside segment groups;
- builds duty groups with new `Map` objects.

**Evidence**

- `gantt/src/components/gantt/renderers/roster-renderer.ts`: `sortedItems = [...crewItems].sort(...)`.
- Same file: `groupByPairing(sortedItems)`.
- Same file: `drawSegmentGroup` sorts and calls `groupByDuty`.

**Recommendation**

Create a render index in `RosterPane` or `roster-store` whenever `items` changes:

```ts
interface RosterRenderIndex {
  byCrew: Map<string, RosterCrewBucket>
  byTaskId: Map<number, RosterItem>
  pairingTaskIdsByCrewPairing: Map<string, number[]>
}

interface RosterCrewBucket {
  crewId: string
  sortedItems: RosterItem[]
  groups: RosterDrawGroup[]
}

type RosterDrawGroup =
  | { kind: 'single'; item: RosterItem }
  | { kind: 'segment'; pairingId: number; items: RosterItem[]; dutyGroups: RosterDutyGroup[] }
```

The per-frame renderer should only iterate visible crew ids and already-built groups.

**Acceptance**

- No `.sort()` in `renderRosterTasks`, `drawSegmentGroup`, or helpers called every draw.
- No new `Map` construction for pairing/duty grouping inside the draw loop.
- Scroll profile shows reduced scripting time.

---

### P0-3: Precompute Render Geometry Inputs, Not Just Parsed Dates

**Performance class:** frontend scripting / date math  
**Expected gain:** high when many blocks are visible.

**Current problem**

`parseIsoCached` removes repeated parsing but the renderer still performs many `timeToX(Date, rangeStart, pxPerHour, 'UTC')` calls per frame. It also computes rest end times with `addMinutes(...).toISOString()` during draw.

**Evidence**

- `roster-renderer.ts`: repeated `timeToX(parseIsoCached(...), ...)`.
- `roster-renderer.ts`: rest end calculated during draw.
- `timezone-store.ts`: `formatTime` creates a new `Intl.DateTimeFormat` per call.

**Recommendation**

Normalize render fields once when roster data changes:

```ts
interface RosterRenderItem extends RosterItem {
  schStartMs: number | null
  schEndMs: number | null
  pickupStartMs: number | null
  pickupEndMs: number | null
  briefStartMs: number | null
  debriefEndMs: number | null
  dropoffStartMs: number | null
  dropoffEndMs: number | null
  restEndMs: number | null
  labelParts: { fltNum: string; depArp: string; arvArp: string }
}
```

Use a hot-path helper:

```ts
const msToX = (ms: number, rangeStartMs: number, pxPerHour: number, scrollX: number) =>
  ((ms - rangeStartMs) / 3_600_000) * pxPerHour - scrollX
```

Keep ISO strings for display, API updates, and dialogs.

**Acceptance**

- Roster draw path uses epoch fields for all UTC x-position calculations.
- Rest end is not recomputed with `addMinutes(...).toISOString()` during draw.
- Visual positions match previous behavior.

---

### P0-4: Cache Time Formatters And Formatted Labels

**Performance class:** frontend scripting / text layout  
**Expected gain:** medium to high when many blocks display labels.

**Current problem**

`formatTime` constructs `new Intl.DateTimeFormat(...)` every time a visible block draws a time label. Roster pucks also parse flight labels repeatedly with `parseFlightLabel`.

**Evidence**

- `gantt/src/stores/timezone-store.ts`: `formatTime` creates a formatter on every call.
- `roster-renderer.ts`: `drawRosterPuck` and `drawPartialRosterPuck` call `parseFlightLabel`.
- `buildRosterTaskLabel` formats UTC time from cached Date during draw.

**Recommendation**

Add formatter cache:

```ts
const formatterByZone = new Map<string, Intl.DateTimeFormat>()
```

Precompute:

- `displayStartTimeByZone` / `displayEndTimeByZone` lazily per timezone; or
- `formattedStartUtc`, `formattedEndUtc` for UTC mode;
- parsed flight label parts in render item normalization.

**Acceptance**

- `formatTime` no longer constructs `Intl.DateTimeFormat` per block draw.
- Flight label parsing does not happen inside the canvas draw loop.

---

### P1-1: Split Roster Query To Preserve Index Usage

**Performance class:** backend DB / cold load TTFB  
**Expected gain:** high if EXPLAIN shows Seq Scan or poor join plan.

**Current problem**

The migration adds `(crew_id, sch_str_dt_utc)` but the query filters on:

```sql
COALESCE(roster_flight.sch_str_dt_utc, pairing_segment.sch_str_dt_utc) BETWEEN ...
```

This expression can prevent direct use of the simple `sch_str_dt_utc` index. It also forces a left join into the date predicate.

**Evidence**

- `live-server/src/services/roster/roster-service.ts`: `COALESCE(...) BETWEEN`.
- `sql/migration/2026-05-30-roster-flight-perf-indexes.sql`: index on direct `sch_str_dt_utc`.

**Recommendation**

Prefer one of these:

1. Backfill old rows so `roster_flight.sch_str_dt_utc` is always populated, then query direct columns.
2. Split into two paths:
   - fast path: `roster_flight.sch_str_dt_utc BETWEEN ...`;
   - legacy fallback: only rows where `roster_flight.sch_str_dt_utc IS NULL`, joined to `pairing_segment`.
3. If fallback must remain common, add an expression/functional index only after confirming with EXPLAIN.

**Acceptance**

- EXPLAIN shows index scan or bitmap index scan for common roster load.
- DB time is captured before and after.

---

### P1-2: Replace Giant Combination Cache With Chunked Roster Cache

**Performance class:** backend cache hit rate / Redis parse / loadMore reuse  
**Expected gain:** high after initial user filtering and loadMore.

**Current problem**

Roster cache key includes the full sorted `crewIds` list. Different combinations produce different large cache entries. Redis also stores/parses huge JSON strings through generic `getOrSet`.

**Evidence**

- `roster-service.ts`: cache key format includes `crewIds.sort().join(',')`.
- `live-server/src/utils/cache.ts`: cache hit does `JSON.parse(cached)`; backfill does `JSON.stringify(data)`.

**Recommendation**

Cache smaller reusable chunks:

- Option A: per crew and date range: `roster:view:crew:<crewId>:<start>:<end>`.
- Option B: fixed crew batches, e.g. 50 crew ids per chunk.
- Option C: one query for missing chunks, merge server-side.

For large roster responses, consider a specialized cache helper that stores:

- pre-serialized JSON string, or
- compressed Buffer, or
- chunked JSON arrays.

**Acceptance**

- Loading overlapping crew sets reuses cached chunks.
- Redis hit path avoids parsing a huge all-crew JSON blob where possible.
- LoadMore cache hit rate improves.

---

### P1-3: Progressive Roster Hydration For First Interactive Screen

**Performance class:** network / JSON parse / initial interactivity  
**Expected gain:** high for 5000 crew default view.

**Current problem**

The app still requests roster data for all selected crew ids when refreshing roster. Compression helps transfer, but browser JSON parse and memory setup still scale with all selected rows before the first screen is truly ready.

**Evidence**

- `roster-api.ts`: `/api/roster` accepts all `crewIds` as one comma-separated query.
- `roster-store.ts`: `fetchRoster` loads all requested ids before setting roster items.

**Recommendation**

Load data in priority order:

1. first screen crew ids plus buffer, e.g. visible rows + 100;
2. next chunks in background using `appendRoster`;
3. cancel or reprioritize chunks when filters/date range change.

This is smaller than full backend viewport-windowing because it can reuse the existing `/api/roster` endpoint and `appendRoster`.

**Acceptance**

- Initial canvas becomes usable after first chunk.
- Background chunks merge without duplicate tasks.
- Changing filter/date cancels obsolete chunks or ignores stale responses.

---

### P1-4: Cache Canvas Paint Assets And Reduce Per-Block Gradient Cost

**Performance class:** Canvas draw cost  
**Expected gain:** medium when many blocks are visible.

**Current problem**

Each task/segment draw can create gradients, compute lighter/darker colors, parse labels, clip text, and draw badges. The largest wins already come from reducing item count and date math, but paint cost may become visible after scripting is reduced.

**Evidence**

- `roster-renderer.ts`: `gradientFill(...)` creates a gradient per block.
- `drawRosterTask`: `lightenColor` / `darkenColor` per draw.
- `drawViolationBadge` and `drawLockIndicator` can add extra draw calls.

**Recommendation**

Precompute or cache:

- `baseColor`, `colorTop`, `colorBottom`, `borderColor`, `textColor` per assignment/group;
- gradient patterns by color and task height when possible;
- icon/badge primitives if they are expensive;
- optional performance mode: flat fills at low zoom or during active scroll, detailed gradients after scroll idle.

**Acceptance**

- Active scroll draw time decreases.
- Visual quality remains acceptable, especially at low zoom.

---

### P2-1: Optimize Rubber-Band Selection For Visible Rows First

**Performance class:** interaction spikes  
**Expected gain:** medium for large selections.

**Current problem**

`hitTestTasksInRect` still loops all items and calls `crewIds.indexOf(item.crewId)`. It is not per-frame, but it can spike on large datasets.

**Evidence**

- `gantt-utils.ts`: `for (const item of items)` and `crewIds.indexOf(item.crewId)`.

**Recommendation**

Use row geometry first:

1. convert rectangle Y range into first/last row indices;
2. iterate only those crew ids;
3. fetch each crew's bucket from `itemsByCrew`;
4. use epoch x bounds to test only bucket tasks.

**Acceptance**

- Rubber-band selection cost scales with selected row range, not total roster items.

---

### P2-2: Add Low-Overhead Render And API Performance Marks

**Performance class:** diagnostics  
**Expected gain:** indirect but important for avoiding blind optimization.

**Recommendation**

Add gated dev/test metrics:

- `paneId`, `paneType`, visible row count, visible item count;
- render duration;
- hit-test duration if above threshold;
- roster API TTFB / response bytes / JSON parse duration if available.

Do not log every frame in production. Publish through the existing test hook or a dev-only performance collector.

**Acceptance**

- E2E or manual testing can compare before/after without opening full DevTools profiles every time.

---

## 3. Implementation Task Cards

### Task A: Pane-Scoped Dirty Rendering

**Priority:** P0  
**Touches:** `gantt-view-store.ts`, `pane-canvas.tsx`, pane scroll handlers.

Steps:

1. Add per-pane and global render versions.
2. Replace `dirty` subscription in `PaneCanvas`.
3. Update vertical scroll handlers to dirty only the target pane.
4. Update zoom/horizontal scroll/date range/timezone/selection to dirty all panes.
5. Add test-hook counters to prove unrelated panes do not render.

Done when:

- vertical scroll in Roster does not render Pairing/Flight canvases;
- horizontal scroll still renders all visible timeline panes.

---

### Task B: Roster Render Index And Epoch Fields

**Priority:** P0  
**Touches:** `roster-pane.tsx`, `roster-store.ts`, `roster-renderer.ts`, `gantt-utils.ts`.

Steps:

1. Normalize API items into render items with epoch fields.
2. Build `RosterRenderIndex` when `items` changes.
3. Move sorting/grouping/duty grouping out of renderer.
4. Use `msToX` in the roster draw path.
5. Preserve original ISO fields for display and mutations.

Done when:

- no per-frame roster sort/group Map allocation remains;
- profile shows lower scripting per scroll frame.

---

### Task C: Time And Label Formatting Cache

**Priority:** P0  
**Touches:** `timezone-store.ts`, roster/pairing/flight render normalizers.

Steps:

1. Cache `Intl.DateTimeFormat` by timezone.
2. Precompute parsed label parts.
3. Precompute UTC display strings or lazy-cache timezone display strings.
4. Ensure timezone switch invalidates or changes display cache.

Done when:

- no `new Intl.DateTimeFormat` inside per-block draw path;
- labels remain correct after timezone switch.

---

### Task D: Roster Query And Cache Shape

**Priority:** P1  
**Touches:** `roster-service.ts`, `cache.ts` or a new roster-specific cache helper, possibly migration/backfill.

Steps:

1. Run EXPLAIN on current `COALESCE` query.
2. Backfill/split query if index is not used.
3. Replace full-combination cache key with chunked cache strategy.
4. Measure cold DB time, warm cache time, and event-loop blocking.

Done when:

- common roster query uses index;
- overlapping crew loads reuse cache chunks;
- Redis hit path avoids a single massive JSON parse where possible.

---

### Task E: Progressive Roster Hydration

**Priority:** P1  
**Touches:** `use-gantt-viewport.ts`, `roster-store.ts`, possibly `crew-store.ts`.

Steps:

1. Identify first visible crew ids plus buffer.
2. Fetch first chunk immediately.
3. Fetch remaining chunks in background with cancellation/stale response guard.
4. Preserve loadMore merge behavior.

Done when:

- first screen interactive time improves on 5000-crew default view;
- background loads do not duplicate or overwrite stale data.

---

## 4. Measurement Plan

### 4.1 Frontend

Capture before/after for:

- Roster vertical scroll 5 seconds;
- horizontal scroll across 2-month range;
- mouse hover over dense task area;
- rubber-band selection over 100+ rows.

Metrics:

- scripting ms/frame;
- render duration per pane;
- number of pane content renders per scroll event;
- JS heap after full load.

### 4.2 Backend

Capture before/after for:

- `/api/roster` cold DB query time;
- `/api/roster` warm cache time;
- compressed response size;
- Redis hit parse/stringify time;
- EXPLAIN plan for roster date-range query.

### 4.3 Acceptance Targets

| Area | Target |
|---|---|
| Vertical scroll | no long scripting tasks; visible canvas remains responsive |
| Horizontal scroll | no all-item scans or repeated date parsing |
| Initial interaction | first visible roster chunk usable before all 5000 crew data is loaded |
| Backend cold load | index-backed common path; no avoidable Seq Scan |
| Cache hit | chunk reuse for overlapping crew sets |

---

## 5. Explicit Non-Goals

Do not start with these unless the P0/P1 tasks fail measurement:

- WebGL rewrite;
- third-party Gantt/grid library;
- full backend viewport windowing by both time and crew;
- Asia read replica;
- large visual redesign;
- broad refactor of unrelated pane layout.

---

## 6. Notes For Future AI Agents

- Do not re-propose compression, `appendRoster`, basic `itemsByCrew`, Pairing/Flight `parseIsoCached`, or removal of the roster scroll log; those are already enhanced.
- Prioritize work that removes repeated per-frame work or reduces first-load payload/parse cost.
- Keep original data contracts stable unless the user approves an API change.
- If modifying behavior or multiple files, follow the repository brainstorming/spec approval workflow before implementation.
- Always include measurement output in completion notes. Without before/after numbers, do not mark a performance item complete.

