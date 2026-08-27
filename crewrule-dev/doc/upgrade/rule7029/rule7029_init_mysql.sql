-- ROSCRW-8559 [TG][Rule] 7029 FDP Extension with in-flight rest for Cabin Crew
-- 7029 法规
INSERT INTO `rule`(`id`, `function`, `instance`, `class`, `description`, `reference`, `category`, `store_structure`, `source`, `detail`, `overridability`, `severity`, `filiale`, `division`, `owner`, `locked`, `modified_by`, `last_modified`) VALUES (7029001, 7029, '001', 'R', 'FDP Extension with in-flight rest', 'TG', 'FDP', 'Table', 'Company', 'FDP extension with in-flight rest for cabin crew', 'S', 2, 'TG', 'C', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300321, 7029001, 1, 'table1Header', 'Acc State,Sectors Range,Rest Facility,Override Duty Attributes,In-flight Rest Range,Group,Max FDP,Min Rest', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(208300322, 7029001, 1, 'table1Row1', 'D|B,1-1,1,*,01:30-01:45,2,14:30,14:00', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(208300323, 7029001, 1, 'table1Row2', 'D|B,1-1,1,*,01:45-02:00,2,15:00,14:00', null, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300324, 7029001, 1, 'table2Header', 'Flight Numbers,Fleets,Take Off Time,Landing Time,Service Time', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(208300325, 7029001, 1, 'table2Row1', '*,*,00:30,00:30,01:00', null, 'ROIS', CURRENT_TIMESTAMP);
