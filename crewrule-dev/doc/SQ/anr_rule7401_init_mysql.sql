-- ANR (Singapore) day off definition (Rule 7401)
-- Shared by downstream ANR rules that need to identify how many
-- days off a rest period contains.

-- OPTIONAL: backup existing rule records before applying
-- CREATE TABLE `rule_backup_7401` LIKE `rule`;
-- INSERT INTO `rule_backup_7401` SELECT * FROM `rule`;
-- CREATE TABLE `rule_parameter_backup_7401` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7401` SELECT * FROM `rule_parameter`;

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
  (7401001, 7401, '001', 'P',
   'ANR Day Off Definition', 'ANR',
   'DEFINITION',
   'Table',
   'ANR',
   'Defines minimum rest hours and local nights for each ANR day-off sequence',
   'S', 2,
   'ANR', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 2) Table header
-- Columns:
--   DAY OFF SEQUENCE : sequence index or range (e.g. 1, 2-99) within a consecutive block
--   MIN REST TIME    : minimum hours free of duty for that sequence (HH or HH:MM)
--   MIN LOCAL NIGHTS : minimum number of local nights that must be included
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208177001, 7401001, 1,
   'tableHeader',
   'DAY OFF SEQUENCE,MIN REST TIME,MIN LOCAL NIGHTS',
   'ROIS', CURRENT_TIMESTAMP);

-- 3) Table rows
-- Row 1: First day off requires at least 34 hours of rest and one local night.
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208177002, 7401001, 1,
   'tableRow1',
   '1,34:00,1',
   'ROIS', CURRENT_TIMESTAMP);

-- Row 2: Subsequent consecutive days off need 24 hours and a local night each.
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208177003, 7401001, 1,
   'tableRow2',
   '2-99,24:00,1',
   'ROIS', CURRENT_TIMESTAMP);
