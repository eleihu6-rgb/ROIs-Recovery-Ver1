-- 2025/11/xx Add FDP parameters USE STICK TIME and MIN CONNECTION TIME (BASIC_DEFINITION 2107)
SET @rp_max_id = (SELECT IFNULL(MAX(id), 0) FROM rule_parameter);
INSERT INTO rule_parameter (id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified)
SELECT @rp_max_id := @rp_max_id + 1, r.id, 1, 'tableRowUseStickTime', CONCAT(r.division, ',USE STICK TIME,N'), NULL, 'ROIS', CURRENT_TIMESTAMP
FROM rule r
WHERE r.`function` = 2107
  AND NOT EXISTS (SELECT 1 FROM rule_parameter rp WHERE rp.rule_id = r.id AND rp.param_values LIKE '%,USE STICK TIME,%');

INSERT INTO rule_parameter (id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified)
SELECT @rp_max_id := @rp_max_id + 1, r.id, 1, 'tableRowMinConnectionTime', CONCAT(r.division, ',MIN CONNECTION TIME,0'), NULL, 'ROIS', CURRENT_TIMESTAMP
FROM rule r
WHERE r.`function` = 2107
  AND NOT EXISTS (SELECT 1 FROM rule_parameter rp WHERE rp.rule_id = r.id AND rp.param_values LIKE '%,MIN CONNECTION TIME,%');

UPDATE rule_parameter rp
JOIN rule r ON rp.rule_id = r.id
SET rp.param_values = CONCAT(r.division, ',USE STICK TIME,Y')
WHERE r.`function` = 2107
  AND r.filiale IN ('SIA', 'SQ')
  AND rp.param_values LIKE '%,USE STICK TIME,%';

UPDATE rule_parameter rp
JOIN rule r ON rp.rule_id = r.id
SET rp.param_values = CONCAT(r.division, ',MIN CONNECTION TIME,55')
WHERE r.`function` = 2107
  AND r.filiale IN ('SIA', 'SQ')
  AND rp.param_values LIKE '%,MIN CONNECTION TIME,%';
