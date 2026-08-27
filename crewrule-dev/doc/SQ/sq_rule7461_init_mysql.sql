-- 7461
-- SQ deadhead and positioning restriction on freight aircraft (Rule 7461)

INSERT INTO `rule`(`id`, `function`, `instance`, `class`, `description`, `reference`, `category`, `store_structure`, `source`, `detail`, `overridability`, `severity`, `filiale`, `division`, `owner`, `locked`, `modified_by`, `last_modified`)
VALUES (7461001, 7461, '001', 'P', 'Deadhead and Positioning Restriction On Freight Aircraft', 'SQ', 'Duty', 'Table', 'Company', 'Deadhead and Positioning Restriction On Freight Aircraft', 'H', 2, 'SQ', 'P', 'U', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified)
VALUES (200003410, 7461001, 1, 'tableHeader', 'Is Home Base,Deadhead And Positioning Assignments', 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified)
VALUES (200003411, 7461001, 1, 'tableRow1', 'Y,DHD', 'ROIS', CURRENT_TIMESTAMP);
