-- SQ (Collective Agreement) limit swingback (Rule 7463)
-- Limits swingback sequences based on timezone diff, tolerance, and max count.

-- Optional backup
-- CREATE TABLE `rule_backup_7463` LIKE `rule`;
-- INSERT INTO `rule_backup_7463` SELECT * FROM `rule` WHERE `function` = 7463;
-- CREATE TABLE `rule_parameter_backup_7463` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7463`
--   SELECT * FROM `rule_parameter` WHERE `rule_id` BETWEEN 7463001 AND 7463999;

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
  (7463001, 7463, '001', 'P',
   'Limit Swingback', 'SQ',
   'Duty', 'Table', 'Company',
   'Limit Swingback',
   'H', 2,
   'SQ', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- Parameters:
-- Service Type; Fleet Group; Swingback TZ Diff; Same TZ Tolerance; Max Swingback
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003412, 7463001, 1,
   'tableHeader',
   'Service Type,Fleet Group,Swingback TZ Diff,Same TZ Tolerance,Max Swingback',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003413, 7463001, 1,
   'tableRow1',
   '*,*,03:00-99:00,00:00,1',
   'ROIS', CURRENT_TIMESTAMP);
