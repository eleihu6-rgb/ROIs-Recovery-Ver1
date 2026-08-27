# Connector roster import field alignment

## Goal

Align `roster_flight` writes performed by `connector-server` / `live-server` roster imports so the imported rows carry the same field sources as the live model expects.

## Scope

- `connector-server` roster / rosterGround transform payloads.
- `live-server` roster inbound worker.
- `live-server` rosterGround inbound worker.
- Focused Vitest coverage in the touched worker tests.

## Required behavior

1. Roster rows with `pairing_id` must set `roster_flight.base` from the matched `pairing.base`.
2. Roster rows with `pairing_id` must derive `roster_flight.position` by mapping the imported active rank through `rank_position`.
3. Roster rows with `pairing_id` must derive `roster_flight.dep_arp` / `arv_arp` from the matched `pairing_segment` row for the current flight segment.
4. Ground rows must persist both scheduled and actual timestamps, with `act_str_dt_utc` / `act_end_dt_utc` mirrored from the schedule times when importing ground tasks.
5. Ground rows must resolve `active_rank` and `position` from the crew rank effective at the task time, then map that rank through `rank_position`.

## Acceptance

- Existing import jobs still enqueue and complete.
- New unit tests prove the inserted SQL/data carries the new field values.
- No schema changes are required.
