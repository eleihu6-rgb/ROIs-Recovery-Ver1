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
