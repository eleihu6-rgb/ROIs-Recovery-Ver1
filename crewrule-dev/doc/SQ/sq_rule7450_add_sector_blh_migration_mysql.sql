-- 2026/03/06 HXCREW-170 [HKA][Rule 7450]
-- Add "Sector BLH Lower/Sector BLH Upper" to SQ rule 7450 table 1.
--
-- Idempotent:
--   - Header is only rewritten when still in old 4-column format.
--   - Rows are only rewritten when still in old 4-value format.
--
-- Optional backup:
-- CREATE TABLE `rule_parameter_backup_7450_blh` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7450_blh`
-- SELECT rp.*
-- FROM `rule_parameter` rp
-- JOIN `rule` r ON r.id = rp.rule_id
-- WHERE r.`function` = 7450;

-- 1) Update table 1 header:
--    COMPOSITION,FDP LOWER,FDP UPPER,MAX SECTORS
-- -> COMPOSITION,SECTOR BLH LOWER,SECTOR BLH UPPER,FDP LOWER,FDP UPPER,MAX SECTORS
UPDATE `rule_parameter` rp
JOIN `rule` r ON r.id = rp.rule_id
SET rp.param_values = 'Composition,Sector BLH Lower,Sector BLH Upper,FDP Lower,FDP Upper,Max Sectors',
    rp.last_modified = CURRENT_TIMESTAMP
WHERE r.`function` = 7450
  AND rp.phase_id = 1
  AND (rp.param_names = 'tableHeader' OR rp.param_names = 'table1Header')
  AND rp.param_values IN ('Composition,FDP Lower,FDP Upper,Max Sectors',
                          'COMPOSITION,FDP LOWER,FDP UPPER,MAX SECTORS');

-- 2) Backfill table 1 rows:
--    COMPOSITION,FDP LOWER,FDP UPPER,MAX SECTORS
-- -> COMPOSITION,*,*,FDP LOWER,FDP UPPER,MAX SECTORS
UPDATE `rule_parameter` rp
JOIN `rule` r ON r.id = rp.rule_id
SET rp.param_values = CONCAT(SUBSTRING_INDEX(rp.param_values, ',', 1), ',*,*,', SUBSTRING_INDEX(rp.param_values, ',', -3)),
    rp.last_modified = CURRENT_TIMESTAMP
WHERE r.`function` = 7450
  AND rp.phase_id = 1
  AND (rp.param_names LIKE 'tableRow%' OR rp.param_names LIKE 'table1Row%')
  AND LENGTH(rp.param_values) - LENGTH(REPLACE(rp.param_values, ',', '')) = 3;
