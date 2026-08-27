-- ANR (Singapore) minimum days off in consecutive periods (Rule 7416)
-- Relies on the ANR day off definition (Rule 7401) to determine whether rest
-- periods qualify as ANR day offs.

-- OPTIONAL: backup existing rule records before applying
-- CREATE TABLE `rule_backup_7416` LIKE `rule`;
-- INSERT INTO `rule_backup_7416` SELECT * FROM `rule`;
-- CREATE TABLE `rule_parameter_backup_7416` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7416` SELECT * FROM `rule_parameter`;

-- 1) Rule definition
INSERT INTO `rule`(
  `id`, `function`, `instance`, `class`,
  `description`, `reference`, `category`,
  `store_structure`, `source`, `detail`,
  `overridability`, `severity`,
  `filiale`, `division`, `owner`,
  `locked`, `modified_by`, `last_modified`
)
VALUES
  (7416001, 7416, '001', 'P',
   'ANR Min Days Off In Consecutive Periods', 'ANR',
   'Day Off',
   'Table',
   'ANR',
   'Checks that each rolling period has at least the configured number of ANR day offs',
   'S', 2,
   'ANR', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 2) Table header
-- Columns:
--   SERVICE TYPE  : '*' (any), 'J' (passenger), 'F' (freighter)
--   FLEET GROUP   : '*' (any), otherwise '|' separated fleet groups
--   UNIT          : CD (consecutive days), CW (consecutive weeks), CM (consecutive months)
--   PERIOD        : length of the window expressed in UNIT
--   MIN DAYS OFF  : minimum number of ANR day offs required in each window
--   WEEK START ON : 1=Monday, 0 or 7=Sunday (only used when UNIT = CW)
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208279001, 7416001, 1,
   'tableHeader',
   'SERVICE TYPE,FLEET GROUP,UNIT,PERIOD,MIN DAYS OFF,WEEK START ON',
   'ROIS', CURRENT_TIMESTAMP);

-- 3) Configuration row
-- Example: at least 2 ANR day offs in every 2 consecutive calendar weeks,
-- with calendar week starting on Monday.
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208279002, 7416001, 1,
   'tableRow1',
   '*,*,CW,2,2,1',
   'ROIS', CURRENT_TIMESTAMP);
