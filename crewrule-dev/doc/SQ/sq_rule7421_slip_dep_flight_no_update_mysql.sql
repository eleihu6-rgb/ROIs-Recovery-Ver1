-- 2026/06/05 Add "Slip Dep Flight No" to rule 7421 (Table 1).
--
-- Current database example:
--   - JsonTestTool/data/inbox/roster/20260604_115654_860_loadScenario.data.txt
--   - Existing 7421 table1Header rows currently end with:
--       ...,DO after duty,Extra Condition,Slip Arr Flight No
--
-- Purpose:
--   - Support flight-number-specific exception filtering on the slip-depart duty.
--   - Accepted formats in parameter value:
--       1) SQ865   (airline + flight number)
--       2) 865/866 (flight numbers only, airline inferred from scenario.airline)
--
-- Migration behavior:
--   1) Append header column "Slip Dep Flight No" for all 7421 table1Header rows when missing.
--   2) Append default "*" for table1Row rows where column count is one less than header.
--
-- Idempotent: safe to run multiple times.

UPDATE rule_parameter rp
JOIN rule r ON r.id = rp.rule_id
SET rp.param_values = CONCAT(rp.param_values, ',Slip Dep Flight No')
WHERE r.`function` = 7421
  AND rp.param_names = 'table1Header'
  AND rp.param_values NOT LIKE '%Slip Dep Flight No%';

UPDATE rule_parameter rp
JOIN rule r ON r.id = rp.rule_id
JOIN rule_parameter hdr
  ON hdr.rule_id = rp.rule_id
 AND hdr.param_names = 'table1Header'
SET rp.param_values = CONCAT(rp.param_values, ',*')
WHERE r.`function` = 7421
  AND rp.param_names LIKE 'table1Row%'
  AND hdr.param_values LIKE '%Slip Dep Flight No%'
  AND (
    (LENGTH(rp.param_values) - LENGTH(REPLACE(rp.param_values, ',', ''))) =
    (LENGTH(hdr.param_values) - LENGTH(REPLACE(hdr.param_values, ',', ''))) - 1
  );
