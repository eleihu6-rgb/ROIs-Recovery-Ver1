# Scenario Roster Flight Legality Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add and validate a scenario-side partial index that gives legality reads a `scenario_id`-leading access path on `roster_flight`.

**Architecture:** Add one idempotent SQL migration without a hard-coded schema name. The deployment runner sets `search_path` to each target scenario schema, so the same migration applies to `f8_dev_scenario`, `f8_sit_scenario`, and `f8_uat_scenario`. Validate the remote DEV schema by inspecting the index definition and running the audit query with read-only `EXPLAIN`.

**Tech Stack:** PostgreSQL 16, `psql`, repository SQL migrations, remote F8 scenario database schemas.

## Global Constraints

- Use the remote PostgreSQL authority for real-data checks; do not use the local f8 schema as the business-data authority.
- Do not hard-code a schema prefix in the migration; execute it with `search_path` set to the target scenario schema.
- Keep the index partial with `where is_deleted = 0` and keyed by `(scenario_id, sch_str_dt_utc)`.
- Keep the change limited to the migration and focused verification; do not change application code or legality logic.
- Do not commit or push unless the user explicitly requests it.

---

## Files

- Create: `sql/migration/2026-08-20-scenario-roster-flight-legality-index.sql` — idempotent scenario `roster_flight` performance index.
- Reference: `docs/superpowers/specs/2026-08-20-scenario-roster-flight-legality-index-design.md` — approved design and verification criteria.
- Reference: `docs/modules/rule-engine/2026-08-20-legality-performance-audit-v1.md` — baseline scan and recommended index shape.

### Task 1: Add the migration

**Files:**
- Create: `sql/migration/2026-08-20-scenario-roster-flight-legality-index.sql`

**Interfaces:**
- Consumes: the target schema through the caller's PostgreSQL `search_path`.
- Produces: index `idx_roster_flight_scenario_sch` on the current schema's `roster_flight` table.

- [ ] **Step 1: Create the idempotent migration with the repository header convention**

```sql
-- =============================================================================
-- 2026-08-20  Scenario roster_flight legality query performance index.
-- =============================================================================
-- Run with search_path set to the target scenario schema
-- (f8_dev_scenario / f8_sit_scenario / f8_uat_scenario).
-- Does not change legality logic or result rows.
-- =============================================================================

create index if not exists idx_roster_flight_scenario_sch
    on roster_flight (scenario_id, sch_str_dt_utc)
    where is_deleted = 0;
```

- [ ] **Step 2: Run static SQL checks**

Run:

```bash
sed -n '1,160p' sql/migration/2026-08-20-scenario-roster-flight-legality-index.sql
git diff --check -- sql/migration/2026-08-20-scenario-roster-flight-legality-index.sql
```

Expected: the SQL contains one `create index if not exists`, no schema-qualified table name, the exact key order `(scenario_id, sch_str_dt_utc)`, and the exact predicate `where is_deleted = 0`; `git diff --check` exits successfully.

### Task 2: Apply and verify against remote DEV scenario

**Files:**
- Read: `sql/migration/2026-08-20-scenario-roster-flight-legality-index.sql`
- Read: `live-server/.env` only through shell environment loading; do not copy credentials into files or output.

**Interfaces:**
- Consumes: the migration from Task 1 and the configured remote PostgreSQL connection.
- Produces: a remote DEV scenario schema containing the new index and a captured `EXPLAIN` verification result.

- [ ] **Step 1: Apply the migration with the scenario schema in `search_path`**

Run with the repository's configured scenario `DATABASE_URL`:

```bash
set -a
. live-server/.env
set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -c 'set search_path to f8_dev_scenario;' \
  -f sql/migration/2026-08-20-scenario-roster-flight-legality-index.sql
```

Expected: PostgreSQL reports `CREATE INDEX` or `NOTICE` for an already-existing index and exits with status 0.

- [ ] **Step 2: Confirm the exact index definition from PostgreSQL**

Run:

```bash
set -a
. live-server/.env
set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -P pager=off -Atc \
  "select indexname, indexdef
     from pg_indexes
    where schemaname = 'f8_dev_scenario'
      and tablename = 'roster_flight'
      and indexname = 'idx_roster_flight_scenario_sch';"
```

Expected: one row whose definition contains `scenario_id, sch_str_dt_utc` and `WHERE (is_deleted = 0)`.

- [ ] **Step 3: Re-run a grouped scenario legality-shaped read with read-only EXPLAIN**

Run the same scenario/time-window/predicate shape identified by the audit, using scenario `683` and a broad UTC window that covers the scenario data:

```bash
set -a
. live-server/.env
set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -P pager=off \
  -c 'set search_path to f8_dev_scenario;' \
  -c "explain (analyze, buffers, format text)
        select crew_id,
               pairing_id,
               min(sch_str_dt_utc) as first_start,
               max(sch_end_dt_utc) as last_end
          from roster_flight
         where scenario_id = 683
           and is_deleted = 0
           and pairing_id is not null
           and assignment_group = 'FLY'
           and sch_str_dt_utc >= timestamp '2025-01-01 00:00:00'
           and sch_str_dt_utc <  timestamp '2027-01-01 00:00:00'
         group by crew_id, pairing_id;"
```

Expected: the plan can use `idx_roster_flight_scenario_sch` or another index-based plan for the scenario `roster_flight` access. Record if PostgreSQL still chooses a sequential scan; that is a measurement result, not a reason to widen the index without evidence.

- [ ] **Step 4: Re-run the migration to prove idempotency**

Run the same apply command from Step 1 a second time.

Expected: exit status 0 with no duplicate-index error.

### Task 3: Final review

**Files:**
- Review: `sql/migration/2026-08-20-scenario-roster-flight-legality-index.sql`
- Review: `docs/superpowers/specs/2026-08-20-scenario-roster-flight-legality-index-design.md`

- [ ] **Step 1: Check the change scope and SQL whitespace**

Run:

```bash
git status --short
git diff --check
```

Expected: only the intended migration/spec/audit files are uncommitted, with no whitespace errors. The audit file was already user-provided and must not be reverted or rewritten.

- [ ] **Step 2: Report exact verification results**

Report the migration path, target schema, index definition result, `EXPLAIN` plan result, idempotency result, and any remaining performance uncertainty. Do not claim a runtime speedup unless the post-migration `EXPLAIN ANALYZE` demonstrates it.
