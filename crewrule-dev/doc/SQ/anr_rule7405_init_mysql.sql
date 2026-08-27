-- ANR ULR duty definition (Rule 7405)
-- Identifies ULR duties based on flight segment properties.
-- A duty is ULR if ANY operating/flying segment matches one row.
-- Effective/Expiry dates are compared using the segment departure LOCAL time (inclusive).
-- Positioning/deadhead segments (e.g. assignment DHD) do NOT make the duty ULR.

-- OPTIONAL: backup existing rule records before applying
-- CREATE TABLE `rule_backup_7405` LIKE `rule`;
-- INSERT INTO `rule_backup_7405` SELECT * FROM `rule`;
-- CREATE TABLE `rule_parameter_backup_7405` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7405` SELECT * FROM `rule_parameter`;

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
  (7405001, 7405, '001', 'P',
   'ANR ULR Duty Definition', 'ANR',
   'DEFINITION',
   'Table',
   'ANR',
   'Defines when a duty is treated as ULR based on segment DEP/ARR, fleet/fleet group, and effective window',
   'S', 2,
   'ANR', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 2) Table header
-- Columns:
--   DEP            : departure station filter (* for any)
--   ARR            : arrival station filter (* for any)
--   Fleet          : fleet code filter (* for any)
--   Fleet Group    : fleet group filter (* for any)
--   Effective Date : inclusive start, local date/time (YYYY-MM-DD[ HH[:MM[:SS]]]) or *
--   Expiry Date    : inclusive end, local date/time (YYYY-MM-DD[ HH[:MM[:SS]]]) or *
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208180001, 7405001, 1,
   'tableHeader',
   'DEP,ARR,Fleet,Fleet Group,Effective Date,Expiry Date',
   'ROIS', CURRENT_TIMESTAMP);

-- 3) Default definition rows (used when DB is empty)
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208180002, 7405001, 1,
   'tableRow1',
   'EWR,SIN,*,350,2025-03-30,2025-10-25',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208180003, 7405001, 1,
   'tableRow2',
   'JFK,SIN,*,350,2025-03-30,2025-10-25',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208180004, 7405001, 1,
   'tableRow3',
   'LAX,SIN,*,350,2025-03-30,2025-10-25',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208180005, 7405001, 1,
   'tableRow4',
   'EWR,SIN,*,350,2025-10-26,2026-03-28',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208180006, 7405001, 1,
   'tableRow5',
   'JFK,SIN,*,350,2025-10-26,2026-03-28',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208180007, 7405001, 1,
   'tableRow6',
   'LAX,SIN,*,350,2025-10-26,2026-03-28',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208180008, 7405001, 1,
   'tableRow7',
   'SFO,SIN,*,350,2025-10-26,2026-03-28',
   'ROIS', CURRENT_TIMESTAMP);
