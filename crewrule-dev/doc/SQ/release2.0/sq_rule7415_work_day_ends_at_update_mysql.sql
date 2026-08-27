-- 2026/02/25 Rule 7415 (ANR Max Consecutive Working Days Between Day Offs):
-- add table-1 column "WORK DAY ENDS AT".
--
-- Backward compatibility:
--   - Header migration:
--       SERVICE TYPE,FLEET GROUP,MAX WORKING DAYS,LAST DAY BUFFER HHMM
--     to:
--       SERVICE TYPE,FLEET GROUP,MAX WORKING DAYS,LAST DAY BUFFER HHMM,WORK DAY ENDS AT
--   - Existing 4-value rows are migrated to 5-value rows by appending:
--       TRANSPORT
--     (default behavior equals previous implementation)

-- Header update: only when WORK DAY ENDS AT is missing.
UPDATE rule_parameter rp
JOIN rule r ON rp.rule_id = r.id
SET rp.param_values =
    'SERVICE TYPE,FLEET GROUP,MAX WORKING DAYS,LAST DAY BUFFER HHMM,WORK DAY ENDS AT'
WHERE r.`function` = 7415
  AND rp.param_names IN ('tableHeader', 'table1Header')
  AND UPPER(rp.param_values) NOT LIKE '%WORK DAY ENDS AT%';

-- Row update: append ",TRANSPORT" for old 4-column rows.
UPDATE rule_parameter rp
JOIN rule r ON rp.rule_id = r.id
SET rp.param_values = CONCAT(rp.param_values, ',TRANSPORT')
WHERE r.`function` = 7415
  AND (rp.param_names LIKE 'tableRow%' OR rp.param_names LIKE 'table1Row%')
  AND (LENGTH(rp.param_values) - LENGTH(REPLACE(rp.param_values, ',', ''))) = 3;

