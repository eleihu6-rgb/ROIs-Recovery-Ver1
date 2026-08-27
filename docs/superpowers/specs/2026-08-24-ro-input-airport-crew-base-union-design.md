# ro_input Airport section includes CrewBase / COF bases

## Status

Approved by user 2026-08-24 (explicit implement request).

## Problem

`scenario_airports()` only collects flight `dep_arp` / `arv_arp`. After COF mates
became division-agnostic (2026-08-20), CrewBase(COF) can include bases such as
`YKF` that never appear on scenario flights. The PBS solver then fails with:

`CrewBase crewId=… base=YKF has no known timezone`

even though `airport.zone_id` is populated in PG.

## Change

Extend `engine-server/F8/ro_input_builder/context.py` `scenario_airports()` to
return the sorted unique union of:

1. Flight airports (existing query on `flight_section_ids`)
2. Distinct `crew_base.base` for `scenario_crew_ids ∪ cof_crew_ids`, using the
   same dated overlap window as CrewBase export (`eff_dt <= scenario end` and
   `exp_dt >= scenario start`)

`Airport` / `Airport(Client)` already call `scenario_airports()`, so both sections
pick up the extra bases without further wiring.

## Out of scope

- Frontend React #31 progress.error object rendering
- Legacy `_LEGACY_BASE_TIMEZONES` expansion
- Backfilling airport master data

## Verification

- Unit / context test: mocked or DB-backed assertion that a COF-only base appears
  in `scenario_airports()` even when absent from flight dep/arv.
- Existing `test_airport_client_*` still pass when f8 DB is available.
