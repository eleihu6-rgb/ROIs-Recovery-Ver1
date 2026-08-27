-- HXCREW-386 [HX][法规]7496 休假任务之间至少X天工作

-- 7496 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7496001, 7496, '001', 'R', 'Limit Minimum Working Days Between Assignments', 'HX', 'Roster', 'Table', 'Company', 'Limit Minimum Working Days Between Assignments', 'S', 2, 'HX', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300315, 7496001, 1, 'tableHeader', 'Consecutive Assignment Group A,Consecutive Assignment A,Consecutive Assignment Group B,Consecutive Assignment B,Directional(Y/N),Min Working Days,Working Assignment Group,Working Assignments,Count Blank Day(Y/N)', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(208300316, 7496001, 1, 'tableRow1', 'LEA,*,LEA,*,N,3,FLY|GND,*,Y', null, 'ROIS', CURRENT_TIMESTAMP);