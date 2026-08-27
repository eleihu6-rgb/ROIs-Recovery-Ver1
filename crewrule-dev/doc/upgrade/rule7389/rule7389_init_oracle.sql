-- CMSCEB-906 [Rule] 7389 Training Automation - 课程连续X天之后要安排Y天休假
-- 7389 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7389001, 7389, '001', 'R', 'Training Consecutive Days Rest', '5J', 'Roster', 'Table', 'Company', 'Training consecutive days rest requirement', 'S', 2, '5J', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300319, 7389001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Type', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(208300320, 7389001, 1, 'tableRow1', '*,*,*,*,TRAINING', null, 'ROIS', CURRENT_TIMESTAMP);

COMMIT;