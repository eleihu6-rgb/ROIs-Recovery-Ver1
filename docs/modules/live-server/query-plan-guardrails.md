# Live Server — Query-Plan Guardrails (P2)

> Part of the Live Server Performance Enhancement plan
> (`docs/superpowers/plans/2026-06-22-0628-live-server-performance-enhancement-ver1.md`, P2).
>
> Long Live date ranges make index quality on the hot date-range queries critical. This is the
> checklist + runnable harness to verify those queries stay on indexes (no sequential / full-table
> scans) for one-month and three-month windows.

## Why this is a script, not a measured result

`EXPLAIN (ANALYZE, BUFFERS)` must run **against the live database** (the local `f8` schema is
empty — Live Server runs against a remote demo Postgres). It cannot be produced offline, so this
item ships as a diagnostic harness to run against live + the acceptance checklist below. Fill the
Before/After tables when you run it.

## How to run

```bash
ROIS_DSN='postgresql://USER:PASS@HOST:5432/rois' \
ROIS_SCHEMA=f8 \
  scripts/live-server-query-plan-check.sh
# optional explicit windows:
#   scripts/live-server-query-plan-check.sh 2026-06-01 2026-07-01 2026-06-01 2026-09-01
```

- **Never** hardcode the DSN/password in the repo — pass `ROIS_DSN` via the environment (connection
  details are in the root `CLAUDE.md`).
- The script only reads. `EXPLAIN ANALYZE` executes the query to get real timings but changes no data.

## Target queries & acceptance

| # | Query (service) | Index it should use | Acceptance |
|---|---|---|---|
| 1 | `roster_flight` by `crew_id` + `sch_str_dt_utc` (`rosterService.getView`) | composite `(crew_id, sch_str_dt_utc)` | **No Seq Scan** when the crew filter is present |
| 2 | `pairing` by `sch_str_dt_utc` (`pairingService.list`) | `(sch_str_dt_utc)` | Index/Bitmap scan, not full scan, for a 1-month page |
| 3 | `pairing_segment` by `pairing_id IN (...)` (list enrichment) | `idx_pair_seg_*` on `pairing_id` | **No avoidable full-table scan** |
| 4 | `pairing_segment` by `flt_id` (flight→pairing link) | `idx_pair_seg_flt_id` | Index scan on `flt_id` |
| 5 | `flight` by `flt_dt` range + `dep_arp/arv_arp/fleet/flt_sts` | `(flt_dt, sch_dep_dt_utc)` | Index/range scan on `flt_dt` |
| 6 | `crew_base` / `crew_rank` / `crew_fleet` effective by `crew_id`, `eff_dt`, `exp_dt` | `(crew_id, eff_dt)` | Index scan by `crew_id` |

Compare across the **one-month** and **three-month** windows: actual rows, planning time,
execution time, and `Buffers: shared hit/read`. A plan that flips from Index Scan to Seq Scan as
the window widens is the signal that an index (or its selectivity) needs attention.

## Adding indexes (if a guardrail fails)

- Add missing indexes **only** through the approved migration flow under `sql/migration/` — do **not**
  edit confirmed schema scripts in `sql/schema/` directly (project rule).
- Re-run this script before/after and record both plans in the tables below.

## Before / After log

### roster_flight crew+range (query 1)

| Window | Scan type | Rows | Planning ms | Execution ms | Buffers (hit/read) |
|---|---|---|---|---|---|
| 1-month (before) | _fill in_ | | | | |
| 3-month (before) | _fill in_ | | | | |
| 1-month (after index, if any) | | | | | |
| 3-month (after index, if any) | | | | | |

### pairing_segment by pairing_id / flt_id (queries 3–4)

| Window | Scan type | Rows | Planning ms | Execution ms | Buffers (hit/read) |
|---|---|---|---|---|---|
| 1-month (before) | _fill in_ | | | | |
| 3-month (before) | _fill in_ | | | | |

> Repeat for queries 2, 5, 6 as needed. The acceptance bar is the table above: no Seq Scan on the
> roster_flight crew+range query, no avoidable full-table scan on `pairing_segment`.
