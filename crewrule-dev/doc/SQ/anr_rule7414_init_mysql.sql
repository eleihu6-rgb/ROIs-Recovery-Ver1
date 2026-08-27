-- ANR (Singapore) consecutive special duty rest requirement (Rule 7414)
-- Applies to early start, late finish, or duties with take-off/landing in WOCL.

-- OPTIONAL: backup existing rule records before applying
-- CREATE TABLE `rule_backup_7414` LIKE `rule`;
-- INSERT INTO `rule_backup_7414` SELECT * FROM `rule`;
-- CREATE TABLE `rule_parameter_backup_7414` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7414` SELECT * FROM `rule_parameter`;

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
  (7414001, 7414, '001', 'P',
   'ANR Consecutive Special Duty Rest Requirement', 'ANR',
   'REST',
   'MultiTable',
   'ANR',
   'Ensure rest between consecutive early start/late finish/WOCL duties meets ANR limits',
   'S', 2,
   'ANR', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 2) Table 1 header
-- Columns:
--   INCLUDE TRAILING DEADHEAD : Y/N, whether trailing deadhead counts toward late finish/WOCL checks
--   REST TYPE                 : IN (inside), PRE (prior), POST (post) rest location for the consecutive-duty check
--   NUM CONSECUTIVE DUTIES    : number of consecutive special duties to guard against (e.g. 3 for IN, 2 for PRE)
--   MIN REST TIME             : required rest (HH:mm)
--   MIN LOCAL NIGHTS          : required local nights in that rest (* to ignore, default 1)
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208178100, 7414001, 1,
   'table1Header',
   'INCLUDE TRAILING DEADHEAD,REST TYPE,NUM CONSECUTIVE DUTIES,MIN REST TIME,MIN LOCAL NIGHTS',
   'ROIS', CURRENT_TIMESTAMP);

-- 3) Table 1 configuration rows
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208178101, 7414001, 1,
   'table1Row1',
   'Y,IN,3,24:00,1',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208178102, 7414001, 1,
   'table1Row2',
   'Y,PRE,2,24:00,1',
   'ROIS', CURRENT_TIMESTAMP);

-- 4) Table 2 control parameters
--   IGNORE INTERMEDIATE DUTY ASSIGNMENTS:
--     - '|' separated assignments to skip when counting consecutive special duties
--     - '*' / 'NO' / 'NONE' means disabled
--   ASSIGNMENTS REDUCE REST AND LOCAL NIGHT:
--     - 'NO' / 'NONE' means intermediate duties do not reduce rest/LN
--     - '*' means all intermediate duties reduce rest/LN
--     - otherwise: only assignments in the list reduce rest/LN
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208178103, 7414001, 1,
   'table2Header',
   'IGNORE INTERMEDIATE DUTY ASSIGNMENTS,ASSIGNMENTS REDUCE REST AND LOCAL NIGHT',
   'ROIS', CURRENT_TIMESTAMP),
  (208178104, 7414001, 1,
   'table2Row1',
   'NO,NO',
   'ROIS', CURRENT_TIMESTAMP);
