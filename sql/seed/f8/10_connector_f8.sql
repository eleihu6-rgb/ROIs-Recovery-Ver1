-- F8 Connector configurations
-- Pre-requisite: run connector-server/migrations/001_connector_tables.sql in f8 schema
-- Credentials are dev-environment values; replace in production via environment-specific seed override

SET search_path = f8;

INSERT INTO connector_config (
  connector_code, connector_name, direction, protocol, data_domain,
  auth_type, auth_config, endpoint_config,
  schedule_cron, transform_plugin,
  is_enabled, is_deleted, created_by, updated_by
) VALUES
-- 1. Crew (full pull, no date range, poll every 4 hours)
(
  'f8-crew',
  'F8 Crew Full Pull',
  'inbound',
  'f8_import',
  'crew',
  'f8_token',
  jsonb_build_object(
    'tokenUrl', 'https://ceje1h57tg.execute-api.ca-central-1.amazonaws.com/Dev/third/auth/getToken',
    'clientId', 'ROIS',
    'sign',      'f7a2c9e1b4d83f6a0e5c2b7d9f1a4e8c'
  ),
  jsonb_build_object(
    'url',        'https://87kbu8v1m6.execute-api.ca-central-1.amazonaws.com/Dev/rois/out/crew',
    'method',     'POST',
    'timeout',    60000,
    'retryCount', 3,
    'retryDelay', 2000,
    'chunkDays',  10
  ),
  '0 */4 * * *',
  'f8/crew',
  1, 0, 'system', 'system'
),
-- 2. Flight (next 30 days, poll every hour)
(
  'f8-flight',
  'F8 Flight Schedule Pull',
  'inbound',
  'f8_import',
  'flight',
  'f8_token',
  jsonb_build_object(
    'tokenUrl', 'https://ceje1h57tg.execute-api.ca-central-1.amazonaws.com/Dev/third/auth/getToken',
    'clientId', 'ROIS',
    'sign',      'f7a2c9e1b4d83f6a0e5c2b7d9f1a4e8c'
  ),
  jsonb_build_object(
    'url',        'https://87kbu8v1m6.execute-api.ca-central-1.amazonaws.com/Dev/rois/out/flight',
    'method',     'POST',
    'timeout',    30000,
    'retryCount', 2,
    'retryDelay', 2000,
    'pollBodyDays', 30,
    'chunkDays',  10
  ),
  '0 * * * *',
  'f8/flight',
  1, 0, 'system', 'system'
),
-- 3. Pairing (next 60 days, poll every 2 hours)
(
  'f8-pairing',
  'F8 Pairing Pull',
  'inbound',
  'f8_import',
  'pairing',
  'f8_token',
  jsonb_build_object(
    'tokenUrl', 'https://ceje1h57tg.execute-api.ca-central-1.amazonaws.com/Dev/third/auth/getToken',
    'clientId', 'ROIS',
    'sign',      'f7a2c9e1b4d83f6a0e5c2b7d9f1a4e8c'
  ),
  jsonb_build_object(
    'url',        'https://87kbu8v1m6.execute-api.ca-central-1.amazonaws.com/Dev/rois/out/pairing',
    'method',     'POST',
    'timeout',    30000,
    'retryCount', 2,
    'retryDelay', 2000,
    'pollBodyDays', 60,
    'chunkDays',  10
  ),
  '0 */2 * * *',
  'f8/pairing',
  1, 0, 'system', 'system'
),
-- 4. Roster-Flight (next 30 days, poll every hour)
(
  'f8-roster-flight',
  'F8 Roster Flight Pull',
  'inbound',
  'f8_import',
  'roster',
  'f8_token',
  jsonb_build_object(
    'tokenUrl', 'https://ceje1h57tg.execute-api.ca-central-1.amazonaws.com/Dev/third/auth/getToken',
    'clientId', 'ROIS',
    'sign',      'f7a2c9e1b4d83f6a0e5c2b7d9f1a4e8c'
  ),
  jsonb_build_object(
    'url',            'https://87kbu8v1m6.execute-api.ca-central-1.amazonaws.com/Dev/rois/out/rosterFlight',
    'method',         'POST',
    'timeout',        30000,
    'retryCount',     2,
    'retryDelay',     2000,
    'pollBodyDays',   30,
    'chunkDays',      10,
    'rosterGroundUrl','https://87kbu8v1m6.execute-api.ca-central-1.amazonaws.com/Dev/rois/out/rosterGround'
  ),
  '0 * * * *',
  'f8/roster-flight',
  1, 0, 'system', 'system'
),
-- 5. Roster Publish outbound callback (live-server publish batches -> F8)
(
  'f8-roster-publish-outbound',
  'F8 Roster Publish Outbound Callback',
  'outbound',
  'push_outbound',
  'roster',
  'f8_token',
  jsonb_build_object(
    'tokenUrl', 'https://ceje1h57tg.execute-api.ca-central-1.amazonaws.com/Dev/third/auth/getToken',
    'clientId', 'ROIS',
    'sign',      'f7a2c9e1b4d83f6a0e5c2b7d9f1a4e8c'
  ),
  jsonb_build_object(
    'url',        'https://87kbu8v1m6.execute-api.ca-central-1.amazonaws.com/Dev/rois/in/rosterFlight',
    'method',     'POST',
    'timeout',    30000,
    'retryCount', 0
  ),
  null,
  'default',
  1, 0, 'system', 'system'
)
ON CONFLICT (connector_code) DO UPDATE SET
  direction        = EXCLUDED.direction,
  protocol         = EXCLUDED.protocol,
  data_domain      = EXCLUDED.data_domain,
  auth_type        = EXCLUDED.auth_type,
  auth_config      = case
                       when connector_config.connector_code = 'f8-roster-publish-outbound'
                         then EXCLUDED.auth_config
                       else connector_config.auth_config
                     end,
  endpoint_config  = EXCLUDED.endpoint_config,
  schedule_cron    = EXCLUDED.schedule_cron,
  transform_plugin = EXCLUDED.transform_plugin,
  is_enabled       = EXCLUDED.is_enabled,
  updated_by       = EXCLUDED.updated_by,
  updated_at       = now();
