-- F8 Manday connector configurations
-- 工时数据接入 — FD（飞行员）和 CC/AM（客舱）各一个独立 connector
-- 注意：endpoint URL 中的 crewMandayFd / crewMandayCcAm 为占位路径，
--       部署前需替换为 F8 提供的正式 API 地址。
-- Pre-requisite: 10_connector_f8.sql already executed (共享 auth_config)

SET search_path = f8;

INSERT INTO connector_config (
  connector_code, connector_name, direction, protocol, data_domain,
  auth_type, auth_config, endpoint_config,
  schedule_cron, transform_plugin,
  is_enabled, is_deleted, created_by, updated_by
) VALUES
-- 5. Manday FD — 飞行员日级工时（前后 30 天滚动，每天凌晨 1:30 执行）
(
  'f8-manday-fd',
  'F8 Manday FD (Pilot)',
  'inbound',
  'f8_import',
  'manday',
  'f8_token',
  jsonb_build_object(
    'tokenUrl', 'https://ceje1h57tg.execute-api.ca-central-1.amazonaws.com/Dev/third/auth/getToken',
    'clientId', 'ROIS',
    'sign',      'f7a2c9e1b4d83f6a0e5c2b7d9f1a4e8c'
  ),
  jsonb_build_object(
    'url',          'https://87kbu8v1m6.execute-api.ca-central-1.amazonaws.com/Dev/rois/out/crewMandayFd',
    'method',       'POST',
    'timeout',      60000,
    'retryCount',   3,
    'retryDelay',   2000,
    'pollBodyDays', 30,
    'chunkDays',    10
  ),
  '30 1 * * *',
  'f8/manday-fd',
  1, 0, 'system', 'system'
),
-- 6. Manday CC/AM — 客舱乘务员日级工时（前后 30 天滚动，每天凌晨 2:00 执行）
(
  'f8-manday-cc-am',
  'F8 Manday CC/AM (Cabin Crew)',
  'inbound',
  'f8_import',
  'manday',
  'f8_token',
  jsonb_build_object(
    'tokenUrl', 'https://ceje1h57tg.execute-api.ca-central-1.amazonaws.com/Dev/third/auth/getToken',
    'clientId', 'ROIS',
    'sign',      'f7a2c9e1b4d83f6a0e5c2b7d9f1a4e8c'
  ),
  jsonb_build_object(
    'url',          'https://87kbu8v1m6.execute-api.ca-central-1.amazonaws.com/Dev/rois/out/crewMandayCcAm',
    'method',       'POST',
    'timeout',      60000,
    'retryCount',   3,
    'retryDelay',   2000,
    'pollBodyDays', 30,
    'chunkDays',    10
  ),
  '0 2 * * *',
  'f8/manday-cc-am',
  1, 0, 'system', 'system'
)
ON CONFLICT (connector_code) DO UPDATE SET
  protocol         = EXCLUDED.protocol,
  endpoint_config  = EXCLUDED.endpoint_config,
  schedule_cron    = EXCLUDED.schedule_cron,
  transform_plugin = EXCLUDED.transform_plugin,
  is_enabled       = EXCLUDED.is_enabled,
  updated_by       = EXCLUDED.updated_by,
  updated_at       = now();
