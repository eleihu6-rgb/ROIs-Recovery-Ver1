-- connector_config and connector_log tables
-- Run this migration in each airline schema (f8, tg, etc.)

-- connector_config: 连接器注册表
CREATE TABLE IF NOT EXISTS connector_config (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  connector_code    varchar(50)  NOT NULL UNIQUE,
  connector_name    varchar(100) NOT NULL,
  direction         varchar(20)  NOT NULL,  -- inbound | outbound
  protocol          varchar(20)  NOT NULL,  -- poll_inbound | push_inbound | push_outbound | query_outbound
  data_domain       varchar(20)  NOT NULL,  -- flight | crew | roster
  auth_type         varchar(20)  NOT NULL,  -- api_key | oauth2_cc
  auth_config       jsonb        NOT NULL,  -- key/secret/token_url etc (encrypted)
  endpoint_config   jsonb        NOT NULL,  -- url, headers, timeout
  schedule_cron     varchar(50),            -- only for poll_inbound
  transform_plugin  varchar(100),           -- optional airline-specific transform
  is_enabled        smallint     NOT NULL DEFAULT 1,
  is_deleted        smallint     NOT NULL DEFAULT 0,
  created_by        varchar(50)  NOT NULL,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_by        varchar(50)  NOT NULL,
  updated_at        timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE connector_config IS 'Connector configuration for external system integration';
COMMENT ON COLUMN connector_config.direction IS 'inbound: receive data, outbound: send data';
COMMENT ON COLUMN connector_config.protocol IS 'poll_inbound: we poll external API, push_inbound: external pushes to us, push_outbound: we push to external, query_outbound: external queries us';
COMMENT ON COLUMN connector_config.auth_config IS 'Authentication config (api_key+secret or oauth2 client credentials), sensitive fields encrypted';

-- connector_log: 执行日志
CREATE TABLE IF NOT EXISTS connector_log (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  connector_id     bigint       NOT NULL REFERENCES connector_config(id),
  direction        varchar(20)  NOT NULL,
  status           varchar(20)  NOT NULL,  -- success | fail | partial
  records_in       int          NOT NULL DEFAULT 0,
  records_out      int          NOT NULL DEFAULT 0,
  error_message    text,
  duration_ms      int,
  executed_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_connector_log_executed_at ON connector_log(executed_at);

COMMENT ON TABLE connector_log IS 'Execution log for connector runs';
COMMENT ON COLUMN connector_log.status IS 'success: all records processed, fail: error occurred, partial: some records failed';

-- Notes:
-- 1. Logs are retained for 30 days (cleanup via external cron job)
-- 2. auth_config sensitive fields (apiSecret, clientSecret) should be encrypted at application layer
-- 3. Run this migration in each airline schema after schema creation