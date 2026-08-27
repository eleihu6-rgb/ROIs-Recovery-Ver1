-- ANR (Singapore) reporting (brief) + debrief minimum minutes (Rule 7417)
-- Requires a minimum reporting (brief) time and combined reporting+debrief time.

-- OPTIONAL: backup existing rule records before applying
-- CREATE TABLE `rule_backup_7417` LIKE `rule`;
-- INSERT INTO `rule_backup_7417` SELECT * FROM `rule`;
-- CREATE TABLE `rule_parameter_backup_7417` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7417` SELECT * FROM `rule_parameter`;

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
  (7417001, 7417, '001', 'P',
   'ANR Reporting + Debrief Minimum Time', 'ANR',
   'Duty',
   'Table',
   'ANR',
   'Checks minimum reporting (brief) time and combined reporting + debrief time per duty',
   'S', 2,
   'ANR', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 2) Table header
-- Columns:
--   SERVICE TYPE               : '*' (any), 'J' (passenger), 'F' (freighter)
--   FLEET GROUP                : '*' (any), otherwise '|' separated fleet groups
--   DUTY ASSIGNMENT            : '*' (any), otherwise '|' separated duty assignments
--   MIN TOTAL BRIEF+DEBRIEF    : minimum total minutes for reporting + debrief (HH:MM)
--   MIN BRIEF                  : minimum reporting minutes (HH:MM)
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208279003, 7417001, 1,
   'tableHeader',
   'SERVICE TYPE,FLEET GROUP,DUTY ASSIGNMENT,MIN TOTAL BRIEF+DEBRIEF,MIN BRIEF',
   'ROIS', CURRENT_TIMESTAMP);

-- 3) Configuration row (default: total>=01:30, reporting>=01:00)
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208279004, 7417001, 1,
   'tableRow1',
   '*,*,FLY|M,01:30,*',
   'ROIS', CURRENT_TIMESTAMP);
