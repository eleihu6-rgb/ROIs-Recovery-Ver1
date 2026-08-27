# F8 Pairing Segment Scheduled Time Fallback

## Problem

In SIT, `pairing_id=12676` has `pairing_segment.sch_str_dt_utc` / `sch_end_dt_utc` equal to `act_str_dt_utc` / `act_end_dt_utc`.

For the same segment, `flight.id=11857` has correct scheduled departure / arrival times. The F8 pairing API may omit segment-level scheduled times, so the import path must not persist actual times as scheduled times when a linked flight has authoritative scheduled times.

## Scope

- `connector-server/src/transform/f8/db/transform-pairing.ts`
- `live-server/src/workers/pairing-inbound-worker.ts`
- `live-server/src/workers/roster-inbound-worker.ts`
- Focused unit tests in the touched areas.

## Current Behavior

- Connector transform sets segment `schStrDtUtc` from `seg.actStrDtUtc ?? seg.stdUtc`.
- Live pairing import resolves `flt_id`, then inserts `pairing_segment.sch_*` directly from the transformed segment.
- If the pairing API omits planned segment times but sends actual times, the planned fields become actual fields even when the referenced `flight` row has correct `sch_dep_dt_utc` / `sch_arv_dt_utc`.

## Design

1. In connector transform, prefer explicit scheduled aliases for segment scheduled fields:
   - start: `schStrDtUtc`, `sch_str_dt_utc`, `stdUtc`
   - end: `schEndDtUtc`, `sch_end_dt_utc`, `staUtc`
   Do not use `actStrDtUtc` / `actEndDtUtc` as the first scheduled source.

2. In live-server pairing import, enrich flight lookup maps with `flight.sch_dep_dt_utc` / `sch_arv_dt_utc`.

3. After resolving `flt_id`, insert `pairing_segment.sch_*` using:
   - linked flight scheduled time when present;
   - otherwise transformed segment scheduled time.

4. Keep `act_*` unchanged from the pairing API transform fallback behavior.

5. In live-server roster import, load `flight.sch_dep_dt_utc` / `sch_arv_dt_utc` through
   `pairing_segment.flt_id` and write `roster_flight.sch_*` from the linked flight when
   present. Fall back to `pairing_segment.sch_*` for unlinked or synthesized edge cases.

## Tests

- Connector transform regression: when API sends `stdUtc/staUtc` and different actual times, segment `sch_*` uses `std/sta` and `act_*` uses `act`.
- Connector transform regression: when API sends explicit `schStrDtUtc/schEndDtUtc`, those fields win over actual fields.
- Live worker regression: when a segment links to an existing flight whose scheduled times differ from the segment actual-derived times, the inserted `pairing_segment.sch_*` params use the flight scheduled times.
- Roster worker regression: when a roster segment has `flt_id` and the linked `flight.sch_*` differs from `pairing_segment.sch_*`, inserted `roster_flight.sch_*` uses the linked flight scheduled times while preserving `act_*`.

## Risks

- Pairing header and duty scheduled fields may still fall back to available segment or duty times when upstream omits all planned timestamps. This spec does not broaden the change beyond segment-level planned times.
- GitNexus impact CLI is currently stale and crashes while reading the index; fallback blast-radius is based on direct code references and touched-area tests.
