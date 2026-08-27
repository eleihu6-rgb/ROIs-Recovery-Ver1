-- 7421 (Instances 011/012)
-- SQ (Collective Agreement) Freighter Layover Rest (6.17) using 7421 engine
--
-- Requirements (summary):
--   744F:
--     - JNB-NBO-AMS: minimum 2 hotel nights rest before ex-JNB
--     - MAA-AMS: maximum 72 hours before ex-MAA
--   777F:
--     - minimum 1 hotel night rest before ex-LAX
--
-- Notes:
--   - These are modeled as slip constraints at the "ex-XXX" station (slip station).
--   - Slip-arrival duty operating is NOT required (Slip Arr Is Operating='*').
--   - Slip-depart duty must be operating (Slip Dep Is Operating='Y') using Table 2 Operating Definition = DUTY_IS_OPERATING (Duty assignment in {FLY,MVO}).
--   - Pattern uses 7421 wildcards:
--       ** : match any number (including 0) of stations (regex-like ".*")
--       ?  : match exactly one station (regex-like ".")
--       *  : legacy "any" token (can span multiple stations); interior '*' has special meaning (see 7421 doc)
--   - Fleet filtering is via Table 2 Fleets (all operating segments must have fleetCD in the list).
--   - Freighter filtering is via Table 2 Service type = F.

-- ======================================================
-- 7421-011: 744F fleet freighter layover rest constraints
-- ======================================================

INSERT INTO `rule`(
  `id`, `function`, `instance`, `class`,
  `description`, `reference`, `category`,
  `store_structure`, `source`, `detail`,
  `overridability`, `severity`,
  `filiale`, `division`, `owner`,
  `locked`, `modified_by`, `last_modified`
)
VALUES
  (7421011, 7421, '011', 'P',
   'Freighter Layover Rest (6.17) - 744F', 'SQ',
   'CA',
   'MultiTable',
   'SQ',
   'Freighter layover rest constraints for 744F (JNB min 2 hotel nights before ex-JNB; MAA max 72h before ex-MAA).',
   'H', 2,
   'SQ', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- Table 1
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003730, 7421011, 1,
   'table1Header',
   'Clause,Pattern,Slip station,Group,Priority,Slip Arr Is Operating,Slip Dep Is Operating,Duty Assignment before slip,Duty Assignment after slip,Reporting time at base,Previous Slip Local Nights,Previous Slip had standby,Min slip hours,Min slip local nights,Max slip hours,Slip depart duty report time,Duty After Hours,Duty After Local Nights,Duty After local time,Max Standby periods,Max standby hours,Allowed duty within slip,DO after duty,Extra Condition',
   'ROIS', CURRENT_TIMESTAMP);

-- 744F: JNB-NBO-AMS (modeled as JNB->AMS duty in station chain; ignore NBO mid-duty stop)
-- Minimum 2 local nights rest before ex-JNB.
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003731, 7421011, 1,
   'table1Row1',
   '6.17 744F JNB,**-JNB-AMS-**,JNB,744F,1,*,Y,*,*,*,*,*,*,2,*,*,*,*,*,*,*,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- 744F: MAA-AMS
-- Maximum 72 hours slip before ex-MAA.
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003732, 7421011, 1,
   'table1Row2',
   '6.17 744F MAA,**-MAA-AMS-**,MAA,744F,1,*,Y,*,*,*,*,*,*,0,72,*,*,*,*,*,*,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- Table 2 (control)
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003733, 7421011, 1,
   'table2Header',
   'Sby Reduces Rest and LN,Rest Starts After,Standby Assignments,Operating Definition,Service type,Fleets,Optimizer pass level',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003734, 7421011, 1,
   'table2Row1',
   'Y,TRANSPORT,SBY,DUTY_IS_OPERATING,F,744F,NONE',
   'ROIS', CURRENT_TIMESTAMP);

-- ======================================================
-- 7421-012: 777F fleet freighter layover rest constraints
-- ======================================================

INSERT INTO `rule`(
  `id`, `function`, `instance`, `class`,
  `description`, `reference`, `category`,
  `store_structure`, `source`, `detail`,
  `overridability`, `severity`,
  `filiale`, `division`, `owner`,
  `locked`, `modified_by`, `last_modified`
)
VALUES
  (7421012, 7421, '012', 'P',
   'Freighter Layover Rest (6.17) - 777F', 'SQ',
   'CA',
   'MultiTable',
   'SQ',
   'Freighter layover rest constraints for 777F (min 1 hotel night before ex-LAX).',
   'H', 2,
   'SQ', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- Table 1
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003740, 7421012, 1,
   'table1Header',
   'Clause,Pattern,Slip station,Group,Priority,Slip Arr Is Operating,Slip Dep Is Operating,Duty Assignment before slip,Duty Assignment after slip,Reporting time at base,Previous Slip Local Nights,Previous Slip had standby,Min slip hours,Min slip local nights,Max slip hours,Slip depart duty report time,Duty After Hours,Duty After Local Nights,Duty After local time,Max Standby periods,Max standby hours,Allowed duty within slip,DO after duty,Extra Condition',
   'ROIS', CURRENT_TIMESTAMP);

-- 777F: minimum 1 hotel night rest before ex-LAX (no route restriction given).
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003741, 7421012, 1,
   'table1Row1',
   '6.17 777F LAX,**-LAX-**,LAX,777F,1,*,Y,*,*,*,*,*,*,1,*,*,*,*,*,*,*,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- Table 2 (control)
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003742, 7421012, 1,
   'table2Header',
   'Sby Reduces Rest and LN,Rest Starts After,Standby Assignments,Operating Definition,Service type,Fleets,Optimizer pass level',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003743, 7421012, 1,
   'table2Row1',
   'Y,TRANSPORT,SBY,DUTY_IS_OPERATING,F,777F,NONE',
   'ROIS', CURRENT_TIMESTAMP);

