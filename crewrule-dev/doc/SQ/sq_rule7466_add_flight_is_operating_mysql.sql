-- 7466 update: add "Flight Is Operating" column in table1
-- New column position: after "Flight Numbers"
-- Default value for existing rows: *
--
-- Optional backup:
-- CREATE TABLE rule_parameter_backup_7466_add_flight_operating LIKE rule_parameter;
-- INSERT INTO rule_parameter_backup_7466_add_flight_operating
-- SELECT rp.*
-- FROM rule_parameter rp
-- JOIN rule r ON r.id = rp.rule_id
-- WHERE r.function = 7466;

START TRANSACTION;

-- Update table1 header text (old schema -> new schema)
UPDATE rule_parameter rp
JOIN rule r ON r.id = rp.rule_id
SET rp.param_values = 'Slip Station,Slip Arr Is Operating,Slip Dep Is Operating,Slip Local Night Range,COP Start DOW,Flight Numbers,Flight Is Operating,Period Start Date,Period End Date,Extra Days Off'
WHERE r.function = 7466
  AND rp.param_names = 'table1Header'
  AND rp.param_values = 'Slip Station,Slip Arr Is Operating,Slip Dep Is Operating,Slip Local Night Range,COP Start DOW,Flight Numbers,Period Start Date,Period End Date,Extra Days Off';

-- Insert default "*" after the 6th token (Flight Numbers) for old table1 rows.
-- Applies only to old format rows with 9 tokens (8 commas).
UPDATE rule_parameter rp
JOIN rule r ON r.id = rp.rule_id
SET rp.param_values = CONCAT(
        SUBSTRING_INDEX(rp.param_values, ',', 6),
        ',*,',
        SUBSTRING(rp.param_values, LENGTH(SUBSTRING_INDEX(rp.param_values, ',', 6)) + 2)
    )
WHERE r.function = 7466
  AND rp.param_names LIKE 'table1Row%'
  AND (LENGTH(rp.param_values) - LENGTH(REPLACE(rp.param_values, ',', ''))) = 8;

COMMIT;
