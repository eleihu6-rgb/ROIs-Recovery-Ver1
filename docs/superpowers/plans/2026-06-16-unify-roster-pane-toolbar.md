# Unify Live + Scenario Roster Pane & Toolbar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or
> superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Collapse the forked Live/Scenario roster pane and toolbar onto shared, source-driven
components, so Scenario inherits Live behavior by construction (fixing the missing per-row violation
bells and the forked zoom control).

**Architecture:** Extend the existing `gantt-source` abstraction with a `RosterPaneSource`; build a
`SharedRosterPane` (mirroring `SharedFlightPane`/`SharedPairingPane`); switch Scenario then Live
wrappers onto it; share the common toolbar controls and unify the per-pane toolbar.

**Tech Stack:** React 19, Zustand, TypeScript, Canvas rendering, Vitest (unit), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-06-16-unify-roster-pane-toolbar-design.md`

**Branch:** `feat/gantt/unify-roster-toolbar`

---

## Phase 0 — Immediate parity (interim fixes, ship now)

### Task 0.1: Scenario per-row violation bell (Issue 1)

**Files:**
- Modify: `gantt/src/components/scenario-gantt/scenario-roster-pane.tsx`
- Test: `e2e/tests/gantt/scenario/scenario-roster-violation-bell.spec.ts`

- [ ] **Step 1 — Playwright regression test (RED first).** Assert that on a scenario with persisted
  violations, at least one roster row renders the per-row gutter bell. Because the gutter is canvas,
  assert via the test hook used elsewhere (`window.__ganttTest`) OR via the panel-row data exposed to
  the canvas. Concretely: load scenario gantt, wait for `scenario-roster-canvas`, then assert the
  shared header-canvas drew ≥1 violation indicator. Use the existing pattern from the Live bell test
  (`e2e/tests/gantt/...alert...`) and the `__ganttTest` Canvas-assert hook (see memory
  "gantt-live-view-and-test-hook"). Expected: FAIL before the fix (no indicators).

- [ ] **Step 2 — Run, verify FAIL.**
  Run: `npx playwright test e2e/tests/gantt/scenario/scenario-roster-violation-bell.spec.ts --reporter=list`
  Expected: FAIL (0 indicators).

- [ ] **Step 3 — Implement.** After the `violationMap` memo (`scenario-roster-pane.tsx:417`), add a
  derived memo that injects per-crew max severity into the panel rows, and feed it to
  `PaneHeaderCanvas`:

```tsx
  // Per-row max violation severity for the left-gutter bell (mirrors Live roster-pane:311-355).
  // Order preserved → selectedRowIndices (built from panelRows) stays aligned.
  const panelRowsWithViolations = useMemo((): PanelRowData[] => {
    if (violationMap.size === 0) return panelRows
    return panelRows.map((row) => {
      let maxSev = 0
      for (const it of built.itemsByCrew.get(row.rowId) ?? []) {
        const s = violationMap.get(it.id) ?? 0
        if (s > maxSev) maxSev = s
      }
      return maxSev > 0 ? { ...row, maxViolationSeverity: maxSev } : row
    })
  }, [panelRows, violationMap, built])
```

  Then change the `PaneHeaderCanvas` prop `rows={panelRows}` → `rows={panelRowsWithViolations}`
  (`scenario-roster-pane.tsx:662`). Leave `selectedRowIndices` on `panelRows` (identical order).

- [ ] **Step 4 — Run, verify PASS.**
  Run: `npx playwright test e2e/tests/gantt/scenario/scenario-roster-violation-bell.spec.ts --reporter=list`
  Expected: PASS (≥1 indicator).

- [ ] **Step 5 — Bump version + commit.** `gantt/src/version.ts` `FRONTEND_VERSION` +1.

```bash
git add gantt/src/components/scenario-gantt/scenario-roster-pane.tsx \
        e2e/tests/gantt/scenario/scenario-roster-violation-bell.spec.ts gantt/src/version.ts
git commit -m "fix(gantt): scenario roster per-row violation bell (Issue 1, interim)"
```

### Task 0.2: Scenario zoom uses shared ZoomControl (Issue 2)

**Files:**
- Modify: `gantt/src/components/common/zoom-control.tsx` (accept optional bounds/handlers, default to live store)
- Modify: `gantt/src/components/scenario-gantt/scenario-gantt-toolbar.tsx` (replace inline buttons)
- Test: `e2e/tests/gantt/scenario/scenario-zoom.spec.ts`

- [ ] **Step 1 — Playwright regression test (RED).** Load scenario gantt; read initial canvas
  geometry via `__ganttTest` (pxPerHour or a measured task width); click `sg-zoom-in`; assert the
  geometry increased; click `sg-zoom-out` twice; assert it decreased. Expected: this passes already
  IF zoom works — so first assert the *shared* control is present (`data-testid="zoom-in"`), which is
  RED until Task 0.2 step 3. (Keeps the test meaningful: it proves the shared control is wired.)

- [ ] **Step 2 — Run, verify FAIL** (no `zoom-in` testid in scenario yet).
  Run: `npx playwright test e2e/tests/gantt/scenario/scenario-zoom.spec.ts --reporter=list`

- [ ] **Step 3 — Make `ZoomControl` reusable + wire it in Scenario.** Add optional props to
  `ZoomControl` (`pxPerHour?`, `zoomMin?`, `zoomMax?`, `onZoomIn?`, `onZoomOut?`); when omitted it
  falls back to the live `useGanttViewStore` (current behavior — Live untouched). In
  `scenario-gantt-toolbar.tsx`, replace the inline zoom `<button>`s (lines 94–134) with
  `<ZoomControl pxPerHour={pxPerHour} zoomMin={zoomMin} zoomMax={zoomMax} onZoomIn={onZoomIn} onZoomOut={onZoomOut} />`.
  Keep the existing `onZoomIn/onZoomOut` wiring in `scenario-gantt-view.tsx` (already correct).

- [ ] **Step 4 — Run, verify PASS.**
  Run: `npx playwright test e2e/tests/gantt/scenario/scenario-zoom.spec.ts --reporter=list`

- [ ] **Step 5 — UI gate + version + commit.**
  Run: `npm run check:ui` (expect PASS / 0 hard).

```bash
git add gantt/src/components/common/zoom-control.tsx \
        gantt/src/components/scenario-gantt/scenario-gantt-toolbar.tsx \
        e2e/tests/gantt/scenario/scenario-zoom.spec.ts gantt/src/version.ts
git commit -m "fix(gantt): scenario reuses shared ZoomControl (Issue 2, interim)"
```

---

## Phase R1 — RosterPaneSource abstraction (additive)

**File structure:**
- Modify: `gantt/src/components/gantt/source/gantt-pane-source.ts` — add `RosterPaneSource`,
  `roster?` member, and `useZoomBounds(): {min,max}` on `GanttPaneSource`.
- Modify: `gantt/src/components/gantt/source/live-gantt-source.ts` — `makeLiveRosterPaneSource()`,
  wire `roster` + `useZoomBounds` (7/50 from `gantt-view-store`).
- Modify: `gantt/src/components/gantt/source/scenario-gantt-source.ts` —
  `makeScenarioRosterPaneSource(scenarioId)`, wire `roster` + `useZoomBounds` (2/200 from
  `scenario-gantt-store`).
- Test: `gantt/src/components/gantt/source/__tests__/roster-pane-source.test.ts`

### Task R1.1: Define the interface

- [ ] **Step 1** — Add `RosterPaneSource` (see spec §3.1 for the full interface) and
  `roster?: RosterPaneSource` to `GanttPaneSource`; add `useZoomBounds: () => { min: number; max: number }`.
  Port the `RosterItem` / `RosterRenderBuckets` types from the roster renderer
  (`components/gantt/renderers/roster-renderer.ts`) — reference them, don't redefine.
- [ ] **Step 2** — `npx tsc -p gantt --noEmit` → expect PASS (interface only; optional member).
- [ ] **Step 3** — Commit `chore(gantt): RosterPaneSource interface (Phase R1, additive)`.

### Task R1.2: Live roster source adapter

- [ ] **Step 1 — Unit test (RED).** In `roster-pane-source.test.ts`, mock the live stores and assert
  `makeLiveRosterPaneSource()` returns a source whose `usePanelRows()` sets `maxViolationSeverity`
  for a crew with a seeded violation, and `capabilities.canReassign === true`.
- [ ] **Step 2 — Run, FAIL.** `npx vitest run gantt/src/components/gantt/source/__tests__/roster-pane-source.test.ts`
- [ ] **Step 3 — Implement** `makeLiveRosterPaneSource()` by lifting the data pipeline from
  `components/panes/roster-pane.tsx` (crew/items/itemsByCrew/renderBuckets, the two-source
  `violationMap`, `usePanelRows` with date-effective history + crew stats + per-row `maxViolationSeverity`,
  lock map, session tags, selection, hit-test, drag, status line). Wire into `useLiveGanttSource()`
  return (`roster`, `useZoomBounds`). Keep memo deps incl. `crossPaneDrag`.
- [ ] **Step 4 — Run, PASS.**
- [ ] **Step 5 — Commit** `feat(gantt): live roster source adapter (Phase R1a)`.

### Task R1.3: Scenario roster source adapter

- [ ] **Step 1 — Unit test (RED).** Mock scenario store; assert `makeScenarioRosterPaneSource(id)`
  `usePanelRows()` sets `maxViolationSeverity` from the scenario violation store; `useLockMap`/
  `useSessionTags` are **undefined**; `capabilities` from `data.capabilities` and `canReassign`
  false when not lock owner.
- [ ] **Step 2 — Run, FAIL.**
- [ ] **Step 3 — Implement** `makeScenarioRosterPaneSource(scenarioId)` by lifting from
  `scenario-roster-pane.tsx` (build items via `build-scenario-roster-items`, single-source
  violationMap, `usePanelRows` from `crewStats`, selection, hit-test, drag, pre-check effect).
  Omit lock/session/crew-history optional members. Wire into `useScenarioGanttSource` + `useZoomBounds`.
- [ ] **Step 4 — Run, PASS.**
- [ ] **Step 5 — Commit** `feat(gantt): scenario roster source adapter (Phase R1b)`.

---

## Phase R2 — SharedRosterPane; switch Scenario first

**Files:**
- Create: `gantt/src/components/panes/shared/roster-pane.tsx` (SharedRosterPane)
- Modify: `gantt/src/components/scenario-gantt/scenario-roster-pane.tsx` → thin wrapper
- Test: existing `e2e/tests/gantt/scenario/*` roster specs + the Phase-0 specs (must still PASS)

### Task R2.1: Build SharedRosterPane

- [ ] **Step 1** — Create `shared/roster-pane.tsx` mirroring `shared/flight-pane.tsx` structure:
  `useGanttSource()`, call `source.roster!.*` unconditionally, render `PaneHeaderCanvas`
  (`usePanelRows()`) + `PaneCanvas` (`useRows()` + `useViolationMap()` + optional overlays),
  interaction handler from `getHitTest()`. Props: `paneId`, `contextId`, `leftPanelWidth`,
  `toolbar`, `splitter`, `onClose?`, `canvasTestId?`. Guard optional members
  (`source.roster.useLockMap?.()` etc.) with stable wrapper hooks.
- [ ] **Step 2** — `npx tsc -p gantt --noEmit` PASS.
- [ ] **Step 3** — Commit `feat(gantt): SharedRosterPane (Phase R2, not yet wired)`.

### Task R2.2: Switch Scenario wrapper

- [ ] **Step 1** — Replace `scenario-roster-pane.tsx` body with a thin wrapper:
  `useScenarioGanttSource(scenarioId)` → `<GanttSourceProvider value={source}><SharedRosterPane
  contextId={scenarioId} toolbar={...ScenarioPaneToolbar} splitter={...ScenarioPanelSplitter}
  canvasTestId="scenario-roster-canvas" /></GanttSourceProvider>`. Delete the old monolith body.
- [ ] **Step 2 — Run the Phase-0 + scenario roster e2e.**
  Run: `npx playwright test e2e/tests/gantt/scenario/scenario-roster-violation-bell.spec.ts e2e/tests/gantt/scenario/scenario-zoom.spec.ts --reporter=list`
  Expected: PASS (bells + zoom still work through the shared pane). Verify on scenario 6 & 460.
- [ ] **Step 3 — Bump version + commit** `feat(gantt): scenario roster onto SharedRosterPane (Phase R2b); delete fork`.

---

## Phase R3 — Switch Live onto SharedRosterPane

**Files:**
- Modify: `gantt/src/components/panes/roster-pane.tsx` → thin wrapper
- Test: Live roster e2e (`e2e/tests/gantt/roster/*`)

### Task R3.1: Switch Live wrapper

- [ ] **Step 1** — Replace `panes/roster-pane.tsx` body with a thin wrapper:
  `useLiveGanttSource()` → `<GanttSourceProvider value={source}><SharedRosterPane contextId="live"
  toolbar={...PaneToolbar+PaneLoadingBar} splitter={...VerticalSplitter} /></GanttSourceProvider>`.
  Delete the old monolith body.
- [ ] **Step 2 — Run Live roster regression** (drag/assign/remove, locks, session tags, violations).
  Run: `npx playwright test e2e/tests/gantt/roster --reporter=list`
  Expected: PASS. Fix any regressions in the source adapter (not by weakening tests — §No-Illusion).
- [ ] **Step 3 — Bump version + commit** `feat(gantt): live roster onto SharedRosterPane (Phase R3); delete fork`.

---

## Phase R4 — Toolbar: shared controls + unified per-pane toolbar

**Files:**
- Create: `gantt/src/components/shell/gantt-toolbar-controls.tsx` (ZoomControl + TimezoneSwitcher +
  pane toggles + AlertCenter, `contextId`-parameterized)
- Modify: `gantt/src/components/shell/gantt-sub-toolbar.tsx` (use it)
- Modify: `gantt/src/components/scenario-gantt/scenario-gantt-toolbar.tsx` (use it; drop inline zoom — already shared in Phase 0)
- Create: `gantt/src/components/panes/shared/pane-toolbar.tsx` (unified per-pane toolbar) and switch
  Live `pane-toolbar.tsx` + Scenario `scenario-pane-toolbar.tsx` to it
- Test: `e2e/tests/gantt/scenario/scenario-zoom.spec.ts` + a Live toolbar smoke test; `npm run check:ui`

### Task R4.1: Shared global toolbar controls

- [ ] **Step 1** — Extract `GanttToolbarControls` taking `contextId` and the bits each context
  supplies (zoom bounds/handlers via the source where mounted, timezone, pane toggles, alert center).
  Replace the equivalent inline blocks in both global toolbars.
- [ ] **Step 2 — Run** `npx playwright test e2e/tests/gantt/scenario/scenario-zoom.spec.ts --reporter=list` + Live toolbar smoke. PASS.
- [ ] **Step 3 — `npm run check:ui`** PASS. Commit `refactor(gantt): shared GanttToolbarControls (Phase R4a)`.

### Task R4.2: Unified per-pane toolbar

- [ ] **Step 1** — Create `shared/pane-toolbar.tsx` (count badges + time-axis, `contextId`-driven);
  switch both panes' per-pane toolbars to it; delete the two forks.
- [ ] **Step 2 — Run** scenario + live pane e2e. PASS.
- [ ] **Step 3 — `npm run check:ui`** PASS. Bump version. Commit `refactor(gantt): unified per-pane toolbar (Phase R4b)`.

---

## Final verification

- [ ] Full gantt e2e roster + scenario + toolbar suites PASS (paste receipts).
- [ ] `npm run check:ui` PASS (0 hard).
- [ ] `npx tsc -p gantt --noEmit` clean.
- [ ] Re-measure code sharing per memory [[live-scenario-sharing-tracker]];
  append to `docs/architecture/live-scenario-code-sharing-tracker.md`.
- [ ] Update memory [[unify-live-scenario-gantt]] with roster+toolbar done.
