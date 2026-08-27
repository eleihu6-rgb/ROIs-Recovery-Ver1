-- SQ check single duty per day (Rule 7009)
-- Duty 1 end time and duty 2 start time cannot be on the same day.
-- Note: TIME ZONE supports BASE/LOCAL (alias B/L). Default should be LOCAL.

-- Optional backup
-- CREATE TABLE `rule_backup_7009` LIKE `rule`;
-- INSERT INTO `rule_backup_7009` SELECT * FROM `rule` WHERE `function` = 7009;
-- CREATE TABLE `rule_parameter_backup_7009` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7009`
--   SELECT * FROM `rule_parameter` WHERE `rule_id` BETWEEN 7009001 AND 7009999;

-- Rule definition
INSERT INTO `rule`(
  `id`, `function`, `instance`, `class`,
  `description`, `reference`, `category`,
  `store_structure`, `source`, `detail`,
  `overridability`, `severity`,
  `filiale`, `division`, `owner`,
  `locked`, `modified_by`, `last_modified`
)
VALUES
  (7009001, 7009, '001', 'P',
   'Check Single Duty Per Day', 'SQ',
   'Duty', 'Table', 'Company',
   'Duty end and next duty start cannot be on the same day',
   'H', 2,
   'SQ', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- Parameters:
-- Level; Fleet Groups; Assignment Groups; Assignments; Time Zone; Prev Roster Start; Next Roster End
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003510, 7009001, 1,
   'tableHeader',
   'Level,Fleet Groups,Assignment Groups,Assignments,Time Zone,Prev Roster Start,Next Roster End',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003511, 7009001, 1,
   'tableRow1',
   'D,*,*,*,BASE,E,S',
   'ROIS', CURRENT_TIMESTAMP);
