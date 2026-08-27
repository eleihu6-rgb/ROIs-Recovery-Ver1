-- 7422
-- SQ (Collective Agreement) CAI/IST short slip ATDO on return to base (Rule 7422)
-- Clause (10) Cairo and Istanbul
--
-- For SIN-CAI-SIN and SIN-IST-SIN operating patterns where:
--   - crew operates the outbound sector to CAI/IST
--   - crew operates the inbound sector back to SIN
--   - slip at CAI/IST is less than 24 hours
-- then, on return to SIN, the crew shall be granted:
--   - 1 full day off (base-local calendar day), and
--   - the following day off, but may be required for duties after 06:00 LT.
--
-- Table 1: rule rows (pattern + slip threshold + ATDO settings)
-- Table 2: control parameters (rest start interpretation + operating definition)
--
-- Note: PATTERN and SLIP STATION support ACOP-style location expressions (LocationMatchUtils),
-- e.g. SIN-(CAI|IST)-SIN.

INSERT INTO `rule`(
  `id`, `function`, `instance`, `class`,
  `description`, `reference`, `category`,
  `store_structure`, `source`, `detail`,
  `overridability`, `severity`,
  `filiale`, `division`, `owner`,
  `locked`, `modified_by`, `last_modified`
)
VALUES
  (7422001, 7422, '001', 'P',
   'ATDO after slip', 'SQ',
   'CA',
   'MultiTable',
   'SQ',
   'If crew operates pattern and satisfy slip duration threshold, apply ATDO on return',
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
  (200003600, 7422001, 1,
   'table1Header',
   'Clause,Pattern,Slip station,Slip < hours,Slip arr is operating,Slip dep is operating,ATDO days,ATDO hours,ATDO local nights,Following DO allow after,Max pairing days',
   'ROIS', CURRENT_TIMESTAMP);

-- 10(a) Cairo
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003601, 7422001, 1,
   'table1Row1',
   '10(a),SIN-CAI-SIN,CAI,24,Y,Y,1,0,0,06:00,*',
   'ROIS', CURRENT_TIMESTAMP);

-- 10(b) Istanbul
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003602, 7422001, 1,
   'table1Row2',
   '10(b),SIN-IST-SIN,IST,24,Y,Y,1,0,0,06:00,*',
   'ROIS', CURRENT_TIMESTAMP);

-- ==============================
-- Table 2 (control)
-- ==============================

INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003610, 7422001, 1,
   'table2Header',
   'Sby Reduces Rest and LN,Do starts after,Standby Assignments,Operating definition,Service type,Fleets',
   'ROIS', CURRENT_TIMESTAMP);

-- Default control row:
--   - Rest starts after transport (dropoff)
--   - Operating definition uses duty assignment (Duty::getAssignment())
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003611, 7422001, 1,
   'table2Row1',
   'Y,TRANSPORT,SBY,DUTY_IS_OPERATING,*,*',
   'ROIS', CURRENT_TIMESTAMP);
