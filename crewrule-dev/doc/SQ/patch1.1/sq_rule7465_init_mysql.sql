-- 7465
-- SQ minimum scheduled days off at base (Rule 7465)

-- Optional backup
-- CREATE TABLE `rule_backup_7465` LIKE `rule`;
-- INSERT INTO `rule_backup_7465` SELECT * FROM `rule` WHERE `function` = 7465;
-- CREATE TABLE `rule_parameter_backup_7465` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7465`
--   SELECT * FROM `rule_parameter` WHERE `rule_id` BETWEEN 7465001 AND 7465999;

INSERT INTO `rule`(
  `id`, `function`, `instance`, `class`,
  `description`, `reference`, `category`,
  `store_structure`, `source`, `detail`,
  `overridability`, `severity`,
  `filiale`, `division`, `owner`,
  `locked`, `modified_by`, `last_modified`
)
VALUES
  (7465001, 7465, '001', 'P',
   'Minimum Scheduled Days Off at Base', 'SQ',
   'Duty',
   'Table',
   'Company',
   'Minimum Scheduled Days Off at Base',
   'H', 2,
   'SQ', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003424, 7465001, 1,
   'tableHeader',
   'COP Length Range,Fleets,Service Type,Do Starts After,Min Days Off',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `param_extra`, `modified_by`, `last_modified`) VALUES(200003425, 7465001, 1, 'tableRow1', '6-6,*,J,DEBRIEF,2', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `param_extra`, `modified_by`, `last_modified`) VALUES(200003426, 7465001, 1, 'tableRow2', '7-7,*,J,DEBRIEF,3', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `param_extra`, `modified_by`, `last_modified`) VALUES(200003427, 7465001, 1, 'tableRow3', '8-10,*,J,DEBRIEF,4', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `param_extra`, `modified_by`, `last_modified`) VALUES(200003428, 7465001, 1, 'tableRow4', '11-13,*,J,DEBRIEF,5', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `param_extra`, `modified_by`, `last_modified`) VALUES(200003429, 7465001, 1, 'tableRow5', '14-15,*,J,DEBRIEF,6', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `param_extra`, `modified_by`, `last_modified`) VALUES(200003430, 7465001, 1, 'tableRow6', '16-18,*,J,DEBRIEF,7', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `param_extra`, `modified_by`, `last_modified`) VALUES(200003431, 7465001, 1, 'tableRow7', '19-99,*,J,DEBRIEF,8', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `param_extra`, `modified_by`, `last_modified`) VALUES(200003432, 7465001, 1, 'tableRow8', '5-6,*,F,DEBRIEF,2', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `param_extra`, `modified_by`, `last_modified`) VALUES(200003433, 7465001, 1, 'tableRow9', '7-10,*,F,DEBRIEF,3', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `param_extra`, `modified_by`, `last_modified`) VALUES(200003434, 7465001, 1, 'tableRow10', '11-13,*,F,DEBRIEF,4', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `param_extra`, `modified_by`, `last_modified`) VALUES(200003435, 7465001, 1, 'tableRow11', '14-17,*,F,DEBRIEF,5', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `param_extra`, `modified_by`, `last_modified`) VALUES(200003436, 7465001, 1, 'tableRow12', '18-99,*,F,DEBRIEF,8', NULL, 'ROIS', CURRENT_TIMESTAMP);
