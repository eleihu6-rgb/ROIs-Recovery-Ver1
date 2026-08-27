#!/usr/bin/env bash
# live-server-query-plan-check.sh — P2 query-plan guardrails for the hot Live date-range queries.
#
# Runs EXPLAIN (ANALYZE, BUFFERS) for the core roster/pairing/flight/crew queries over a
# one-month and a three-month window, so index quality on long Live ranges stays observable.
# This is a DIAGNOSTIC tool — it only reads (EXPLAIN ANALYZE executes the query but mutates
# nothing). It must be run against the live DB; it cannot run offline.
#
# Usage:
#   ROIS_DSN='postgresql://USER:PASS@HOST:5432/rois' \
#   ROIS_SCHEMA=f8 \
#     scripts/live-server-query-plan-check.sh [ONE_MONTH_START ONE_MONTH_END THREE_MONTH_START THREE_MONTH_END]
#
# Defaults to the current rolling windows if dates are omitted. NEVER hardcode the DSN/password
# in this file or commit it — pass ROIS_DSN via the environment (see CLAUDE.md for connection info).
#
# What to look for (acceptance, see docs/modules/live-server/query-plan-guardrails.md):
#   - roster_flight range query WITH a crew filter: Index Scan on the (crew_id, sch_str_dt_utc)
#     composite — NOT a Seq Scan.
#   - pairing_segment by pairing_id / flt_id: Index Scan (idx_pair_seg_*), no full-table scan.
#   - flight by flt_dt range + filters: Index Scan on (flt_dt, sch_dep_dt_utc).
#   - crew_base/crew_rank/crew_fleet effective lookup: Index Scan by crew_id.
set -euo pipefail

DSN="${ROIS_DSN:?Set ROIS_DSN to the rois connection string (no password in the repo)}"
SCHEMA="${ROIS_SCHEMA:-f8}"

# Rolling defaults: this month (1mo) and this month +2 (3mo).
M1_START="${1:-$(date -u +%Y-%m-01)}"
M1_END="${2:-$(date -u -v+1m +%Y-%m-01 2>/dev/null || date -u -d '+1 month' +%Y-%m-01)}"
M3_START="${3:-$M1_START}"
M3_END="${4:-$(date -u -v+3m +%Y-%m-01 2>/dev/null || date -u -d '+3 months' +%Y-%m-01)}"

psql_run() { psql "$DSN" -v ON_ERROR_STOP=1 -X -q -c "set search_path to ${SCHEMA};" -c "$1"; }

run_window() {
  local label="$1" start="$2" end="$3"
  echo "================================================================"
  echo "WINDOW: ${label}  [${start} .. ${end})  schema=${SCHEMA}"
  echo "================================================================"

  echo "--- [1] roster_flight by crew_id + sch_str_dt_utc (gantt getView) ---"
  psql_run "explain (analyze, buffers) select rf.* from roster_flight rf
    where rf.is_deleted = 0
      and rf.crew_id = any(array(select crew_id from crew limit 200))
      and rf.sch_str_dt_utc between '${start}'::timestamptz and '${end}'::timestamptz
    order by rf.sch_str_dt_utc;"

  echo "--- [2] pairing by sch_str_dt_utc (pairing list) ---"
  psql_run "explain (analyze, buffers) select p.* from pairing p
    where p.is_deleted = 0
      and p.sch_str_dt_utc between '${start}'::timestamptz and '${end}'::timestamptz
    order by p.sch_str_dt_utc limit 50;"

  echo "--- [3] pairing_segment by pairing_id IN (...) (list enrichment) ---"
  psql_run "explain (analyze, buffers) select ps.* from pairing_segment ps
    where ps.is_deleted = 0
      and ps.pairing_id = any(array(select id from pairing where is_deleted = 0
        and sch_str_dt_utc between '${start}'::timestamptz and '${end}'::timestamptz limit 50))
    order by ps.duty_seq, ps.seg_seq;"

  echo "--- [4] pairing_segment by flt_id (flight->pairing link) ---"
  psql_run "explain (analyze, buffers) select distinct ps.pairing_id from pairing_segment ps
    where ps.is_deleted = 0
      and ps.flt_id = any(array(select id from flight where is_deleted = 0
        and flt_dt between '${start}' and '${end}' limit 200));"

  echo "--- [5] flight by flt_dt range + filters (flight list/grouped) ---"
  psql_run "explain (analyze, buffers) select f.* from flight f
    where f.is_deleted = 0
      and f.flt_dt between '${start}' and '${end}'
    order by f.sch_dep_dt_utc;"

  echo "--- [6] crew_base effective lookup by crew_id + eff/exp_dt ---"
  psql_run "explain (analyze, buffers) select distinct on (cb.crew_id) cb.crew_id, cb.base
    from crew_base cb
    where cb.crew_id = any(array(select crew_id from crew limit 200))
      and cb.eff_dt <= '${start}'::timestamptz
      and (cb.exp_dt is null or cb.exp_dt > '${start}'::timestamptz)
    order by cb.crew_id, cb.eff_dt desc;"
}

run_window "one-month" "$M1_START" "$M1_END"
run_window "three-month" "$M3_START" "$M3_END"

echo
echo "Done. Paste the plans into the Before/After tables in"
echo "docs/modules/live-server/query-plan-guardrails.md and confirm: no Seq Scan on the"
echo "roster_flight crew+range query, no avoidable full-table scan on pairing_segment."
