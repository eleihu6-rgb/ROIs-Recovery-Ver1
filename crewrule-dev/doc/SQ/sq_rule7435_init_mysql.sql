-- CA (SQ) ULR pairing minimum duration (Rule 7435)
-- Pairings containing ULR duty and specified standby duties
-- must span at least the configured base-local calendar days.

-- Optional backup
-- CREATE TABLE `rule_backup_7435` LIKE `rule`;
-- INSERT INTO `rule_backup_7435` SELECT * FROM `rule` WHERE `function` = 7435;
-- CREATE TABLE `rule_parameter_backup_7435` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7435`
--   SELECT * FROM `rule_parameter` WHERE `rule_id` BETWEEN 7435001 AND 7435999;

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
  (7435001, 7435, '001', 'P',
   'CA ULR Standby Pairing Minimum Days', 'SQ',
   'Pairing', 'Table', 'Company',
   'Pairings with ULR duties and standby must span the configured base-local calendar days',
   'H', 2,
   'SQ', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- Parameters:
-- Service Type; Fleet Group; Has ULR Duty,Y/N/*; Layover Airport; Layover Country; Has Duty Assignment; Min Pairing Days; Pairing Length Ends At
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174350, 7435001, 1,
   'tableHeader',
   'Service Type,Fleet Group,Has ULR Duty,Layover Airport,Layover Country,Has Duty Assignment,Min Pairing Days,Pairing Length Ends At',
   'ROIS', CURRENT_TIMESTAMP);

-- Default rows
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES (208174351, 7435001, 1, 'tableRow1', '*,*,Y,*,*,SBY,6,TRANSPORT', 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES (208174352, 7435001, 1, 'tableRow2', '*,*,*,*,US,SBY,6,TRANSPORT', 'ROIS', CURRENT_TIMESTAMP);

