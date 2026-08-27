-- SQ same-city requirement around ULR duties in COP (Rule 7453)

-- Optional backup
-- CREATE TABLE `rule_backup_7453` LIKE `rule`;
-- INSERT INTO `rule_backup_7453` SELECT * FROM `rule`;
-- CREATE TABLE `rule_parameter_backup_7453` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7453` SELECT * FROM `rule_parameter`;

INSERT INTO `rule`(
    `id`, `function`, `instance`, `class`, `description`, `reference`, `category`,
    `store_structure`, `source`, `detail`, `overridability`, `severity`,
    `filiale`, `division`, `owner`, `locked`, `modified_by`, `last_modified`
)
VALUES (
    7453001, 7453, '001', 'P', 'Same City Around ULR Duty In COP',
    'SQ', 'Pairing', 'Table', 'Company', 'Non-boundary cities around ULR duties in COP must match',
    'H', 2, 'SQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP
);

INSERT INTO `rule_parameter`(
    `id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`
)
VALUES (
    200003585, 7453001, 1, 'tableHeader',
    'BASES,FLEET GROUP,ACTIVE',
    'ROIS', CURRENT_TIMESTAMP
);

INSERT INTO `rule_parameter`(
    `id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`
)
VALUES (
    200003586, 7453001, 1, 'tableRow1',
    'SIN,359,Y',
    'ROIS', CURRENT_TIMESTAMP
);
