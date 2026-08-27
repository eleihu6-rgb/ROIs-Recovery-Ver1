-- 7466
-- SQ extra days off at base (Rule 7466)

-- Optional backup
-- CREATE TABLE `rule_backup_7466` LIKE `rule`;
-- INSERT INTO `rule_backup_7466` SELECT * FROM `rule` WHERE `function` = 7466;
-- CREATE TABLE `rule_parameter_backup_7466` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7466`
--   SELECT * FROM `rule_parameter` WHERE `rule_id` BETWEEN 7466001 AND 7466999;

INSERT INTO `rule`(
  `id`, `function`, `instance`, `class`,
  `description`, `reference`, `category`,
  `store_structure`, `source`, `detail`,
  `overridability`, `severity`,
  `filiale`, `division`, `owner`,
  `locked`, `modified_by`, `last_modified`
)
VALUES
  (7466001, 7466, '001', 'P',
   'Extra Days Off at Base', 'SQ',
   'ATDO',
   'MultiTable',
   'Company',
   'Extra Days Off at Base',
   'H', 2,
   'SQ', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- ==============================
-- Table 1 (requirements)
-- ==============================

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003437, 7466001, 1,
   'table1Header',
   'Slip Station,Slip Arr Is Operating,Slip Dep Is Operating,Slip Local Night Range,COP Start DOW,Flight Numbers,Flight Is Operating,Period Start Date,Period End Date,Extra Days Off',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `param_extra`, `modified_by`, `last_modified`) VALUES(200003438, 7466001, 1, 'table1Row1', '*,*,*,0-99,3-4,392,*,2024-06-05,2025-03-27,1', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `param_extra`, `modified_by`, `last_modified`) VALUES(200003439, 7466001, 1, 'table1Row2', '*,*,*,*,7,392,*,2025-03-30,2035-12-31,1', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `param_extra`, `modified_by`, `last_modified`) VALUES(200003440, 7466001, 1, 'table1Row3', '*,*,*,*,7,304,*,2024-04-07,2035-12-31,1', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `param_extra`, `modified_by`, `last_modified`) VALUES(200003441, 7466001, 1, 'table1Row4', '*,*,*,*,1-7,34,*,2025-03-28,2025-10-23,1', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `param_extra`, `modified_by`, `last_modified`) VALUES(200003442, 7466001, 1, 'table1Row5', '*,*,*,*,1-7,32,*,2024-03-30,2035-12-31,1', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `param_extra`, `modified_by`, `last_modified`) VALUES(200003443, 7466001, 1, 'table1Row6', '*,*,*,*,5,36,*,2023-03-24,2035-12-31,1', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `param_extra`, `modified_by`, `last_modified`) VALUES(200003444, 7466001, 1, 'table1Row7', '*,*,*,*,3,36,*,2023-03-24,2035-12-31,1', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `param_extra`, `modified_by`, `last_modified`) VALUES(200003445, 7466001, 1, 'table1Row8', '*,*,*,*,1-7,24,*,2023-10-02,2035-12-31,1', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `param_extra`, `modified_by`, `last_modified`) VALUES(200003446, 7466001, 1, 'table1Row9', '*,*,*,*,4-5,28,*,2025-05-29,2035-12-31,1', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `param_extra`, `modified_by`, `last_modified`) VALUES(200003447, 7466001, 1, 'table1Row10', '*,*,*,*,6,338,*,2025-10-30,2025-11-09,1', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `param_extra`, `modified_by`, `last_modified`) VALUES(200003448, 7466001, 1, 'table1Row11', '*,*,*,*,1,338,*,2025-11-24,2025-12-21,1', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `param_extra`, `modified_by`, `last_modified`) VALUES(200003449, 7466001, 1, 'table1Row12', '*,*,*,*,3,32,*,2026-01-05,2026-03-01,1', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `param_extra`, `modified_by`, `last_modified`) VALUES(200003450, 7466001, 1, 'table1Row13', '*,*,*,*,2,366,*,2026-03-29,2035-12-31,1', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- ==============================
-- Table 2 (control)
-- ==============================

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003451, 7466001, 1,
   'table2Header',
   'Sby Reduces Rest and LN,Rest Starts After,Standby Assignments,Do Starts After',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003452, 7466001, 1,
   'table2Row1',
   'Y,TRANSPORT,SBY,DEBRIEF',
   'ROIS', CURRENT_TIMESTAMP);
