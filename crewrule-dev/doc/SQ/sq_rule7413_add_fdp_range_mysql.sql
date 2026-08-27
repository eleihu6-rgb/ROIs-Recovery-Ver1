-- 2026/03/05 Rule 7413 (ANR CC Augmented MAX FDP): add table-1 column "FDP RANGE".
-- Desired column order:
--   COMPOSITION,REST FACILITY,FDP RANGE,DUTY START STATION,HAS SECTOR,SECTOR MIN FLY TIME,MAX FDP
--
-- Backward compatibility:
-- 1) Legacy 5-value rows:
--      COMPOSITION,REST FACILITY,HAS SECTOR,SECTOR MIN FLY TIME,MAX FDP
--    -> COMPOSITION,REST FACILITY,*,*,HAS SECTOR,SECTOR MIN FLY TIME,MAX FDP
--
-- 2) Existing 6-value rows (already have DUTY START STATION):
--      COMPOSITION,REST FACILITY,DUTY START STATION,HAS SECTOR,SECTOR MIN FLY TIME,MAX FDP
--    -> COMPOSITION,REST FACILITY,*,DUTY START STATION,HAS SECTOR,SECTOR MIN FLY TIME,MAX FDP
--
-- Default for new FDP RANGE is '*', preserving previous behavior.

-- Header: replace with canonical order that includes FDP RANGE.
UPDATE rule_parameter rp
JOIN rule r ON rp.rule_id = r.id
SET rp.param_values = 'COMPOSITION,REST FACILITY,FDP RANGE,DUTY START STATION,HAS SECTOR,SECTOR MIN FLY TIME,MAX FDP'
WHERE r.`function` = 7413
  AND rp.param_names IN ('tableHeader', 'table1Header')
  AND UPPER(rp.param_values) NOT LIKE '%FDP RANGE%';

-- Rows: migrate 5-value rows -> 7-value rows by inserting "*,*" after REST FACILITY.
UPDATE rule_parameter rp
JOIN rule r ON rp.rule_id = r.id
SET rp.param_values = CONCAT(
        SUBSTRING_INDEX(rp.param_values, ',', 1), ',',
        SUBSTRING_INDEX(SUBSTRING_INDEX(rp.param_values, ',', 2), ',', -1), ',',
        '*,*,',
        SUBSTRING_INDEX(SUBSTRING_INDEX(rp.param_values, ',', 3), ',', -1), ',',
        SUBSTRING_INDEX(SUBSTRING_INDEX(rp.param_values, ',', 4), ',', -1), ',',
        SUBSTRING_INDEX(rp.param_values, ',', -1)
    )
WHERE r.`function` = 7413
  AND (rp.param_names LIKE 'tableRow%' OR rp.param_names LIKE 'table1Row%')
  AND (LENGTH(rp.param_values) - LENGTH(REPLACE(rp.param_values, ',', ''))) = 4;

-- Rows: migrate 6-value rows -> 7-value rows by inserting "*" after REST FACILITY.
UPDATE rule_parameter rp
JOIN rule r ON rp.rule_id = r.id
SET rp.param_values = CONCAT(
        SUBSTRING_INDEX(rp.param_values, ',', 1), ',',
        SUBSTRING_INDEX(SUBSTRING_INDEX(rp.param_values, ',', 2), ',', -1), ',',
        '*,',
        SUBSTRING_INDEX(SUBSTRING_INDEX(rp.param_values, ',', 3), ',', -1), ',',
        SUBSTRING_INDEX(SUBSTRING_INDEX(rp.param_values, ',', 4), ',', -1), ',',
        SUBSTRING_INDEX(SUBSTRING_INDEX(rp.param_values, ',', 5), ',', -1), ',',
        SUBSTRING_INDEX(rp.param_values, ',', -1)
    )
WHERE r.`function` = 7413
  AND (rp.param_names LIKE 'tableRow%' OR rp.param_names LIKE 'table1Row%')
  AND (LENGTH(rp.param_values) - LENGTH(REPLACE(rp.param_values, ',', ''))) = 5;

