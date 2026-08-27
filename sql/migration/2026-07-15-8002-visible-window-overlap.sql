-- =============================================================================
-- 2026-07-15  rule_violation: effective violation window for rolling-window rules.
-- =============================================================================
-- Physical anchor fields remain pairing_id/start_dt/end_dt. For cumulative rules such
-- as 8002, window_start_dt/window_end_dt store the checked rolling window so a Gantt
-- range can include a row whose anchor pairing is outside the opened range.
--
-- Run the Live block with search_path set to the target live schema.
-- Run the Scenario block with search_path set to scenario.
-- =============================================================================

-- ───────────────────────── LIVE  (run with search_path = f8 or f8_sit_live) ─────────────────────────
alter table rule_violation
  add column if not exists window_start_dt timestamptz,
  add column if not exists window_end_dt timestamptz;

create index if not exists idx_rv_crew_ruleset_effective_window
  on rule_violation (
    crew_id,
    ruleset_id,
    coalesce(window_start_dt, start_dt),
    coalesce(window_end_dt, end_dt)
  );

comment on column rule_violation.window_start_dt is
  'Effective violation window start. Null means use physical anchor start_dt.';
comment on column rule_violation.window_end_dt is
  'Effective violation window end. Null means use physical anchor end_dt.';

-- ─────────────────────── SCENARIO  (run with search_path = scenario) ───────────────────────
set search_path to scenario;

alter table rule_violation
  add column if not exists window_start_dt timestamptz,
  add column if not exists window_end_dt timestamptz;

create index if not exists idx_srv_scenario_effective_window
  on rule_violation (
    scenario_id,
    crew_id,
    coalesce(window_start_dt, start_dt),
    coalesce(window_end_dt, end_dt)
  );

comment on column rule_violation.window_start_dt is
  'Effective violation window start. Null means use physical anchor start_dt.';
comment on column rule_violation.window_end_dt is
  'Effective violation window end. Null means use physical anchor end_dt.';
