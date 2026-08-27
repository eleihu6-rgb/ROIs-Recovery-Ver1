# Roster Publish Snapshot Alignment

## Background

`roster_publish` should be a clear published roster snapshot, not a partial mirror with ambiguous names.
The target meaning is:

> `roster_publish` is the published roster snapshot of `roster_flight` plus the related
> `pairing_segment` time windows needed by downstream consumers.

PBS Award Results must read roster task information from `roster_publish` only. It must not join live
`roster_flight`, `pairing`, `pairing_segment`, or other live operational tables for published task details.
When PBS needs more published roster fields, those fields must be added to `roster_publish` and populated
at publish time.

## Current Field Audit

Schema-level counts from `sql/schema/live/02-crew-roster.sql`:

- `roster_flight`: 71 columns.
- `roster_publish`: 76 columns.
- `roster_flight` columns missing from `roster_publish`: 34.
- `roster_publish` has legacy publish/app/check-in fields that are not present in `roster_flight`.

Live publish currently reads `roster_flight`, `pairing`, `pairing_segment`, `crew`, `crew_base`, and
`crew_fleet` to build the diff and apply publish changes. That is acceptable for Live Publish because it is
comparing the current live source against the published snapshot.

PBS Award Results currently reads `roster_publish` but joins:

- `roster_flight` for `sch_credited_minutes` and `act_credited_minutes`.
- `pairing` for `pairing_label`, `tafb`, `base`, and `fleet`.

That violates the new contract and must be removed.

## Required Contract

1. `roster_publish` is the source of truth for already-published roster task details.
2. PBS Award Results task queries must use only `roster_publish`.
3. `roster_publish.roster_id` must be treated as the source `roster_flight.id`; add a clearer
   `roster_flight_id` name and keep compatibility for existing code during migration.
4. Avoid ambiguous aliases for source fields:
   - `duty_id` should be replaced by or aliased to `duty_seq`.
   - `acting_rank` should be replaced by or aliased to `flight_acting_rank`.
   - `roster_rank` should be replaced by or aliased to `roster_acting_rank`.
   - `pick_up_*` should be normalized against `pairing_segment.pickup_*` naming, with compatibility kept
     until all readers are migrated.
5. Add all `roster_flight` fields that are currently absent from `roster_publish`, except `scenario_id`
   should remain excluded because live business tables must not add scenario semantics.
6. Add the PBS Award Results fields currently sourced from `pairing`, because PBS cannot join `pairing`
   anymore.

## Fields To Add From `roster_flight`

Add these source-aligned columns to `roster_publish`:

- Identity/source/status: `roster_flight_id`, `ver`, `base`, `source`, `is_requested`, `is_deleted`,
  `is_swapped`, `preference`, `comments`, `score`, `exception_code`.
- Work and credit: `working_hour`, `sch_credited_minutes`, `sch_fm_credited_minutes`,
  `sch_per_diem_mins`, `sch_lh_per_diem_mins`, `sch_fm_per_diem_mins`, `sch_fm_lh_per_diem_mins`,
  `act_credited_minutes`, `act_fm_credited_minutes`, `act_per_diem_mins`, `act_lh_per_diem_mins`,
  `act_fm_per_diem_mins`, `act_fm_lh_per_diem_mins`.
- Segment identity/times: `duty_seq`, `seg_seq`, `act_str_dt_utc`, `act_end_dt_utc`, `act_rest_min`.
- Rank and ordering: `flight_acting_rank`, `roster_acting_rank`, `tag_set`, `is_extra_course`,
  `seq_order_source`.

Do not add `scenario_id` to `roster_publish`.

## Fields To Add For PBS No-Join Reads

Add published display fields that PBS currently obtains from `pairing`:

- `pairing_label`
- `pairing_base`
- `pairing_fleet`
- `tafb_minutes`

PBS should then map:

- `sch_credit_minutes` from `roster_publish.sch_credited_minutes`
- `act_credit_minutes` from `roster_publish.act_credited_minutes`
- `pairing_label` from `roster_publish.pairing_label`, falling back to `label` only if needed
- `base` from `roster_publish.base` or `pairing_base`, based on the Award UI's current meaning
- `fleet` from `roster_publish.pairing_fleet`
- `tafb_minutes` from `roster_publish.tafb_minutes`

## Migration Plan

Create a new migration under `sql/migration/` that:

1. Adds all new columns idempotently with `alter table roster_publish add column if not exists ...`.
2. Backfills new source-aligned columns from existing same-meaning legacy columns where possible:
   - `roster_flight_id = roster_id`
   - `duty_seq = duty_id`
   - `flight_acting_rank = acting_rank`
   - `roster_acting_rank = roster_rank`
3. Backfills credit, base, actual times, `seg_seq`, and PBS display fields for existing published rows by
   joining live tables in the migration/backfill only. Runtime PBS reads remain no-join.
4. Adds comments documenting the published snapshot meaning and naming compatibility.
5. Keeps existing indexes and adds a replacement unique index for `roster_flight_id` while leaving the old
   `roster_id` index during compatibility.

## Code Changes

Live Server:

- Update `live-server/src/models/roster/roster-publish.ts`.
- Update `roster-publish-service.ts` publish apply SQL to populate all new `roster_flight` snapshot fields,
  pairing segment windows, and PBS display fields.
- Keep old compatibility fields populated in the same write path until all readers are migrated.
- Update publish diff signatures only after the schema alignment is complete; the separate
  `2026-07-22-roster-publish-update-identity-fix.md` spec should build on this schema.

PBS Server:

- Update Award Results query to select task fields only from `roster_publish`.
- Remove joins to `roster_flight` and `pairing`.
- Update types/tests to cover credit and pairing display fields from `roster_publish`.

PBS sync script:

- Update `sync-roster-publish-from-roster-flight-core.ts` to write all new fields for historical/monthly
  publish sync.

## Verification

Automated:

- `live-server` focused Vitest for `roster-publish-service` covering inserted snapshot fields, especially
  credit and clear rank/id fields.
- `pbs-server` Award Results test proving SQL does not contain joins to live `roster_flight`, `pairing`,
  or `pairing_segment`.
- `pbs-server` sync script tests proving generated insert/update SQL includes the new fields.
- `npm run build` in affected modules.

Database:

- Remote PostgreSQL read-only validation of column presence after migration.
- Backfill validation that existing published rows have credit fields when their source `roster_flight`
  rows still exist.

Manual / QA:

- PBS Award Results for a crew with published flying and ground duties still shows task timing, credit,
  base/fleet, and pairing label.
- Live Publish Roster apply still creates published rows with old and new compatibility fields populated.

## Risks

- Existing published rows whose source `roster_flight` rows no longer exist cannot be fully backfilled.
  The migration should report counts for rows that remain partially null.
- Keeping old and new names during compatibility creates duplication, but it is safer than a single-step
  breaking rename across Live, PBS, outbound, and sync paths.
- `pairing_label`, `pairing_fleet`, and `tafb_minutes` are not `roster_flight` fields, but they are required
  to satisfy the PBS no-live-join contract without losing current Award Results information.
