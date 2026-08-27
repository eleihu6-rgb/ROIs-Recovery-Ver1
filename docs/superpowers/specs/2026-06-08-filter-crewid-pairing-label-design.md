# Filter dialog: Crew ID + Pairing Label (bring matches to top) — Design Spec

> Date: 2026-06-08
> Module: gantt (frontend only)
> Status: approved for implementation

Two inputs in the global Filter dialog that **bring matching rows to the top of their pane**
(keeping the rest below), rather than hard-filtering. Reuses the existing "found rows to top"
mechanism (`pane-store.foundCrewIds`, per pane).

## Behavior (both)
- On **Apply**, matches move to the TOP of their pane; all other rows remain below in their
  current order. Matching crew not currently loaded are fetched and added.
- Matched **crew** group is shown in the pane's current sort order — which defaults to
  **rank displayOrder** (then crewId). Matched **pairings** in the pane's sort order — default
  **sch start ascending**.
- Clearing the field (empty) on Apply removes that pane's top grouping.
- Both inputs live in the Filter dialog (Crew tab / Pairing tab) and apply via "Apply Filters".

## Feature A — Crew ID (Crew tab)
- Input: `TextChipField`, IDs separated by **comma `,` or period `.`** (also Enter / whitespace),
  each a removable chip. Active-chip `crew:id = 12345, 67890`.
- `filter-store`: `CrewFilter` += `crewIds: string[]` (default `[]`). NOT included in
  `crewFiltersEqual` / `hasCrewFilterValues` (it is an overlay, not a facet filter, so it must
  not trigger the base crew reload). The dialog's active-count includes `crewIds.length`.
- `apply-filters.ts`: detect `crewIdsChanged` (compare `appliedFilters.crew.crewIds`). Include it
  in the early-return guard. As a post-step (after base crew/roster load), if `crewIds` non-empty
  and a roster pane is visible → `bringCrewIdsToTop(crewIds, 'main')`; if emptied → clear the
  roster panes' found rows.

## Feature B — Pairing Label (Pairing tab)
- Input: single text `<input>` (partial, case-insensitive). Active-chip `pairing:label = <text>`.
- `filter-store`: `PairingFilter` += `label: string` (default `''`). NOT in `pairingFiltersEqual`
  (overlay, not a facet that reloads the pairing set). Active-count adds `label.trim()?1:0`.
- `apply-filters.ts`: detect `labelChanged`. Post-step: if `label.trim()` and a pairing pane is
  visible → `bringPairingLabelToTop(label)`; if emptied → clear the pairing pane's found rows.

## New module — `gantt/src/utils/bring-matches-to-top.ts`
- `bringCrewIdsToTop(crewIds, paneKey)`: dedupe; add missing to `crew-store.selectedCrewIds`;
  `crew-store.fetchCrewsByIds(missing)` + `roster-store.appendRoster(paneKey, missing, range)`;
  `pane-store.addFoundCrewIds(rosterPaneType, crewIds)`; select rows; scroll roster pane to top.
  (Mirrors the existing `find-crew.ts` core; kept separate to avoid editing that file while it is
  under concurrent change. Consolidate later.)
- `bringPairingLabelToTop(label)`: `pairingApi.list({ label, dateRange, pageSize })` → merge into
  `pairing-store` (new `addItems` merge method) → `pane-store.addFoundCrewIds('pairing', matchedIds)`
  → scroll pairing pane to top.

## Pane reorder changes
- `roster-pane.tsx`: the found-to-top stage keeps found rows in the **pane's sorted order**
  (drop the accumulation-order sort) → matched crew appear by rank displayOrder.
- `pairing-pane.tsx`: add a found-to-top stage before the frozen reorder, using
  `pane-store.getFoundCrewIds('pairing')` as found pairing IDs (`String(pairing.id)`), preserving
  `sortedPairingItems` order (sch start by default). Cleared on re-sort like the roster pane.
- `pairing-store.ts`: add `addItems(pairings: Pairing[])` that merges via the existing
  `mergeItems` (dedupe by id), without disturbing sessions/total.

## Versioning
`gantt/src/version.ts`: `FRONTEND_VERSION` +1. (No backend change — `/api/crew?crewIds` and
`/api/pairing?label` already exist.)

## Tests — §Playwright-Required / §No-Illusion
`e2e/tests/gantt/filter-bring-to-top.spec.ts`:
1. **Crew ID**: open Filter → Crew tab → type two real IDs separated by a period and a comma →
   assert both chips parsed → Apply → assert those crew are at the TOP of the roster pane and a
   known other crew remains below (kept, not filtered out).
2. **Pairing Label**: open Filter → Pairing tab → type a label substring known to match some
   pairings → Apply → assert the matching pairings are at the TOP of the pairing pane and
   non-matching pairings remain below.

## Help — §Help-Sync
Update `help/topics/live/live-filter.tsx` (or `live-panes`) to document the Crew ID field
(separators, brings to top) and the Pairing Label search.

## Out of scope
- Hard filtering / hiding non-matches (explicitly bring-to-top).
- Fuzzy crew-ID matching; multi-term label search.
- Editing `crew-store.ts` / `find-crew.ts` (under concurrent change); reuse their existing exports.
