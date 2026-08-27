# Data Migration Live Pairing Month Copy Tool

## Status

Approved by user on 2026-07-28 for implementation.

## Background

`data-migration` currently targets the F8 migration service and uses PyMySQL for legacy migration flows. The requested tool is specifically for a live schema and the live PostgreSQL table model:

- `pairing`
- `pairing_segment`
- `pairing_composition`

The live model rule is that `pairing` does not directly reference `flight`; `pairing_segment.flt_id` references `flight.id`. Therefore the copy must remap each copied segment to the target-month `flight` row.

## Goal

Add a `data-migration` utility class that copies one whole month of live PostgreSQL schema pairing data into another month. The concrete database can be SIT, UAT, or another live-like PostgreSQL database; the caller provides the database URL and live schema name.

Given:

- live schema name, for example `f8`
- source month, for example `2026-05`
- target month, for example `2026-06`

The tool copies all `pairing` rows whose planned start time month is the source month into the target month. Related `pairing_segment` and `pairing_composition` rows are copied by `pairing.id`.

## Functional Requirements

1. Select source pairings by `pairing.sch_str_dt_utc` month.
2. Insert new `pairing` rows with new generated IDs.
3. Copy related `pairing_composition` rows and point them to the new `pairing.id`.
4. Copy related `pairing_segment` rows and point them to the new `pairing.id`.
5. Shift all date/time fields by the month offset from source month to target month, preserving the time-of-day.
6. For each copied `pairing_segment`, find the matching target-month `flight` and replace `pairing_segment.flt_id` with that target `flight.id`.
7. Run inside transactions with rollback on any failed pairing copy.
8. Provide dry-run mode that reports counts and missing target flights without writing.

## Date Shift Rule

The target month can be any month, not only the next month. The month offset is calculated from source month to target month.

Date/time columns are shifted with calendar-month semantics, preserving time-of-day. Example:

- `2026-05-12 08:35:00+00` copied from May to June becomes `2026-06-12 08:35:00+00`.

End-of-month overflow needs deterministic behavior. Proposed rule: clamp to the last valid day of the target month, matching PostgreSQL interval behavior for month addition. Example:

- `2026-01-31` plus one month becomes `2026-02-28` or `2026-02-29` depending on year.

## Date/Time Columns To Shift

`pairing`:

- `sch_str_dt_utc`
- `sch_end_dt_utc`
- `act_str_dt_utc`
- `act_end_dt_utc`
- `pairing_dt`

`pairing_segment`:

- `duty_sch_str_dt_utc`
- `duty_sch_end_dt_utc`
- `duty_act_str_dt_utc`
- `duty_act_end_dt_utc`
- `flt_dt`
- `act_str_dt_utc`
- `act_end_dt_utc`
- `sch_str_dt_utc`
- `sch_end_dt_utc`
- `pickup_start_utc`
- `pickup_end_utc`
- `brief_start_utc`
- `brief_end_utc`
- `debrief_start_utc`
- `debrief_end_utc`
- `dropoff_start_utc`
- `dropoff_end_utc`
- `double_pickup_start_utc`
- `double_pickup_end_utc`
- `double_brief_start_utc`
- `double_brief_end_utc`
- `double_debrief_start_utc`
- `double_debrief_end_utc`
- `double_dropoff_start_utc`
- `double_dropoff_end_utc`

## Target Flight Matching

For each source segment, the tool uses the source segment's copied business fields plus shifted times to find the target flight.

Confirmed matching key:

- `airline`
- `flt_num`
- `dep_arp`
- `arv_arp`
- shifted `sch_str_dt_utc` from `pairing_segment`, matched to `flight.sch_dep_dt_utc`

The tool should reject ambiguous matches. When no target flight matches, it should create a target-month `flight` row derived from the copied segment. The created flight must leave `interface_flt_id` unset.

The copied `pairing` row must also leave `interface_id` unset.

## Duplicate Handling

Default behavior should fail fast if target-month duplicate pairings are detected for the same copied business shape.

Initial duplicate detection proposal:

- same `pairing_label`
- same `base`
- same `division`
- same target `sch_str_dt_utc`
- `is_deleted = 0`
- `scenario_id = 0`

An explicit `replace_existing` option can be added only if needed later. Initial implementation should avoid destructive delete/replace behavior.

## Public API Shape

Implement a small utility class under `data-migration`, for example:

- `data-migration/f8/live_pairing_month_copy.py`
- class `LivePairingMonthCopyTool`

Proposed method:

```python
copy_month(
    database_url: str,
    schema: str,
    source_month: str,
    target_month: str,
    dry_run: bool = True,
) -> PairingMonthCopyResult
```

Add a minimal script or route only if it matches existing module style after implementation review. The first implementation can be directly callable from Python for controlled ops usage.

## Verification Plan

1. Unit tests for month shifting, including end-of-month dates and nullable timestamp columns.
2. Unit tests for generated SQL identifier validation, ensuring schema name is restricted to safe `snake_case` identifiers.
3. Unit tests for flight match behavior: exact match, missing match, ambiguous match.
4. Dry-run smoke against a remote read-only transaction or EXPLAIN path if credentials are available.
5. Focused test command from `data-migration`:

```bash
pytest tests/test_live_pairing_month_copy.py
```

## Constraints And Risks

- The repo-level `brainstorming` skill is required for this kind of change, but this Codex session does not expose that skill. This document is the fallback design artifact and still requires explicit user approval before implementation.
- GitNexus impact tools are referenced by root instructions, but no GitNexus tool namespace was available through `tool_search`; impact analysis will be documented as unavailable unless tooling appears before implementation.
- The existing `data-migration` codebase currently uses MySQL-oriented helpers and legacy table names in some pairing paths. This tool targets live PostgreSQL-style table names because the request explicitly names `pairing/pairing_segment/pairing_composition` and a live schema.
- Real-data validation must use the remote PostgreSQL authority and must not use local empty F8 data as business proof.
