-- SQ mid-duty base turn restriction (Rule 7460)
-- Restricts duties that pass through crew base mid-duty when
-- the duty does not start or end at the base.

-- Optional backup
-- CREATE TABLE `rule_backup_7460` LIKE `rule`;
-- INSERT INTO `rule_backup_7460` SELECT * FROM `rule`;
-- CREATE TABLE `rule_parameter_backup_7460` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7460` SELECT * FROM `rule_parameter`;

-- Insert rule definition
INSERT INTO `rule`(`id`, `function`, `instance`, `class`, `description`, `reference`, `category`, `store_structure`, `source`, `detail`, `overridability`, `severity`, `filiale`, `division`, `owner`, `locked`, `modified_by`, `last_modified`)
VALUES (7460001, 7460, '001', 'P', 'Restrict Mid Duty Base Turn', 'SQ', 'Duty', 'Table', 'Company', 'Restrict duties that pass through crew base mid-duty when the duty does not start or end at base', 'H', 2, 'SQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- Parameters: restrict duty patterns where mid-duty base turns are enforced
-- Only rows with ACTIVE = 'Y' are loaded by the engine (others may hold comments).
-- Duty Start Station,Duty End Station,ACTIVE
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES (200074600, 7460001, 1, 'tableHeader', 'Duty Start Station,Duty End Station,ACTIVE', 'ROIS', CURRENT_TIMESTAMP);

-- Example of a comment/inactive row (ignored by backend)
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES (200074601, 7460001, 1, 'tableRow1', '*,!(SIN|KUL),N', 'ROIS', CURRENT_TIMESTAMP);

-- Active restriction
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES (200074602, 7460001, 1, 'tableRow2', '!(SIN),!(SIN),Y', 'ROIS', CURRENT_TIMESTAMP);
