-- 7421
-- SQ (Collective Agreement) ACOP slip pattern - Template B (Rule 7421)
-- Table 1 defines slip limitations and allowed duties within slips.
-- Table 2 defines control parameters affecting rest/local-night and standby interpretation.
-- Extra Condition tokens (Table 1):
--   - EUR_4B (clause-specific logic)
--   - 9AI_STBY (clause 9(a)(i) standby period limits by crew composition)
--   - ATDO=<N> (minimum days off at base on return; 7465-style: defines a day-off window from rest start with midnight alignment)
--   - EXDO=<N> (extra days off at base; 7466-style: extends existing min rest then aligns rest END to midnight)
-- Pattern wildcards (Table 1 "Pattern"):
--   - "*"  : match any station(s) (existing behavior; token can cover multiple stations)
--   - "**" : match any number (including 0) of stations (regex-like ".*")
--   - "?"  : match exactly one station (regex-like ".")
--   - Interior "*" has special meaning: it must NOT match the previous or next pattern token (e.g. SIN-*-AU-SIN).

-- Optional backup
-- CREATE TABLE `rule_backup_7421` LIKE `rule`;
-- INSERT INTO `rule_backup_7421` SELECT * FROM `rule` WHERE `function` = 7421;
-- CREATE TABLE `rule_parameter_backup_7421` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7421`
--   SELECT * FROM `rule_parameter` WHERE `rule_id` BETWEEN 7421001 AND 7421999;

INSERT INTO `rule`(
  `id`, `function`, `instance`, `class`,
  `description`, `reference`, `category`,
  `store_structure`, `source`, `detail`,
  `overridability`, `severity`,
  `filiale`, `division`, `owner`,
  `locked`, `modified_by`, `last_modified`
)
VALUES
  (7421001, 7421, '001', 'P',
   'ACOP slip pattern Template B', 'SQ',
   'CA',
   'MultiTable',
   'SQ',
   'Generic ACOP rule to limit slip duration/local nights and constrain standby/allowed duties during slip periods.',
   'H', 2,
   'SQ', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- ==============================
-- Table 1 (slip limitation)
-- ==============================

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003520, 7421001, 1,
   'table1Header',
   'Clause,Pattern,Slip station,Group,Priority,Slip Arr Is Operating,Slip Dep Is Operating,Duty Assignment before slip,Duty Assignment after slip,Reporting time at base,Previous Slip Local Nights,Previous Slip had standby,Min slip hours,Min slip local nights,Max slip hours,Slip depart duty report time,Duty After Hours,Duty After Local Nights,Duty After local time,Max Standby periods,Max standby hours,Allowed duty within slip,DO after duty,Extra Condition',
   'ROIS', CURRENT_TIMESTAMP);

-- (3)(b)
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003521, 7421001, 1,
   'table1Row1',
   '(3)(b),SIN-ADL-MEL in single FDP,MEL,SLIP,1,Y,*,*,*,18:00-04:00,*,*,*,2,*,*,*,*,*,2,6,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- (3)(c)
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003522, 7421001, 1,
   'table1Row2',
   '(3)(c),SIN-PER flight,PER,SLIP,1,Y,*,*,*,18:00-04:00,*,*,10,*,*,*,*,*,*,2,0,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- (3)(d) part 1
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003523, 7421001, 1,
   'table1Row3',
   '(3)(d) part 1,SIN-NZ-SIN,NZ,SLIP,1,Y,*,*,*,18:00-04:00,*,*,*,2,*,*,*,*,00:00,2,6,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- (3)(d) part 2
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003524, 7421001, 1,
   'table1Row4',
   '(3)(d) part 2,SIN-NZ-SIN,NZ,SLIP,1,N,Y,*,*,*,*,*,24,1,*,*,24,1,*,1,6,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- (3)(d) part 3
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003525, 7421001, 1,
   'table1Row5',
   '(3)(d) part 3,SIN-NZ-SIN,NZ,DUTY,1,*,*,*,*,*,*,*,*,*,*,*,*,1,*,0,0,POS in NZ,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- (3)(e) part 1
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003526, 7421001, 1,
   'table1Row6',
   '(3)(e) part 1,SIN-(AU~PER)|NZ-SIN,(AU~PER)|NZ,SLIP,1,Y,N,*,*,*,*,*,0,1,*,*,*,*,*,0,0,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- (3)(e) part 2
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003527, 7421001, 1,
   'table1Row7',
   '(3)(e) part 2,SIN-PER-SIN,PER,SLIP,1,Y,N,*,*,*,*,*,10,*,*,*,*,*,*,0,0,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- (3)(f) AU
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003528, 7421001, 1,
   'table1Row8',
   '(3)(f),SIN-AU-NZ-SIN,AU,SLIP,1,*,*,*,*,*,*,*,*,1,*,*,*,*,*,0,0,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- (3)(f) NZ
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003529, 7421001, 1,
   'table1Row9',
   '(3)(f),SIN-AU-NZ-SIN,NZ,SLIP,1,*,*,*,*,*,*,*,*,1,*,*,*,*,*,0,0,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- (4)(a)(i)
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003530, 7421001, 1,
   'table1Row10',
   '(4)(a)(i),SIN-CLON-SIN,CLON,SLIP,1,*,*,*,*,22:00-02:59,*,*,0,2,*,06:00,*,*,00:00,2,6,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- (4)(d)(i)
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003531, 7421001, 1,
   'table1Row11',
   '(4)(d)(i),SIN-REUR-SIN,REUR,SLIP,1,N,*,*,*,*,*,*,24,1,*,*,*,*,*,*,*,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- (4)(d)(ii)
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003532, 7421001, 1,
   'table1Row12',
   '(4)(d)(ii),SIN-REUR-SIN,REUR,DUTY,1,N,*,*,*,*,*,*,*,1,*,*,*,*,*,0,0,POS | FDP <=6h,1,*',
   'ROIS', CURRENT_TIMESTAMP);

-- (4)(e)
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003533, 7421001, 1,
   'table1Row13',
   '(4)(e),SIN-REUR-SIN,REUR,SLIP,1,Y,N,*,*,*,*,*,24,1,*,*,*,*,*,0,0,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- (5)(h) LAX
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003534, 7421001, 1,
   'table1Row14',
   '5(h),SIN-TYO-LAX-TYO-LAX,LAX,SLIP,1,*,*,*,*,*,*,*,*,2,*,*,*,*,*,2,6,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- (5)(h) TYO 1
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003535, 7421001, 1,
   'table1Row15',
   '5(h),SIN-TYO-LAX-TYO-LAX,TYO 1,SLIP,1,*,*,*,*,*,*,*,*,1,*,*,*,*,*,0,0,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- (5)(h) TYO 2
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003536, 7421001, 1,
   'table1Row16',
   '5(h),SIN-TYO-LAX-TYO-LAX,TYO 2,SLIP,1,*,*,*,*,*,*,*,*,1,*,*,*,*,*,0,0,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- (6)(a) REUR 1
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003537, 7421001, 1,
   'table1Row17',
   '6(a),SIN-REUR-RNOA-REUR-SIN,REUR 1,SLIP,1,*,*,*,*,*,*,*,*,2,*,*,*,*,*,2,6,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- (6)(b) RNOA (2 local nights with standby after first LN)
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003538, 7421001, 1,
   'table1Row18',
   '6(b),SIN-REUR-RNOA-REUR-SIN,RNOA,SLIP,1,*,*,*,*,*,*,*,*,2,*,*,*,*,*,2,6,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- (6)(b) RNOA (at least 1 local night)
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003539, 7421001, 1,
   'table1Row19',
   '6(b),SIN-REUR-RNOA-REUR-SIN,RNOA,SLIP,1,*,*,*,*,*,*,*,*,1,*,*,*,*,*,0,0,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- (6)(c) REUR 2, if previous slip (RNOA) is >= 1 local night -> need >= 2 local nights with standby after first LN
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003540, 7421001, 1,
   'table1Row20',
   '6(c),SIN-REUR-RNOA-REUR-SIN,REUR 2,SLIP,1,*,*,*,*,*,1,*,*,2,*,*,*,*,*,2,6,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- (6)(c) REUR 2, if previous slip (RNOA) is >= 2 local nights -> need >= 1 local night
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003541, 7421001, 1,
   'table1Row21',
   '6(c),SIN-REUR-RNOA-REUR-SIN,REUR 2,SLIP,1,*,*,*,*,*,2,*,*,1,*,*,*,*,*,0,0,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- (9)(a)(i) JNB: after 1 LN can operate JNB-CPT-JNB or JNB-DUR-JNB, or standby (up to 6h)
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003542, 7421001, 1,
   'table1Row22',
   '9(a)(i),SIN-JNB-SIN,JNB,DUTY,1,*,*,*,*,*,*,*,*,2,*,*,*,1,*,2,6,Duty IN (JNB-CPT-JNB; JNB-DUR-JNB),0,9AI_STBY',
   'ROIS', CURRENT_TIMESTAMP);

-- (9)(a)(i) JNB: positioning back after 24h incl 1 LN (except PER logic not applicable here)
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003543, 7421001, 1,
   'table1Row23',
   '9(a)(i),SIN-JNB-SIN,JNB,SLIP,1,Y,N,*,*,*,*,*,24,1,*,*,*,*,*,*,*,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- (9)(a)(ii) JNB: after positioning, operate JNB-SIN after 24h incl 1 LN
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003544, 7421001, 1,
   'table1Row24',
   '9(a)(ii),SIN-JNB-SIN,JNB,SLIP,1,N,Y,*,*,*,*,*,24,1,*,*,*,*,*,*,*,*,0,*',
   'ROIS', CURRENT_TIMESTAMP);

-- (4)(b) Europe (with EUR_4B extra condition)
-- For crew operating patterns from SIN/BKK/CMB/MLE to Europe: slip >= 2 local nights in Europe.
-- If standby occurs on any day within the slip, EUR_4B enforces day-after-standby rules (COP within Europe after 06:00 + 1 DO, or depart out of Europe after 06:00).
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003547, 7421001, 1,
   'table1Row25',
   '4(b),(SIN|BKK|CMB|MLE)-REUR-*,REUR,SLIP,1,Y,*,*,*,*,*,*,*,2,*,*,*,*,00:00,2,6,POS IN REUR | FDP <=6H IN REUR,1,EUR_4B',
   'ROIS', CURRENT_TIMESTAMP);

-- ==============================
-- Table 2 (control parameters)
-- ==============================

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003545, 7421001, 1,
   'table2Header',
   'Sby Reduces Rest and LN,Rest Starts After,Standby Assignments,Operating Definition,Service type,Fleets,Optimizer pass level',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003546, 7421001, 1,
   'table2Row1',
   'Y,TRANSPORT,SBY,DUTY_IS_OPERATING,*,*,NONE',
   'ROIS', CURRENT_TIMESTAMP);
