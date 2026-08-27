-- =============================================================================
-- 2026-08-21  roster_flight flt_id index for 8072/8030 Live∪Scenario COF fills.
-- =============================================================================
-- Run with search_path set to EACH target Live AND Scenario schema:
--   f8_dev_live / f8_sit_live / f8_uat_live
--   f8_dev_scenario / f8_sit_scenario / f8_uat_scenario
-- Does not change legality logic or result rows.
-- =============================================================================

create index if not exists idx_roster_flight_flt_fly
    on roster_flight (flt_id)
    where is_deleted = 0
      and assignment_group = 'FLY'
      and pairing_id is not null
      and flt_id is not null;
