-- 2026-07-26-crew-manday-period-rename.sql
-- ----------------------------------------------------------------------------
-- Repurpose the crew manday monthly tables to roster-period (RP) grain across ALL
-- manday-bearing schemas in the rois database:
--   crew_manday_fd_monthly    -> crew_manday_fd_period
--   crew_manday_cc_am_monthly -> crew_manday_cc_am_period
--   year_month char(7)        -> roster_period varchar(100)  (mirrors roster_period.roster_period, e.g. '2026RP07')
--   + rp_start / rp_end timestamptz  (denormalized from roster_period for direct range reads)
--
-- Schemas (live-grain vs scenario-grain unique key):
--   live:     f8, f8_sit_live, f8_uat_live                                  -> (crew_id, roster_period)
--   scenario: scenario, f8_sit_scenario, f8_uat_scenario                    -> (scenario_id, crew_id, roster_period)
--
-- Data is TRUNCATED (owner-confirmed); the manday RuleTool (recompute driver) rebuilds the
-- _period rows from the daily tables post-deploy — daily is the source of truth and already
-- handles RP date boundaries (Feb ends Mar-01, Mar starts Mar-02).
--
-- Idempotent: safe to re-run. Apply against the remote DB, then deploy the matching
-- live-server + engine-server + pbs-server builds, then run the RuleTool repopulation
-- (see docs/handoff/gantt/2026-07-26-rp-centric-migration-runbook.md).
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  s text;
  is_live boolean;
BEGIN
  FOREACH s IN ARRAY ARRAY['f8','f8_sit_live','f8_uat_live','f8_sit_scenario','f8_uat_scenario','scenario'] LOOP
    EXECUTE format('SET search_path TO %I', s);
    is_live := s IN ('f8','f8_sit_live','f8_uat_live');

    -- 1. Rename tables (only if the old name still exists).
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = s AND table_name = 'crew_manday_fd_monthly') THEN
      EXECUTE 'ALTER TABLE crew_manday_fd_monthly RENAME TO crew_manday_fd_period';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = s AND table_name = 'crew_manday_cc_am_monthly') THEN
      EXECUTE 'ALTER TABLE crew_manday_cc_am_monthly RENAME TO crew_manday_cc_am_period';
    END IF;

    -- 2. FD period columns: year_month -> roster_period + add rp_start/rp_end.
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = s AND table_name = 'crew_manday_fd_period' AND column_name = 'year_month') THEN
      EXECUTE 'ALTER TABLE crew_manday_fd_period RENAME COLUMN year_month TO roster_period';
      EXECUTE 'ALTER TABLE crew_manday_fd_period ALTER COLUMN roster_period TYPE varchar(100)';
    END IF;
    EXECUTE 'ALTER TABLE crew_manday_fd_period ADD COLUMN IF NOT EXISTS rp_start timestamptz NOT NULL DEFAULT now()';
    EXECUTE 'ALTER TABLE crew_manday_fd_period ADD COLUMN IF NOT EXISTS rp_end   timestamptz NOT NULL DEFAULT now()';
    EXECUTE 'ALTER TABLE crew_manday_fd_period ALTER COLUMN rp_start DROP DEFAULT';
    EXECUTE 'ALTER TABLE crew_manday_fd_period ALTER COLUMN rp_end   DROP DEFAULT';

    -- 3. CC/AM period columns: year_month -> roster_period + add rp_start/rp_end.
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = s AND table_name = 'crew_manday_cc_am_period' AND column_name = 'year_month') THEN
      EXECUTE 'ALTER TABLE crew_manday_cc_am_period RENAME COLUMN year_month TO roster_period';
      EXECUTE 'ALTER TABLE crew_manday_cc_am_period ALTER COLUMN roster_period TYPE varchar(100)';
    END IF;
    EXECUTE 'ALTER TABLE crew_manday_cc_am_period ADD COLUMN IF NOT EXISTS rp_start timestamptz NOT NULL DEFAULT now()';
    EXECUTE 'ALTER TABLE crew_manday_cc_am_period ADD COLUMN IF NOT EXISTS rp_end   timestamptz NOT NULL DEFAULT now()';
    EXECUTE 'ALTER TABLE crew_manday_cc_am_period ALTER COLUMN rp_start DROP DEFAULT';
    EXECUTE 'ALTER TABLE crew_manday_cc_am_period ALTER COLUMN rp_end   DROP DEFAULT';

    -- 4. Drop the old unique indexes (both naming conventions) + recreate on the new key.
    EXECUTE 'DROP INDEX IF EXISTS uq_manday_fd_monthly';
    EXECUTE 'DROP INDEX IF EXISTS uq_manday_cc_monthly';
    EXECUTE 'DROP INDEX IF EXISTS crew_manday_fd_monthly_crew_id_year_month_idx';
    EXECUTE 'DROP INDEX IF EXISTS crew_manday_cc_am_monthly_crew_id_year_month_idx';
    IF is_live THEN
      EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_manday_fd_period    ON crew_manday_fd_period (crew_id, roster_period)';
      EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_manday_cc_am_period ON crew_manday_cc_am_period (crew_id, roster_period)';
    ELSE
      EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_manday_fd_period    ON crew_manday_fd_period (scenario_id, crew_id, roster_period)';
      EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_manday_cc_am_period ON crew_manday_cc_am_period (scenario_id, crew_id, roster_period)';
    END IF;

    -- 5. Truncate: discard the calendar-month data; RuleTool repopulates by RP.
    EXECUTE 'TRUNCATE crew_manday_fd_period';
    EXECUTE 'TRUNCATE crew_manday_cc_am_period';
  END LOOP;
END $$;
