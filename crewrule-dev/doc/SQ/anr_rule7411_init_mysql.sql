-- ANR (Singapore) sector counting definition (Rule 7411)
-- Used by rule 7410 to adjust the effective number of sectors for long sectors
-- based on sector length and time zone difference.

-- OPTIONAL: backup existing rule records before applying
-- CREATE TABLE `rule_backup_7411` LIKE `rule`;
-- INSERT INTO `rule_backup_7411` SELECT * FROM `rule`;
-- CREATE TABLE `rule_parameter_backup_7411` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7411` SELECT * FROM `rule_parameter`;

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
  (7411001, 7411, '001', 'P',
   'ANR FDP Limit Sector Adjustment Definition', 'ANR',
   'FDP',
   'Table',
   'ANR',
   'Sector length and TZ-diff based sector count adjustment for ANR FDP limit',
   'S', 2,
   'ANR', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 2) Table header
-- Columns:
--   SECTOR LENGTH LOWER : inclusive lower bound of sector length (HHMM)
--   SECTOR LENGTH UPPER : inclusive upper bound of sector length (HHMM)
--   TZ DIFF             : time zone difference between acclimated time and local time (HH:MM-HH:MM, both inclusive)
--   SECTOR VALUE        : adjusted sector value (e.g. 2,3,4)
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174110, 7411001, 1,
   'tableHeader',
   'SECTOR LENGTH LOWER,SECTOR LENGTH UPPER,TZ DIFF,SECTOR VALUE',
   'ROIS', CURRENT_TIMESTAMP);

-- 3) Table rows (example from Table B)
-- Long sector adjustment table (2-pilot only)
-- Format: BLOCK LOWER, BLOCK UPPER, TZ DIFF, SECTOR COUNT

-- Row 1: 07:00 <= length <= 09:00, TZ diff 00:00-02:00 (Table A), counts as 2 sectors
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208176001, 7411001, 1,
   'tableRow1',
   '0701,0900,00:00-02:00,2',
   'ROIS', CURRENT_TIMESTAMP);

-- Row 2: 09:00 < length <= 11:00, TZ diff 00:00-02:00 (Table A), counts as 3 sectors
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208176002, 7411001, 1,
   'tableRow2',
   '0901,1100,00:00-02:00,3',
   'ROIS', CURRENT_TIMESTAMP);

-- Row 3: length > 11:00 (11:00–24:00], TZ diff 00:00-02:00 (Table A), counts as 4 sectors
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208176003, 7411001, 1,
   'tableRow3',
   '1101,9900,00:00-02:00,4',
   'ROIS', CURRENT_TIMESTAMP);

-- Row 4: 07:00 < length <= 09:00, TZ diff 02:01-24:00 (Table B), counts as 3 sectors
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208176004, 7411001, 1,
   'tableRow4',
   '0701,0900,02:01-24:00,3',
   'ROIS', CURRENT_TIMESTAMP);

-- Row 5: 09:00 < length <= 11:00, TZ diff 02:01-24:00 (Table B), counts as 4 sectors
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208176005, 7411001, 1,
   'tableRow5',
   '0901,1100,02:01-24:00,4',
   'ROIS', CURRENT_TIMESTAMP);

-- Row 6: length > 11:00 (11:00–24:00], TZ diff 02:01-24:00 (Table B), counts as 5 sectors
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208176006, 7411001, 1,
   'tableRow6',
   '1101,9900,02:01-24:00,5',
   'ROIS', CURRENT_TIMESTAMP);
