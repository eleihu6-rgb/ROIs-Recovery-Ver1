# Roster Publish Update Identity Fix

## Problem

In Live Publish Roster, the publish diff needs to follow the latest `roster_publish` table rules.
The same duty must not be split into multiple publish actions just because the stored row id changed.

## Matching rules

### Flying rows (`pairing_id is not null`)

- Match by `crew_id + pairing_id`.
- If both `roster_flight` and `roster_publish` have the row, compare child fields:
  - if any tracked child field changes, emit `UPDATE`
  - if nothing changes, emit `NO_CHANGE`
- If `roster_flight` has the row and `roster_publish` does not, emit `ADD`
- If `roster_publish` has the row and `roster_flight` does not, emit `DELETE`

### Ground rows (`pairing_id is null`)

- Do not rely on `roster_flight_id` yet.
- Match by this business composite identity:
  - `crew_id`
  - `assignment_group`
  - `assignment`
  - `sch_str_dt_utc`
  - `sch_end_dt_utc`
  - `dep_arp`
  - `arv_arp`
- If both sides have the row, emit `NO_CHANGE`
- If `roster_flight` has the row and `roster_publish` does not, emit `ADD`
- If `roster_publish` has the row and `roster_flight` does not, emit `DELETE`

## Goal

Keep the publish batch aligned with the real roster state:

- `UPDATE` only when the same duty exists on both sides and child data changed
- `NO_CHANGE` when the same duty exists on both sides and nothing changed
- `ADD` / `DELETE` only when the duty exists on one side only

## Scope

- `live-server/src/services/roster/roster-publish-service.ts`
- `live-server/src/services/roster/roster-publish-outbound-service.ts`
- Focused Vitest coverage in `live-server/src/__tests__/services/roster/`

## Verification

- Add regression tests that prove:
  - same-duty flying re-materialization produces `NO_CHANGE` or `UPDATE` as appropriate, not
    `DELETE` + `ADD`
  - ground duties match by business fields, not by `roster_flight_id`
- Keep the existing apply transaction test green.
- Run the focused live-server roster publish test file after the change.

## Notes

- This is a backend behavior fix, not a UI change.
- The ground business composite field list is fixed to the seven fields above.
