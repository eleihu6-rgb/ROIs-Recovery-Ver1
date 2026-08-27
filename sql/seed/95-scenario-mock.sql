-- =============================================================
-- 95-scenario-mock.sql
-- Scenario module mock data (PO / RO / TO — all statuses)
--
-- Purpose: enable full CRUD flow testing in development
-- Notes:   workset_id range 9001-9012 reserved for mock data
--          cqfset_id uses placeholder value 'DFLT'; ruleset_id omitted (defaults to 103)
--
-- Run (f8 schema):
--   psql "$F8_DSN" -f sql/seed/95-scenario-mock.sql
--
-- Idempotent: ON CONFLICT DO NOTHING
-- Changelog: 2026-04-15 initial version
-- =============================================================

-- ---------------------------------------------------------------
-- Workset records (one per scenario)
-- Uses OVERRIDING SYSTEM VALUE to insert with explicit IDs
-- ---------------------------------------------------------------
INSERT INTO workset (id, created_by, created_at, updated_by, updated_at, filiale, division, name, category, type)
OVERRIDING SYSTEM VALUE VALUES
  (9001, 'demo', NOW(), 'demo', NOW(), 'F8', 'P', 'PO-2026-04 Apr Main Pairing',      'MONTH',   'PO'),
  (9002, 'demo', NOW(), 'demo', NOW(), 'F8', 'P', 'PO-2026-04 B737 Dedicated',        'MONTH',   'PO'),
  (9003, 'demo', NOW(), 'demo', NOW(), 'F8', 'P', 'PO-2026-04 Full Test',             'MONTH',   'PO'),
  (9004, 'demo', NOW(), 'demo', NOW(), 'F8', 'P', 'PO-2026-03 Mar Final',             'MONTH',   'PO'),
  (9005, 'demo', NOW(), 'demo', NOW(), 'F8', 'P', 'PO-2026-04 Apr Retry',             'MONTH',   'PO'),
  (9006, 'demo', NOW(), 'demo', NOW(), 'F8', 'P', 'RO-2026-04 Pilot Assignment',      'MONTH',   'RO'),
  (9007, 'demo', NOW(), 'demo', NOW(), 'F8', 'C', 'RO-2026-04 Cabin Assignment',      'MONTH',   'RO'),
  (9008, 'demo', NOW(), 'demo', NOW(), 'F8', 'A', 'RO-2026-03 Mar Full Assignment',   'MONTH',   'RO'),
  (9009, 'demo', NOW(), 'demo', NOW(), 'F8', 'P', 'RO-2026-04 B737 Pilot Assignment', 'MONTH',   'RO'),
  (9010, 'demo', NOW(), 'demo', NOW(), 'F8', 'P', 'TO-2026-Q2 Annual Recurrent Plan', 'QUARTER', 'TO'),
  (9011, 'demo', NOW(), 'demo', NOW(), 'F8', 'A', 'TO-2026-Q1 Recurrent Completed',   'QUARTER', 'TO'),
  (9012, 'demo', NOW(), 'demo', NOW(), 'F8', 'P', 'TO-2026-04 Urgent Recurrent Opt',  'MONTH',   'TO')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------
-- PO scenarios (pairing optimization)
-- ---------------------------------------------------------------
INSERT INTO scenario (
    workset_id, name, status, file_type,
    str_dt_loc, end_dt_loc, leadin_live, optimized_count,
    cqfset_id, filter_params,
    comments, created_by, updated_by
) VALUES
-- PO-1: draft, not yet run
(9001, 'PO-2026-04 Apr Main Pairing', 'DRAFT', 'PO',
 '2026-04-01 00:00:00+08', '2026-04-30 23:59:59+08', 1, 0,
 'DFLT',
 '{"flightNos":[],"depAirports":["PEK","SHA"],"arrAirports":[],"fleets":["B737","A320"],"flightStatus":"ALL"}',
 'April main pairing initial draft', 'demo', 'demo'),

-- PO-2: draft, with fleet filter
(9002, 'PO-2026-04 B737 Dedicated', 'DRAFT', 'PO',
 '2026-04-01 00:00:00+08', '2026-04-30 23:59:59+08', 1, 0,
 'DFLT',
 '{"flightNos":[],"depAirports":[],"arrAirports":[],"fleets":["B737"],"flightStatus":"SCHEDULED"}',
 'Dedicated pairing for B737 fleet only', 'demo', 'demo'),

-- PO-3: running
(9003, 'PO-2026-04 Full Test', 'RUNNING', 'PO',
 '2026-04-01 00:00:00+08', '2026-04-30 23:59:59+08', 1, 1,
 'DFLT',
 '{"flightNos":[],"depAirports":[],"arrAirports":[],"fleets":[],"flightStatus":"ALL"}',
 'Full-fleet run, estimated 2 hours', 'demo', 'demo'),

-- PO-4: done, with KPIs
(9004, 'PO-2026-03 Mar Final', 'DONE', 'PO',
 '2026-03-01 00:00:00+08', '2026-03-31 23:59:59+08', 1, 3,
 'DFLT',
 '{"flightNos":[],"depAirports":["PEK"],"arrAirports":[],"fleets":["B737","A320","A330"],"flightStatus":"ALL"}',
 'March pairing completed, KPIs excellent', 'demo', 'demo'),

-- PO-5: failed
(9005, 'PO-2026-04 Apr Retry', 'FAILED', 'PO',
 '2026-04-01 00:00:00+08', '2026-04-30 23:59:59+08', 0, 1,
 'DFLT',
 '{}',
 'Failed on first run due to constraint conflict, pending fix', 'demo', 'demo')

ON CONFLICT (workset_id) DO NOTHING;

-- ---------------------------------------------------------------
-- RO scenarios (roster optimization)
-- ---------------------------------------------------------------
INSERT INTO scenario (
    workset_id, name, status, file_type,
    str_dt_loc, end_dt_loc, leadin_live, optimized_count,
    cqfset_id, filter_params,
    comments, created_by, updated_by
) VALUES
-- RO-1: draft (pilots)
(9006, 'RO-2026-04 Pilot Assignment', 'DRAFT', 'RO',
 '2026-04-01 00:00:00+08', '2026-04-30 23:59:59+08', 1, 0,
 'DFLT',
 '{"crew":{"division":"P","bases":["PEK","SHA"],"fleets":["B737","A320"],"status":"ACTIVE"},"pairing":{"bases":[],"fleets":[],"sources":["MANUAL","OPT","IMPORT"]}}',
 'April pilot assignment initial draft', 'demo', 'demo'),

-- RO-2: draft (cabin)
(9007, 'RO-2026-04 Cabin Assignment', 'DRAFT', 'RO',
 '2026-04-01 00:00:00+08', '2026-04-30 23:59:59+08', 1, 0,
 'DFLT',
 '{"crew":{"division":"C","bases":["PEK"],"fleets":[],"status":"ACTIVE"},"pairing":{"bases":["PEK"],"fleets":["B737"],"sources":["MANUAL","OPT"]}}',
 'April cabin crew assignment', 'demo', 'demo'),

-- RO-3: done, with KPIs
(9008, 'RO-2026-03 Mar Full Assignment', 'DONE', 'RO',
 '2026-03-01 00:00:00+08', '2026-03-31 23:59:59+08', 1, 2,
 'DFLT',
 '{"crew":{"division":"ALL","bases":[],"fleets":[],"status":"ACTIVE"},"pairing":{"bases":[],"fleets":[],"sources":["MANUAL","OPT","IMPORT"]}}',
 'March full-crew assignment, published', 'demo', 'demo'),

-- RO-4: running
(9009, 'RO-2026-04 B737 Pilot Assignment', 'RUNNING', 'RO',
 '2026-04-01 00:00:00+08', '2026-04-30 23:59:59+08', 1, 1,
 'DFLT',
 '{"crew":{"division":"P","bases":[],"fleets":["B737"],"status":"ACTIVE"},"pairing":{"bases":[],"fleets":["B737"],"sources":["OPT"]}}',
 'B737 pilot dedicated assignment in progress', 'demo', 'demo')

ON CONFLICT (workset_id) DO NOTHING;

-- ---------------------------------------------------------------
-- TO scenarios (training optimization)
-- ---------------------------------------------------------------
INSERT INTO scenario (
    workset_id, name, status, file_type,
    str_dt_loc, end_dt_loc, leadin_live, optimized_count,
    cqfset_id, filter_params,
    comments, created_by, updated_by
) VALUES
-- TO-1: draft
(9010, 'TO-2026-Q2 Annual Recurrent Plan', 'DRAFT', 'TO',
 '2026-04-01 00:00:00+08', '2026-06-30 23:59:59+08', 0, 0,
 'DFLT',
 '{"crew":{"division":"P","bases":["PEK","SHA","CAN"],"fleets":["B737","A320"],"status":"ACTIVE"},"pairing":{"bases":[],"fleets":[],"sources":["MANUAL","OPT","IMPORT"]},"training":{"courseTypes":["Annual Recurrent","Sim Check"],"expiryFilter":"EXPIRING_90D","priorities":["Urgent","High"]}}',
 'Q2 pilot annual recurrent training plan draft', 'demo', 'demo'),

-- TO-2: done, with KPIs
(9011, 'TO-2026-Q1 Recurrent Completed', 'DONE', 'TO',
 '2026-01-01 00:00:00+08', '2026-03-31 23:59:59+08', 0, 1,
 'DFLT',
 '{"crew":{"division":"ALL","bases":[],"fleets":[],"status":"ACTIVE"},"pairing":{"bases":[],"fleets":[],"sources":["MANUAL","OPT","IMPORT"]},"training":{"courseTypes":["Annual Recurrent"],"expiryFilter":"ALL","priorities":[]}}',
 'Q1 recurrent training completed, coverage 98%', 'demo', 'demo'),

-- TO-3: running
(9012, 'TO-2026-04 Urgent Recurrent Opt', 'RUNNING', 'TO',
 '2026-04-01 00:00:00+08', '2026-04-30 23:59:59+08', 0, 1,
 'DFLT',
 '{"crew":{"division":"P","bases":["PEK"],"fleets":["A330"],"status":"ACTIVE"},"pairing":{"bases":[],"fleets":[],"sources":["MANUAL"]},"training":{"courseTypes":["Sim Check"],"expiryFilter":"EXPIRING_90D","priorities":["Urgent"]}}',
 'A330 pilots with expiring qualifications, optimization in progress', 'demo', 'demo')

ON CONFLICT (workset_id) DO NOTHING;

-- ---------------------------------------------------------------
-- KPI data (for completed scenarios) — stored in scenario_result type='kpi' (JSON array)
-- ---------------------------------------------------------------
-- PO-4 KPIs
INSERT INTO scenario_result (scenario_id, type, json, created_by, updated_by)
SELECT s.id, 'kpi',
  jsonb_build_array(
    jsonb_build_object('id', 1, 'scenarioId', s.id, 'kpiNames', 'Aircraft Utilization', 'kpiValues', '87.3%', 'description', '+2.1% vs baseline', 'idx', 1, 'type', 'UTILIZATION'),
    jsonb_build_object('id', 2, 'scenarioId', s.id, 'kpiNames', 'Deadhead Time', 'kpiValues', '4.2h', 'description', '-0.8h vs baseline', 'idx', 2, 'type', 'COST'),
    jsonb_build_object('id', 3, 'scenarioId', s.id, 'kpiNames', 'Duty Day Variance', 'kpiValues', '1.2d', 'description', 'Crew fairness index', 'idx', 3, 'type', 'FAIRNESS'),
    jsonb_build_object('id', 4, 'scenarioId', s.id, 'kpiNames', 'Total Flight Hours', 'kpiValues', '128,460h', 'description', 'Monthly aggregate', 'idx', 4, 'type', 'UTILIZATION')
  ), 'system', 'system'
FROM scenario s
WHERE s.workset_id = 9004
ON CONFLICT (scenario_id, type) DO NOTHING;

-- RO-3 KPIs
INSERT INTO scenario_result (scenario_id, type, json, created_by, updated_by)
SELECT s.id, 'kpi',
  jsonb_build_array(
    jsonb_build_object('id', 1, 'scenarioId', s.id, 'kpiNames', 'Assignment Coverage', 'kpiValues', '99.2%', 'description', 'Assigned / required pairings', 'idx', 1, 'type', 'UTILIZATION'),
    jsonb_build_object('id', 2, 'scenarioId', s.id, 'kpiNames', 'Avg Monthly FH', 'kpiValues', '72.4h', 'description', 'Per pilot monthly average', 'idx', 2, 'type', 'COST'),
    jsonb_build_object('id', 3, 'scenarioId', s.id, 'kpiNames', 'FH Std Deviation', 'kpiValues', '8.3h', 'description', 'Crew fairness index', 'idx', 3, 'type', 'FAIRNESS'),
    jsonb_build_object('id', 4, 'scenarioId', s.id, 'kpiNames', 'Soft Violations', 'kpiValues', '3', 'description', 'Pending manual review', 'idx', 4, 'type', 'COST')
  ), 'system', 'system'
FROM scenario s
WHERE s.workset_id = 9008
ON CONFLICT (scenario_id, type) DO NOTHING;

-- TO-2 KPIs
INSERT INTO scenario_result (scenario_id, type, json, created_by, updated_by)
SELECT s.id, 'kpi',
  jsonb_build_array(
    jsonb_build_object('id', 1, 'scenarioId', s.id, 'kpiNames', 'Training Coverage', 'kpiValues', '98.4%', 'description', 'Completed / required', 'idx', 1, 'type', 'UTILIZATION'),
    jsonb_build_object('id', 2, 'scenarioId', s.id, 'kpiNames', 'Roster Conflicts', 'kpiValues', '7', 'description', 'Conflicts with flight schedule', 'idx', 2, 'type', 'COST'),
    jsonb_build_object('id', 3, 'scenarioId', s.id, 'kpiNames', 'Training Load Balance', 'kpiValues', '0.87', 'description', 'Crew load balance index', 'idx', 3, 'type', 'FAIRNESS')
  ), 'system', 'system'
FROM scenario s
WHERE s.workset_id = 9011
ON CONFLICT (scenario_id, type) DO NOTHING;
