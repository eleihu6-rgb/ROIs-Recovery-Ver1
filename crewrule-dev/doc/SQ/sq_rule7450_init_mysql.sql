-- SQ (Collective Agreement) FDP-based sector limitation (Rule 7450)
-- Limits augmented (3P/4P) duties by sector BLH/FDP and sector count.

-- OPTIONAL: backup existing rule entries before running
-- CREATE TABLE `rule_backup_7450` LIKE `rule`;
-- INSERT INTO `rule_backup_7450` SELECT * FROM `rule` WHERE `function` = 7450;
-- CREATE TABLE `rule_parameter_backup_7450` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7450`
--   SELECT * FROM `rule_parameter` WHERE `rule_id` BETWEEN 7450001 AND 7450999;

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
  (7450001, 7450, '001', 'P',
   'SQ FDP-based sector limit', 'SQ',
   'DUTY',
   'Table',
   'SQ',
   'Augmented (3P/4P) duties are limited to 1 or 2 sectors based on FDP duration; last deadhead beyond FDP is excluded.',
   'H', 2,
   'SQ', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 2) Table 1 header
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174500, 7450001, 1,
   'tableHeader',
   'COMPOSITION,SECTOR BLH LOWER,SECTOR BLH UPPER,FDP LOWER,FDP UPPER,MAX SECTORS',
   'ROIS', CURRENT_TIMESTAMP);

-- 3) Default rows (BLH wildcard), FDP <= 13:00 -> max 2 sectors
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174501, 7450001, 1,
   'tableRow1',
   '3P|4P,*,*,00:00,13:00,2',
   'ROIS', CURRENT_TIMESTAMP);

-- 4) Default rows (BLH wildcard), FDP > 13:00 -> max 1 sector
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174502, 7450001, 1,
   'tableRow2',
   '3P|4P,*,*,13:01,99:00,1',
   'ROIS', CURRENT_TIMESTAMP);

-- 5) Table 2 header (control parameters)
-- Columns:
--   SERVICE TYPE : '*' (any), 'J' (passenger), 'F' (freighter)
--   FLEET GROUP  : '*' (any), otherwise '|' separated fleet groups
--   COUNT DEADHEAD SECTORS        : Y/N
--   EXCLUDE FINAL DEADHEAD SECTORS: Y/N
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174503, 7450001, 1,
   'table2Header',
   'SERVICE TYPE,FLEET GROUP,COUNT DEADHEAD SECTORS,EXCLUDE FINAL DEADHEAD SECTORS',
   'ROIS', CURRENT_TIMESTAMP);

-- 6) Control row: count all deadheads within FDP, including trailing ones
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174504, 7450001, 1,
   'table2Row1',
   '*,*,Y,N',
   'ROIS', CURRENT_TIMESTAMP);
