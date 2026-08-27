-- Rule 7400 migration: add optional output-state columns
--   ACC STATE CURRENT TZ
--   ACC STATE PREV TZ
-- Backward-compatible defaults:
--   CURRENT TZ -> A
--   PREV TZ    -> B

-- Header: append the two new columns.
UPDATE rule_parameter rp
JOIN rule r ON rp.rule_id = r.id
SET rp.param_values = CONCAT(rp.param_values, ',ACC STATE CURRENT TZ,ACC STATE PREV TZ'),
    rp.last_modified = CURRENT_TIMESTAMP
WHERE r.`function` = 7400
  AND rp.phase_id = 1
  AND (rp.param_names = 'tableHeader' OR rp.param_names = 'table1Header')
  AND UPPER(rp.param_values) NOT LIKE '%ACC STATE CURRENT TZ%';

-- Rows: append backward-compatible defaults A,B when the row is two columns shorter than the header.
UPDATE rule_parameter rowp
JOIN rule r ON rowp.rule_id = r.id
JOIN rule_parameter headp
  ON headp.rule_id = rowp.rule_id
 AND headp.phase_id = rowp.phase_id
 AND (headp.param_names = 'tableHeader' OR headp.param_names = 'table1Header')
SET rowp.param_values = CONCAT(rowp.param_values, ',A,B'),
    rowp.last_modified = CURRENT_TIMESTAMP
WHERE r.`function` = 7400
  AND rowp.phase_id = 1
  AND (rowp.param_names LIKE 'tableRow%' OR rowp.param_names LIKE 'table1Row%')
  AND UPPER(headp.param_values) LIKE '%ACC STATE CURRENT TZ%'
  AND (LENGTH(rowp.param_values) - LENGTH(REPLACE(rowp.param_values, ',', '')))
      = (LENGTH(headp.param_values) - LENGTH(REPLACE(headp.param_values, ',', '')) - 2);
