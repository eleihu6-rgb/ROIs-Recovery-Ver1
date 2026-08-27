-- SQ operational coterminal duty connection restriction (Rule 7451)
-- Controls which slip connections between coterminal airports are NOT allowed.
-- Notes:
--   - Coterminal is determined by airport city code (AIRPORT.CITY).
--   - Positioning/deadheading on flight sectors between coterminals is not allowed by the engine logic.

-- Optional backup
-- CREATE TABLE `rule_backup_7451` LIKE `rule`;
-- INSERT INTO `rule_backup_7451` SELECT * FROM `rule` WHERE `function` = 7451;
-- CREATE TABLE `rule_parameter_backup_7451` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7451`
--   SELECT * FROM `rule_parameter` WHERE `rule_id` BETWEEN 7451001 AND 7451999;

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
  (7451001, 7451, '001', 'P',
   'Restrict Coterminal Duty Connection (Operational)', 'SQ',
   'Duty',
   'Table',
   'Company',
   'Restricts specified coterminal slip connections between duties and forbids deadhead/positioning on flight sectors between coterminals.',
   'H', 2,
   'SQ', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 2) Table header
-- Columns:
--   PREV DUTY ARRIVAL     : airport code of previous duty last segment arrival (e.g. LHR)
--   PREV DUTY ASSIGNMENT  : assignment of previous duty last segment (e.g. FLY, MVP), '*' for any
--   NEXT DUTY DEPART      : airport code of next duty first segment departure (e.g. LGW)
--   NEXT DUTY ASSIGNMENT  : assignment of next duty first segment (e.g. FLY, MVP), '*' for any
--   ACTIVE                : Y/N
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200074510, 7451001, 1,
   'tableHeader',
   'PREV DUTY ARRIVAL,PREV DUTY ASSIGNMENT,NEXT DUTY DEPART,NEXT DUTY ASSIGNMENT,ACTIVE',
   'ROIS', CURRENT_TIMESTAMP);

-- 3) Restrict any duty ending at LHR to any duty starting at LGW
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200074511, 7451001, 1,
   'tableRow1',
   'LHR,*,LGW,*,Y',
   'ROIS', CURRENT_TIMESTAMP);

-- 4) Restrict any duty ending at LGW to a positioning/deadhead duty starting at LHR (MVP)
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200074512, 7451001, 1,
   'tableRow2',
   'LGW,*,LHR,MVP,Y',
   'ROIS', CURRENT_TIMESTAMP);

