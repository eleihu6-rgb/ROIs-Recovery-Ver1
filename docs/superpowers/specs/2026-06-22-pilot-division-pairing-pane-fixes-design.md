# Pilot-Division Pairing Pane Fixes — Design

> **Goal:** A division-scoped scenario (e.g. `#540 YVR-FC-Ver1`, FC = flight crew / pilots)
> must show ONLY its own division's pairings, the pairing pane must default to the
> Open+Partial coverage filter (showing pairings still needing crew), and each pairing row
> must surface its **Base** between the pairing label and the type. All shared changes land
> once in the unified Live/Scenario code path (§Gantt-Unify).
>
> Date: 2026-06-22 · Status: approved design · Reference: `docs/modules/gantt/live-scenario-gantt-playbook.md`

## Background

Scenario `#540` is a flight-crew (pilot, `division='P'`) scenario. Its roster pane correctly
shows only pilot crew, but its **pairing pane shows cabin pairings** (e.g. `V4519` with
composition `IFD(1:0)FA(3:0)` — In-Flight Director + Flight Attendant, both cabin ranks).

Root cause — the scenario crew query is division-scoped but the pairing query is not, in BOTH
backend paths:

- **Solver export** (`live-server/src/services/scenario/scenario-export-service.ts`):
  `crewIdSet()` applies `AND division = ${division}` (line ~56); `pairingIdSet()` (lines ~79–97)
  filters only by base / fleet / time-window — **no division filter**. So a pilot scenario's
  `ro_input.gz` (the solver input) contains cabin pairings.
- **Display path** (`live-server/src/services/scenario/scenario-gantt-db-service.ts`, reached via
  `GET /api/scenario/:id/gantt-data` when `SCENARIO_GANTT_SOURCE=db` → `buildGanttDataFromDb`):
  reads pairings from the scenario partition with no division predicate, so cabin pairings render.

Two additional pairing-pane requests, both landing in the shared layer:

1. The pairing pane should **default** to the Open+Partial coverage filter.
2. Each pairing row should show its **Base** column.

A pre-existing §Gantt-Unify divergence surfaced while scoping (2): the coverage filter is
implemented differently per view — **Live floats** matching pairings to the top
(`live-gantt-source.ts:213–231`) while **Scenario hard-filters** (hides non-matching, via
`pairingMatchesSharedFilter`). For a shared default to behave identically, the semantics must be
unified.

## Decisions (locked with user)

1. **Division fix — backend, both paths.** Filter pairings by the scenario's division in the
   solver export AND the display query. Most correct: fixes `#540`'s display immediately (the
   display query runs live against the partition) and stops cabin pairings reaching the solver on
   future runs.
2. **Open+Partial default — both Live and Scenario.** One shared default in the filter store.
3. **Coverage semantics — hard filter / hide, unified.** Open+Partial HIDES full & over-covered
   pairings in both views (matches the `#540` screenshot). Live is changed to match Scenario's
   existing hard-filter behavior.
4. **Base column — shared.** Added to the shared pairing column set so both views get it.

## Changes

### Change 1 — Division scoping for pairings (backend, all three sites)

There are **three** backend sites that source scenario pairings, and a scenario can be served by
either display builder depending on `SCENARIO_GANTT_SOURCE` (`db` default, `gz` escape hatch) and
whether the partition roster is loaded. All three must scope by division. The `pairing.division`
column is indexed (`idx_pairing_division`); every display builder already emits
`ScenarioGanttPairing.division`, and crew is already division-scoped, so the display fix derives the
scope from the loaded crew (no `filterParams` threading, path-independent, immediate on `#540`).

1. **Solver export** — `scenario-export-service.ts › pairingIdSet(s)`: add, when a division is
   resolved from `filterParams.crew.division` (the same value `crewIdSet()` uses):
   `AND division = ${division}`. Scopes the `ro_input.gz` solver input. Applies to future runs; no
   re-export of `#540` is in scope. Unchanged when the scenario has no division.

2. **gz / snapshot display builder** — `scenario-gantt-service.ts › parseCrewAndPairings()`
   (used by both `buildGanttDataSnapshot` and `buildGanttDataLiveRefresh`): after building `crew`
   and `pairings`, keep only pairings whose `division` is present among the loaded crew —
   `const crewDivs = new Set(crew.map(c => c.division).filter(Boolean)); pairings = crewDivs.size === 0 ? pairings : pairings.filter(p => crewDivs.has(p.division))`.
   This re-parses the existing gz each request, so `#540` corrects with no re-export.

3. **db display builder** — `scenario-gantt-db-service.ts › buildGanttDataFromDb()`: apply the same
   crew-division filter to the returned pairings (after `crew` and `updatedPairings` are built),
   keeping the two display paths byte-identical.

Filtering by *divisions present in the crew* (not a hard-coded value) is self-consistent: a
single-division scenario keeps only its division; a genuinely mixed scenario keeps all present
divisions; an empty-crew scenario keeps all (safe fallback). No frontend change is required — the
gantt-data payload simply stops carrying foreign-division pairings.

### Change 2 — Default coverage = Open+Partial, hard-filter, unified

- **`gantt/src/stores/filter-store.ts › DEFAULT_PAIRING_FILTER.coverage`** → `['open','partial']`
  (was `[...ALL_COVERAGE]`). The store is a per-context registry factory with one shared default,
  so both `'live'` and every scenario instance pick it up. The condition strip already renders an
  `Open, Partial` chip when coverage is narrowed, and `clearAllFilters` / chip-remove already reset
  to `['open','partial']`.
- **Unify coverage to a hard filter.** Extract the coverage match into one shared predicate
  (e.g. `pairingMatchesCoverage(pairing, coverage)` built on the existing
  `pairingCoverageNarrowed` + `classifyCoverage`). Consume it in both sources:
  - **Scenario** already hard-filters via `pairingMatchesSharedFilter` — refactor it to call the
    shared predicate (no behavior change).
  - **Live** (`live-gantt-source.ts › useRows`) — replace the coverage **float** tier with a
    coverage **filter**: when coverage is narrowed, drop pairings whose `classifyCoverage` is not
    in the selection, while always preserving explicitly **frozen** rows and **label-found** rows
    (those overlays stay visible regardless of coverage). The label-search float tier and
    frozen-first reorder are otherwise unchanged.

> Note: this changes Live's default pairing view to hide fully-covered pairings. Accepted per
> decision 3 (the planning intent is "show pairings still needing crew").

### Change 3 — Base column (shared)

- **`gantt/src/stores/column-store.ts › DEFAULT_PAIRING_COLUMNS`** — insert between `pairingId`
  and `type`: `{ key:'base', label:'Base', width:36, visible:true, order:2, row:1 }`; renumber the
  trailing `order` values. Shared by `'pairing'` and `'scenario-pairing'`, so both views show it.
- **`gantt/src/components/panes/shared/pairing-pane.tsx › buildPairingPanelRowData`** — add
  `base: p.base` to `values`. `PaneHeaderCanvas` already renders any visible column by reading
  `values[column.key]`.

## Testing strategy (§Playwright-Required, §No-Illusion, §Stale-Test)

Drive the real UI (§Simulate-User): login → `/fpqe/gantt/` → search → open scenario `#540`.

- **Scenario division (Playwright, Scen-2xxx)** — open `#540`; assert the pairing pane contains
  **no** cabin pairing: `V4519` absent, and no row's composition line contains `IFD` or `FA`;
  assert pilot pairings present (`CA`/`FO` compositions). Use `toHaveCount`/`toContainText`, not
  bare `toBeVisible`.
- **Solver export (Vitest, live-server)** — unit-test `pairingIdSet`: the generated SQL includes
  the division predicate when `filterParams.crew.division` is set, and omits it when none is set.
- **Display filter (Vitest, live-server)** — unit-test the shared crew-division pairing filter
  helper: pilot crew + mixed pairings → only pilot pairings returned; empty crew → all returned.
- **Default coverage (Playwright)** — on open, the pairing condition strip shows the `Open, Partial`
  chip and full/over pairings are hidden (count matches open+partial only). Assert for **both** a
  scenario and the Live pairing pane (Live regression).
- **Base column (Playwright)** — the pairing pane left panel shows a `Base` column header and a row
  value (e.g. `YVR`) at the position between Pairing and Tp.

Each spec pastes its PASS summary into the completion message (§No-Illusion). Update any stale
pairing-pane specs to the current columns/coverage behavior (§Stale-Test).

## Conventions

- Touches frontend (gantt) + backend (live-server) → bump both in `gantt/src/version.ts`:
  `FRONTEND_VERSION` 296→297, `BACKEND_VERSION` 153→154.
- Run `npm run check:ui` — hard violations must be 0 (Base adds a token-driven label only).
- §First-Paint preserved: changes are filter/column/query scoping, not new blocking loads.
- UI strings English (`Base`, `Open`, `Partial`).

## Out of scope

- The label-filter-vs-float divergence (Live floats label matches, Scenario hard-filters them) —
  left as-is (§Surgical); only coverage semantics are unified here.
- Re-exporting `#540`'s existing `ro_input.gz`; the export fix applies to future solver runs.
- Any pairing-pane performance re-architecture.

## Risks & mitigations

- **Hiding full pairings surprises Live planners.** Accepted (decision 3); the coverage chip is
  visible and one click clears it. Covered by the Live default-coverage spec.
- **Division source missing on older scenarios** (`filterParams` without `crew.division`). The
  export predicate is only added when a division resolves; the display filter derives scope from
  the loaded crew, so un-scoped/empty-crew scenarios are unchanged.
- **Two display paths drift.** The same crew-division filter helper is applied in both
  `parseCrewAndPairings` and `buildGanttDataFromDb`; covered by the Scen-2xxx spec asserting the
  cabin pairing is gone on `#540` whichever path the env uses.
