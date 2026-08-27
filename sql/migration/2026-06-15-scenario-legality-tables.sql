-- 2026-06-15  Scenario persisted legality: scenario.rule_violation + scenario.legality_status
-- Spec: docs/superpowers/specs/2026-06-15-scenario-persisted-legality-design.md
-- Plan: docs/superpowers/plans/2026-06-15-scenario-persisted-legality.md
--
-- Persisted, per-scenario rule violations (keyed by scenario_id), computed once on first
-- open and read by later users. Lives in the `scenario` schema alongside roster_flight and
-- crew_manday_*, so a scenario delete / idle sweep reclaims everything in one schema.
-- Idempotent (CREATE TABLE IF NOT EXISTS). Run with search_path = scenario.
set search_path to scenario;

-- Mirrors live rule_violation (sql/schema/live/04-rule-violation.sql), minus monthly
-- partitioning (a scenario is one bounded period; scenario_id is the prune key), plus
-- scenario_id + roster_version (the version the rows were computed against).
create table if not exists rule_violation (
  id                bigint generated always as identity,
  scenario_id       bigint         not null,
  roster_version    bigint         not null,
  crew_id           varchar(20)    not null,
  pairing_id        bigint,                        -- NULL = roster-level violation
  duty_seq          smallint,
  rule_group_code   varchar(50)    not null,
  rule_code         varchar(50)    not null,       -- rule TEMPLATE/function code, e.g. '8002'
  rule_instance     varchar(20),                   -- rule INSTANCE code, e.g. '006'
  start_dt          timestamptz    not null,
  end_dt            timestamptz    not null,
  severity          smallint       not null,       -- 1=INFO 2=WARNING 3=ERROR
  actual_value      numeric,
  limit_value       numeric,
  unit              varchar(20),
  message           text           not null,
  computed_at       timestamptz    not null default now(),
  created_by        varchar(50)    not null default 'system',
  created_at        timestamptz    not null default now(),
  primary key (id),
  unique (scenario_id, crew_id, pairing_id, duty_seq, rule_group_code, rule_code)
);
create index if not exists idx_srv_scenario on rule_violation (scenario_id, crew_id);

-- 1:1 bookkeeping per scenario (legality is 1:1 with the scenario because each scenario has
-- exactly one tied rule_group_code). Freshness predicate: serve stored rows iff
-- status = 'READY' AND computed_version = roster_version.
create table if not exists legality_status (
  scenario_id       bigint       primary key,
  rule_group_code   varchar(50)  not null,            -- snapshot of scenario.rule_group_code at compute
  roster_version    bigint       not null default 0,  -- current roster version (loader/save bumps)
  computed_version  bigint       not null default -1, -- version the stored violations reflect
  status            varchar(20)  not null default 'PENDING', -- PENDING|COMPUTING|READY|STALE|FAILED
  computed_at       timestamptz,
  error_text        text,
  updated_at        timestamptz  not null default now()
);
create index if not exists idx_legality_status_idle on legality_status (updated_at);
