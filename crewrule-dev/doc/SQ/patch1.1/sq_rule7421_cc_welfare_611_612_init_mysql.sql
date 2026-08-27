-- 7421 (Instance 010)
-- SQ (Collective Agreement) Cabin Crew Welfare Rest (Rules 6.11 / 6.12) using 7421 engine
--
-- Notes / assumptions (data-only, no code change):
--   - Applies to Cabin Crew (division 'C') via a new 7421 instance.
--   - 6.11 Layover Rest: only applies when BOTH slip-arrival and slip-departure duties are operating.
--   - 6.12 Positioning Rest:
--       * Position Up  : slip-arrival duty is NOT operating, slip-departure duty IS operating.
--       * Position Down: slip-arrival duty IS operating, slip-departure duty is NOT operating.
--   - "Operating duty" is defined as Duty Assignment in {FLY, MVO} (Table 2: DUTY_IS_OPERATING).
--   - Rest-hours mapping by Local Nights (LN):
--       * 1 LN => 21 hours
--       * 2 LN => 45 hours
--       * 3 LN => 60 hours
--   - Region matching uses LocationMatchUtils tokens:
--       * Rxxx = DBAirport.category (Region)
--       * AA   = DBAirport.country (2-letter country)
--       * AAA  = airport code
--
-- Caveats:
--   - Preferred-LN vs fallback-LN rows are not modeled as a "soft preference" here; this instance enforces
--     the minimum legal rest requirements only. Any EXDO/ATDO behavior is handled by other rules (e.g. 7466/7465).
--   - NAM (non-ULR): temporarily excludes JFK|EWR|SEA|LAX only (per requirement).

INSERT INTO `rule`(
  `id`, `function`, `instance`, `class`,
  `description`, `reference`, `category`,
  `store_structure`, `source`, `detail`,
  `overridability`, `severity`,
  `filiale`, `division`, `owner`,
  `locked`, `modified_by`, `last_modified`
)
VALUES
  (7421010, 7421, '010', 'P',
   'CC Welfare Layover/Positioning Minimum Rest (6.11/6.12)', 'SQ',
   'CA',
   'MultiTable',
   'SQ',
   'Cabin crew welfare layover/positioning minimum rest using 7421 slip pattern engine: enforce min slip hours and min local nights by station region, with operating/positioning boundary filters.',
   'H', 2,
   'SQ', 'C', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- ==============================
-- Table 1 (requirements)
-- ==============================

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003700, 7421010, 1,
   'table1Header',
   'Clause,Pattern,Slip station,Group,Priority,Slip Arr Is Operating,Slip Dep Is Operating,Duty Assignment before slip,Duty Assignment after slip,Reporting time at base,Previous Slip Local Nights,Previous Slip had standby,Min slip hours,Min slip local nights,Max slip hours,Slip depart duty report time,Duty After Hours,Duty After Local Nights,Duty After local time,Max Standby periods,Max standby hours,Allowed duty within slip,DO after duty,Extra Condition',
   'ROIS', CURRENT_TIMESTAMP);

-- ------------------------------
-- 6.11 Layover Minimum Rest (CC)
-- ------------------------------
-- Asia (incl DXB): 1 LN => 21h (Operating flights only)
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003701, 7421010, 1,
   'table1Row1',
   '6.11 Asia,*,(RSEA|RNAS|RORI|RCHI|RJAK|RJAP|RSAS|RSOA|RMDE|RMIE),SLIP,1,Y,Y,*,*,*,*,*,21,1,*,*,*,*,*,*,*,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- Australia + New Zealand: 1 LN => 21h (Operating flights only)
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003702, 7421010, 1,
   'table1Row2',
   '6.11 AU/NZ,*,(AU|NZ),SLIP,1,Y,Y,*,*,*,*,*,21,1,*,*,*,*,*,*,*,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- Europe (incl IST): 2 LN => 45h (Operating flights only)
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003703, 7421010, 1,
   'table1Row3',
   '6.11 EUR,*,(REUR|IST),SLIP,1,Y,Y,*,*,*,*,*,45,2,*,*,*,*,*,*,*,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- Africa: 2 LN => 45h (Operating flights only)
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003704, 7421010, 1,
   'table1Row4',
   '6.11 AFR,*,(RAFR|RSFA),SLIP,1,Y,Y,*,*,*,*,*,45,2,*,*,*,*,*,*,*,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- North America: 3 LN => 60h (Operating flights only)
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003705, 7421010, 1,
   'table1Row5',
   '6.11 NAM,*,(RNOA|RAME|RUSP),SLIP,1,Y,Y,*,*,*,*,*,60,3,*,*,*,*,*,*,*,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- --------------------------------
-- 6.12 Positioning Welfare Rest (CC)
-- --------------------------------
-- Position Up: arr NOT operating, dep operating
-- Position Down: arr operating, dep NOT operating

-- Asia (incl DXB) + Australia:
--   - Position Up   : 1 LN => 21h
--   - Position Down : 1 LN => 21h
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003706, 7421010, 1,
   'table1Row6',
   '6.12 Pos Up Asia/AU,*,(RSEA|RNAS|RORI|RCHI|RJAK|RJAP|RSAS|RSOA|RMDE|RMIE|AU),SLIP,1,N,Y,*,*,*,*,*,21,1,*,*,*,*,*,*,*,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003707, 7421010, 1,
   'table1Row7',
   '6.12 Pos Down Asia/AU,*,(RSEA|RNAS|RORI|RCHI|RJAK|RJAP|RSAS|RSOA|RMDE|RMIE|AU),SLIP,1,Y,N,*,*,*,*,*,21,1,*,*,*,*,*,*,*,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- New Zealand / Europe (incl IST) / Africa:
--   - Position Up   : 2 LN => 45h
--   - Position Down : 1 LN => 21h
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003708, 7421010, 1,
   'table1Row8',
   '6.12 Pos Up NZ/EUR/AFR,*,(NZ|REUR|IST|RAFR|RSFA),SLIP,1,N,Y,*,*,*,*,*,45,2,*,*,*,*,*,*,*,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003709, 7421010, 1,
   'table1Row9',
   '6.12 Pos Down NZ/EUR/AFR,*,(NZ|REUR|IST|RAFR|RSFA),SLIP,1,Y,N,*,*,*,*,*,21,1,*,*,*,*,*,*,*,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- North America (non-ULR, temporary list): 3 LN => 60h for both Position Up/Down
-- Exclude JFK/EWR/SEA/LAX from matching (treated as ULR list for now).
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003710, 7421010, 1,
   'table1Row10',
   '6.12 Pos Up NAM non-ULR,*,((RNOA|RAME|RUSP)~(JFK|EWR|SEA|LAX)),SLIP,1,N,Y,*,*,*,*,*,60,3,*,*,*,*,*,*,*,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003711, 7421010, 1,
   'table1Row11',
   '6.12 Pos Down NAM non-ULR,*,((RNOA|RAME|RUSP)~(JFK|EWR|SEA|LAX)),SLIP,1,Y,N,*,*,*,*,*,60,3,*,*,*,*,*,*,*,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- ==============================
-- Table 2 (control parameters)
-- ==============================

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003720, 7421010, 1,
   'table2Header',
   'Sby Reduces Rest and LN,Rest Starts After,Standby Assignments,Operating Definition,Service type,Fleets,Optimizer pass level',
   'ROIS', CURRENT_TIMESTAMP);

-- Default control row:
--   - Standby reduces rest/local nights (SBY within slip reduces effective rest)
--   - Rest starts after transport (dropoff)
--   - Standby assignments include SBY
--   - Operating definition uses duty assignment (Duty::getAssignment() in {FLY, MVO})
--   - Service type not filtered
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003721, 7421010, 1,
   'table2Row1',
   'Y,TRANSPORT,SBY,DUTY_IS_OPERATING,*,*,NONE',
   'ROIS', CURRENT_TIMESTAMP);
