# Gantt Memory Optimization: Scenario-Focused AI Coding Plan

**Created**: 2026-06-15 12:04:19 America/Vancouver  
**Scope**: Live Gantt + Scenario Gantt re-check, with implementation focus on Scenario Gantt hidden tabs  
**Audience**: next AI coder implementing the memory fix  
**Status**: current recommendation after code re-check  
**Previous note**: `docs/superpowers/specs/2026-06-14-224913-gantt-memory-optimization-ai-coding.md`

## Measured Baseline (2026-06-15, remote test env)

Measured via Playwright against `crew-f8-usva-tst.roiscloud.com` (the local dev DB has no
engine optimization artifacts, so every scenario `gantt-data` 502s — `engine-server
/optimize/input 404`; the remote env serves scenario 6's 1.38 MB of real data). Heap read
through CDP `Performance.getMetrics` `JSHeapUsedSize` (precise — `performance.memory` is
quantized/clamped) with a forced `HeapProfiler.collectGarbage` before each sample.

Flow: Live → Scenario tab → open scenario 6 (`RO-2026-06 YEG Test---`, RO/DONE) → back to Live.

| Stage | Heap | total `<canvas>` | scenario canvases | scenario views | DOM nodes |
|---|---|---|---|---|---|
| M1 — Live only | **27.3 MB** | 6 | 0 | 0 | 513 |
| M2 — Scenario 6 active | **63.4 MB** | 12 | 2 | 1 | 1205 |
| M3 — Live active, **scenario 6 hidden** | **63.4 MB** | 12 | 2 | 1 | 1225 |

**Cost of one HIDDEN scenario tab (M3 − M1): ≈ 36.1 MB heap, +6 `<canvas>`, +712 DOM nodes.**

The decisive fact: **M3 heap == M2 heap (63.4 MB) exactly** — switching away from scenario 6
releases *nothing*. The hidden tab retains its full heap, all 6 canvases, and ~712 DOM nodes.
This scales linearly: N hidden scenario tabs ≈ N × ~36 MB retained (5 tabs ≈ ~180 MB).

Reusable measurement: `e2e/tests/gantt/scenario-memory-baseline.spec.ts` (skips gracefully
where scenario data is unavailable). Re-run after Phase 2 — M3's scenario canvases should
drop to 0 and M3 heap should fall back toward M1.

```
GANTT_BASE_URL=https://crew-f8-usva-tst.roiscloud.com \
GANTT_API_URL=https://crew-f8-usva-tst.roiscloud.com/fpqe/live \
GANTT_TEST_USER=admin GANTT_TEST_PASS=123456 \
npx playwright test --config config/playwright.config.ts \
  tests/gantt/scenario-memory-baseline.spec.ts --project=gantt --no-deps
```

## Implemented (2026-06-15) + what the measurement revealed

**Shipped (Phases 1–3):** `ScenarioGanttView` now derives `active = activeModule === moduleKey`
locally (no AppShell prop-drilling). When a scenario tab is hidden it returns a tiny
`scenario-gantt-suspended` placeholder instead of the toolbar/grid/canvas tree (all hooks run
first, so store data + edits survive), and its lock-status polling is paused. Reactivating
re-renders from the still-loaded store data — no `/gantt-data` refetch.

Proven (prod build, `vite preview` → remote data, `e2e/tests/gantt/scenario-memory-baseline.spec.ts`):

| Stage | JS heap | total canvas | scn canvas | scn views | suspended | DOM |
|---|---|---|---|---|---|---|
| M1 Live only | 27.9 MB | 6 | 0 | 0 | 0 | 530 |
| M2 Scenario 6 active | 71.4 MB | 12 | 2 | 1 | 0 | 1222 |
| M3 Live, scn-6 hidden | 70.4 MB | **6** | **0** | **0** | **1** | **1068** |
| M4 returned | 71.4 MB | 12 | 2 | 1 | 0 | 1222 |

Per hidden tab: **−6 `<canvas>`, −154 DOM nodes**, RAF render loop + lock polling stopped,
full restore, **no refetch**.

**NOT shipped — Phases 4–5 (idle data release), and why.** I implemented them, measured them,
and reverted them. The measurement disproved the premise that the retained heap lives in the
canvas tree or `store.data`:
- Suspending the canvas tree (Phase 2) reclaimed only **~0.7 MB JS heap**.
- Additionally releasing `store.data` (Phase 4/5) reclaimed only **~1.3 MB JS heap**.
- A scenario tab costs **~44–58 MB JS heap** on open, almost all of it RETAINED after both.

So the per-tab JS heap is dominated by **one-time scenario module compilation + shared
module-level caches/adapters** (e.g. `parseIsoCached`, pairing/crew caches, source adapters),
which neither suspending the canvas nor nulling `store.data` can free. Phase 4/5 bought ~1.3 MB
at the cost of a reload spinner on return to a long-hidden tab (and lives next to the 2026-06-05
flood landmine) — a bad trade, so it was dropped.

**What the win actually is:** Phase 2 frees the canvas **backing stores** (hi-DPI gantt
canvases are tens of MB of *native* memory not counted in `JSHeapUsedSize`) and stops per-tab
RAF/polling work — real memory + CPU/battery wins that the JS-heap metric understates. Phase 3
stops background network polling on hidden tabs.

### TODO — revisit Phase 4/5 (idle data-release) at REAL scale

The heap measurement above used **scenario 6, which has only 14 crew** (1.38 MB payload) — the
*smallest* loadable scenario. That under-samples the per-tab data cost. Remote payload sizes:

| scenario | gantt-data | relative |
|---|---|---|
| 6 (14 crew) | 1.38 MB | 1× |
| 229 / 415 / 421 / 422 / 424 | ~1.30 MB | ~1× |
| **8** | **5.56 MB** | **~4×** |
| **14** | **6.14 MB** | **~4.4×** |

Real production scenarios hold **300+ crew**, i.e. ~4–6× scenario 6. Since `store.data` and its
derived structures scale with crew/flight count, the **data-release heap win scales with them**
too — the ~1.3 MB measured on 14 crew likely becomes meaningfully larger on a 300+ crew tab, and
compounds across multiple open tabs. So Phase 4/5 was **reverted for now, not rejected.**

**TODO (do next, multiple times):**
1. Re-run `scenario-memory-baseline.spec.ts` against a 300+ crew scenario (e.g. id 8 or 14) on a
   prod build — parameterize `SCENARIO_ID`/`SCENARIO_NAME` via env first.
2. Measure the data-release heap delta at that scale (active → hidden+idle).
3. If it is materially larger than ~1.3 MB, **re-ship Phase 4/5** (the implementation is in this
   session's git history): `releaseHeavyData` store action (guarded: dirty/saving/owner keep
   data) + a hidden idle-release effect (5 min) + an activation-reload-once effect. The reload is
   safe — `loadData` sets `loading` synchronously, blocking the 2026-06-05 re-fetch loop.
4. Also profile a Chrome heap snapshot (1 vs N tabs by retained size) to find the non-canvas,
   non-data residual (shared caches / source adapter holding a transformed payload copy).

**Recurring playbook target:** hidden keep-alive tab memory is a standing item — re-measure each
time a new heavy tab type (or a much larger scenario) ships, at realistic crew scale, not the
14-crew demo.

## What Changed In Recommendation

The current first-pass memory target should be Scenario Gantt hidden-tab behavior:

1. Hidden Scenario Gantt tabs are still mounted by AppShell keep-alive.
2. Hidden Scenario tabs still keep canvas-heavy component trees alive.
3. Hidden Scenario stores still retain full scenario data while the tab remains open.
4. There is no idle-release policy for clean hidden scenario tabs.

## Current Code Evidence

### AppShell still keeps all open tabs mounted

File: `gantt/src/components/shell/app-shell.tsx`

Current behavior:

```tsx
{openTabs.map((module) => (
  <div
    key={module}
    className={[
      'absolute inset-0',
      module === activeModule ? '' : 'invisible pointer-events-none',
    ].join(' ')}
  >
    <ModuleView module={module} />
  </div>
))}
```

This means inactive tabs are CSS-hidden, not unmounted. For ordinary pages this is acceptable. For Scenario Gantt, it keeps heavy canvases and data in memory.

### ModuleView does not pass active state

File: `gantt/src/components/shell/app-shell.tsx`

Current behavior:

```tsx
const ModuleView = ({ module }: { module: ActiveModule }) => {
  ...
  if (module.startsWith('scenario-gantt:')) {
    const scenarioId = Number(module.slice('scenario-gantt:'.length))
    if (!Number.isNaN(scenarioId)) return <ScenarioGanttView scenarioId={scenarioId} />
  }
}
```

`ScenarioGanttView` cannot tell whether it is active or hidden, so it cannot suspend heavy rendering.

### Scenario Gantt store still holds full data while tab is open

File: `gantt/src/stores/scenario-gantt-store.ts`

Current behavior:

- Per-scenario stores are kept in a registry.
- The store has `data: ScenarioGanttData | null`.
- `destroyScenarioGanttStore(scenarioId)` exists, but it is only called when `ScenarioGanttView` unmounts.

Because AppShell keeps hidden tabs mounted, hidden scenario stores stay alive.

### Scenario Gantt view always renders heavy grid when data exists

File: `gantt/src/components/shell/scenario-gantt-view.tsx`

Current behavior:

```tsx
return (
  <div ref={containerRef} className="flex h-full flex-col overflow-hidden" data-testid="scenario-gantt-view">
    <ScenarioGanttToolbar ... />
    <ScenarioDragProvider scenarioId={scenarioId}>
      <ScenarioLayoutGrid scenarioId={scenarioId} />
    </ScenarioDragProvider>
    <ScenarioHorizontalScrollbar ... />
    <ScenarioStatusBar scenarioId={scenarioId} />
  </div>
)
```

`ScenarioLayoutGrid` contains the heavy pane/canvas tree. It is rendered even when the scenario tab is hidden by the parent.

### Timers do not respect active state

File: `gantt/src/components/shell/scenario-gantt-view.tsx`

Current behavior:

```ts
useEffect(() => {
  const id = setInterval(() => void refreshLock(scenarioId), LOCK_POLL_MS)
  return () => clearInterval(id)
}, [scenarioId, refreshLock])
```

Hidden scenario tabs still poll lock status every 30 seconds. Keepalive only runs for lock owner, which is correct, but refresh polling can pause while inactive.

## Do Not Change In This Pass

Do not implement these from the older note in the first pass:

- Do not stop Live `fetchFlights` background load in `apply-filters.ts`.
- Do not stop Live `loadFor(flightIds)` full composition load.
- Do not remove Live full-load sorting behavior for crew/pairing/flight.
- Do not rewrite roster derived maps/buckets yet.
- Do not change server APIs.

Those may still be revisited after measuring Scenario-focused changes, but they are not current priorities.

## Target Outcome

When users open Live Gantt plus multiple Scenario Gantt tabs:

- Only the active Scenario Gantt tab should render canvas grids.
- Hidden Scenario Gantt tabs should preserve tab identity and safe lightweight state.
- Hidden clean Scenario Gantt tabs should be able to release heavy scenario `data` after an idle timeout.
- Hidden dirty/locked Scenario tabs must preserve data and edits.
- Switching back to a scenario tab should restore or reload cleanly without request floods.

## Recommended Implementation

### Phase 1: Pass active state from AppShell into ScenarioGanttView

**Potential enhance**: Required foundation.

**Files**:

- `gantt/src/components/shell/app-shell.tsx`
- `gantt/src/components/shell/scenario-gantt-view.tsx`

**Change**:

Update `ModuleView` to accept active:

```tsx
const ModuleView = ({ module, active }: { module: ActiveModule; active: boolean }) => {
  ...
  if (module.startsWith('scenario-gantt:')) {
    const scenarioId = Number(module.slice('scenario-gantt:'.length))
    if (!Number.isNaN(scenarioId)) return <ScenarioGanttView scenarioId={scenarioId} active={active} />
  }
}
```

Update `ContentArea`:

```tsx
{openTabs.map((module) => {
  const active = module === activeModule
  return (
    <div
      key={module}
      className={['absolute inset-0', active ? '' : 'invisible pointer-events-none'].join(' ')}
    >
      <ModuleView module={module} active={active} />
    </div>
  )
})}
```

Update ScenarioGanttView props:

```ts
export const ScenarioGanttView = ({ scenarioId, active }: { scenarioId: number; active: boolean }): ReactNode => {
```

**Acceptance**:

- Active scenario tab receives `active=true`.
- Hidden scenario tab receives `active=false`.
- Existing non-scenario modules still render normally.

### Phase 2: Suspend hidden Scenario canvas/grid rendering

**Potential enhance**: High. This attacks hidden canvas/component memory directly.

**Files**:

- `gantt/src/components/shell/scenario-gantt-view.tsx`
- `gantt/src/components/scenario-gantt/scenario-layout-grid.tsx` only if direct gating is cleaner there.

**Change**:

When `active === false`, do not render:

- `ScenarioDragProvider`
- `ScenarioLayoutGrid`
- `ScenarioHorizontalScrollbar`
- `ScenarioStatusBar`

Render either nothing or a tiny placeholder inside the mounted tab wrapper:

```tsx
if (!active && data) {
  return (
    <div
      data-testid="scenario-gantt-suspended"
      data-scenario-id={scenarioId}
      className="hidden"
    />
  )
}
```

Important: keep this after the core store hooks and safety effects, so state is preserved but heavy DOM/canvas work is gone.

**Recommended nuance**:

- If `loading` and inactive, do not render the loading screen either.
- If `error` and inactive, do not render visible error UI.
- When active again, normal render path should show loading/error/data.

**Acceptance**:

- Switch away from a scenario tab.
- DOM should no longer contain that hidden tab's scenario pane canvases.
- Switch back.
- Grid/canvas should remount and render from existing store data.
- No additional `/gantt-data` call should happen just because the tab was suspended.

### Phase 3: Pause hidden scenario lock polling, keep owner keepalive

**Potential enhance**: Medium. Reduces background work and removes hidden-tab timer churn.

**Files**:

- `gantt/src/components/shell/scenario-gantt-view.tsx`

**Current**:

Lock refresh interval runs for every mounted scenario tab.

**Change**:

Only refresh lock status while active:

```ts
useEffect(() => {
  if (!active) return
  const id = setInterval(() => void refreshLock(scenarioId), LOCK_POLL_MS)
  return () => clearInterval(id)
}, [active, scenarioId, refreshLock])
```

Keep owner keepalive as-is or make it explicitly independent of active:

```ts
const isOwner = lockStatus?.isOwner ?? false
useEffect(() => {
  if (!isOwner) return
  const id = setInterval(() => void scenarioGanttApi.keepaliveLock(scenarioId), LOCK_KEEPALIVE_MS)
  return () => clearInterval(id)
}, [isOwner, scenarioId])
```

**Reason**:

- Non-owner hidden tabs do not need polling.
- Owner hidden tabs may need keepalive to avoid silently losing edit lock.

**Acceptance**:

- Hidden non-owner scenario tab does not poll `/lock-status`.
- Hidden owner tab still keeps lock alive, or UX explicitly releases/blocks before hide. First pass should keep alive.

### Phase 4: Add safe heavy-data release API to scenario store

**Potential enhance**: High for many scenario tabs or very large scenario data.

**Files**:

- `gantt/src/stores/scenario-gantt-store.ts`

**Add state/action**:

```ts
releasedAt: number | null
releaseHeavyData: () => void
```

Implementation:

```ts
releaseHeavyData: () => {
  const s = get()
  if (s.isDirty || s.pendingChanges.length > 0 || s.saving || s.lockStatus?.isOwner) return
  set({ data: null, error: null, loading: false, releasedAt: Date.now() })
}
```

When `loadData` succeeds:

```ts
set({ data, loading: false, releasedAt: null })
```

**Expose registry diagnostics**:

Helpful but optional:

```ts
export function getScenarioGanttStoreCount() {
  return registry.size
}
```

**Acceptance**:

- Clean store releases `data`.
- Dirty store does not release `data`.
- Saving store does not release `data`.
- Lock-owned store does not release `data`.

### Phase 5: Release clean hidden scenario data after idle timeout

**Potential enhance**: High after canvas suspension.

**Files**:

- `gantt/src/components/shell/scenario-gantt-view.tsx`
- maybe `gantt/src/stores/scenario-gantt-store.ts`

**Add constant**:

```ts
const HIDDEN_RELEASE_MS = 5 * 60_000
```

**Effect**:

```ts
useEffect(() => {
  if (active) return
  const id = window.setTimeout(() => {
    getScenarioGanttStore(scenarioId).getState().releaseHeavyData()
  }, HIDDEN_RELEASE_MS)
  return () => window.clearTimeout(id)
}, [active, scenarioId])
```

**Reload on activation if data was released**:

Existing load effect currently runs only on mount:

```ts
useEffect(() => {
  cancelDeferredDestroy(scenarioId)
  void getScenarioGanttStore(scenarioId).getState().loadData(scenarioId)
  return () => scheduleDeferredDestroy(scenarioId)
}, [scenarioId])
```

Do not make this effect depend on active directly, or it may reload every tab switch.

Instead add a separate activation effect:

```ts
useEffect(() => {
  if (!active) return
  const state = getScenarioGanttStore(scenarioId).getState()
  if (!state.data && !state.loading) void state.loadData(scenarioId)
}, [active, scenarioId])
```

**Acceptance**:

- Clean hidden scenario tab releases heavy data after timeout.
- Returning to released tab reloads once.
- Switching between active tabs quickly does not reload data.
- Dirty tab is not released.

### Phase 6: Add memory/debug instrumentation for this scenario path

**Potential enhance**: Medium. Useful to prove the fix.

**Files**:

- `gantt/src/utils/gantt-memory-debug.ts` new
- `gantt/src/stores/scenario-gantt-store.ts`
- `gantt/src/components/shell/scenario-gantt-view.tsx`

**Implement**:

Dev-only logger gated by localStorage:

```ts
localStorage.setItem('roisGanttMemoryDebug', '1')
```

Report:

- `performance.memory.usedJSHeapSize` if available.
- scenario store count.
- active scenario id.
- whether current scenario has `data`.
- number of open tabs and scenario tabs.

Optional count helpers in scenario store:

```ts
export function getScenarioGanttStoreDebugSnapshot() {
  return [...registry.entries()].map(([scenarioId, store]) => {
    const s = store.getState()
    return {
      scenarioId,
      hasData: !!s.data,
      isDirty: s.isDirty,
      pendingChanges: s.pendingChanges.length,
      lockOwner: !!s.lockStatus?.isOwner,
      releasedAt: s.releasedAt,
    }
  })
}
```

**Acceptance**:

- Debug log shows hidden scenario data released after timeout.
- Debug log shows active scenario reloaded once on return.

## Updated Priority Order

1. Pass `active` into `ScenarioGanttView`.
2. Suspend hidden Scenario canvas/grid rendering.
3. Pause hidden lock polling while preserving owner keepalive.
4. Add `releaseHeavyData` guardrails to scenario store.
5. Add hidden idle release + activation reload.
6. Add memory/debug instrumentation.

Do not prioritize Live Flight/Composition changes in this pass.

## Test Plan

### Unit / component tests to add

Add tests near existing shell/scenario tests, or create:

- `gantt/src/components/shell/__tests__/scenario-gantt-suspension.test.tsx`
- `gantt/src/stores/__tests__/scenario-gantt-release.test.ts`

Test cases:

1. `AppShell` passes active state:
   - active scenario renders normal view.
   - hidden scenario renders suspended placeholder.
2. Suspended scenario:
   - does not render `ScenarioLayoutGrid`.
   - does not render scenario canvases.
3. Store release:
   - clean store clears `data`.
   - dirty store keeps `data`.
   - pending changes keep `data`.
   - lock owner keeps `data`.
4. Activation reload:
   - if `active=true` and `data=null`, calls `loadData` once.
   - if `data` already exists, does not reload.

### Manual browser verification

1. Open Live Gantt.
2. Open two Scenario Gantt tabs.
3. Switch to Scenario A.
4. Confirm Scenario A canvases exist.
5. Switch to Scenario B.
6. Confirm Scenario A canvases are removed/suspended.
7. Wait hidden release timeout.
8. Confirm Scenario A store has no heavy `data` if clean.
9. Switch back to Scenario A.
10. Confirm data reloads once and canvas returns.

Use Chrome Task Manager or DevTools Memory to compare:

- one active scenario vs two hidden scenarios before change.
- after canvas suspension.
- after idle data release.

## Risks And Guardrails

### Risk: request flood on activation

Avoid adding `active` to the existing mount-time `loadData` effect. Use a separate activation effect that checks `!data && !loading`.

### Risk: losing unsaved scenario edits

Never release data when:

- `isDirty === true`
- `pendingChanges.length > 0`
- `saving === true`

### Risk: losing edit lock

Do not pause owner keepalive unless product explicitly wants hidden tabs to release locks.

### Risk: layout reset after release/reload

Do not destroy `ScenarioLayoutStore` during idle release. Only clear heavy `data`. Keep layout/scroll/filter state.

### Risk: hidden toolbar/data UI still costs memory

The first suspension can return a tiny placeholder for the whole scenario view when inactive. That removes toolbar/grid/scrollbar/status together.

## Suggested Final Acceptance

The implementation is good enough for the first pass when:

- Hidden scenario-gantt tabs no longer keep canvas DOM nodes mounted.
- Clean hidden scenario tabs release `data` after idle timeout.
- Dirty or lock-owned scenario tabs do not release data.
- Returning to a released tab reloads once and restores UI.
- Live Flight/Composition preload remains unchanged.
- `cd gantt && npm run build` passes.
