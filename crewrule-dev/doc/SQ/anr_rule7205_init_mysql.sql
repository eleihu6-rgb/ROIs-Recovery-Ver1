-- ANR (Singapore) duty-period limits in consecutive 14 local days (Rule 7205)
-- Based on ANR-121 Section 12:
--   * Flight crew: cumulative DP must not exceed 90 hours in any 14 consecutive days
--   * Cabin crew: cumulative DP must not exceed 100 hours in any 14 consecutive days
-- The rule is configured as a sliding window (UNIT=CD) with the DP ceiling encoded
-- through the new "Limit DP Range" column (HH:mm-HH:mm, inclusive lower bound,
-- exclusive upper bound).

-- OPTIONAL: backup existing rule records before applying (adjust table names as needed)
-- CREATE TABLE `rule_backup_7205` LIKE `rule`;
-- INSERT INTO `rule_backup_7205` SELECT * FROM `rule` WHERE `function` = 7205;
-- CREATE TABLE `rule_parameter_backup_7205` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7205`
--   SELECT * FROM `rule_parameter`
--   WHERE `rule_id` IN (SELECT `id` FROM `rule` WHERE `function` = 7205);

-- ---------------------------------------------------------------------------
-- Flight Crew (division P) – 90 hours DP in any 14 consecutive local days
-- ---------------------------------------------------------------------------
INSERT INTO `rule`(
  `id`, `function`, `instance`, `class`,
  `description`, `reference`, `category`,
  `store_structure`, `source`, `detail`,
  `overridability`, `severity`,
  `filiale`, `division`, `owner`,
  `locked`, `modified_by`, `last_modified`
)
VALUES
  (7205001, 7205, '001', 'B',
   'Max Duty Period', 'ANR',
   'Pairing',
   'Table',
   'ANR',
   'Ensures each flight crew member accumulates no more than 90 duty hours in any consecutive 14 local days',
   'S', 2,
   'ANR', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- Table header (adds the new Limit DP Range column alongside BLH/FDP placeholders)
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208172050, 7205001, 1,
   'Bases,Ranks,Fleets,Teams,Compositions,Duty Assignments,Duty Type,Period,Unit,Limit Flight Time Range,Limit FDP Range,Limit DP Range',
   'Bases,Ranks,Fleets,Teams,Compositions,Duty Assignments,Duty Type,Period,Unit,Limit Flight Time Range,Limit FDP Range,Limit DP Range',
   'ROIS', CURRENT_TIMESTAMP);

-- Flight crew threshold: Ranks = FD, DP limit 00:00-90:01 (exclusive upper bound)
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208172051, 7205001, 1,
   'tableRow1',
   '*,FD,*,*,*,*,*,14,CD,*,*,00:00-90:01',
   'ROIS', CURRENT_TIMESTAMP);

