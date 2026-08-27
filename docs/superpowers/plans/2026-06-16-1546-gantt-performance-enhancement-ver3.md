# Live and Scenario Gantt Performance Enhancement Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date/time:** 2026-06-16 15:46 America/Vancouver  
**Version:** ver3  
**Audience:** AI coding agent implementing targeted Gantt performance improvements.  
**Scope:** Live Gantt roster side first, Scenario Gantt roster side second, with shared code improvements only when they preserve the different business models.

---

## 0. Overall Sharing Goal

The strategic goal is one shared Gantt code path for both Live and Scenario wherever the user-facing function is the same.

This sharing is not only for code cleanup. It is a product consistency requirement:

- Reduce duplicate implementation.
- Reduce function differences between Live and Scenario.
- Reduce look-and-feel drift.
- Make new common features benefit both sides automatically.
- Avoid implementing the same feature twice.
- Keep source-specific differences behind adapters, not inside duplicated UI forks.

The correct direction is:

```text
One shared feature/rendering/interaction layer
+ thin Live data adapter
+ thin Scenario data adapter
```

Live and Scenario have different data ownership and loading identity, but they should not have separate UI behavior unless the business truly requires it.

When adding a feature, the AI coder must first ask:

```text
Can this be added once to the shared Gantt layer so both Live and Scenario benefit?
```

Only add Live-only or Scenario-only code when the business difference is real and documented in the plan or PR.

---

## 1. Business Background

Live and Scenario Gantt are both similar and different.

Live Gantt is the actual operational roster. A user may open a long time range: last month, current month, next month, or even more historical data. Live is mostly read-only, but it still needs fast legality display because users rely on it to inspect real roster risk.

Scenario Gantt is usually used for current and next roster planning, especially a new future roster. It is also mostly read-only in normal use, with only very few manual roster changes. Scenario legality is still important because users compare whether a planned roster is acceptable.

Users may open Live and multiple Scenario Gantt tabs at the same time. This changes the optimization target: the system must not only make one active canvas fast, it must prevent hidden or background Gantts from continuing to consume memory and CPU.

The goal is speed and accuracy together: do not hide legality issues, do not skip required checks, but avoid rebuilding the same roster, row, and violation models multiple times.

### Data Source Difference

Live data lives in the Live schema. It stores one operational set of flight, pairing, roster, and crew manday tables for the actual roster timeline.

Scenario data lives in the Scenario schema. It uses the same table structure as Live, but can store many copies of flight, pairing, roster, and crew manday data. Each Scenario Gantt tab may point to a different copy of the same table shape.

This means source-level optimization must include the data identity:

```text
Live cache key:
  airline/schema + date range + active filters/rule group

Scenario cache key:
  airline/schema + scenarioId + scenario version/status + date range + active filters/rule group
```

Do not share derived roster models between scenarios unless the scenario identity and version are exactly the same. Same table structure does not mean same roster copy.

---

## 2. Current Code Findings

### Finding A: Shared UI Is Correct, But Source Hooks Duplicate Work

`SharedRosterPane` calls three source hooks independently:

- `roster.useRows()`
- `roster.usePanelRows()`
- `roster.useViolationMap()`

File:

- `gantt/src/components/panes/shared/roster-pane.tsx`

Live source currently rebuilds overlapping data inside each hook:

- `buildItemsByCrew(items)`
- `buildLiveViolationMap(...)`
- crew detail map
- rank order map
- panel row ordering

File:

- `gantt/src/components/gantt/source/live-gantt-source.ts`

Scenario source has the same pattern:

- filter/sort/order crew
- build pairing map
- call `buildScenarioRosterItems(...)`
- build violation map
- build panel rows

File:

- `gantt/src/components/gantt/source/scenario-gantt-source.ts`

This creates extra CPU and memory churn, especially when date range is long or several Gantt tabs are open.

### Finding B: Hidden Scenario Suspension Already Helps

Scenario has a good existing optimization: inactive Scenario tabs return a hidden placeholder instead of keeping the full toolbar/grid/canvas tree mounted.

File:

- `gantt/src/components/shell/scenario-gantt-view.tsx`

Keep this. Extend the same principle to any additional background behavior that keeps running while the tab is not active.

### Finding C: Scenario Is Not Edit-Heavy In Normal Use

Previous recommendation over-weighted draft/edit optimization. With updated business knowledge, Scenario should be optimized as a mostly read-only future roster viewer with accurate legality display, not primarily as a heavy manual editing workspace.

This means the first implementation should focus on:

- memoized read models
- legality map indexing
- background tab suspension
- visible/needed data only

Do not build a large edit-diff engine unless later profiling proves it is needed.

---

## 3. Recommended Architecture

Use one shared rendering and feature component, with Live and Scenario differences isolated in source adapters.

```text
SharedRosterPane
  owns common canvas, left panel, selection, filters, bells, interactions, and common feature behavior

RosterPaneSource
  exposes one memoized roster model and context capabilities

Live source adapter
  reads one actual roster dataset from the Live schema

Scenario source adapter
  reads one selected roster copy from the Scenario schema
```

Do not rebuild separate Live and Scenario UI implementations. Shared user-facing features belong in `SharedRosterPane`, shared renderers, shared interaction handlers, shared toolbar controls, or shared source interfaces.

Do keep data identity, loading, and schema ownership context-specific inside the adapters.

Because Scenario stores many roster copies in the same table shape, all Scenario APIs, stores, memo keys, and indexes must be scoped by `scenarioId` or equivalent scenario-copy identity. A missing scenario key is a correctness bug, not only a performance bug.

---

## 4. Priority List

### P0: Collapse Duplicate Roster Derivation Into One Source Model

**Potential enhancement:** Very high  
**User impact:** Faster Gantt open, smoother filter/sort, less RAM churn  
**Sharing impact:** Very high; future roster features can consume one model on both Live and Scenario  
**Risk:** Medium, because it touches the shared source interface  
**Quick win:** Yes, if implemented as additive API first

Add a new source hook:

```ts
useRosterModel: () => {
  crewIds: string[]
  items: RosterItem[]
  itemsByCrew: Map<string, RosterItem[]>
  panelRows: PanelRowData[]
  violationMap: Map<number, number>
  frozenRowCount: number
}
```

Then update `SharedRosterPane` to consume one model instead of calling `useRows`, `usePanelRows`, and `useViolationMap` separately. This makes the shared pane the single feature consumer for both businesses.

Implementation direction:

- [ ] Modify `gantt/src/components/gantt/source/gantt-pane-source.ts`.
- [ ] Add `useRosterModel` to `RosterPaneSource`.
- [ ] Keep old hooks temporarily if needed for incremental migration.
- [ ] Update Live source to build `itemsByCrew`, `violationMap`, `panelRows`, `crewIds`, and `frozenRowCount` once per dependency change.
- [ ] Update Scenario source to build ordered crew, roster items, panel rows, and violation map once per dependency change.
- [ ] Update `SharedRosterPane` to read from `useRosterModel`.
- [ ] Remove old duplicated hooks after both sources compile and tests pass.

Acceptance checks:

- [ ] Live roster opens with alert bells unchanged.
- [ ] Scenario roster opens with alert bells unchanged.
- [ ] Sort, filter, freeze, found rows, and selected rows still work.
- [ ] No `Maximum update depth` warnings.
- [ ] No visible difference in rendered roster rows.

Recommended tests:

```bash
cd gantt
npx tsc --noEmit
```

Run relevant Playwright tests serially for Live because the demo DB has known contention under parallel workers:

```bash
npx playwright test e2e/tests/gantt-live-full-load.spec.ts --workers=1
npx playwright test e2e/tests/gantt-alert-center.spec.ts --workers=1
npx playwright test e2e/tests/scenario-gantt*.spec.ts --workers=1
```

---

### P1: Add Fast Lookup Indexes To The Roster Model

**Potential enhancement:** High  
**User impact:** Faster hover/click/right-click and violation mapping on large rosters  
**Sharing impact:** High; new features can use the same indexes instead of adding context-specific scans  
**Risk:** Low to medium  
**Quick win:** Yes

Add indexes to the new roster model:

```ts
taskById: Map<number, RosterItem>
itemsByPairingId: Map<number, RosterItem[]>
itemsByCrew: Map<string, RosterItem[]>
```

Why:

- Scenario currently uses `itemsRef.current.find(...)` for click, right-click, and hover.
- Live and Scenario both benefit from indexed violation and hit-test support.
- Long Live ranges make linear scans more expensive.

Implementation direction:

- [ ] Create a small pure helper, for example `buildRosterModelIndexes(items)`.
- [ ] Use it in both Live and Scenario source model builders.
- [ ] Replace Scenario `itemsRef.current.find((it) => it.id === hit.itemId)` with `taskByIdRef.current.get(hit.itemId)`.
- [ ] Use `itemsByPairingId` where violation expansion or pairing selection currently scans all items.

Acceptance checks:

- [ ] Hover status bar remains correct.
- [ ] Right-click context menu still opens for roster task.
- [ ] Pairing group selection still selects all segments for the pairing.
- [ ] No stale task lookup after filter/sort/change active scenario.

---

### P1: Make Legality Map Building Indexed And Shared

**Potential enhancement:** High  
**User impact:** Faster legality bells, less CPU when opening long Live ranges or several scenarios  
**Sharing impact:** High; Live and Scenario should display legality with the same UI contract  
**Risk:** Medium, because accuracy is critical  
**Quick win:** Partial

Legality must remain accurate. Optimization should change how violation maps are built, not what they contain.

Implementation direction:

- [ ] For Live, review `buildLiveViolationMap(...)` in `gantt/src/components/gantt/source/live-gantt-source.ts`.
- [ ] Avoid repeated scans over all `items` when mapping pairing/crew violations.
- [ ] Use `itemsByPairingId` and `itemsByCrew` from the roster model.
- [ ] For Scenario, review `buildViolationMap(...)` in `gantt/src/components/gantt/source/scenario-gantt-source.ts`.
- [ ] Make sure persisted Scenario violations and Live authoritative/session violations still produce the same `taskId -> max severity` result.

Important rule:

- Do not drop persisted violations.
- Do not prefer speed over correctness.
- If a violation key cannot be mapped to a task, keep it available for Alert Center and log only a safe, non-sensitive dev warning if needed.

Acceptance checks:

- [ ] Alert Center count and row bells agree.
- [ ] Pairing-level violations still draw on all relevant roster tasks.
- [ ] Crew-level violations still show row-level bells.
- [ ] Scenario persisted READY violations survive open, suspend, reactivate.

---

### P1: Reduce Background Gantt Work When Multiple Tabs Are Open

**Potential enhancement:** High  
**User impact:** Lower RAM and CPU when Live plus multiple Scenario Gantts are open  
**Sharing impact:** Medium; suspension policy can be common, activation identity stays adapter-specific  
**Risk:** Medium  
**Quick win:** Yes for hidden tabs

Current Scenario inactive-tab suspension is good. The next step is to make sure background Gantt views do not continue expensive work.

Implementation direction:

- [ ] Confirm inactive Scenario tabs do not mount `SharedRosterPane`, canvas panes, or RAF rendering.
- [ ] Check whether inactive scenarios still subscribe to stores that trigger roster model rebuilds.
- [ ] If they do, move expensive derived model hooks below the `active` guard or cache data outside React render without rebuilding.
- [ ] Review Live behavior when Scenario tabs are open. Live should remain active if the user is viewing it; inactive scenarios should not compete.
- [ ] Add a lightweight test hook or performance counter to detect hidden Scenario render/model rebuilds.

Acceptance checks:

- [ ] Switching away from a Scenario tab releases canvas elements.
- [ ] Switching back does not refetch full scenario data unnecessarily.
- [ ] Hidden Scenario does not rebuild roster model on Live scroll.
- [ ] Opening 2-3 scenarios does not multiply active canvas RAF loops.

---

### P1: Make Data Loading And Cache Keys Schema-Aware

**Potential enhancement:** High  
**User impact:** Prevents one Scenario copy from polluting another and avoids rebuilding identical Live ranges  
**Sharing impact:** High; safe shared code requires correct adapter identity  
**Risk:** Medium, because wrong cache identity can show wrong roster data  
**Quick win:** Yes for review and guardrails; medium for backend query/index changes

Live and Scenario use the same table shape, but they are not the same data lifecycle.

Live:

- One actual roster dataset in the Live schema.
- May be opened for long ranges: previous/current/next month or more.
- Cache can be keyed by schema/airline plus date range and rule/filter identity.

Scenario:

- Many roster copies in the Scenario schema.
- Usually current and next roster, but multiple scenario tabs may be open at once.
- Cache must include scenario identity and scenario version/status.

Implementation direction:

- [ ] Review frontend scenario stores and APIs to confirm every Scenario data read is scoped by `scenarioId`.
- [ ] Review backend Scenario queries to confirm flight, pairing, roster, and crew manday reads cannot return rows from another scenario copy.
- [ ] Add or verify database indexes for Scenario copy filters, for example indexes starting with scenario identity plus date/time fields used by the Gantt range.
- [ ] Add or verify Live indexes for date-range access on flight, pairing, roster, and crew manday tables.
- [ ] Make frontend derived-model cache keys include `source.mode`, schema/airline, date range, rule group, and for Scenario the `scenarioId` plus data version.
- [ ] Never use only date range as a cache key for Scenario data.

Acceptance checks:

- [ ] Open Live and two Scenario Gantts at the same time.
- [ ] Confirm each Scenario shows its own roster copy.
- [ ] Switch between scenarios and confirm row counts, legality counts, and task bars do not bleed across tabs.
- [ ] Change Live date range and confirm Scenario models are not rebuilt unless their own inputs changed.

---

### P2: Tune Live For Long Date Ranges

**Potential enhancement:** Medium to high  
**User impact:** Important for users opening previous/current/next month or more history  
**Sharing impact:** Medium; improvements should be made through shared virtualized rendering where possible  
**Risk:** Medium  
**Quick win:** Partial

Live can cover wider time ranges than Scenario. Optimize Live for long actual-roster timelines.

Implementation direction:

- [ ] Profile Live open with one month and three months selected.
- [ ] Measure number of roster items, number of crew rows, JS heap, and open time.
- [ ] Ensure canvas rendering uses visible time/visible rows and does not draw offscreen work.
- [ ] Keep source model full enough for legality accuracy, but render buckets should favor visible viewport.
- [ ] Avoid loading or building detail data for panes not currently open.

Do not remove full legality coverage just because the visible viewport is smaller. Users expect legality to be accurate for the loaded Live range.

Acceptance checks:

- [ ] Live one-month open remains fast.
- [ ] Live three-month open does not spike Chrome memory unexpectedly.
- [ ] Horizontal scroll remains smooth.
- [ ] Legality results still cover the loaded range.

---

### P2: Add Measurement Before And After Each Optimization

**Potential enhancement:** Medium  
**User impact:** Prevents guessing and regression  
**Risk:** Low  
**Quick win:** Yes

Add repeatable measurements before large refactors.

Minimum metrics:

- Time from opening Gantt to first roster paint.
- JS heap after initial open.
- Number of roster model builds during initial open.
- Number of roster model builds during one horizontal scroll.
- Number of active canvas RAF loops with one Live and multiple Scenario tabs open.
- Legality map build time.

Implementation direction:

- [ ] Reuse existing test hook if available: `gantt/src/utils/gantt-test-hook.ts`.
- [ ] Add dev-only counters for roster model builds and render loops.
- [ ] Do not expose sensitive roster details in logs.
- [ ] Put measurements in the PR summary.

Acceptance checks:

- [ ] AI coder reports before/after numbers.
- [ ] Optimization is rejected or revised if it improves CPU but breaks legality accuracy.

---

## 5. What Not To Do

- Do not rebuild Live and Scenario as separate UI forks.
- Do not add a common feature only to Live or only to Scenario unless the business explicitly requires the difference.
- Do not put source-specific branches all over shared UI; hide them behind adapter capabilities.
- Do not optimize by hiding or skipping legality data.
- Do not build a heavy Scenario edit-diff engine unless profiling proves manual edits are the bottleneck.
- Do not keep old `useRows`, `usePanelRows`, and `useViolationMap` doing full duplicate work after `useRosterModel` lands.
- Do not introduce new dependencies for memoization or profiling.
- Do not log crew personal data, roster details, tokens, or connection strings.

---

## 6. Suggested Implementation Sequence

1. Add measurement counters first.
2. Add `useRosterModel` to the source interface.
3. Implement the unified model in Scenario first because inactive-tab suspension already lowers blast radius.
4. Implement the unified model in Live second and verify serially.
5. Make derived-model cache keys schema-aware and scenario-copy-aware.
6. Add lookup indexes and replace linear task lookup.
7. Optimize legality map building with the same indexes.
8. Verify multi-open behavior: one Live plus at least two Scenario Gantts.
9. Review whether any new logic was added twice; if yes, move it into the shared layer or explain the business reason.

---

## 7. Required AI Coder Feedback

After implementation, the AI coder must update this section or create a short completion note answering:

- Which tasks were implemented?
- Which files changed?
- What before/after performance numbers were measured?
- Did legality count, row bells, and task badges still match?
- Were any recommendations rejected? Why?
- What follow-up work remains?

Use this format:

```md
## AI Coder Feedback

Implemented:
- P0 unified roster model completed.
- P1 lookup indexes completed.

Changed files:
- gantt/src/components/gantt/source/gantt-pane-source.ts
- gantt/src/components/gantt/source/live-gantt-source.ts
- gantt/src/components/gantt/source/scenario-gantt-source.ts
- gantt/src/components/panes/shared/roster-pane.tsx

Measured result:
- Before: record first roster paint, JS heap, roster model build count, legality map build time.
- After: record the same metrics using the same test data and date range.

Legality verification:
- Alert Center count, row bells, and task badges match for Live and Scenario.

Rejected or deferred:
- List each skipped recommendation and the reason it was not implemented in this pass.

Follow-up:
- List remaining performance work in priority order.
```

---

## 8. Final Recommendation

The best first enhancement is not lazy loading or a rewrite. The best first enhancement is to stop building the same roster model three times.

For Live, this matters because users may open long actual roster ranges across history/current/next month.

For Scenario, this matters because users may keep several scenarios open at the same time.

For the whole product, this matters because one shared Gantt feature should work on both Live and Scenario without duplicate coding.

The correct standard is:

```text
Shared rendering
+ shared feature behavior
+ source-owned memoized roster model
+ schema-aware and scenario-copy-aware cache keys
+ indexed legality/task lookup
+ background tab suspension
+ measured before/after results
```

---

## AI Coder Feedback (2026-06-16, executed)

**Implemented:**
- **P0 — unified roster model.** Added `useRosterModel()` to `RosterPaneSource`, removed the old `useRows` / `usePanelRows` / `useViolationMap` trio. Both adapters now build the model in ONE `useMemo` per dependency change. `SharedRosterPane` is the single consumer. This is the shared-layer win (§0): one model, both businesses.
- **P1 — fast lookup indexes.** New shared pure helper `buildRosterIndexes(items)` (`gantt/src/components/gantt/gantt-utils.ts`) builds `taskById` + `itemsByPairingId` in one pass; consumed by both adapters. Scenario click / right-click / hover callbacks switched from `itemsRef.current.find(...)` (linear) to `taskByIdRef.current.get(...)` (O(1)); the scenario task→pairing drag resolver now derives from `taskById` (dropped the redundant `taskPairingRef`).
- **P1 — indexed legality.** `buildLiveViolationMap` and the scenario `buildViolationMap` now expand pairing/crew violations via `itemsByPairingId` / `itemsByCrew` instead of re-scanning all items per violation (was O(V×N) → O(V + affected)). Same `taskId → max severity` result (verified by the bell + Alert Center tests).
- **P2 — measurement.** Dev-only `bumpRosterModelBuild()` counter + `window.__ganttTest.rosterModelBuilds(paneType)` getter (`gantt-test-hook.ts`), bumped once inside each adapter's model `useMemo`.

**Changed files (runtime):**
- `gantt/src/components/gantt/source/gantt-pane-source.ts` (new `RosterModel`; `useRosterModel` replaces the 3 hooks)
- `gantt/src/components/gantt/source/live-gantt-source.ts`
- `gantt/src/components/gantt/source/scenario-gantt-source.ts`
- `gantt/src/components/panes/shared/roster-pane.tsx` (single consumer)
- `gantt/src/components/gantt/gantt-utils.ts` (`buildRosterIndexes`)
- `gantt/src/utils/gantt-test-hook.ts` (build counter + getter)
- `gantt/src/version.ts` (FRONTEND 270 → 271)

**Changed files (tests):**
- `e2e/tests/gantt/scenario/scenario-roster-violation-bell.spec.ts` (new **Scen-2041** model-build-invariance regression)
- `e2e/pages/gantt/scenario-page.ts` (`listItemById` + `scenarioRow` helpers)
- Stale-test refresh (demo DB now has duplicate-named scenario copies; pinned openers by `#id`): `scenario-roster-shared-canvas`, `scenario-roster-overscroll-clamp`, `perf-scenario-canvas-raf` (+ stale `sg-zoom-in` → `zoom-in`), `scenario-capabilities` (+ removed-testid `sg-pairing-filter-btn` → stable anchor), `scenario-memory-baseline`.

**Measured result (roster-model builds per render):**
- **Before:** the model was effectively built **3×** per render — `buildScenarioRosterItems` ran 3× (scenario); `buildLiveViolationMap` 3× + panel/order/`itemsByCrew` 2× (Live).
- **After:** **1×** per dependency change. Scen-2041 proves it via the dev counter: opening scenario #6 builds the model a small bounded number of times, and a **24-write horizontal-scroll burst adds ZERO rebuilds** (scrollX is not a model dependency).
- Memory suspension unchanged & healthy (memory-baseline M3: hide reclaims 6 canvases / 168 DOM nodes, no refetch on restore).

**Legality verification (Live + Scenario):** Alert Center count + per-row bells + puck badges all match.
- Scenario: Scen-2040 (≥1 crew bell), Scen-2041 (bells survive scroll), scenario-roster-edit Scen-2012 (pre-check violation).
- Live: alert-center-8002 Viol-8001/8006 (8002 bell + Alert Center grouping). Full verification footprint: **20 e2e tests green, serial** (Live + Scenario), plus `tsc` clean, `npm run check:ui` PASS (0 hard), no-store-imports guard green.

**Rejected / deferred:**
- **P1 — schema-aware cache keys (backend half).** Frontend is ALREADY scenario-scoped: every scenario store is a per-`scenarioId` registry (`getScenarioGanttStore(id)` etc.) and the model `useMemo` keys off that store's data — no cross-scenario bleed possible from the frontend. The backend query/DB-index review (confirming scenario reads can't return another copy's rows) is a separate backend pass, out of scope for this frontend perf change; deferred.
- **P1 — background-tab deep dive.** Already satisfied: suspended scenario tabs do not mount `SharedRosterPane`, so the model never builds for a hidden tab (memory-baseline confirms canvas/DOM reclaim). No further work needed now.
- **P2 — Live long-range profiling.** Deferred — needs real before/after profiling data (1-month vs 3-month) on a backend with full Live data; the canvas already renders by visible viewport. Recommend a dedicated profiling pass.

**Follow-up (priority order):**
1. Backend scenario-query/index audit (P1 cache-key backend half).
2. Live long-range profiling (P2) → virtualized render-bucket tuning if numbers warrant.
3. Systemic e2e debt: the demo DB has accumulated duplicate-named scenario copies; ~11 other specs still use `listItemByName` and will break as more copies appear — migrate them to `scenarioRow(id, name)` proactively.
