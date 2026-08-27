-- 2026/01/xx SQ: align rule parameter names with Flight Time (FT) semantics
-- - Rule 2004: rename "Max Flight BLH Allow DHD" -> "Max Flight Time Allow DHD"
-- - Rule 7205: rename "Limit BLH Range" -> "Limit Flight Time Range"
--
-- Notes:
-- - Code remains backward-compatible with the legacy BLH-based names.
-- - This script updates both param_names and param_values to cover different header-row storage styles.

-- ---------------------------------------------------------------------------
-- Rule 2004 (Duty Construction Rules): deadhead limit param name
-- ---------------------------------------------------------------------------
UPDATE rule_parameter rp
JOIN rule r ON rp.rule_id = r.id
SET rp.param_names = REPLACE(
    REPLACE(rp.param_names, 'Max Flight BLH Allow DHD', 'Max Flight Time Allow DHD'),
    'maxFlightBLHAllowDHD', 'maxFlightTimeAllowDHD'
)
WHERE r.`function` = 2004
  AND (rp.param_names LIKE '%Flight BLH Allow DHD%' OR rp.param_names LIKE '%maxFlightBLHAllowDHD%');

-- ---------------------------------------------------------------------------
-- Rule 7205 (Max Flight Time in Period): header column name
-- ---------------------------------------------------------------------------
UPDATE rule_parameter rp
JOIN rule r ON rp.rule_id = r.id
SET rp.param_names = REPLACE(rp.param_names, 'Limit BLH Range', 'Limit Flight Time Range'),
    rp.param_values = REPLACE(rp.param_values, 'Limit BLH Range', 'Limit Flight Time Range')
WHERE r.`function` = 7205
  AND (
    rp.param_names  LIKE '%Limit BLH Range%'
    OR rp.param_values LIKE '%Limit BLH Range%'
  );

