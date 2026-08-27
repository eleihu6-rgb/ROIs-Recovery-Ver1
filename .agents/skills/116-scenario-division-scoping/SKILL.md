---
name: 116-scenario-division-scoping
description: Use when a Scenario Gantt shows data from the wrong crew division (e.g. a pilot/FC scenario leaking cabin IFD/FA pairings), or when scoping scenario pairings/crew by division. Maps the THREE backend pairing-sourcing sites and the shared pairing-pane layer.
---

# Scenario division scoping (pilot vs cabin) — debug & fix recipe

A scenario belongs to one division (`P`=pilot/flight-crew, `C`=cabin, `A`=ATC). Crew is
division-scoped, but **pairings historically were not** — so a pilot scenario could leak cabin
pairings (composition ranks `IFD`/`FA`). Scoping must be applied at **three** backend sites,
because a scenario can be served by different paths (`SCENARIO_GANTT_SOURCE` = `db` default | `gz`).

## The three pairing-sourcing sites (live-server/src/services/scenario/)

1. **Solver export** — `scenario-export-service.ts › pairingIdSet()`. Builds `ro_input.gz` (the
   solver input). Filter by `filterParams.pairing.division ?? filterParams.crew.division`
   (same value `crewIdSet()` uses). Affects FUTURE solver runs only; existing gz isn't re-written.
2. **gz/snapshot display** — `scenario-gantt-service.ts › parseCrewAndPairings()` (used by both
   `buildGanttDataSnapshot` and `buildGanttDataLiveRefresh`).
3. **db display** — `scenario-gantt-db-service.ts › buildGanttDataFromDb()` (apply after
   `recomputeCompositionFill`, on the final pairings array, so composition fill is computed first).

For the two DISPLAY builders, scope by the divisions **present among the loaded crew** (which is
already division-scoped) via the shared helper
`live-server/src/services/scenario/pairing-division-filter.ts › filterPairingsByCrewDivision(crew, pairings)`.
No `filterParams` threading needed; path-independent; corrects existing scenarios immediately
(builders read live each request). Empty/no-division crew → returns all (safe fallback).

## Verify (§No-Illusion)
Hit the REAL backend, not a mock: a Playwright test that loads `#540`'s gantt-data and asserts no
pairing has a `C`/cabin division or `IFD`/`FA` composition rank, AND that pilot pairings are present
(non-empty, so it proves filtering not an empty pane). Make warm-up + non-empty HARD assertions —
never a soft skip that can vacuously pass. See `e2e/tests/gantt/scenario-540-pilot-division-pairings.spec.ts`.

## Shared pairing-pane layer (gantt, §Gantt-Unify — lands once for Live + Scenario)
- Columns: `gantt/src/stores/column-store.ts › DEFAULT_PAIRING_COLUMNS` (cloned by both `'pairing'`
  and `'scenario-pairing'`). Row values in `panes/shared/pairing-pane.tsx › buildPairingPanelRowData`.
- Coverage filter is a HARD filter (hide full/over) via one shared predicate
  `gantt/src/utils/pairing-coverage.ts › coverageMatches`, consumed by BOTH `live-gantt-source.ts`
  and `scenario-gantt-source.ts`. Default `DEFAULT_PAIRING_FILTER.coverage = ['open','partial']`.
  (Live previously *floated* coverage; Scenario *hard-filtered* — they're now unified.)

For full gantt architecture, see the **gantt playbook** (skill 115 →
`docs/modules/gantt/live-scenario-gantt-playbook.md`). Spec/plan:
`docs/superpowers/{specs,plans}/2026-06-22-pilot-division-pairing-pane-fixes*`.

## ⚠ Shared-repo hazard
This working tree may be shared by a concurrent session that commits to the same branch/`main`.
Always `git add <explicit files>` (never `-A`/`.`); verify each commit's file list; treat foreign
commits as not-yours (don't rewrite). `version.ts` is a single forward-only counter both sessions bump.
