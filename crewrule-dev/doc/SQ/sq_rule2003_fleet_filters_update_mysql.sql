-- SQ Rule 2003 update: add optional Fleets / Fleet Group filters.
-- Keep header/value counts aligned so legacy rows still parse.

UPDATE `rule_parameter` rp
INNER JOIN `rule` r ON r.`id` = rp.`rule_id`
SET rp.`param_values` = CONCAT(rp.`param_values`, ',Fleets,Fleet Group')
WHERE r.`function` = 2003
  AND rp.`param_names` = 'tableHeader'
  AND rp.`param_values` NOT LIKE '%Fleets,Fleet Group%';

UPDATE `rule_parameter` rp
INNER JOIN `rule` r ON r.`id` = rp.`rule_id`
SET rp.`param_values` = CONCAT(rp.`param_values`, ',*,*')
WHERE r.`function` = 2003
  AND rp.`param_names` LIKE 'tableRow%'
  AND (CHAR_LENGTH(rp.`param_values`) - CHAR_LENGTH(REPLACE(rp.`param_values`, ',', ''))) < 8;
