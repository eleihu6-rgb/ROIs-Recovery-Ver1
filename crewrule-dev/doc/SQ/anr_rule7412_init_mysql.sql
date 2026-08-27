-- ANR (Singapore) minimum rest period between duties (Rule 7412)
-- DP range bounds are inclusive on both ends: [HH:mm,HH:mm]
-- Local night definition follows 2014 regulation (8 consecutive hours inside 22:00-08:00)

-- OPTIONAL: backup existing rule records before applying
-- CREATE TABLE `rule_backup_7412` LIKE `rule`;
-- INSERT INTO `rule_backup_7412` SELECT * FROM `rule`;
-- CREATE TABLE `rule_parameter_backup_7412` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7412` SELECT * FROM `rule_parameter`;

-- 1) Rule definition
INSERT INTO `rule`(
  `id`, `function`, `instance`, `class`,
  `description`, `reference`, `category`,
  `store_structure`, `source`, `detail`,
  `overridability`, `severity`,
  `filiale`, `division`, `owner`,
  `locked`, `modified_by`, `last_modified`
)
VALUES
  (7412001, 7412, '001', 'P',
   'ANR Minimum Rest Between Consecutive Duties', 'ANR',
   'Rest',
   'MultiTable',
   'ANR',
   'Minimum rest between consecutive duties based on duty assignments, DP length, and local night coverage',
   'S', 2,
   'ANR', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 2) Table header
-- Columns:
--   CURRENT DUTY PATTERN     : dep-arr station pattern for current duty (LocationExpr-LocationExpr, '*' for any)
--   NEXT DUTY PATTERN        : dep-arr station pattern for next duty (LocationExpr-LocationExpr, '*' for any)
--   CURRENT DUTY ASSIGNMENTS : assignments of the current duty ('|' separated, '*' for any)
--   NEXT DUTY ASSIGNMENTS    : assignments of the next duty ('|' separated, '*' for any)
--   DP RANGE                 : duty period length of current duty in minutes (HH:mm-HH:mm, inclusive bounds)
--   has Local Night(Y/N)     : whether a local night exists between the two duties (Y/N, '*' to skip)
--   MIN REST TIME            : minimum rest time (HH:mm)
--   INCREMENTAL REST PER DP HOUR : optional extra rest per DP hour above floor(DP RANGE lower) (HH:mm, '*' to ignore)
--   MIN LOCAL NIGHTS         : minimum local night count (* to ignore)
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174200, 7412001, 1,
   'table1Header',
   'CURRENT DUTY PATTERN,NEXT DUTY PATTERN,CURRENT DUTY ASSIGNMENTS,NEXT DUTY ASSIGNMENTS,DP RANGE,has Local Night(Y/N),MIN REST TIME,INCREMENTAL REST PER DP HOUR,MIN LOCAL NIGHTS',
   'ROIS', CURRENT_TIMESTAMP);

-- 3) Table rows
INSERT INTO `rule_parameter`(`id`,`rule_id`,`phase_id`,`param_names`,`param_values`,`modified_by`,`last_modified`) VALUES
  (208174201, 7412001, 1, 'table1Row1',  '*,*,FLY|MVO,*,*,Y,10:00,*,*',       'ROIS', CURRENT_TIMESTAMP),
  (208174202, 7412001, 1, 'table1Row2',  '*,*,FLY|MVO,*,*,N,12:00,*,*',       'ROIS', CURRENT_TIMESTAMP),
  (208174203, 7412001, 1, 'table1Row3',  '*,*,FLY|MVO,*,10:01-11:00,*,11:00,*,*', 'ROIS', CURRENT_TIMESTAMP),
  (208174204, 7412001, 1, 'table1Row4',  '*,*,FLY|MVO,*,11:01-12:00,*,12:00,*,*', 'ROIS', CURRENT_TIMESTAMP),
  (208174205, 7412001, 1, 'table1Row5',  '*,*,FLY|MVO,*,12:01-13:00,*,13:00,*,*', 'ROIS', CURRENT_TIMESTAMP),
  (208174206, 7412001, 1, 'table1Row6',  '*,*,FLY|MVO,*,13:01-14:00,*,14:00,*,*', 'ROIS', CURRENT_TIMESTAMP),
  (208174207, 7412001, 1, 'table1Row7',  '*,*,FLY|MVO,*,14:01-15:00,*,15:00,*,*', 'ROIS', CURRENT_TIMESTAMP),
  (208174208, 7412001, 1, 'table1Row8',  '*,*,FLY|MVO,*,15:01-16:00,*,16:00,*,*', 'ROIS', CURRENT_TIMESTAMP),
  (208174209, 7412001, 1, 'table1Row9',  '*,*,FLY|MVO,*,16:01-99:00,*,24:00,*,1', 'ROIS', CURRENT_TIMESTAMP),
  (208174210, 7412001, 1, 'table1Row10', '*,*,*,FLY|MVO,*,Y,10:00,*,*',       'ROIS', CURRENT_TIMESTAMP),
  (208174211, 7412001, 1, 'table1Row11', '*,*,*,FLY|MVO,*,N,12:00,*,*',       'ROIS', CURRENT_TIMESTAMP),
  (208174212, 7412001, 1, 'table1Row12', '*,*,*,FLY|MVO,10:01-11:00,*,11:00,*,*', 'ROIS', CURRENT_TIMESTAMP),
  (208174213, 7412001, 1, 'table1Row13', '*,*,*,FLY|MVO,11:01-12:00,*,12:00,*,*', 'ROIS', CURRENT_TIMESTAMP),
  (208174214, 7412001, 1, 'table1Row14', '*,*,*,FLY|MVO,12:01-13:00,*,13:00,*,*', 'ROIS', CURRENT_TIMESTAMP),
  (208174215, 7412001, 1, 'table1Row15', '*,*,*,FLY|MVO,13:01-14:00,*,14:00,*,*', 'ROIS', CURRENT_TIMESTAMP),
  (208174216, 7412001, 1, 'table1Row16', '*,*,*,FLY|MVO,14:01-15:00,*,15:00,*,*', 'ROIS', CURRENT_TIMESTAMP),
  (208174217, 7412001, 1, 'table1Row17', '*,*,*,FLY|MVO,15:01-16:00,*,16:00,*,*', 'ROIS', CURRENT_TIMESTAMP),
  (208174218, 7412001, 1, 'table1Row18', '*,*,*,FLY|MVO,16:01-99:00,*,24:00,*,1', 'ROIS', CURRENT_TIMESTAMP);

-- 4) Table 2 (control parameters):
--   SERVICE TYPE: '*' (any), 'J' (passenger), 'F' (freighter)
--   FLEET GROUP: '*' (any), otherwise '|' separated fleet groups
--   IGNORE INTERMEDIATE DUTY ASSIGNMENTS:
--     - '|' separated assignments to skip as rest boundaries (applies in the middle and at pairing ends)
--     - '*' / 'NO' / 'NONE' means disabled for rule 7412
--   ASSIGNMENTS REDUCE REST AND LOCAL NIGHT:
--     - 'NO' / 'NONE' means intermediate duties do not reduce rest/LN
--     - '*' means all intermediate duties reduce rest/LN
--     - otherwise: only assignments in the list reduce rest/LN
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174219, 7412001, 1,
   'table2Header',
   'SERVICE TYPE,FLEET GROUP,IGNORE INTERMEDIATE DUTY ASSIGNMENTS,ASSIGNMENTS REDUCE REST AND LOCAL NIGHT',
   'ROIS', CURRENT_TIMESTAMP),
  (208174220, 7412001, 1,
   'table2Row1',
   '*,*,NO,NO',
   'ROIS', CURRENT_TIMESTAMP);
