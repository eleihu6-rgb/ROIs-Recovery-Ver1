-- SQ limit positioning sectors and duties in COP (Rule 7468)

-- Optional backup
-- CREATE TABLE `rule_backup_7468` LIKE `rule`;
-- INSERT INTO `rule_backup_7468` SELECT * FROM `rule`;
-- CREATE TABLE `rule_parameter_backup_7468` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7468` SELECT * FROM `rule_parameter`;

-- Insert rule definition
INSERT INTO `rule`(`id`, `function`, `instance`, `class`, `description`, `reference`, `category`, `store_structure`, `source`, `detail`, `overridability`, `severity`, `filiale`, `division`, `owner`, `locked`, `modified_by`, `last_modified`)
VALUES (7468001, 7468, '001', 'P', 'Limit positioning sectors in COP', 'SQ', 'Pairing', 'Table', 'Company', 'Limit positioning sectors and duties in COP', 'H', 2, 'SQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- Parameters
-- BASES,SERVICE TYPE,FLEET GROUP,LIMIT SECTOR ASSIGNMENTS,MAX LIMITED SECTORS IN COP,LIMIT DUTY ASSIGNMENTS,MAX LIMITED DUTIES IN COP
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES (200003468, 7468001, 1, 'tableHeader', 'BASES,SERVICE TYPE,FLEET GROUP,LIMIT SECTOR ASSIGNMENTS,MAX LIMITED SECTORS IN COP,LIMIT DUTY ASSIGNMENTS,MAX LIMITED DUTIES IN COP', 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES (200003469, 7468001, 1, 'tableRow1', 'SIN,Freighter,*,DHD,1,*,*', 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES (200003470, 7468001, 1, 'tableRow2', 'SIN,Freighter,*,*~SBY,8,*,*', 'ROIS', CURRENT_TIMESTAMP);
