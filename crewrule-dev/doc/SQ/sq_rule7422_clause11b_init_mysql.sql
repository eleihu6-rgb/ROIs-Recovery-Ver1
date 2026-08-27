-- 7422 (11)(b)
-- SQ (Collective Agreement) - Clause (11)(b) General
--
-- For crew operating patterns to Europe and West Coast Canada/West Coast USA which:
--   - exclude positioning from SIN to Europe / West Coast (i.e., outbound sector must be operating), and
--   - are of six base-local calendar days duration or less
-- then the crew shall be rostered two days off at SIN.
--
-- This is implemented using rule 7422 as a single-slip pattern:
--   SIN -> (target location) -> SIN
-- and setting ATDO=2 on return to SIN.
--
-- Note: West Coast is represented via city-code tokens (Cxxx) in LocationMatchUtils.

INSERT INTO `rule`(
  `id`, `function`, `instance`, `class`,
  `description`, `reference`, `category`,
  `store_structure`, `source`, `detail`,
  `overridability`, `severity`,
  `filiale`, `division`, `owner`,
  `locked`, `modified_by`, `last_modified`
)
VALUES
  (7422002, 7422, '002', 'P',
   'ATDO after slip', 'SQ',
   'CA',
   'MultiTable',
   'SQ',
   'If crew operates SIN-(EU or West Coast)-SIN and pairing duration <= 6 base-local calendar days, apply ATDO=2 on return.',
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
  (200003620, 7422002, 1,
   'table1Header',
   'Clause,Pattern,Slip station,Slip < hours,Max pairing days,Slip arr is operating,Slip dep is operating,ATDO days,ATDO hours,ATDO local nights,Following DO allow after',
   'ROIS', CURRENT_TIMESTAMP);

-- 11(b) Europe (region token REUR)
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003621, 7422002, 1,
   'table1Row1',
   '11(b),SIN-REUR-SIN,REUR,9999,6,Y,Y,2,0,0,00:00',
   'ROIS', CURRENT_TIMESTAMP);

-- 11(b) West Coast Canada/USA (city tokens; adjust list as needed)
-- Example list: LAX/SFO/SEA/PDX/OAK/SAN/YVR
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003622, 7422002, 1,
   'table1Row2',
   '11(b),SIN-(CLAX|CSFO|CSEA|CPDX|COAK|CSAN|CYVR)-SIN,CLAX|CSFO|CSEA|CPDX|COAK|CSAN|CYVR,9999,6,Y,Y,2,0,0,00:00',
   'ROIS', CURRENT_TIMESTAMP);

-- ==============================
-- Table 2 (control)
-- ==============================

INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003630, 7422002, 1,
   'table2Header',
   'Sby Reduces Rest and LN,Rest starts after,Standby Assignments,Operating definition,Service type,Fleets,Pairing length ends at',
   'ROIS', CURRENT_TIMESTAMP);

-- Control row:
--   - Rest starts after transport (dropoff)
--   - Operating definition uses Segment::getIsOperating()
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003631, 7422002, 1,
   'table2Row1',
   'Y,TRANSPORT,SBY,SEGMENT_IS_OPERATING,*,*,DEBRIEF',
   'ROIS', CURRENT_TIMESTAMP);
