-- connector-server 测试账号配置
-- 在 f8 schema 下执行: psql -d rois -U f8 -f test-connectors.sql

-- 测试账号信息:
-- API Key: f8-test-api-key
-- API Secret: f8-test-secret-2026

-- 测试入向连接器（航班推送）
INSERT INTO connector_config (
  connector_code,
  connector_name,
  direction,
  protocol,
  data_domain,
  auth_type,
  auth_config,
  endpoint_config,
  transform_plugin,
  is_enabled,
  created_by,
  updated_by
) VALUES (
  'f8-flight-test',
  'F8 航班推送测试',
  'inbound',
  'push_inbound',
  'flight',
  'api_key',
  '{"apiKey": "f8-test-api-key", "apiSecret": "f8-test-secret-2026"}',
  '{"url": "", "timeout": 30000}',
  NULL,
  1,
  'system',
  'system'
) ON CONFLICT (connector_code) DO UPDATE SET
  auth_config = '{"apiKey": "f8-test-api-key", "apiSecret": "f8-test-secret-2026"}',
  is_enabled = 1;

-- 测试入向连接器（机组推送）
INSERT INTO connector_config (
  connector_code,
  connector_name,
  direction,
  protocol,
  data_domain,
  auth_type,
  auth_config,
  endpoint_config,
  transform_plugin,
  is_enabled,
  created_by,
  updated_by
) VALUES (
  'f8-crew-test',
  'F8 机组推送测试',
  'inbound',
  'push_inbound',
  'crew',
  'api_key',
  '{"apiKey": "f8-test-api-key", "apiSecret": "f8-test-secret-2026"}',
  '{"url": "", "timeout": 30000}',
  NULL,
  1,
  'system',
  'system'
) ON CONFLICT (connector_code) DO UPDATE SET
  auth_config = '{"apiKey": "f8-test-api-key", "apiSecret": "f8-test-secret-2026"}',
  is_enabled = 1;

-- 测试出向连接器（排班查询）
INSERT INTO connector_config (
  connector_code,
  connector_name,
  direction,
  protocol,
  data_domain,
  auth_type,
  auth_config,
  endpoint_config,
  transform_plugin,
  is_enabled,
  created_by,
  updated_by
) VALUES (
  'f8-roster-query-test',
  'F8 排班查询测试',
  'outbound',
  'query_outbound',
  'roster',
  'api_key',
  '{"apiKey": "f8-test-api-key", "apiSecret": "f8-test-secret-2026"}',
  '{"url": "", "timeout": 30000}',
  NULL,
  1,
  'system',
  'system'
) ON CONFLICT (connector_code) DO UPDATE SET
  auth_config = '{"apiKey": "f8-test-api-key", "apiSecret": "f8-test-secret-2026"}',
  is_enabled = 1;

-- 查看配置结果
SELECT connector_code, connector_name, direction, protocol, data_domain, is_enabled
FROM connector_config
WHERE connector_code LIKE 'f8-%test';