# Find Crew / Find Pairing by Flight — Design

Date: 2026-06-11
Branch: feat/gantt/rule-ui-locate-pairing

## Problem

From the Flight pane context menu the scheduler can already run **Find Crew by
Flight**, which floats the crew assigned to a (rostered) flight to the top of the
roster pane. Two gaps:

1. **Bug / missing feedback (Find Crew by Flight).** When the roster pane has an
   active filter that hides some of the flight's crew, the feature force-adds
   them silently. The user gets no signal that rows outside their filter were
   injected. The feature also has no Playwright coverage proving the
   bring-to-top works.
2. **Missing feature (Find Pairing by Flight).** There is no way to float the
   pairing(s) that use a given flight to the top of the pairing pane. The flight
   bar carries no `pairingId`, and there is no flight→pairing API.

## Goals

- Find Crew by Flight: keep current behaviour, add a toast when crew were
  outside the active filter, and prove the whole flow with a Playwright test.
- Find Pairing by Flight: new context-menu action that floats the flight's
  pairing(s) to the top of the pairing pane, force-loading any hidden by the
  current filter and notifying the user when it does.

## Non-goals

- No change to the float-to-top mechanism itself (`pane-store.foundCrewIds`).
- No new filter UI; we reuse the existing filter state.

## Source of truth

The crew path resolves a flight's crew from `roster_flight` (`getCrewList`,
`WHERE flt_id = :id`) — that table is the crew↔flight link. The pairing↔flight
link is a different table: `pairing_segment` (`pairing_id`, `flt_id`, backed by
`idx_pair_seg_flt_id`). A pairing "uses" a flight when one of its segments points
at it, independent of whether crew are rostered yet. So the pairing lookup is
`SELECT DISTINCT pairing_id FROM pairing_segment WHERE flt_id = :id` — NOT
`roster_flight` (which would miss pairings whose flight has no crew assigned).

## Design

### Backend (live-server) — BACKEND_VERSION +1

- **Route** `GET /api/flight/:id/pairings` in `src/routes/flight/flight.ts`,
  mirroring the existing `/:id/crew` route (same param parsing, error handling).
- **Service** `flightService.getPairingIds(fastify, fltId): Promise<{ pairingIds: number[] }>`
  in `src/services/flight/flight-service.ts`:
  - `SELECT DISTINCT pairing_id FROM pairing_segment WHERE flt_id = :id AND <notDeleted>`.
  - Redis-cached via the same `getOrSet` helper, key `<CACHE_PREFIX>:pairings:<fltId>`, same TTL as crew.
  - Returns ids sorted ascending for determinism.

### Frontend (gantt) — FRONTEND_VERSION +1

- **`src/services/flight-api.ts`**: add
  `getPairingIds(id: number): Promise<FlightPairingsResponse>` →
  `GET /api/flight/:id/pairings`.
- **`src/types/flight.ts`**: add `interface FlightPairingsResponse { pairingIds: number[] }`.
- **`src/utils/find-crew.ts` — `findCrewToTop` (Part 1 fix).**
  - Capture `hadView = crewStore.selectedCrewIds.length > 0` before adding.
  - `missing` (flight crew not in `selectedCrewIds`) is the filtered-out set.
  - After force-adding, if `missing.length > 0 && hadView`:
    `notify.info(<n> crew not in the current filter — added to the Gantt anyway)`
    (`crew` is singular-aware: "1 crew" → "Crew"). Wording fixed as:
    `"Crew not in the current filter — added to the Gantt anyway"` (with leading
    count when >1).
- **`src/utils/bring-matches-to-top.ts` — new `findPairingsByFlight(flightId)`.**
  1. `flightApi.getPairingIds(flightId)`; on error `notify.error('Failed to find pairing')`.
  2. Empty → `notify.info('This flight has no pairing')` and return.
  3. `notLoaded` = returned ids not already in `pairingStore.items`. Force-load
     each via `pairingApi.getDetail` → `pairingStore.addItems` (reusing the
     `bringPairingIdToTop` loading pattern).
  4. `addFoundCrewIds('pairing', ids.map(String))`, scroll pairing pane to top,
     `markDirty()`.
  5. If `notLoaded.length > 0`:
     `notify.info('Pairing not in the current filter — added to the Gantt anyway')`.
- **`src/components/roster/context-menu.tsx`**: add a **Find Pairing by Flight**
  item to the flight-pane section (`paneType === 'flight' && hasTask`), next to
  Find Crew by Flight, wired to `findPairingsByFlight(findCtx.findFltId ?? task.id)`.

### Notice semantics

| Action | Force-add trigger | Toast |
|---|---|---|
| Find Crew by Flight | flight crew not in `selectedCrewIds`, and a roster view already existed | "Crew not in the current filter — added to the Gantt anyway" |
| Find Pairing by Flight | returned pairing id not in `pairingStore.items` | "Pairing not in the current filter — added to the Gantt anyway" |

Both reuse the existing `notify.info` toast — no new UI surface.

## Testing

- **Playwright** `e2e/gantt/pairing/find-by-flight.spec.ts`:
  - Crew, no filter: right-click a rostered flight → Find Crew by Flight → the
    flight's crew occupy the top roster rows (assert via DOM/`window.__ganttTest`).
  - Crew, filtered: apply a filter excluding those crew → Find Crew by Flight →
    crew added to top AND the filter toast appears. Regression test: fails before
    the fix (no toast today).
  - Pairing: Find Pairing by Flight → the pairing floats to the top of the
    pairing pane.
  - Pairing, filtered: the pairing toast appears.
- **Vitest** `live-server` for `flightService.getPairingIds` — result shape and
  cache hit/miss behaviour.

## Versioning

- BACKEND_VERSION +1 (new route + service in live-server).
- FRONTEND_VERSION +1 (gantt api/util/menu changes).
