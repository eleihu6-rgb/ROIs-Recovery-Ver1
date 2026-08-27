# Pairing Coverage filter — Design Spec

> Date: 2026-06-08
> Module: gantt (frontend) + live-server (backend)
> Status: implemented

Replaces the Pairing tab's tri-state **Fully Crewed** toggle (`isFull`: All/Full only/Partial
only) with a multi-select **Coverage** of three states, and changes the behavior from a hard
filter to **bring matching pairings to the top** (keeping the rest), consistent with the new
Crew ID / Label inputs.

## Coverage states
Computed from a pairing's composition (sum of `fill` vs `plan`):
- **Open** — no crew at all (total fill 0, with a composition requirement).
- **Partial** — partially crewed (0 < fill < plan).
- **Full** — fully crewed (`isFull`), or no composition requirement.

## Behavior
- Coverage is a multi-select (Open / Partial / Full). **Default = Open + Partial** — under-crewed
  pairings surface at the top on load.
- On Apply (and on load), pairings whose coverage ∈ selection float to the **top** of the Pairing
  pane, ordered by the pane's sort (default sch start asc); other pairings stay below.
- Selecting all three (or none) = no narrowing (no reorder).
- Active chip: `pairing:coverage = Open, Partial`.

## Frontend (`gantt`)
- `filter-store`: `PairingFilter.isFull` → `coverage: CoverageState[]` (`'open'|'partial'|'full'`),
  default `['open','partial']`. New `pairingCoverageEqual`; coverage excluded from
  `pairingFiltersEqual` / `hasPairingFilterValues` (overlay, not a base-reload facet);
  `setPairingFilter` guard and `activeFilterCount` updated; coverage counts as active when it
  narrows (1–2 of 3).
- `filter-dialog`: "Fully Crewed" `ToggleRow` → "Coverage" `PillGroup` (multi-select);
  summary chip; reset → `['open','partial']`. `ToggleRow` removed.
- `pairing-pane`: `computeCoverage(pairing)`; the row reorder floats two tiers — Label matches
  first, then Coverage matches — above the rest, each keeping sort order. Condition-strip chip
  switched from isFull to coverage.
- `bring-matches-to-top.ts`: `bringPairingCoverageToTop(coverage)` fetches coverage-matching
  pairings (so they load) and merges them (`pairing-store.addItems`); the pane reorder floats
  them. No-op when coverage is empty/all-three.
- `apply-filters`: `coverageChanged` detection + post-step `bringPairingCoverageToTop`.
- `pairing-api` / `PairingListQuery`: `coverage?: string[]` → CSV query param. `isFull` plumbing
  in `pairing-store.fetchPairings` removed (coverage is the replacement, client-driven).

## Backend (`live-server`)
- `/api/pairing` list: new `coverage` CSV param (open|partial|full). Classifies each enriched
  pairing and keeps matching ones (in-memory post-filter, mirroring the existing `isFull`
  filter); cache key includes coverage. Because the post-filter runs after SQL paging, the
  frontend requests a large page to capture the whole range (future: SQL-level classification).

## Tests — §Playwright-Required / §No-Illusion
`e2e/tests/gantt/pairing-coverage-filter.spec.ts`:
1. Default (Open+Partial): every under-crewed pairing appears above every full one.
2. Select Full only: every full pairing appears above every non-full one.
(Coverage classified from the API for assertions.)

## Versioning
`gantt/src/version.ts`: `BACKEND_VERSION` +1, `FRONTEND_VERSION` +1.

## Out of scope
- SQL-level coverage classification (current post-filter requires a large page fetch).
