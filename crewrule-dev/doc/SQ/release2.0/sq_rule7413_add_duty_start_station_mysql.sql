-- 2026/02/18 Rule 7413 (ANR CC Augmented MAX FDP): add table-1 column "DUTY START STATION".
-- Backward compatibility:
--   - Existing rows are migrated from:
--       COMPOSITION,REST FACILITY,HAS SECTOR,SECTOR MIN FLY TIME,MAX FDP
--     to:
--       COMPOSITION,REST FACILITY,DUTY START STATION,HAS SECTOR,SECTOR MIN FLY TIME,MAX FDP
--   - Default value for the new column is '*' (any duty start station).

-- Header: replace with canonical order that includes DUTY START STATION.
UPDATE rule_parameter rp
JOIN rule r ON rp.rule_id = r.id
SET rp.param_values = 'COMPOSITION,REST FACILITY,DUTY START STATION,HAS SECTOR,SECTOR MIN FLY TIME,MAX FDP'
WHERE r.`function` = 7413
  AND rp.param_names IN ('tableHeader', 'table1Header')
  AND UPPER(rp.param_values) NOT LIKE '%DUTY START STATION%';

-- Rows: migrate 5-value rows to 6-value rows by inserting '*' as the third value.
UPDATE rule_parameter rp
JOIN rule r ON rp.rule_id = r.id
SET rp.param_values = CONCAT(
        SUBSTRING_INDEX(rp.param_values, ',', 1), ',',
        SUBSTRING_INDEX(SUBSTRING_INDEX(rp.param_values, ',', 2), ',', -1), ',',
        '*,',
        SUBSTRING_INDEX(SUBSTRING_INDEX(rp.param_values, ',', 3), ',', -1), ',',
        SUBSTRING_INDEX(SUBSTRING_INDEX(rp.param_values, ',', 4), ',', -1), ',',
        SUBSTRING_INDEX(rp.param_values, ',', -1)
    )
WHERE r.`function` = 7413
  AND (rp.param_names LIKE 'tableRow%' OR rp.param_names LIKE 'table1Row%')
  AND (LENGTH(rp.param_values) - LENGTH(REPLACE(rp.param_values, ',', ''))) = 4;

