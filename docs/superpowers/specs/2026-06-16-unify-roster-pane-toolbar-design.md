# Unify Live + Scenario Roster Pane & Toolbar — Design

> Date: 2026-06-16
> Status: Approved (design) — implementation pending
> Owner: gantt
> Related: [[unify-live-scenario-gantt]] memory; prior specs `2026-06-15-unify-live-scenario-gantt-design.md`

## 1. Problem

Live and Scenario gantts are supposed to be mirrors ("mirror scen from live"). Two visible
divergences were reported:

1. **No per-row violation bells in Scenario.** The Scenario roster gutter (left panel, next to
   MDO) shows no per-crew alert icon even though the bell counts 351 violations. Root cause:
   `scenario-roster-pane.tsx` builds `panelRows` (lines 267–293) without ever setting
   `maxViolationSeverity`; `pane-header-canvas.tsx` draws the gutter bell purely from
   `row.maxViolationSeverity`. Live's `roster-pane.tsx:311–355` computes and sets it. The Scenario
   `violationMap` exists but is only used for canvas task-puck badges, never aggregated per crew row.
2. **Zoom +/- behaves differently in Scenario.** The Scenario toolbar re-implements the zoom
   buttons inline instead of importing the shared `ZoomControl`, and uses different bounds
   (`zoomMin/zoomMax = 2/200` vs Live `7/50`). No keyboard zoom shortcuts exist in either view
   (both zoom via button + Ctrl-scroll only).

Both are symptoms of the same structural cause: the **roster pane** and the **toolbar** are still
forked, while Flight (Phase 5A) and Pairing (Phase 5B) were already collapsed onto shared
components via the `gantt-source` abstraction.

## 2. Goal

Finish the Phase-5 unification for roster + toolbar: one `SharedRosterPane` and shared toolbar
controls, both driven by the `gantt-source` abstraction, so Scenario inherits Live behavior by
construction. The two reported bugs are fixed — first surgically (Phase 0, immediate), then
structurally (the shared pane makes them unrepresentable).

Non-goals: redesigning roster visuals; changing Live behavior; adding new roster features.

## 3. Architecture — apply the existing blueprint to roster

The pattern is identical to Flight/Pairing (see `components/gantt/source/`):

- **`GanttPaneSource`** (`gantt-pane-source.ts`) is the single seam. Shared components read
  everything through it and import no live/scenario stores (enforced by the existing
  `no-store-imports.guard.test.ts`).
- **`GanttSourceProvider` + `useGanttSource()`** (`gantt-source-context.tsx`) deliver the source;
  each context's *wrapper* mounts the provider.

### 3.1 `RosterPaneSource` interface (new, additive)

Add to `gantt-pane-source.ts`, mirroring `FlightPaneSource`/`PairingPaneSource`. Shape (final
signatures fixed during R1):

```ts
export interface RosterPaneSource {
  // Canvas data (per-context builder; deterministic ids)
  useRows: () => {
    crewIds: string[]                       // ordered: frozen → found → rest
    items: RosterItem[]
    itemsByCrew: Map<string, RosterItem[]>
    renderBuckets: RosterRenderBuckets
    frozenRowCount: number
  }
  // Left-panel rows — built per context, INCLUDING maxViolationSeverity (fixes Issue 1 for both)
  usePanelRows: () => PanelRowData[]
  // Per-task severity for canvas badges
  useViolationMap: () => Map<number, number>

  // Selection (crew + task)
  useSelectedCrewIds: () => Set<string>
  useSelectedTaskIds: () => Set<number>
  selectCrew: (crewId: string, mode: 'single' | 'toggle' | 'range') => void
  selectTasks: (taskIds: Set<number>) => void

  // Geometry / hit-test (imperative at event time)
  getHitTest: () => HitTestFn

  // Status line
  formatStatusLine?: (taskId: number) => string

  // Capabilities
  capabilities: { canAssign: boolean; canRemove: boolean; canReassign: boolean }

  // Optional Live-only overlays — Scenario omits → shared component skips
  useLockMap?: () => Map<number, 'mine' | 'other'>
  useSessionTags?: () => Map<string, number[]>
  useFrozenCrewIds?: () => string[]
  unfreezeCrew?: (crewId: string) => void

  // Optional Live-only interactions
  startReassignDrag?: (taskId: number, crewId: string, clientX: number, clientY: number) => void
  openContextMenu?: (taskId: number, clientX: number, clientY: number) => void
  openTaskDetail?: (taskId: number) => void
}
```

Add `roster?: RosterPaneSource` to `GanttPaneSource`. Mount invariant: `SharedRosterPane` is only
mounted where `source.roster` is defined (same invariant as flight/pairing).

Zoom bounds: extend the source viewport surface so the **shared `ZoomControl` reads bounds from the
source** (`useZoomBounds(): { min: number; max: number }`) instead of hardcoding
`useGanttViewStore`. Live supplies 7/50; Scenario supplies 2/200 (its wider range is intentional —
scenarios span arbitrary date ranges). Sharing the control, keeping per-context bounds.

### 3.2 Source implementations

- **`makeLiveRosterPaneSource()`** in `live-gantt-source.ts`: adapts existing roster-pane.tsx
  pipeline — `roster-store`, `crew-store` (crewStatsMap, sessions, date-effective ranks/bases/fleets
  via `getAllEffective`), `rule-check-store` + `session-violation-store` (two-source violation merge),
  `lock-store`, `pane-store` (sort/frozen/found/selected). Provides all optional members. Memo deps
  include `crossPaneDrag`.
- **`makeScenarioRosterPaneSource(scenarioId)`** in `scenario-gantt-source.ts`: adapts
  `scenario-gantt-store`, `build-scenario-roster-items`, `scenario-violation-store` (single source
  via existing `useScenarioViolationSource`), `filter-store(scenarioId)`, `pane-store(scenarioId)`,
  `scenario-layout-store(scenarioId)`. **Omits** lock/session-tag/crew-stats/date-effective members.
  `usePanelRows()` aggregates per-crew `maxViolationSeverity` from the violation map (fixes Issue 1).
  `capabilities` from `data?.capabilities`; `canReassign` additionally gated by lock ownership.

### 3.3 `SharedRosterPane`

`components/panes/shared/roster-pane.tsx`, mirroring `shared/flight-pane.tsx` and
`shared/pairing-pane.tsx`:

- `useGanttSource()` → calls `source.roster!.*` unconditionally (stable hook order).
- Left panel via `PaneHeaderCanvas` fed by `usePanelRows()` (carries `maxViolationSeverity`,
  optional `lockStatus`).
- Canvas via `PaneCanvas` + `renderRosterTasks` fed by `useRows()` + `useViolationMap()` +
  optional `useLockMap`/`useSessionTags`.
- Interaction handler from `getHitTest()` + selection/drag/context-menu callbacks (optional members
  guarded).
- Props: `paneId`, `contextId: 'live' | number`, `leftPanelWidth`, render-props `toolbar(rowCount)`,
  `splitter`, `onClose?`, `canvasTestId?`.

### 3.4 Thin wrappers

- **Live** `panes/roster-pane.tsx`: mount `GanttSourceProvider value={useLiveGanttSource()}`, render
  `SharedRosterPane contextId="live"`, supply `PaneToolbar` + `PaneLoadingBar` + `VerticalSplitter`.
- **Scenario** `scenario-gantt/scenario-roster-pane.tsx`: mount provider with
  `useScenarioGanttSource(scenarioId)`, render `SharedRosterPane contextId={scenarioId}`, supply
  `ScenarioPaneToolbar` + `ScenarioPanelSplitter`.

The two old monolithic fork bodies are deleted once the wrapper renders the shared pane.

## 4. Toolbar (chosen scope: share common controls + unify per-pane toolbar)

- **`GanttToolbarControls`** (new shared sub-component): `ZoomControl` (source-bounds driven) +
  `TimezoneSwitcher` + pane toggles + `AlertCenter`. Used by both `gantt-sub-toolbar.tsx` (Live) and
  `scenario-gantt-toolbar.tsx` (Scenario). Scenario stops re-implementing zoom buttons.
- **Unified per-pane toolbar**: merge `pane-toolbar.tsx` + `scenario-pane-toolbar.tsx` into one
  `contextId`-parameterized component (count badges + time-axis).
- **Context-specific ends unchanged**: Live keeps date-range/refresh/draft/rule-group; Scenario
  keeps scenario/type badges, snapshot badge, lock acquire/release, save.

## 5. Phasing (each phase independently shippable, tested, with a pasted PASS receipt)

- **Phase 0 — immediate parity (interim, ship now).**
  (a) Scenario `panelRows` compute `maxViolationSeverity` (mirror Live). (b) Scenario toolbar reuses
  shared `ZoomControl` (source-bounds). Two Playwright regression tests (bell visible on a violating
  scenario crew; canvas geometry changes on `sg-zoom-in`). Interim code superseded by R2/R4; the
  tests are permanent (they assert behavior, survive the refactor — §Stale-Test).
- **Phase R1 — source abstraction (additive, nothing switched).** Define `RosterPaneSource` +
  `useZoomBounds`; implement Live & Scenario adapters; vitest unit tests (mock stores, capability
  variants); `no-store-imports` guard stays green.
- **Phase R2 — shared pane, switch Scenario first.** Build `SharedRosterPane`; Scenario wrapper
  renders it; delete scenario fork body. Verify on scenario 6 (14 crew) & 460. Smaller blast radius
  (read-only).
- **Phase R3 — switch Live.** Live wrapper renders `SharedRosterPane`; delete Live fork body.
  Full Live roster regression (drag/assign/remove/lock/session-tags/violations).
- **Phase R4 — toolbar.** `GanttToolbarControls` + unified per-pane toolbar; delete duplicated zoom.
  `npm run check:ui` PASS.

## 6. Testing & versioning

- §Playwright-Required + §No-Illusion: every phase ships tests and a pasted PASS/FAIL summary.
- Source adapters: vitest under `components/gantt/source/__tests__/` (mock stores, capability
  variants), mirroring `scenario-gantt-source.test.ts`.
- Panes: Playwright under `e2e/tests/gantt/` — Issue 1 regression (Scen, per-row bell visible),
  Issue 2 regression (Scen, zoom changes canvas), plus Live roster non-regression.
- §UI-Standard-Gate: `npm run check:ui` after toolbar work.
- Bump `FRONTEND_VERSION` in `gantt/src/version.ts` per phase (frontend-only changes).

## 7. Risks

- Roster has the richest divergence (locks, session tags, crew stats, two violation sources,
  date-effective history). Mitigation: optional source members; Scenario-first switch (R2) limits
  blast radius before touching Live (R3).
- Hook-order stability in `SharedRosterPane` (all source hooks called unconditionally; optional
  members invoked via stable wrapper hooks, not conditionally).
- Per-context registry stores must not leak across scenarios (existing pattern; covered by tests).
