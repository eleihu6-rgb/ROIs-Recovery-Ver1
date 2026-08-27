-- CMSCEB-905 [5J][Rule7388] Course只能安排在指定weekday
-- 7388 法规
INSERT INTO `rule`(`id`, `function`, `instance`, `class`, `description`, `reference`, `category`, `store_structure`, `source`, `detail`, `overridability`, `severity`, `filiale`, `division`, `owner`, `locked`, `modified_by`, `last_modified`) VALUES (7388001, 7388, '001', 'R', 'Course Allowed Weekdays', '5J', 'Roster', 'Table', 'Company', 'Course Allowed Weekdays', 'S', 2, '5J', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300317, 7388001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Type', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(208300318, 7388001, 1, 'tableRow1', '*,*,*,*,TRAINING', null, 'ROIS', CURRENT_TIMESTAMP);
