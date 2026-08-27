-- 2025/11/xx Add FDP parameters USE STICK TIME and MIN CONNECTION TIME (BASIC_DEFINITION 2107)
INSERT INTO rule_parameter (id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified)
SELECT (SELECT NVL(MAX(id), 0) FROM rule_parameter) + ROWNUM,
       r.id,
       1,
       'tableRowUseStickTime',
       r.division || ',USE STICK TIME,N',
       NULL,
       'ROIS',
       CURRENT_TIMESTAMP
FROM rule r
WHERE r.function = 2107
  AND NOT EXISTS (SELECT 1 FROM rule_parameter rp WHERE rp.rule_id = r.id AND rp.param_values LIKE '%,USE STICK TIME,%');

INSERT INTO rule_parameter (id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified)
SELECT (SELECT NVL(MAX(id), 0) FROM rule_parameter) + ROWNUM,
       r.id,
       1,
       'tableRowMinConnectionTime',
       r.division || ',MIN CONNECTION TIME,0',
       NULL,
       'ROIS',
       CURRENT_TIMESTAMP
FROM rule r
WHERE r.function = 2107
  AND NOT EXISTS (SELECT 1 FROM rule_parameter rp WHERE rp.rule_id = r.id AND rp.param_values LIKE '%,MIN CONNECTION TIME,%');

UPDATE rule_parameter rp
SET rp.param_values = (SELECT r.division || ',USE STICK TIME,Y' FROM rule r WHERE r.id = rp.rule_id)
WHERE EXISTS (SELECT 1 FROM rule r WHERE r.id = rp.rule_id AND r.function = 2107 AND r.filiale IN ('SIA', 'SQ'))
  AND rp.param_values LIKE '%,USE STICK TIME,%';

UPDATE rule_parameter rp
SET rp.param_values = (SELECT r.division || ',MIN CONNECTION TIME,55' FROM rule r WHERE r.id = rp.rule_id)
WHERE EXISTS (SELECT 1 FROM rule r WHERE r.id = rp.rule_id AND r.function = 2107 AND r.filiale IN ('SIA', 'SQ'))
  AND rp.param_values LIKE '%,MIN CONNECTION TIME,%';
