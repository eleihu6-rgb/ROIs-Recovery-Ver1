-- HXCREW-387 [HX][法规]7495 连续N天的某种任务前/后要有X个DDO/DO关联7401定义的

-- 7495 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7495001, 7495, '001', 'R', 'Limit Pre/Post Days Off for Consecutive Duty', 'HX', 'Roster', 'Table', 'Company', 'Limit Pre/Post Days Off for Consecutive Duty', 'S', 2, 'HX', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300311, 7495001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Assignment Groups,Assignments,Attributes,Consecutive Days Range,Min Pre Days Off,Min Post Days Off', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(208300312, 7495001, 1, 'tableRow1', '*,*,*,*,HSB,*,*,3-*,*,2', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(208300313, 7495001, 1, 'tableRow2', '*,*,*,*,*,ABL,*,7-13,1,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(208300314, 7495001, 1, 'tableRow3', '*,*,*,*,*,ABL,*,14-*,2,2', null, 'ROIS', CURRENT_TIMESTAMP);

