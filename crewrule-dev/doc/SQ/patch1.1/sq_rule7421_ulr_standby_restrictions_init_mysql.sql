-- 7421 (Instance 013)
-- SQ (Collective Agreement) ULR standby restrictions using 7421 slip pattern engine
--
-- Implements Annex E ULR clause fragments:
--   - After operating a ULR sector OR positioning on an equivalent ULR city pair:
--       * Minimum 48 hours at the same slip station, including 2 local nights (standby reduces rest/LN via gaps)
--       * Standby may be rostered only after 24 hours and 1 local night, with max 6 hours standby within the slip
--   - Equivalent positioning is matched by the special duty token ULR_EQUIVALENT_POS:
--       * Duty assignment is MVP, and the dep/arr + fleet/fleetGroup match rule 7405 rows.
--
-- Notes:
--   - Uses special tokens in "Duty Assignment before slip":
--       * ULR_DUTY: matches Duty::isULR()==true (set by rule 7405)
--       * ULR_EQUIVALENT_POS: matches MVP duties whose segment dep/arr + fleet/fleetGroup match 7405 rows
--   - Service type is filtered to Passenger ('J') via table 2.

INSERT INTO `rule`(
  `id`, `function`, `instance`, `class`,
  `description`, `reference`, `category`,
  `store_structure`, `source`, `detail`,
  `overridability`, `severity`,
  `filiale`, `division`, `owner`,
  `locked`, `modified_by`, `last_modified`
)
VALUES
  (7421030, 7421, '013', 'P',
   'CA ULR Standby Restrictions (Annex E 6.2.2)', 'SQ',
   'CA',
   'MultiTable',
   'SQ',
   'ULR rest and standby limit for ANR and CA.',
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
  (200003780, 7421030, 1,
   'table1Header',
   'Clause,Pattern,Slip station,Group,Priority,Slip Arr Is Operating,Slip Dep Is Operating,Duty Assignment before slip,Duty Assignment after slip,Reporting time at base,Previous Slip Local Nights,Previous Slip had standby,Min slip hours,Min slip local nights,Max slip hours,Slip depart duty report time,Duty After Hours,Duty After Local Nights,Duty After local time,Max Standby periods,Max standby hours,Allowed duty within slip,DO after duty,Extra Condition',
   'ROIS', CURRENT_TIMESTAMP);

-- ULR / ULR-equivalent positioning:
--   - 48h + 2 local nights at the same slip station
--   - Standby allowed only after 24h + 1 local night
--   - Max 6h standby within the slip
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003781, 7421030, 1,
   'table1Row1',
   '6.2.2 ULR,*,*,ULR,1,*,*,ULR_DUTY|ULR_EQUIVALENT_POS,*,*,*,*,48,2,*,*,24,1,*,*,6,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- ==============================
-- Table 2 (control parameters)
-- ==============================

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003790, 7421030, 1,
   'table2Header',
   'Sby Reduces Rest and LN,Rest Starts After,Standby Assignments,Operating Definition,Service type,Fleets,Optimizer pass level',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003791, 7421030, 1,
   'table2Row1',
   'Y,TRANSPORT,SBY,DUTY_IS_OPERATING,J,*,NONE',
   'ROIS', CURRENT_TIMESTAMP);

