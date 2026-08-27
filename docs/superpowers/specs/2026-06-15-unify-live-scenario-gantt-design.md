# Unify Live & Scenario Gantt — Design

> **Goal:** Live and Scenario Gantt run on the *same* code. A feature built once (filter
> criteria, sort, toolbar control, styling) appears in both views with no parallel work.
> End state: the `scenario-gantt/scenario-*` fork is **deleted** and both views render the
> same shared components, differing only by injected context + capabilities.
>
> Date: 2026-06-15 · Branch base: `feat/scenario/db-load-ruletool` · Status: approved design

## Background

The shared **source-abstraction layer** (`gantt/src/components/gantt/source/`:
`gantt-source-context.tsx`, `gantt-pane-source.ts`, `live-gantt-source.ts`,
`scenario-gantt-source.ts`) already lets ONE canvas render both data sources via
`useGanttSource()`. Canvas, renderers, interactions, and time axis are 100% shared.

Everything *above* the canvas is still forked:

| Layer | Live | Scenario |
|---|---|---|
| Toolbar | `shell/gantt-sub-toolbar.tsx` | `scenario-gantt/scenario-gantt-toolbar.tsx` |
| Pane wrappers | `panes/{roster,pairing,flight}-pane.tsx` | `scenario-gantt/scenario-{roster,pairing,flight}-pane.tsx` |
| Pane toolbar | `panes/pane-toolbar.tsx` | `scenario-gantt/scenario-pane-toolbar.tsx` |
| Condition strip | `panes/pane-condition-strip.tsx` | reused, but `onSortClick` not wired |
| Filter dialog | `layout/filter-dialog.tsx` | none (reduced per-pane popovers only) |
| Sort dialog | `panes/sort-dialog.tsx` | none (single-column header click, **lost on tab suspend**) |
| Layout grid | `layout/` | `scenario-gantt/scenario-layout-grid.tsx` + `scenario-panel-splitter.tsx` |
| Stores | singletons | per-scenario registry `getScenario*Store(scenarioId)` |

Baseline sharing = **45.3%** (`docs/architecture/live-scenario-code-sharing-tracker.md`,
2026-06-15).

### Why the fork exists (the real blocker)

**Store identity.** Live stores are **singletons** (one per browser tab). Scenario stores are a
**per-scenario registry** keyed by `scenarioId`, because multiple scenario tabs can be open at
once — each with its own data, edit-lock, and capabilities — and singletons would cross-pollute.
The registry is the reason the pane wrappers "can't be merged as-is."

### Observed drift (the symptoms the user reported)

- **Filter criteria gaps.** Scenario crew filter has only Rank/Base/Division (Live also has
  Fleet, Crew ID). Scenario pairing pane has **no** filter UI (Live has 7 fields). Scenario flight
  filter lacks Flight No. and Status. Scenario adds a Register field Live lacks.
- **Sort missing.** Scenario has single-column header-click sort only, kept in **component-local
  state → lost on tab suspend** (a regression). No multi-key SortDialog, no sort button in the
  condition strip for scenario.
- **Filter UI position/style differ.** Live = global toolbar Filter button → `filter-dialog`
  modal. Scenario = floating per-pane popover. Different placement, different look.
- **Toolbar drift.** Live-only: date range, refresh, rule-group selector, ground-task, keyboard
  shortcuts, selection count. Scenario-only: edit-lock Save / Acquire / Release.
- **Count badges** (filtered/total, matched) absent on scenario pane toolbar.

## Decisions (locked with user)

1. **Scope:** full collapse — end state is forks deleted, one shared codebase.
2. **Delivery:** phased; after **each** phase both Live and Scenario stay working with passing
   Playwright. No big-bang.
3. **Edit/lock depth:** share the UI shell; keep edit/lock + draft behavior **capability-gated**
   (Live keeps crew-locks + undo/redo draft; Scenario keeps scenario-lock + Save). Do **not** merge
   edit/lock/draft semantics in this effort.
4. **Store conversion:** **compatibility shim** — wrap each store in a registry factory but keep
   the existing singleton export aliased to the `'live'` instance, so existing Live imports keep
   working; only the shared wrappers switch to the context resolver.

## Architecture

### 1. Store-context factory

Generalize the scenario registry to key on `contextId = 'live' | number`:

- New `GanttContext` value `{ contextId: 'live' | number }`, provided by
  `<GanttContextProvider>`. Live's `app-layout` mounts `'live'`; each scenario view mounts its
  `scenarioId` (it already wraps per-scenario today).
- Each pane/toolbar/filter/sort store becomes a registry factory `getXStore(contextId)` with
  `'live'` as a permanent key. A `useXStore()` hook reads `contextId` from context and resolves the
  instance.
- **Compatibility shim (decision 4):** keep the current singleton export as
  `export const useFilterStore = makeLiveAlias(getFilterStore('live'))` so untouched Live code
  compiles and behaves identically. Shared wrappers use `useXStore()` (context-resolved).
- Multi-tab isolation is preserved unchanged: Scenario keeps one instance per id; Live has exactly
  one instance under `'live'`.

Stores in scope (filter, sort/pane-interactive, layout, view, rule-check). Reference-store stays a
true singleton (immutable reference data, shared). Draft-store / lock-store are **not** converted
(edit/lock stays mode-specific per decision 3).

### 2. Capability-driven UI (one component, gated sections)

Extend the existing `GanttCapabilities` with feature flags so toolbar/pane differences are data,
not files:

```
capabilities.toolbar = {
  dateRange, refresh, ruleGroup, groundTask, keyboardShortcuts, selectionCount, // Live-on
  editLock, save,                                                               // Scenario-on
}
```

Live registers read-only capabilities + a no-op edit controller through the **same** interface
Scenario already uses, so shared wrappers branch on **capability**, never on `mode`.

### 3. Data-shape unification

- **Filter:** one `CrewFilter` = `{ divisions, bases, ranks, fleets, crewIds? }` (adds the fields
  scenario lacked; `crewIds` overlay optional). Keep existing `PairingFilter` / `FlightFilter`. Add
  optional `register` to `FlightFilter` to preserve scenario's extra field. Scenario gains the full
  Live filter dialog automatically.
- **Sort:** scenario sort moves from component-local state into the unified per-pane sort store
  (`SortCriterion[]`), fixing the tab-suspend regression and giving scenario the multi-key
  SortDialog + sort chips + header-click.
- **Violations / edit / capabilities:** routed through the source interface for both modes (Live =
  read-only). Shared wrappers never special-case Live vs Scenario.

## Component collapse

Promote one shared set (under `components/gantt/` or `panes/` re-exported as shared) consumed by
both views: `roster-pane`, `pairing-pane`, `flight-pane`, `pane-toolbar`, `pane-condition-strip`,
`gantt-toolbar`, `filter-dialog`, `sort-dialog`, `layout-grid`, `panel-splitter`.

**Deleted at the end:** `scenario-gantt/scenario-{roster,pairing,flight}-pane.tsx`,
`scenario-gantt-toolbar.tsx`, `scenario-pane-toolbar.tsx`, `scenario-layout-grid.tsx`,
`scenario-panel-splitter.tsx`, and the divergent `ScenarioCrewFilter` shape.

**Kept (genuinely scenario-only, mounted via capability/source, not a forked pane):**
`scenario-context-menu.tsx`, `scenario-drag-provider.tsx`, `scenario-status-bar.tsx`,
`scenario-edit-controller.ts`, `scenario-violation-source.ts`, `build-scenario-roster-items.ts`,
`scenario-time-axis-menu.tsx`.

## Phases (each phase: both views green + tested before next)

1. **Store-context factory + provider.** Live keyed `'live'` via shim; zero behavior change.
   Verify: full Live + scenario 6/460 suites still green.
2. **Unify filter + sort store shapes.** Add `fleets`/`crewIds`/`register`; persist scenario sort
   in the store. Verify: scenario sort survives tab suspend; Live unaffected.
3. **Collapse filter dialog + sort dialog + condition strip → shared**, context-resolved.
   Verify: scenario filter parity (each new field filters), multi-key sort + chips.
4. **Collapse toolbar** into one capability-gated component. Verify: Live toolbar unchanged;
   scenario shows edit-lock section + gains shared controls where capability allows.
5. **Collapse pane wrappers + layout grid.** Verify: both views render identically from shared
   wrappers; canvas/edit/lock behavior preserved.
6. **Delete `scenario-gantt/*` forks**; re-measure sharing % (`scripts/measure-gantt-sharing.sh`)
   and append a row to the tracker (expect a large jump from 45.3%).

## Testing strategy (CLAUDE.md §Playwright-Required, §No-Illusion)

Harness: extend the existing `e2e/tests/gantt/scenario/scenario-db-source.spec.ts` pattern (login →
`/fpqe/gantt/` → search → select by #id → open). Fixtures:

- **Scenario 6** — live-backed RO, 26 crew, MCred present.
- **Scenario 460** — copy-backed (FAILED-but-loaded), 26 crew, proves the render gate.

Per phase, assert the *current function* (update stale specs per §Stale-Test):

- **Filter parity:** open the shared filter dialog in scenario; apply Rank, Fleet, Crew ID, and a
  pairing/flight field; assert correct rows shown and wrong rows absent (`toHaveCount` /
  `toContainText`, not bare `toBeVisible`).
- **Sort parity:** multi-key SortDialog applies; sort chips render; **sort persists across tab
  suspend/resume** (the regression).
- **Toolbar parity:** scenario shows the shared controls its capabilities allow; Live toolbar
  unchanged (existing specs green).
- **UI position/style:** filter button lives in the shared toolbar position for both; styling via
  tokens — run `npm run check:ui` (hard violations = 0) and the `ui-standard` perf spec.
- **Live regression:** the full existing Live gantt + scenario suites stay green every phase.

New/updated spec files: `e2e/tests/gantt/scenario/scenario-filter-parity.spec.ts`,
`scenario-sort-parity.spec.ts`, `scenario-toolbar-parity.spec.ts` (Scen-20xx ID range per
`docs/test-cases/e2e/README.md`).

Each phase touches a frontend module → bump `FRONTEND_VERSION` in `gantt/src/version.ts`
(CLAUDE.md version rule).

## Out of scope

- Merging edit/lock/draft semantics (decision 3).
- Reworking the source-abstraction layer's viewport contract (already shared, works).
- Backend/data-source changes (`SCENARIO_GANTT_SOURCE=db` stays as-is).
- Pane-wrapper performance re-architecture beyond preserving First-Paint behavior.

## Risks & mitigations

- **Breaking Live (production-critical, First-Paint).** Mitigated by the compatibility shim
  (decision 4) + phasing + full Live suite green every phase.
- **Multi-tab isolation regressions in Scenario.** The registry semantics are preserved; Live just
  becomes one more key. Covered by scenario 6 + 460 + existing memory-suspension specs.
- **Filter/sort shape changes leaking defaults into Live.** New fields are additive/optional;
  Live's applied-filter snapshot semantics unchanged.
