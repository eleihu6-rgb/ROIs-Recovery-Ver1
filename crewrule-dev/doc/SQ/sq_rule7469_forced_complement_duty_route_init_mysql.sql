-- SQ forced complement by duty route (Rule 7469)

-- Optional backup
-- CREATE TABLE `rule_backup_7469` LIKE `rule`;
-- INSERT INTO `rule_backup_7469` SELECT * FROM `rule`;
-- CREATE TABLE `rule_parameter_backup_7469` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7469` SELECT * FROM `rule_parameter`;

-- Insert rule definition
INSERT INTO `rule`(`id`, `function`, `instance`, `class`, `description`, `reference`, `category`, `store_structure`, `source`, `detail`, `overridability`, `severity`, `filiale`, `division`, `owner`, `locked`, `modified_by`, `last_modified`)
VALUES (7469001, 7469, '001', 'P', 'Forced complement by duty route', 'SQ', 'Duty', 'Table', 'Company',
        'Override crew need by duty route pattern', 'H', 2, 'SQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- Parameters
-- DUTY ROUTES,SERVICE TYPES,FLEETS,FLEET GROUPS,COMPOSITIONS,RANK PLAN
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES (200003480, 7469001, 1, 'tableHeader',
        'DUTY ROUTES,SERVICE TYPES,FLEETS,FLEET GROUPS,COMPOSITIONS,RANK PLAN',
        'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES (200003481, 7469001, 1, 'tableRow1',
        'SIN-HKG-SHJ|JNB-NBO-AMS|SHJ-NBO-AMS,F,*,B77F,4P,CAP:2+FO:2',
        'ROIS', CURRENT_TIMESTAMP);
