-- SQ Late Finish definition (Rule 2042)
-- Aligns with the requirement that late finishes end between 01:00 and 01:59 acclimated time.

-- Optional backup
-- CREATE TABLE `rule_backup_2042` LIKE `rule`;
-- INSERT INTO `rule_backup_2042` SELECT * FROM `rule` WHERE `function` = 2042;
-- CREATE TABLE `rule_parameter_backup_2042` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_2042` SELECT * FROM `rule_parameter` WHERE `rule_id` BETWEEN 2042001 AND 2042999;

INSERT INTO `rule`(
  `id`, `function`, `instance`, `class`,
  `description`, `reference`, `category`,
  `store_structure`, `source`, `detail`,
  `overridability`, `severity`,
  `filiale`, `division`, `owner`,
  `locked`, `modified_by`, `last_modified`
)
VALUES
  (2042001, 2042, '001', 'B',
   'Late Finish Definition', 'PI',
   'Definition',
   'Table',
   'PI',
   'Defines a late finish as duties ending between 01:00 and 01:59 acclimated time',
   'S', 1,
   'SQ', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208120420, 2042001, 1,
   'tableHeader',
   'Late Finish Start,Late Finish End',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208120421, 2042001, 1,
   'tableRow1',
   '01:00,01:59',
   'ROIS', CURRENT_TIMESTAMP);
