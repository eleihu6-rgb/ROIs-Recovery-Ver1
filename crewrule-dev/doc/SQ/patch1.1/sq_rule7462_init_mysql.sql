-- SQ allowed multi-sector duty for freighter/service type F (Rule 7462)

-- Optional backup
-- CREATE TABLE `rule_backup_7462` LIKE `rule`;
-- INSERT INTO `rule_backup_7462` SELECT * FROM `rule`;
-- CREATE TABLE `rule_parameter_backup_7462` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7462` SELECT * FROM `rule_parameter`;

-- Insert rule definition
INSERT INTO `rule`(`id`, `function`, `instance`, `class`, `description`, `reference`, `category`, `store_structure`, `source`, `detail`, `overridability`, `severity`, `filiale`, `division`, `owner`, `locked`, `modified_by`, `last_modified`)
VALUES (7462001, 7462, '001', 'P', 'Allowed Multi-Sector Duty For Freighter', 'SQ', 'Duty', 'Table', 'Company', 'Allowed Multi-Sector Duty For Freighter', 'H', 2, 'SQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- Parameters
-- Service Type,Segment Number In Duty,Allowed Sectors,Duty Operating Type
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES (200003408, 7462001, 1, 'tableHeader', 'Service Type,Segment Number In Duty,Allowed Sectors,Duty Operating Type', 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES (200003409, 7462001, 1, 'tableRow1', 'F,2-99,SIN-CAN-SIN|SIN-BLR-SHJ|AMS-LHR-SHJ|JNB-NBO-AMS|SYD-MEL-AKL|SYD-AKL-MEL,FLY', 'ROIS', CURRENT_TIMESTAMP);
