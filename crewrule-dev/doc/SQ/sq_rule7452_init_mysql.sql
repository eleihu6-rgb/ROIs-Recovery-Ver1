-- 7452
-- SQ ULR/FDP classification mismatch check (Rule 7452)

INSERT INTO `rule`(
    `id`, `function`, `instance`, `class`, `description`, `reference`, `category`,
    `store_structure`, `source`, `detail`, `overridability`, `severity`,
    `filiale`, `division`, `owner`, `locked`, `modified_by`, `last_modified`
)
VALUES (
    7452001, 7452, '001', 'P', 'ULR/FDP Classification Mismatch',
    'SQ', 'Duty', 'Table', 'Company', 'ULR/FDP Classification Mismatch',
    'H', 2, 'SQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP
);

INSERT INTO rule_parameter(
    id, rule_id, phase_id, param_names, param_values, modified_by, last_modified
)
VALUES (
    200003580, 7452001, 1, 'tableHeader',
    'DUTY PATTERN,FLEET GROUP,IS ULR,MIN FDP,MAX FDP',
    'ROIS', CURRENT_TIMESTAMP
);

INSERT INTO rule_parameter(
    id, rule_id, phase_id, param_names, param_values, modified_by, last_modified
)
VALUES (
    200003581, 7452001, 1, 'tableRow1',
    'SIN-*,*,N,*,18:00',
    'ROIS', CURRENT_TIMESTAMP
);

INSERT INTO rule_parameter(
    id, rule_id, phase_id, param_names, param_values, modified_by, last_modified
)
VALUES (
    200003582, 7452001, 1, 'tableRow2',
    '*-SIN,*,N,*,18:00',
    'ROIS', CURRENT_TIMESTAMP
);

INSERT INTO rule_parameter(
    id, rule_id, phase_id, param_names, param_values, modified_by, last_modified
)
VALUES (
    200003583, 7452001, 1, 'tableRow3',
    'SIN-*,*,Y,18:01,*',
    'ROIS', CURRENT_TIMESTAMP
);

INSERT INTO rule_parameter(
    id, rule_id, phase_id, param_names, param_values, modified_by, last_modified
)
VALUES (
    200003584, 7452001, 1, 'tableRow4',
    '*-SIN,*,Y,18:01,*',
    'ROIS', CURRENT_TIMESTAMP
);
