# Find Crew / Find Pairing by Flight — Implementation Plan

Spec: ../specs/2026-06-11-find-by-flight-design.md

## Phase 1 — Backend (live-server)

1. `src/services/flight/flight-service.ts`: add `getPairingIds(fastify, fltId)`:
   `SELECT DISTINCT pairing_id FROM roster_flight WHERE flt_id=:id AND pairing_id IS NOT NULL AND <notDeleted>`,
   `getOrSet` cache key `flight:pairings:<id>`, return `{ pairingIds: number[] }` asc.
2. `src/routes/flight/flight.ts`: add `GET /:id/pairings` mirroring `/:id/crew`.
3. `src/__tests__/services/flight/flight-service.test.ts`: add `getPairingIds`
   describe block (returns distinct ids; empty when none). Run vitest.
4. Bump `BACKEND_VERSION` in `gantt/src/version.ts`.

## Phase 2 — Frontend (gantt)

5. `src/types/flight.ts`: `interface FlightPairingsResponse { pairingIds: number[] }`.
6. `src/services/flight-api.ts`: `getPairingIds(id) → GET /api/flight/:id/pairings`.
7. `src/utils/find-crew.ts`: in `findCrewToTop`, capture `hadView` before adding;
   if `missing.length>0 && hadView`, `notify.info` the crew filter notice.
8. `src/utils/bring-matches-to-top.ts`: add `findPairingsByFlight(flightId)` —
   fetch ids, force-load not-loaded ones, float to top, notify when force-loaded.
9. `src/components/roster/context-menu.tsx`: add "Find Pairing by Flight" to the
   flight-pane section (and the pairing-pane flight-context block alongside the
   existing Find Crew by Flight) wired to `findPairingsByFlight`.
10. Bump `FRONTEND_VERSION` in `gantt/src/version.ts`.

## Phase 3 — E2E

11. `e2e/gantt/pairing/find-by-flight.spec.ts`: crew (plain + filtered+toast),
    pairing (plain + filtered+toast). Run with playwright.

## Verify

- `npx vitest run src/__tests__/services/flight/flight-service.test.ts` (live-server)
- `npx playwright test e2e/gantt/pairing/find-by-flight.spec.ts --reporter=list`
- `npx tsc --noEmit` (gantt)
