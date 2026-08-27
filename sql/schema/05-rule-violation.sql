-- =============================================================================
-- rule_violation: Individual rule violations per crew/pairing/duty
-- Monthly RANGE partition on start_dt
-- =============================================================================
-- Semantics of start_dt / end_dt:
--   - FDP violation: duty report time → duty release time
--   - Min rest violation: previous duty release → next duty report
--   - 7/28/365 cumulative: triggering pairing start → end
--   - Roster-level (whole month): 1st of month → last day of month
-- =============================================================================

CREATE TABLE rule_violation (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  crew_id           varchar(20)    NOT NULL,
  pairing_id        bigint,                        -- NULL = roster-level violation
  duty_seq          smallint,                      -- NULL if pairing_id is NULL
  ruleset_id        bigint         NOT NULL,       -- workset id (法规集合 id), default 103
  rule_code         varchar(50)    NOT NULL,       -- specific rule identifier
  scope_key         varchar(40)    NOT NULL DEFAULT '', -- window signature per param row, e.g. '28CD'; '' = single-window rule
  start_dt          timestamptz    NOT NULL,       -- violation window start
  end_dt            timestamptz    NOT NULL,       -- violation window end
  severity          smallint       NOT NULL,       -- 1=INFO 2=WARNING 3=ERROR
  actual_value      numeric,                       -- measured value
  limit_value       numeric,                       -- regulatory/policy limit
  unit              varchar(20),                   -- 'HOUR' / 'DAY' / 'MINUTE' etc.
  message           text           NOT NULL,       -- human-readable violation description
  input_hash        varchar(64),                   -- hash of input for dedup
  computed_at       timestamptz    NOT NULL DEFAULT now(),
  created_by        varchar(50)    NOT NULL DEFAULT 'system',
  created_at        timestamptz    NOT NULL DEFAULT now(),
  updated_by        varchar(50)    NOT NULL DEFAULT 'system',
  updated_at        timestamptz    NOT NULL DEFAULT now(),
  UNIQUE (crew_id, pairing_id, duty_seq, ruleset_id, rule_code)
) PARTITION BY RANGE (start_dt);

CREATE INDEX idx_rv_crew_group_time
  ON rule_violation (crew_id, ruleset_id, start_dt, end_dt);

CREATE INDEX idx_rv_pairing
  ON rule_violation (pairing_id)
  WHERE pairing_id IS NOT NULL;

-- =============================================================================
-- Create initial monthly partitions: 2025-01 through 2026-12 (24 months)
-- =============================================================================

CREATE TABLE rule_violation_2025_01 PARTITION OF rule_violation
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE rule_violation_2025_02 PARTITION OF rule_violation
  FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

CREATE TABLE rule_violation_2025_03 PARTITION OF rule_violation
  FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

CREATE TABLE rule_violation_2025_04 PARTITION OF rule_violation
  FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');

CREATE TABLE rule_violation_2025_05 PARTITION OF rule_violation
  FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');

CREATE TABLE rule_violation_2025_06 PARTITION OF rule_violation
  FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');

CREATE TABLE rule_violation_2025_07 PARTITION OF rule_violation
  FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');

CREATE TABLE rule_violation_2025_08 PARTITION OF rule_violation
  FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');

CREATE TABLE rule_violation_2025_09 PARTITION OF rule_violation
  FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');

CREATE TABLE rule_violation_2025_10 PARTITION OF rule_violation
  FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');

CREATE TABLE rule_violation_2025_11 PARTITION OF rule_violation
  FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

CREATE TABLE rule_violation_2025_12 PARTITION OF rule_violation
  FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

CREATE TABLE rule_violation_2026_01 PARTITION OF rule_violation
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE rule_violation_2026_02 PARTITION OF rule_violation
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE TABLE rule_violation_2026_03 PARTITION OF rule_violation
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE rule_violation_2026_04 PARTITION OF rule_violation
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE rule_violation_2026_05 PARTITION OF rule_violation
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE rule_violation_2026_06 PARTITION OF rule_violation
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE TABLE rule_violation_2026_07 PARTITION OF rule_violation
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE rule_violation_2026_08 PARTITION OF rule_violation
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

CREATE TABLE rule_violation_2026_09 PARTITION OF rule_violation
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

CREATE TABLE rule_violation_2026_10 PARTITION OF rule_violation
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

CREATE TABLE rule_violation_2026_11 PARTITION OF rule_violation
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

CREATE TABLE rule_violation_2026_12 PARTITION OF rule_violation
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
