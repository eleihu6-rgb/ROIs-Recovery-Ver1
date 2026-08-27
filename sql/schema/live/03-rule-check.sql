-- rule_check_result_pairing: Level 1 check results per crew x pairing
CREATE TABLE rule_check_result_pairing (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  crew_id          varchar(30)    NOT NULL,
  pairing_id       bigint         NOT NULL REFERENCES pairing(id),
  ruleset_id       bigint         NOT NULL,        -- workset id (法规集合 id), default 103
  passed_all       boolean        NOT NULL,
  highest_severity smallint       NOT NULL DEFAULT 0,
  check_results    jsonb          NOT NULL DEFAULT '[]',
  calc_results     jsonb          NOT NULL DEFAULT '{}',
  checked_at       timestamptz    NOT NULL DEFAULT now(),
  created_by       varchar(30)    NOT NULL DEFAULT 'system',
  created_at       timestamptz    NOT NULL DEFAULT now(),
  updated_by       varchar(30)    NOT NULL DEFAULT 'system',
  updated_at       timestamptz    NOT NULL DEFAULT now(),
  UNIQUE (crew_id, pairing_id, ruleset_id)
);
CREATE INDEX idx_rcr_pairing_group ON rule_check_result_pairing (pairing_id, ruleset_id);
CREATE INDEX idx_rcr_crew_group ON rule_check_result_pairing (crew_id, ruleset_id, checked_at);

-- rule_check_result_roster: Level 2 check results per crew x month
CREATE TABLE rule_check_result_roster (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  crew_id          varchar(30)    NOT NULL,
  ruleset_id       bigint         NOT NULL,    -- workset id (法规集合 id), default 103
  result_month     char(7)        NOT NULL,   -- 'YYYY-MM'
  passed_all       boolean        NOT NULL,
  highest_severity smallint       NOT NULL DEFAULT 0,
  violations       jsonb          NOT NULL DEFAULT '[]',
  calc_summary     jsonb          NOT NULL DEFAULT '{}',
  checked_at       timestamptz    NOT NULL DEFAULT now(),
  created_by       varchar(30)    NOT NULL DEFAULT 'system',
  created_at       timestamptz    NOT NULL DEFAULT now(),
  updated_by       varchar(30)    NOT NULL DEFAULT 'system',
  updated_at       timestamptz    NOT NULL DEFAULT now(),
  UNIQUE (crew_id, ruleset_id, result_month)
);
CREATE INDEX idx_rcrr_crew_group_month ON rule_check_result_roster (crew_id, ruleset_id, result_month);

-- rule_check_batch_run: progress tracking for bulk checks
CREATE TABLE rule_check_batch_run (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ruleset_id          bigint         NOT NULL,        -- workset id (法规集合 id), default 103
  date_from           date           NOT NULL,
  date_to             date           NOT NULL,
  filiale             varchar(6)     NOT NULL,
  reason              varchar(30)    NOT NULL,
  status              varchar(20)    NOT NULL DEFAULT 'pending',
  total_crew          int            NOT NULL DEFAULT 0,
  processed_crew      int            NOT NULL DEFAULT 0,
  total_pairings      int            NOT NULL DEFAULT 0,
  processed_pairings  int            NOT NULL DEFAULT 0,
  started_at          timestamptz,
  completed_at        timestamptz,
  error_summary       jsonb,
  created_by          varchar(30)    NOT NULL,
  created_at          timestamptz    NOT NULL DEFAULT now(),
  updated_by          varchar(30)    NOT NULL DEFAULT 'system',
  updated_at          timestamptz    NOT NULL DEFAULT now()
);
