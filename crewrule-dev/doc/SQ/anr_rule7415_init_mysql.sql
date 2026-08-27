-- ANR (Singapore) consecutive working day limit between days off (Rule 7415)
-- Relies on the ANR day off definition (Rule 7401) to determine whether a rest
-- period qualifies as a day off.

-- OPTIONAL: backup existing rule records before applying
-- CREATE TABLE `rule_backup_7415` LIKE `rule`;
-- INSERT INTO `rule_backup_7415` SELECT * FROM `rule`;
-- CREATE TABLE `rule_parameter_backup_7415` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7415` SELECT * FROM `rule_parameter`;

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
  (7415001, 7415, '001', 'P',
   'ANR Max Consecutive Working Days Between Day Offs', 'ANR',
   'Day Off',
   'Table',
   'ANR',
   'Checks that no more than 7 consecutive working days occur between ANR day offs',
   'S', 2,
   'ANR', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 2) Table header
-- Columns:
--   SERVICE TYPE           : '*' (any), 'J' (passenger), 'F' (freighter)
--   FLEET GROUP            : '*' (any), otherwise '|' separated fleet groups
--   MAX WORKING DAYS       : maximum allowed consecutive working days (default 7)
--   LAST DAY BUFFER HHMM   : latest allowed rest-start time on the 7th day (default 21:00)
--   WORK DAY ENDS AT       : TRANSPORT (default) or DEBRIEF
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208178001, 7415001, 1,
   'tableHeader',
   'SERVICE TYPE,FLEET GROUP,MAX WORKING DAYS,LAST DAY BUFFER HHMM,WORK DAY ENDS AT',
   'ROIS', CURRENT_TIMESTAMP);

-- 3) Configuration row
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208178002, 7415001, 1,
   'tableRow1',
   '*,*,7,21:00,TRANSPORT',
   'ROIS', CURRENT_TIMESTAMP);
