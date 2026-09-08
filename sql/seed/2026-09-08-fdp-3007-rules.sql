-- =============================================================
-- 2026-09-08-fdp-3007-rules.sql
-- Wildcard seed for 2107 BASIC_DEFINITION, 3010 CHECK_IN_OUT, 2102
-- MAX_TRANSIT / long-transit, and 3007 MAX FDP PER DUTY.
--
-- Idempotent on (function, instance) / (workset_id, rule_id). Does NOT
-- rewrite existing live F8 3007 rows that already have non-wildcard
-- values — this seed is only for the new/minimal ruleset (worksets 103
-- and 433) when those function ids are absent.
--
-- rule.rule_id = function*1000 + instance:
--   2107001, 3010001, 2102001, 3007001
-- Identity PKs are left to GENERATED ALWAYS AS IDENTITY.
-- =============================================================

INSERT INTO rule (created_by, created_at, updated_by, updated_at, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, exception_code, rule_id, param_json)
SELECT 'system', now(), 'system', now(), 2107, '001', 'B', 'FDP Basic Definition', 'ROIs', 'Definition', 'Table', 'Company', 'FDP Basic Definition (2107)', 'S', 1, 'F8', 'P', 'S', '1', '', 2107001,
   '{"tables":[{"header":["DEFINITION","DIVISION","VALUE"],"rows":[["INCLUDE CHECK IN","*","Y"],["INCLUDE CHECK OUT","*","N"],["IS PICKUP COUNT","*","N"],["IS DROPOFF COUNT","*","N"],["IS PRE-FERRY COUNT","*","N"],["IS POST-FERRY COUNT","*","N"],["INCLUDE LT CHECK IN","*","Y"],["INCLUDE LT CHECK OUT","*","Y"],["IS LT PICKUP COUNT","*","N"],["IS LT DROPOFF COUNT","*","N"],["INCLUDE BREAK","*","N"],["USE STICK TIME","*","N"],["FIXED EXTENSTION","*","0"],["FIXED BEFORE EXTENSTION","*","0"],["MIN CONNECTION TIME","*","0"],["IS PRE-CSB COUNT","*","N"],["IS POST-CSB COUNT","*","N"],["IS PRE-GROUND COUNT","*","N"],["IS POST-GROUND COUNT","*","N"],["IS PRE-STAY COUNT","*","N"],["IS POST-STAY COUNT","*","N"],["IS PRE-HSB COUNT","*","N"],["IS POST-HSB COUNT","*","N"]]}]}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM rule WHERE rule_id = 2107001);

INSERT INTO rule (created_by, created_at, updated_by, updated_at, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, exception_code, rule_id, param_json)
SELECT 'system', now(), 'system', now(), 3010, '001', 'B', 'Check In / Check Out', 'ROIs', 'Definition', 'Table', 'Company', 'Duty BRIEF/DEBRIEF minutes when nodes are missing', 'S', 1, 'F8', 'P', 'S', '1', '', 3010001,
   '{"tables":[{"header":["BRIEF","DEBRIEF","AIRPORT","FLEET","FLT NUM"],"rows":[["60","15","*","*","*"]]}]}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM rule WHERE rule_id = 3010001);

INSERT INTO rule (created_by, created_at, updated_by, updated_at, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, exception_code, rule_id, param_json)
SELECT 'system', now(), 'system', now(), 2102, '001', 'B', 'Long Transit Limitation', 'ROIs', 'Definition', 'Table', 'Company', 'Long transit / split-duty FDP (2102)', 'S', 1, 'F8', 'P', 'S', '1', '', 2102001,
   '{"tables":[{"header":["INBOUND","OUTBOUND","AIRPORT","FLEETS","MAX TURNTIME","PSEUDO BRIEF","PSEUDO DEBRIEF","PSEUDO PICK UP","PSEUDO DROP OFF","IS SPLIT DUTY"],"rows":[["*","*","*","*","02:00","00:20","00:15","00:00","00:00","Y"]]}]}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM rule WHERE rule_id = 2102001);

INSERT INTO rule (created_by, created_at, updated_by, updated_at, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, exception_code, rule_id, param_json)
SELECT 'system', now(), 'system', now(), 3007, '001', 'R', 'Max FDP Per Duty', 'ROIs', 'Duty', 'Table', 'Company', 'Maximum flight duty period per duty', 'S', 1, 'F8', 'P', 'S', '1', '', 3007001,
   '{"tables":[{"header":["COMPOSITION","RPT START","RPT END","LANDING LOWER","LANDINGS UPPER","REST FACILITY","MAX FDP","MAX EXTENSION","ISAUGMENT","DEPARTURE START","DEPARTURE END","DUTY TYPE","DUTY FLEET","LT REST THREADHOLD","LT REST RATIO","EXTENSION TS FLAGS","AT BASE FDP EXTENSION","OUT OF BASE FDP EXTENSION","LEG SCH BLH START","LEG SCH BLH END"],"rows":[["*","00:00","23:59","0","99","*","16:00","","N","00:00","23:59","*","*","","","*","00:00","00:00","*","*"]]}]}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM rule WHERE rule_id = 3007001);

INSERT INTO rule_set (created_by, created_at, updated_by, updated_at, workset_id, rule_id)
SELECT 'system', now(), 'system', now(), 103, 2107001
WHERE NOT EXISTS (SELECT 1 FROM rule_set WHERE workset_id = 103 AND rule_id = 2107001);

INSERT INTO rule_set (created_by, created_at, updated_by, updated_at, workset_id, rule_id)
SELECT 'system', now(), 'system', now(), 103, 3010001
WHERE NOT EXISTS (SELECT 1 FROM rule_set WHERE workset_id = 103 AND rule_id = 3010001);

INSERT INTO rule_set (created_by, created_at, updated_by, updated_at, workset_id, rule_id)
SELECT 'system', now(), 'system', now(), 103, 2102001
WHERE NOT EXISTS (SELECT 1 FROM rule_set WHERE workset_id = 103 AND rule_id = 2102001);

INSERT INTO rule_set (created_by, created_at, updated_by, updated_at, workset_id, rule_id)
SELECT 'system', now(), 'system', now(), 103, 3007001
WHERE NOT EXISTS (SELECT 1 FROM rule_set WHERE workset_id = 103 AND rule_id = 3007001);

INSERT INTO rule_set (created_by, created_at, updated_by, updated_at, workset_id, rule_id)
SELECT 'system', now(), 'system', now(), 433, 2107001
WHERE NOT EXISTS (SELECT 1 FROM rule_set WHERE workset_id = 433 AND rule_id = 2107001);

INSERT INTO rule_set (created_by, created_at, updated_by, updated_at, workset_id, rule_id)
SELECT 'system', now(), 'system', now(), 433, 3010001
WHERE NOT EXISTS (SELECT 1 FROM rule_set WHERE workset_id = 433 AND rule_id = 3010001);

INSERT INTO rule_set (created_by, created_at, updated_by, updated_at, workset_id, rule_id)
SELECT 'system', now(), 'system', now(), 433, 2102001
WHERE NOT EXISTS (SELECT 1 FROM rule_set WHERE workset_id = 433 AND rule_id = 2102001);

INSERT INTO rule_set (created_by, created_at, updated_by, updated_at, workset_id, rule_id)
SELECT 'system', now(), 'system', now(), 433, 3007001
WHERE NOT EXISTS (SELECT 1 FROM rule_set WHERE workset_id = 433 AND rule_id = 3007001);

-- Bind to every existing RULE workset (recovery DBs may only have workset 1, not 103/433).
INSERT INTO rule_set (created_by, created_at, updated_by, updated_at, workset_id, rule_id)
SELECT 'system', now(), 'system', now(), w.id, v.rule_id
  FROM workset w
  CROSS JOIN (VALUES (2107001), (3010001), (2102001), (3007001)) AS v(rule_id)
 WHERE (coalesce(w.category, 'RULE') = 'RULE' OR w.id IN (1, 103, 433))
   AND NOT EXISTS (
     SELECT 1 FROM rule_set rs WHERE rs.workset_id = w.id AND rs.rule_id = v.rule_id
   );
