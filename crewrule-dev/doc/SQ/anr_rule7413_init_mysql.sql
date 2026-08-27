-- 7413 法规
-- ANR (Singapore) CC augmented MAX FDP limit (Rule 7413)
-- Dependent rule of 7410: when a 7410 table 1 row matches, apply all matching 7413 rows
-- and use the maximum MAX FDP among (7410 + 7413) as the effective MAX FDP limit.
--
-- Columns:
--   COMPOSITION          : duty composition, '|' separated, '*' for any
--   REST FACILITY        : rest facility code, '*' for any
--   FDP RANGE            : duty FDP band in HH:MM-HH:MM (inclusive), '*' for any
--   DUTY START STATION   : duty first-segment departure station filter ("SIN", "!SIN", or "*")
--   HAS SECTOR           : sector endpoint filter in "AAA-BBB" form, where each endpoint supports
--                          exact station, negation (e.g. "!SIN"), or '*' wildcard.
--                          Examples: "SIN-*", "!SIN-*", "*-SIN"
--   SECTOR MIN FLY TIME  : minimum fly time (end - start) of the matching sector(s) in HH:MM
--   MAX FDP              : augmented MAX FDP limit in HH:MM

-- OPTIONAL: backup existing rule records before applying
-- CREATE TABLE `rule_backup_7413` LIKE `rule`;
-- INSERT INTO `rule_backup_7413` SELECT * FROM `rule`;
-- CREATE TABLE `rule_parameter_backup_7413` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7413` SELECT * FROM `rule_parameter`;

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
  (7413001, 7413, '001', 'P',
   'ANR CC Augmented MAX FDP Limit', 'ANR',
   'FDP',
   'Table',
   'ANR',
   'Cabin crew augmented MAX FDP limit based on sector endpoints and fly time',
   'S', 2,
   'ANR', 'C', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 2) Table header
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174330, 7413001, 1,
   'tableHeader',
   'COMPOSITION,REST FACILITY,FDP RANGE,DUTY START STATION,HAS SECTOR,SECTOR MIN FLY TIME,MAX FDP',
   'ROIS', CURRENT_TIMESTAMP);

-- 3) Table rows (from design doc)
INSERT INTO `rule_parameter`(`id`,`rule_id`,`phase_id`,`param_names`,`param_values`,`modified_by`,`last_modified`) VALUES
  (208174331, 7413001, 1, 'tableRow1', '*,3,00:00-14:00,SIN,SIN-*,09:00,14:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`,`rule_id`,`phase_id`,`param_names`,`param_values`,`modified_by`,`last_modified`) VALUES
  (208174332, 7413001, 1, 'tableRow2', '*,3,00:00-14:00,!SIN,*-SIN,09:00,14:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`,`rule_id`,`phase_id`,`param_names`,`param_values`,`modified_by`,`last_modified`) VALUES
  (208174333, 7413001, 1, 'tableRow3', '*,3,14:01-16:00,SIN,SIN-*,12:00,16:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`,`rule_id`,`phase_id`,`param_names`,`param_values`,`modified_by`,`last_modified`) VALUES
  (208174334, 7413001, 1, 'tableRow4', '*,3,14:01-16:00,!SIN,*-SIN,13:00,16:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`,`rule_id`,`phase_id`,`param_names`,`param_values`,`modified_by`,`last_modified`) VALUES
  (208174335, 7413001, 1, 'tableRow5', '*,3,16:01-19:00,SIN,SIN-*,14:00,19:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`,`rule_id`,`phase_id`,`param_names`,`param_values`,`modified_by`,`last_modified`) VALUES
  (208174336, 7413001, 1, 'tableRow6', '*,3,16:01-19:00,!SIN,*-SIN,15:00,19:00', 'ROIS', CURRENT_TIMESTAMP);

