-- sql/seed/f8/11_connector_sync_dictionary.sql
SET search_path = f8;

INSERT INTO dictionary (parent_code, code, name, code_value, idx, created_by, updated_by)
VALUES
  ('CONNECTOR_SYNC', 'f8_crew_cron',         'F8 Crew Sync Cron',         '0 */4 * * *', 10, 'system', 'system'),
  ('CONNECTOR_SYNC', 'f8_flight_cron',        'F8 Flight Sync Cron',       '0 * * * *',   20, 'system', 'system'),
  ('CONNECTOR_SYNC', 'f8_pairing_cron',       'F8 Pairing Sync Cron',      '0 */2 * * *', 30, 'system', 'system'),
  ('CONNECTOR_SYNC', 'f8_roster_flight_cron', 'F8 Roster Flight Sync Cron','0 * * * *',   40, 'system', 'system')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO UPDATE SET
  name       = EXCLUDED.name,
  code_value = EXCLUDED.code_value,
  idx        = EXCLUDED.idx,
  updated_by = EXCLUDED.updated_by,
  updated_at = now();
