-- 7420 法规
-- SQ (Collective Agreement) ACOP FDP pattern - Table A (Rule 7420)
-- Table A defines trigger flights by dep/arr and reporting window that limit operating sectors,
-- plus optional restrictions on when the next duty may start and forbidden next-duty patterns.

-- Optional backup
-- CREATE TABLE `rule_backup_7420` LIKE `rule`;
-- INSERT INTO `rule_backup_7420` SELECT * FROM `rule` WHERE `function` = 7420;
-- CREATE TABLE `rule_parameter_backup_7420` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7420`
--   SELECT * FROM `rule_parameter` WHERE `rule_id` BETWEEN 7420001 AND 7420999;


INSERT INTO `rule`(
  `id`, `function`, `instance`, `class`,
  `description`, `reference`, `category`,
  `store_structure`, `source`, `detail`,
  `overridability`, `severity`,
  `filiale`, `division`, `owner`,
  `locked`, `modified_by`, `last_modified`
)
VALUES
  (7420001, 7420, '001', 'P',
   'ACOP FDP pattern Table A', 'SQ',
   'CA',
   'MultiTable',
   'SQ',
   'Generic ACOP rule to limit FDP and future duties based on direct flight.',
   'H', 2,
   'SQ', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003421, 7420001, 1,
   'table1Header',
   'Clause,Flight Dep,Flight Arr,Reporting time (LT),Limitation: max operating sectors in FDP,Limitation: deadhead allowed,Next duty day offset,Forbidden next pattern,Applies at slip station',
   'ROIS', CURRENT_TIMESTAMP);

-- ===================================================
-- (2) Orient
-- ===================================================

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003422, 7420001, 1,
   'table1Row1',
   '(2),SIN,CTYO|COSA|CFUK|CNGO|CSDJ,22:00-02:59,1,Yes,0,No,*',
   'ROIS', CURRENT_TIMESTAMP);

-- ===================================================
-- (3)(a) Australia And New Zealand
-- ===================================================

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003423, 7420001, 1,
   'table1Row2',
   '(3)(a),SIN,SYD|MEL|ADL|BNE,18:00-00:00,1,Yes,1,OPERATING_LEGS_TO_SIN >= 2,SYD|MEL|ADL|BNE',
   'ROIS', CURRENT_TIMESTAMP);

-- ==============================
-- Table 2 (control parameters)
-- ==============================

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003460, 7420001, 1,
   'table2Header',
   'Service type,Optimizer pass level',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003461, 7420001, 1,
   'table2Row1',
   '*,NONE',
   'ROIS', CURRENT_TIMESTAMP);
