-- Rule 7412 migration: prepend CURRENT/NEXT DUTY PATTERN columns for table 1.
-- Idempotent:
--   - Header is only rewritten when missing the new prefix.
--   - Rows are only rewritten when they do not already start with "*,*,".

-- Optional backup:
-- CREATE TABLE `rule_parameter_backup_7412_pattern` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7412_pattern`
-- SELECT rp.*
-- FROM `rule_parameter` rp
-- JOIN `rule` r ON r.id = rp.rule_id
-- WHERE r.`function` = 7412;

-- 1) Update table1 header
UPDATE `rule_parameter` rp
JOIN `rule` r ON r.id = rp.rule_id
SET rp.param_values = CONCAT(
        'CURRENT DUTY PATTERN,NEXT DUTY PATTERN,',
        rp.param_values
    ),
    rp.last_modified = CURRENT_TIMESTAMP
WHERE r.`function` = 7412
  AND rp.phase_id = 1
  AND (rp.param_names = 'table1Header' OR rp.param_names = 'tableHeader')
  AND rp.param_values NOT LIKE 'CURRENT DUTY PATTERN,NEXT DUTY PATTERN,%';

-- 2) Update table1 data rows (default both new columns to '*' for backward-compatible behavior)
UPDATE `rule_parameter` rp
JOIN `rule` r ON r.id = rp.rule_id
SET rp.param_values = CONCAT('*,*,', rp.param_values),
    rp.last_modified = CURRENT_TIMESTAMP
WHERE r.`function` = 7412
  AND rp.phase_id = 1
  AND (rp.param_names LIKE 'table1Row%' OR rp.param_names LIKE 'tableRow%')
  AND rp.param_values NOT LIKE '*,*,%';
