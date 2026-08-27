-- CQF5113 init script: set universal uncovered cost to 100000 (1e5)
-- Target tables: cqf / cqf_parameter
--
-- CQF 5113
INSERT INTO `cqf` (id, `function`, `instance`, class, description, reference, category, store_structure, source, detail_display, filiale, division, owner, locked, modified_by, last_modified) VALUES(5113001, 5113, '001', 'C', 'Uncovered Segment Cost', 'Pairing', 'Cost', 'Table', 'General', 'Uncovered Segment Cost', 'PI', 'P', 'S', '', 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200032, 5113001, 1, 'tableHeader', 'Segment Departure,Segment Arrival,Segment Airline,Segment Flight Number,Cost', '', CURRENT_TIMESTAMP);
INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200033, 5113001, 1, 'tableRow1', '*,*,*,*,100000', '', CURRENT_TIMESTAMP);
