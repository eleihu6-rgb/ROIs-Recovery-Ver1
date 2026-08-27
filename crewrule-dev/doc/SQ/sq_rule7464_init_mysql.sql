-- 7464
-- SQ limit ground transport length (Rule 7464)

INSERT INTO `rule`(`id`, `function`, `instance`, `class`, `description`, `reference`, `category`, `store_structure`, `source`, `detail`, `overridability`, `severity`, `filiale`, `division`, `owner`, `locked`, `modified_by`, `last_modified`)
VALUES (7464001, 7464, '001', 'P', 'Limit Ground Transport Length', 'SQ', 'Duty', 'Table', 'Company', 'Limit Ground Transport Length', 'H', 2, 'SQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified)
VALUES (200003414, 7464001, 1, 'tableHeader', 'Service Type,Fleet Group,Flight Flags,Flight Assignments,Exception Flight Routes,Max Transport Length', 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified)
VALUES (200003415, 7464001, 1, 'tableRow1', '*,*,D,BUS|HSR|TRAIN,BSL-ZRH|AUH-DXB|AUH-DWC|FUK-NGS,02:30', 'ROIS', CURRENT_TIMESTAMP);
