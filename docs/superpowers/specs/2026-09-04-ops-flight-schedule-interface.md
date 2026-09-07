# OPS Flight Schedule Simulation

## Scope

Add an admin-facing `System -> Interface` page named `OPS Flight Schedule Simulation`.
The page simulates an OPS flight schedule feed by searching live flights and applying
editable operational fields to an existing flight record.

The existing top-level `Recovery` page remains the Crew Roster Recovery workbench.

## User workflow

1. Search by flight number (case-insensitive partial match) and flight date.
2. Show flight number, date, departure, arrival, STD, STA, ETD, ETA, ATD, ATA,
   fleet/type, and tail number.
3. Click `Edit` on a result row.
4. Keep flight number, flight date, departure airport, and arrival airport read-only.
   Allow editing STD, STA, ETD, ETA, ATD, ATA, fleet/type, and tail number.
5. Save the row through the existing flight update service.
6. In the same database transaction, synchronize linked `pairing_segment` and
   `roster_flight` records and refresh affected Pairing/Roster caches.
7. Trigger the existing live legality and Manday refresh for affected crews and
   Pairings, using both the old and new operational timestamps as reference dates.

## API and data rules

- Reuse `GET /api/flight` with `grouping=none` for the flat search result.
- Extend `PUT /api/flight/:id` with nullable ETD/ETA fields.
- Do not accept edits to `fltNum`, `fltDt`, `depArp`, or `arvArp` in the update
  payload; those are identity/route fields for this interface.
- Propagation updates the linked Pairing Segment's flight identity, route, fleet,
  scheduled timestamps, and actual timestamps, plus the linked Roster Flight's
  flight date, route, scheduled timestamps, and actual timestamps.
- Pairing duty/head scheduled and actual anchors are recomputed from the affected
  segments. Existing manual duty protections remain in effect for operational
  windows.

## Verification

- Backend focused tests cover flight payload validation and Pairing/Roster propagation.
- Frontend build and UI standard checks must pass.
- Playwright must exercise System -> Interface, search, edit, save, and visible
  updated data; the same run captures a versioned screenshot.
