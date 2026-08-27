-- 7466 migration: old single-table parameters -> new multi-table parameters
-- Assumptions:
--   - Old table values are comma-separated:
--     COP Length Range, Flight Numbers, Period Start Date, Period End Date, Do Starts After, Extra Days Off
--   - New table1 values:
--     Slip Station, Slip Arr Is Operating, Slip Dep Is Operating, Slip Local Night Range,
--     COP Start DOW, Flight Numbers, Flight Is Operating, Period Start Date, Period End Date, Extra Days Off
--   - Map COP Length Range -> COP Start DOW to preserve existing numeric ranges.
--   - Default Slip fields to "*" and Slip Local Night Range to "0-99".
--   - Table2 DO STARTS AFTER uses DEBRIEF if any old row had DEBRIEF/DEBRIEFING; otherwise TRANSPORT.
--
-- NOTE: Use this in a transaction; review row counts before COMMIT.

START TRANSACTION;

-- Optional backup
-- CREATE TABLE rule_parameter_backup_7466 LIKE rule_parameter;
-- INSERT INTO rule_parameter_backup_7466 SELECT * FROM rule_parameter WHERE rule_id BETWEEN 7466001 AND 7466999;

-- Ensure rule uses MultiTable store structure
UPDATE rule
SET store_structure = 'MultiTable'
WHERE function = 7466;

-- Determine control DO STARTS AFTER from existing rows (before row rewrite)
SET @do_after :=
(
    SELECT CASE
               WHEN SUM(
                    UPPER(SUBSTRING_INDEX(SUBSTRING_INDEX(param_values, ',', 5), ',', -1)) IN ('DEBRIEF', 'DEBRIEFING')
               ) > 0
               THEN 'DEBRIEF'
               ELSE 'TRANSPORT'
           END
    FROM rule_parameter
    WHERE rule_id = 7466001
      AND param_names LIKE 'tableRow%'
);

-- Update header row to table1Header + new header list
UPDATE rule_parameter
SET param_names = 'table1Header',
    param_values = 'Slip Station,Slip Arr Is Operating,Slip Dep Is Operating,Slip Local Night Range,COP Start DOW,Flight Numbers,Flight Is Operating,Period Start Date,Period End Date,Extra Days Off'
WHERE rule_id = 7466001
  AND param_names = 'tableHeader';

-- Rename tableRowX -> table1RowX
UPDATE rule_parameter
SET param_names = CONCAT('table1Row', SUBSTRING(param_names, LENGTH('tableRow') + 1))
WHERE rule_id = 7466001
  AND param_names LIKE 'tableRow%';

-- Rewrite row values to new schema
UPDATE rule_parameter
SET param_values = CONCAT(
        '*,*,*,0-99,',
        SUBSTRING_INDEX(param_values, ',', 1), ',',
        SUBSTRING_INDEX(SUBSTRING_INDEX(param_values, ',', 2), ',', -1), ',',
        '*,',
        SUBSTRING_INDEX(SUBSTRING_INDEX(param_values, ',', 3), ',', -1), ',',
        SUBSTRING_INDEX(SUBSTRING_INDEX(param_values, ',', 4), ',', -1), ',',
        SUBSTRING_INDEX(SUBSTRING_INDEX(param_values, ',', 6), ',', -1)
    )
WHERE rule_id = 7466001
  AND param_names LIKE 'table1Row%';

-- Insert table2 header/row if missing
SET @next_id := (SELECT COALESCE(MAX(id), 0) + 1 FROM rule_parameter);
INSERT INTO rule_parameter (id, rule_id, phase_id, param_names, param_values, modified_by, last_modified)
SELECT @next_id, 7466001, 1,
       'table2Header',
       'Sby Reduces Rest and LN,Rest Starts After,Standby Assignments,Do Starts After',
       'ROIS', CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM rule_parameter WHERE rule_id = 7466001 AND param_names = 'table2Header'
);

SET @next_id := (SELECT COALESCE(MAX(id), 0) + 1 FROM rule_parameter);
INSERT INTO rule_parameter (id, rule_id, phase_id, param_names, param_values, modified_by, last_modified)
SELECT @next_id, 7466001, 1,
       'table2Row1',
       CONCAT('Y,TRANSPORT,SBY,', @do_after),
       'ROIS', CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM rule_parameter WHERE rule_id = 7466001 AND param_names = 'table2Row1'
);

COMMIT;
