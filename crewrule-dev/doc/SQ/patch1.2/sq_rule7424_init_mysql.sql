-- 7424
-- SQ Overnight Arrival ATDO at Base (Rule 7424)
--
-- Conditions are AND-ed when configured:
--   - Overnight arrival after threshold (cross-midnight + arrive after HH:MM)
--   - Minimum FDP threshold
--   - Final segment start station list (e.g., KTM)
-- Use '*' to ignore a condition.

INSERT INTO `rule`(
  `id`, `function`, `instance`, `class`,
  `description`, `reference`, `category`,
  `store_structure`, `source`, `detail`,
  `overridability`, `severity`,
  `filiale`, `division`, `owner`,
  `locked`, `modified_by`, `last_modified`
)
VALUES
  (7424001, 7424, '001', 'P',
   'Overnight arrival ATDO at base', 'SQ',
   'ATDO',
   'MultiTable',
   'SQ',
   'Apply ATDO on return to base when overnight/FDP/start-station conditions match.',
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
  (200003670, 7424001, 1,
   'table1Header',
   'Clause,ATDO days,Overnight Arrive After,Min FDP,Final Start Stations',
   'ROIS', CURRENT_TIMESTAMP);

-- Clause b: Overnight flight arriving after 02:30 LT and FDP > 08:00 -> 2 ATDO days.
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES
  (200003671, 7424001, 1,
   'table1Row1',
   '5.13,1,02:30,08:00,*',
   'ROIS', CURRENT_TIMESTAMP);


-- ==============================
-- Table 2 (control)
-- ==============================

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003680, 7424001, 1,
   'table2Header',
   'DO starts after,Service type,Fleet Group',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003681, 7424001, 1,
   'table2Row1',
   'DEBRIEF,*,737',
   'ROIS', CURRENT_TIMESTAMP);
