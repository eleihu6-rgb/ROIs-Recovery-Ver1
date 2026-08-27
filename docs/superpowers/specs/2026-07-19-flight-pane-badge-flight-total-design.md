# Flight Pane Badge: Count Flight Legs (not RegNo Rows)

**Date:** 2026-07-19  
**Status:** Implemented  
**Scope:** Live Flight pane title badge (+ Scenario parity under §Gantt-Unify)

## Problem

The Flight pane header badge (e.g. `74`) shows `flight-store.unfilteredTotal`, which comes from the API `listGrouped` field `total`. That value is the number of **RegNo rows** after registration / fleet grouping and bin-pack splits (`C-FLKC`, `C-FLKC#2`, …) — not the number of **individual flight legs** in the date range.

Product need: the badge must show the count of single-segment flights (`flight` table rows matching the date range + filters).

## Decision

**Approach A:** Keep API `total` as RegNo-row count (pagination / row semantics). Add `flightTotal` = number of flight legs before grouping. The pane badge reads `flightTotal` only.

Rejected:

- **B** — Repurpose `total` to mean legs: breaks pagination and any consumer of `total`.
- **C** — Client `sum(item.flights.length)` over loaded rows: wrong under pagination / partial load.

## Behavior

| State | Badge | Tooltip |
|-------|--------|---------|
| No flight facet filter | `{flightTotal}` | Flights in date range |
| Filter active | `{filteredFlightTotal}/{unfilteredFlightTotal}` | Filtered / total flights in date range |

- **Flight leg** = one `flight` row in the list query (same filters as today: date range, dep/arv, fltNum, fleet, status, not deleted).
- RegNo row rendering and bin-pack logic are unchanged.
- Out of scope: Flight Navi counts, Pairing/Roster badges, backend schema changes.

## Live API

File: `live-server/src/services/flight/flight-service.ts` → `listGrouped`

Grouped path (current):

1. Load matching flights → `allFlights`
2. `allItems = groupFlights(allFlights)`
3. Return `{ items, total: allItems.length, flightTotal: allFlights.length }`

Summary / `grouping: 'none'` path already has SQL `count(*)` as leg count; expose the same field name `flightTotal` (equal to existing `total` there, or rename carefully for clients — Live Gantt grouped path is the badge consumer).

Cache keys that store the payload must include the new field (value change only; key shape can stay).

## Frontend (Live)

1. **Types / API client** — accept optional `flightTotal` on list response.
2. **`flight-store`**
   - Store `flightTotal` (filtered / current query) and `unfilteredFlightTotal`.
   - On `fetchFlightsWithFilter` / replace load: set badge fields from `result.flightTotal`.
   - When a facet filter is active, the secondary unfiltered probe (`pageSize: 1` without facets) must use `r.flightTotal` (not `r.total`) for `unfilteredFlightTotal`.
   - Keep existing `total` / `unfilteredTotal` as **row** counts if still needed for sessions / load-more; badge must not use them.
3. **`FlightPane` → `PaneToolbar`** — pass flight totals into `unfilteredTotal` / `filteredTotal` props used by the badge (or add dedicated props; prefer reusing badge props with flight semantics and update titles). Update tooltip strings to say “flights”, not ambiguous “total”.
4. **Test hook** — `flightTotals()` / `counts().flightLegs` should reflect leg counts so e2e can assert truth.

## Scenario (§Gantt-Unify)

`ScenarioPaneToolbar` currently shows `rowCount` (RegNo-style rows from SharedFlightPane). Change the Flight pane toolbar to pass **leg count** for the scenario date window (sum of flights across scenario flight rows / flat flight list in scenario gantt data), same user-facing meaning as Live.

## Tests

| Layer | Proof |
|-------|--------|
| Vitest / live-server unit | `listGrouped` returns `flightTotal === allFlights.length` and `total === allItems.length` on a fixture where bin-pack creates `#2` rows (leg count > row count). |
| Playwright Live | After gantt load, Flight badge text equals `__ganttTest` / API flight leg count; assert it is **not** equal to RegNo row count when overlaps produce extra rows (or use a known range where legs ≠ rows). |

## Risks

- Stale Redis cache entries without `flightTotal`: treat missing field as fallback to summing loaded legs only if unavoidable; prefer cache TTL expiry / version bump in cache key suffix (`:ft1`) so old payloads are not served.
- Callers that assumed badge = rows: intentional product change; document in playbook / flight-pane.md briefly.

## Non-goals

- Showing both row count and flight count.
- Changing how rows are grouped or labeled.
