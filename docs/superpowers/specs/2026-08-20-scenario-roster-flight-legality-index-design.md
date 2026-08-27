# Scenario Roster Flight Legality Index

## Goal

Add a scenario-side PostgreSQL index that gives legality reads a `scenario_id`-leading access path and avoids scanning unrelated `roster_flight` rows.

## Context

The 2026-08-20 legality performance audit found that scenario legality reads on `scenario.roster_flight` used a `Parallel Seq Scan`, filtering approximately 74,644 rows per worker in scenario `683`. Existing scenario indexes cover `(crew_id, sch_str_dt_utc)`, `(pairing_id, duty_seq, seg_seq)`, and `(scenario_id, live_id)`, but none is led by `scenario_id` and ordered by roster start time.

The audit recommends first testing a narrow partial index on `(scenario_id, sch_str_dt_utc)` with `is_deleted = 0`, before considering a wider compound key.

## Design

Create one idempotent migration:

```sql
create index if not exists idx_roster_flight_scenario_sch
    on roster_flight (scenario_id, sch_str_dt_utc)
    where is_deleted = 0;
```

The migration will not hard-code a schema name. It will be run with `search_path` set to each target scenario schema, including `f8_dev_scenario`, `f8_sit_scenario`, and `f8_uat_scenario`.

The partial predicate keeps deleted rows out of the index. `is_deleted` therefore does not need to be an index key. The index does not alter legality logic, row contents, or API contracts.

## Alternatives Considered

1. **Recommended: `(scenario_id, sch_str_dt_utc) WHERE is_deleted = 0`**
   - Matches the audit recommendation and the scenario/time-window access pattern.
   - Smaller index and lower write overhead than a wide compound index.
   - Allows a direct before/after `EXPLAIN` measurement.

2. **Wider legality index: `(scenario_id, pairing_id, assignment_group, sch_str_dt_utc) WHERE is_deleted = 0`**
   - Could filter more predicates inside the index.
   - Adds index size and write cost before confirming the narrow index is insufficient.

3. **Add the index to the base scenario DDL only**
   - Helps newly initialized schemas.
   - Does not update existing DEV/SIT/UAT schemas, so it is insufficient without a migration.

## Verification

1. Check the migration is idempotent and follows the repository's schema/search-path convention.
2. Apply it to the remote DEV scenario schema using the configured database connection.
3. Confirm the index definition through `pg_indexes`.
4. Re-run the audit query with read-only `EXPLAIN` and verify that PostgreSQL can use the new index instead of the previous `Parallel Seq Scan`.

## Scope

Only the migration and its focused verification are in scope. No application code, schema column, legality rule, runtime version, or unrelated index will change.
