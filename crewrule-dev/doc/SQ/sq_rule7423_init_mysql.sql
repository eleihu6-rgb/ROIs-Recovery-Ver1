-- 7423
-- SQ Post-ULR Rest At Base (Rule 7423)

-- Rule definition (MultiTable: Table 1 = requirements, Table 2 = control)
INSERT INTO `rule`(
  `id`, `function`, `instance`, `class`,
  `description`, `reference`, `category`,
  `store_structure`, `source`, `detail`,
  `overridability`, `severity`,
  `filiale`, `division`, `owner`,
  `locked`, `modified_by`, `last_modified`
)
VALUES
  (7423001, 7423, '001', 'P',
   'Post ULR Rest At Base', 'SQ',
   'ATDO',
   'MultiTable',
   'SQ',
   'On completion of a ULR RDA (pairing contains exactly one ULR duty and ends at base), set minimum rest at base; includes cases where crew are positioned back to base after operating the ULR RDA.',
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
  (200003650, 7423001, 1,
   'table1Header',
   'Clause,Has ULR Duty,Post ULR Position Back To Base,Rest days,Rest hours,Rest local nights,Following DO allow after',
   'ROIS', CURRENT_TIMESTAMP);

-- CA example (ULR RDA completion): 4 consecutive local nights free of duty at base.
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003651, 7423001, 1,
   'table1Row1',
   '6.2.2(f) ULR RDA completion,Y,N,0,0,4,00:00',
   'ROIS', CURRENT_TIMESTAMP);

-- CA example (positioned back to base after operating ULR RDA): same as (f).
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003652, 7423001, 1,
   'table1Row2',
   '6.2.2(g) Position back to base after ULR RDA,Y,Y,0,0,4,00:00',
   'ROIS', CURRENT_TIMESTAMP);

-- ==============================
-- Table 2 (control)
-- ==============================

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003660, 7423001, 1,
   'table2Header',
   'Rest starts after,Service type,Fleets',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003661, 7423001, 1,
   'table2Row1',
   'DEBRIEF,*,*',
   'ROIS', CURRENT_TIMESTAMP);

