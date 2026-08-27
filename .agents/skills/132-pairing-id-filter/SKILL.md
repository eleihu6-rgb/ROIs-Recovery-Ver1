---
name: 132-pairing-id-filter
description: Add or maintain the gantt Filter dialog › Pairing tab › "Pairing ID" multi-value search — a client-side HARD filter on the numeric pairing.id, unified across Live (legacy pairing-pane) and Scenario (SharedPairingPane / pairingMatchesSharedFilter). Use when touching pairing-id filtering, adding a multi-value chip facet to the Pairing tab, or when a pairing filter must behave identically in Live + Scenario. Triggers on "pairing id search", "filter by pairing id", "find pairings by id", "multiple pairing ids".
---

# Pairing ID filter (multi-value, hard, unified Live + Scenario)

Shipped gantt feature. Always load **115-gantt-playbook** first; canonical reference is
`docs/modules/gantt/live-scenario-gantt-playbook.md` §9. Bump `FRONTEND_VERSION` on change.

## What it does
Filter dialog › Pairing tab › **"Pairing ID"** (`filter-pairing-id`, a `TextChipField`, split on
comma/period/space) narrows the pairing pane to the pairings whose **numeric `pairing.id`** is in
`PairingFilter.pairingIds`. It is a **HARD filter in BOTH views** (shows only matches — never floats),
which is the clean unified behaviour. Distinct from the **Label** field (which matches `pairingLabel`).

## The one rule that makes it unified
The predicate lives **once** in `filter-store.ts`:
```ts
export const matchesPairingIdFilter = (pairingId: number, pairingIds: string[]): boolean =>
  pairingIds.length === 0 || pairingIds.includes(String(pairingId))
```
Both render paths call it (Live pairing is still the legacy fork, 5B-2 pending — so two panes, one predicate):
- **Live**: `components/panes/pairing-pane.tsx` → `idFilteredItems` memo, applied to `pairingItems`
  **before** the coverage/label float tiers (so count badge + floats + panel rows all see only the matches).
- **Scenario**: `scenario-gantt-source.ts` → `pairingMatchesSharedFilter` (id check first) +
  `hasActivePairingFilter` (adds `f.pairingIds.length > 0`).

## Why client-side is complete (no server param)
All pairings are already loaded in both contexts — Live `fetchPairings` uses `ALL_DATA_PAGE_SIZE = 0`
(= load all); Scenario builds rows from `ScenarioGanttData`. So filtering on `pairing.id` in the pane is
exhaustive. Do **not** add a server `id` param.

## Wiring checklist (what a new such facet touches)
1. `filter-store.ts`: add field to `PairingFilter` + `DEFAULT_PAIRING_FILTER`; add `pairingIdsEqual`;
   include it in the `setPairingFilter` no-change guard and `activeFilterCount`; add the shared matcher.
2. `filter-dialog.tsx`: a `FilterRow` + `TextChipField` (`filter-pairing-id`); add to `pairingCount`,
   `summaryChips` (`p-id` chip), and `handleReset`.
3. `apply-filters.ts`: track as `pairingIdsChanged` (overlay-style, like label/coverage) and add to the
   early-return guard — so it re-runs `markApplied` **without** forcing the ~46 MB pairing reload
   (it's client-side; `pairingFiltersEqual` deliberately does NOT include it, so `pairingChanged` stays false).
4. Condition-strip chip in BOTH panes: add `{ dim: 'pairingIds', label: 'Pairing ID' }` to the
   `buildGlobalFilterChips` dims (generic remove handler already covers any `string[]` dim). Note the legacy
   pane chips read `appliedFilters.pairing` (post-markApplied); the shared pane reads the live filter.
5. Don't add to `hasPairingFilterValues` — that gates server-side count semantics (`unfilteredTotal`), which
   a client-only filter must not corrupt.

## Testing (E2E, real UI)
`e2e/tests/gantt/pairing-id-filter.spec.ts` — Live-1180/1289 + Scen-2440/2441. Patterns:
- Assert the **rendered** (filtered) row count via `paneRenderStat(page, 'pairing').totalRows` — NOT the
  `pairings`/`counts` store hooks (those read the full store, blind to a client-side filter).
- Exact-id order via `readHook('pairingPanelOrder')`. The legacy Live pane publishes it; **SharedPairingPane
  now also calls `publishPairingOrder('pairing', …)`** so the hook works for Scenario too.
- Drive the **real** dialog (`openFilter` / pane `pane-filter-button`), type ids into `filter-pairing-id`
  (`fill(String(id))` + Enter per id — store ids are numbers), then `applyFilterLight` (NOT `applyFilter`:
  its `waitGanttReady` requires panes to show objects, so the "unknown id → 0 rows" case would hang).
- 0-rows-on-unknown-id is the key proof it's a hard filter, not a float.

## Gotchas
- Store `pairings()` hook returns numeric `id`; convert with `String()` before typing/comparing.
- The pairing pane "Pairing ID" **column** displays `pairingLabel ?? P<id>`, but the filter matches the real
  numeric `pairing.id`. They differ; that's intentional (Label field covers the label).
- Known pre-existing-red neighbours (NOT your regression): `pairing-coverage-filter`,
  `pairing-filter-chips` Live-1121, `pairing-division-filter` Live-1120 fail because they assume an
  all-states coverage default; the live default is `['open','partial']` (playbook §13a). Verify via stash.
