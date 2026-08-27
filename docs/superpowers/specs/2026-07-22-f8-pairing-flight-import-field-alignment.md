# F8 pairing and flight import field alignment

## Goal

Align F8 Pairing and Flight inbound writes with the expected live table field semantics.

## Scope

- `live-server` pairing inbound worker.
- `live-server` flight inbound worker.
- Focused worker unit tests.

## Required behavior

1. Pairing import writes `pairing.pairing_dt` from `act_str_dt_utc` converted to the local date of the pairing base airport.
2. The base airport timezone comes from `airport.zone_id`; invalid or missing timezones fall back to UTC date.
3. Flight import writes `ac_owner`, `pilot_owner`, and `cabin_owner` as `F8`.
4. Flight import writes `flt_dt_utc` from the UTC calendar date of `sch_dep_dt_utc`.
5. Flight import writes `flight_assignment = 'FLY'` when `flight_flag = 'A'`.

## Acceptance

- Existing import behavior remains idempotent.
- Unit tests assert the new pairing and flight insert/update fields.
- No schema change is required.
