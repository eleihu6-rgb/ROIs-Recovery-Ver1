-- ANR (Singapore) acclimatisation definition (Rule 7400)
-- Requires LOCAL_NIGHT_DEFINITION (2014) to be present for local night windows

-- Backup (optional)
-- CREATE TABLE `rule_backup_7400` LIKE `rule`;
-- INSERT INTO `rule_backup_7400` SELECT * FROM `rule`;
-- CREATE TABLE `rule_parameter_backup_7400` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7400` SELECT * FROM `rule_parameter`;

-- Insert rule definition
INSERT INTO `rule`(`id`, `function`, `instance`, `class`, `description`, `reference`, `category`, `store_structure`, `source`, `detail`, `overridability`, `severity`, `filiale`, `division`, `owner`, `locked`, `modified_by`, `last_modified`)
VALUES (7400001, 7400, '001', 'P', 'ANR Acclimatization Definition', 'ANR', 'DEFINITION', 'Table', 'ANR', 'Acclimatized time changes after N consecutive local nights free of duty within a timezone', 'S', 2, 'ANR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- Parameters: single table with MIN LN and optional output-state mapping
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified)
VALUES (200074000, 7400001, 1, 'tableHeader', 'MIN LN,ACC STATE CURRENT TZ,ACC STATE PREV TZ', 'ROIS', CURRENT_TIMESTAMP);

-- Default: 3 consecutive local nights, preserving legacy output values A/B
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified)
VALUES (200074001, 7400001, 1, 'tableRow1', '3,A,B', 'ROIS', CURRENT_TIMESTAMP);

