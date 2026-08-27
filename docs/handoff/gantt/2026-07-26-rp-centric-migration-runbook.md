# RP-Centric Gantt — P2 Cutover Runbook

> Branch: `feat/gantt-rp-centric`
> Date: 2026-07-26
> Owner: gantt + live-server (+ engine-server, pbs-server)

This runbook covers the **P2 data migration** — repurposing `crew_manday_*_monthly` to
`crew_manday_*_period` (roster-period grain) and migrating all four consumers in one
coordinated cutover. P1 (gantt nav + select foundation) is independent and already shipped.

## What changes

- **DB** (`sql/migration/2026-07-26-crew-manday-period-rename.sql`): rename
  `crew_manday_fd_monthly`→`crew_manday_fd_period`, `crew_manday_cc_am_monthly`→`crew_manday_cc_am_period`;
  `year_month char(7)`→`roster_period varchar(100)`; +denormalized `rp_start`/`rp_end`; recreate unique
  indexes on the new key; **TRUNCATE** both tables in both `f8` and `scenario` schemas. Fresh installs use
  the updated `sql/schema/live/02-crew-roster.sql` + `sql/schema/scenario/01-scenario-tables.sql`.
- **live-server**: Drizzle model + recompute re-aggregation (daily→period by `roster_period` join) +
  `crew-stats-service` (Rp* per RP, Y* per year) + readers (scenario-gantt-db, scenario-export,
  pairing-service, table lists) + `findStaleFdCrews` (rp_start/rp_end) + inbound worker (RP-resolved period upsert).
- **engine-server**: `manday.py` reads `_period` windowed by `rp_start`/`rp_end`.
- **pbs-server**: `dashboard-profile` reads `_period`; `formatRosterPeriod` produces `YYYYRPMM`.
- **gantt**: `RpCred/RpDO/RpBH` columns; Live crew stats keyed by the viewport's current RP.

## Cutover steps (maintenance window)

Run as a **single coordinated cutover** — the services read `_period`, so they must not serve
traffic between the migration and the RuleTool repopulation (stats would be empty).

1. **Snapshot**: take a pre-migration DB dump (rollback insurance).
2. **Apply migration** against the remote DB (`DATABASE_URL_F8`), both schemas:
   ```bash
   psql "$DATABASE_URL_F8" -f sql/migration/2026-07-26-crew-manday-period-rename.sql
   # verify: tables renamed, roster_period column present, _period tables empty (truncated)
   psql "$DATABASE_URL_F8" -c "SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'crew_manday_%_period';"
   ```
3. **Deploy** the new builds: `live-server`, `engine-server`, `pbs-server`, `gantt` (all from this branch).
   - `~/rois/rois.sh restart live-server` (rebuilds + restarts).
   - Restart engine-server + pbs-server + redeploy gantt per the standard deploy.
4. **Repopulate `_period`** via the manday RuleTool (daily is the source of truth; boundaries handled):
   ```bash
   # admin refresh over the full needed range (e.g. 2026-01 → 2027-12):
   curl -X POST "$LIVE/api/admin/manday-credit-refresh" -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"startDt":"2026-01-01","endDt":"2027-12-31"}'
   # (or the owner's manday refresh script — same recompute driver)
   ```
   The recompute re-aggregates `_period` from daily per `roster_period`.
5. **Smoke checks** (§No-Illusion — run these, don't assume):
   - gantt: `GET /api/roster-periods` returns RPs; a known crew's `RpCred` cell matches the RP total.
   - pbs dashboard: a pilot's credit shows (non-empty).
   - `SELECT count(*) FROM f8.crew_manday_fd_period;` > 0 after repopulation.

## Conflict regression (migration gate) — run post-migration

The migration gate requires a test where calendar-month and RP disagree. Construct a crew with a
duty on **2026-03-01** (Feb RP's last day per the F8 seed: Feb RP ends Mar-01, Mar RP starts Mar-02):

```sql
-- after recompute, that duty's credit/blh/day-off must land in 2026RP02, NOT 2026RP03:
SELECT roster_period, credit, blh, is_day_off
  FROM f8.crew_manday_fd_period
 WHERE crew_id = '<the crew>' ORDER BY roster_period;
-- expect a 2026RP02 row carrying the Mar-01 duty; no Mar-01 contribution in 2026RP03.
```

This is the regression that would fail if anyone reverts the daily→period grouping to `to_char(crew_base_dt,'YYYY-MM')`.

## Known gaps / follow-ups (residual risk per migration gate)

1. **Scenario roster Rp-column values** — `scenario-gantt-source` reads preloaded
   `crewStats[crewId][yearMonth]` (calendar-keyed). The Scenario result loader must key its crewStats
   by `roster_period` for Scenario RpCred/RpDO/RpBH to be RP-accurate. (Live is already RP-keyed.)
   Until then, Scenario shows the column labels but with calendar-keyed values.
2. **DB-backed test assertion values** — the live-server manday tests (DB-backed, self-skip without
   creds) reference `'2026-06'`-style values against the renamed `roster_period` column. Their **column
   refs** are migrated; their **values** need updating to RP codes (e.g. `'2026RP06'`) when first run
   post-migration. Tests self-skip in CI (no DB), so they don't block.
3. **Rule outcome re-validation** — engine-server now feeds the solver manday history in RP buckets
   (not calendar months). Spot-check rule outputs at the Feb/Mar RP boundary before final release.
4. **Rule-engine-rs / pbs-engine** — verified clean of `_monthly`/`year_month` references; no change needed.

## Rollback

- **Before repopulation lands**: redeploy the previous builds + restore the pre-migration dump.
  (The migration is reversible by restoring the dump; there is no in-place down-migration script —
  the period grain is not 1:1 with the old monthly grain.)
- **After repopulation**: rolling back loses the new period data; restore the dump + redeploy old builds.

## Verification status of this branch (write-only for the DB path)

- tsc clean across live-server, gantt, pbs-server; engine-server Python compiles.
- gantt unit tests green (manday-delta 6/6, use-current-rp 5/5, guard 2/2, roster-period-store, zoom-rp).
- P1 Playwright green (gantt nav/select/header).
- **Not runtime-verified by the author** (no DB creds): the migration SQL execution, the recompute
  repopulation, the DB-backed live-server/engine-server tests, and the post-cutover smoke checks —
  these are the operator's steps above.
