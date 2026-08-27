-- 7400 法规
-- ANR (Singapore) acclimatisation definition (Rule 7400)
-- Requires LOCAL_NIGHT_DEFINITION (2014) to be present for local night windows

-- Backup (optional)
-- CREATE TABLE `rule_backup_7400` LIKE `rule`;
-- INSERT INTO `rule_backup_7400` SELECT * FROM `rule`;
-- CREATE TABLE `rule_parameter_backup_7400` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7400` SELECT * FROM `rule_parameter`;

-- Insert rule definition
INSERT INTO `rule`(`id`, `function`, `instance`, `class`, `description`, `reference`, `category`, `store_structure`, `source`, `detail`, `overridability`, `severity`, `filiale`, `division`, `owner`, `locked`, `modified_by`, `last_modified`)
VALUES (7400001, 7400, '001', 'P', 'ANR Acclimatization Definition', 'ANR', 'Duty', 'Table', 'ANR', 'Acclimatized time changes after N consecutive local nights free of duty within a timezone', 'S', 2, 'ANR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- Parameters: single table with MIN LN and SEVERITY
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified)
VALUES (200003313, 7400001, 1, 'tableHeader', 'MIN LN', 'ROIS', CURRENT_TIMESTAMP);

-- Default: 3 consecutive local nights, severity 2
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified)
VALUES (200003314, 7400001, 1, 'tableRow1', '3', 'ROIS', CURRENT_TIMESTAMP);


-- 7401 法规
-- ANR (Singapore) day off definition (Rule 7401)
-- Shared by downstream ANR rules that need to identify how many
-- days off a rest period contains.

-- OPTIONAL: backup existing rule records before applying
-- CREATE TABLE `rule_backup_7401` LIKE `rule`;
-- INSERT INTO `rule_backup_7401` SELECT * FROM `rule`;
-- CREATE TABLE `rule_parameter_backup_7401` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7401` SELECT * FROM `rule_parameter`;

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
  (7401001, 7401, '001', 'P',
   'ANR Day Off Definition', 'ANR',
   'REST',
   'Table',
   'ANR',
   'Defines minimum rest hours and local nights for each ANR day-off sequence',
   'S', 2,
   'ANR', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 2) Table header
-- Columns:
--   DAY OFF SEQUENCE : sequence index or range (e.g. 1, 2-99) within a consecutive block
--   MIN REST TIME    : minimum hours free of duty for that sequence (HH or HH:MM)
--   MIN LOCAL NIGHTS : minimum number of local nights that must be included
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003315, 7401001, 1,
   'tableHeader',
   'DAY OFF SEQUENCE,MIN REST TIME,MIN LOCAL NIGHTS',
   'ROIS', CURRENT_TIMESTAMP);

-- 3) Table rows
-- Row 1: First day off requires at least 34 hours of rest and one local night.
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003316, 7401001, 1,
   'tableRow1',
   '1,34:00,1',
   'ROIS', CURRENT_TIMESTAMP);

-- Row 2: Subsequent consecutive days off need 24 hours and a local night each.
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003317, 7401001, 1,
   'tableRow2',
   '2-99,24:00,1',
   'ROIS', CURRENT_TIMESTAMP);

-- 7410 法规
-- ANR (Singapore) FDP limit definition (Rule 7410)
-- Depends on ANR acclimatisation (7400) for ref timezone and QQ FDP setup if used together.

-- OPTIONAL: backup existing rule records before applying
-- CREATE TABLE `rule_backup_7410` LIKE `rule`;
-- INSERT INTO `rule_backup_7410` SELECT * FROM `rule`;
-- CREATE TABLE `rule_parameter_backup_7410` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7410` SELECT * FROM `rule_parameter`;

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
  (7410001, 7410, '001', 'P',
   'ANR Maximum FDP per duty', 'ANR',
   'FDP',
   'MultiTable',
   'ANR',
   'Maximum permitted FDP by TZ diff, composition, rest facility, report time, and sector count',
   'S', 2,
   'ANR', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 2) Table 1 header (Max FDP rows)
-- Columns:
--   TZ Diff:         time zone difference between acclimated time and local time at report (HH:MM-HH:MM, inclusive lower, inclusive upper)
--   COMPOSITION:     crew composition (e.g. 2P, 3P), '|' separated, '*' for any
--   REST FACILITY:   rest facility code (integer), '*' or empty for any
--   REPORT START:    report local time lower bound (HHMM)
--   REPORT END:      report local time upper bound (HHMM)
--   SECTOR LOWER:    inclusive lower bound of total sectors (including DHD if enabled)
--   SECTORS UPPER:   inclusive upper bound of total sectors
--   MAX FDP:         maximum FDP in HH:MM
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003318, 7410001, 1,
   'table1Header',
   'TZ DIFF,COMPOSITION,REST FACILITY,REPORT START,REPORT END,SECTOR LOWER,SECTORS UPPER,FDP RANGE,MAX FDP',
   'ROIS', CURRENT_TIMESTAMP);

-- ===================================================
-- (2.1) Rows from Table A (TZ Diff 00:00-02:00, Basic)
-- ===================================================

-- Local time of start 0600-0759
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003319, 7410001, 1,
   'table1Row1',
   '00:00-02:00,2P,*,0600,0759,1,1,*,13:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003320, 7410001, 1,
   'table1Row2',
   '00:00-02:00,2P,*,0600,0759,2,2,*,12:15',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003321, 7410001, 1,
   'table1Row3',
   '00:00-02:00,2P,*,0600,0759,3,3,*,11:30',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003322, 7410001, 1,
   'table1Row4',
   '00:00-02:00,2P,*,0600,0759,4,4,*,10:45',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003323, 7410001, 1,
   'table1Row5',
   '00:00-02:00,2P,*,0600,0759,5,5,*,10:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003324, 7410001, 1,
   'table1Row6',
   '00:00-02:00,2P,*,0600,0759,6,6,*,09:15',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003325, 7410001, 1,
   'table1Row7',
   '00:00-02:00,2P,*,0600,0759,7,7,*,09:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003326, 7410001, 1,
   'table1Row8',
   '00:00-02:00,2P,*,0600,0759,8,99,*,09:00',
   'ROIS', CURRENT_TIMESTAMP);

-- Local time of start 0800-1459
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003327, 7410001, 1,
   'table1Row9',
   '00:00-02:00,2P,*,0800,1459,1,1,*,14:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003328, 7410001, 1,
   'table1Row10',
   '00:00-02:00,2P,*,0800,1459,2,2,*,13:15',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003329, 7410001, 1,
   'table1Row11',
   '00:00-02:00,2P,*,0800,1459,3,3,*,12:30',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003330, 7410001, 1,
   'table1Row12',
   '00:00-02:00,2P,*,0800,1459,4,4,*,11:45',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003331, 7410001, 1,
   'table1Row13',
   '00:00-02:00,2P,*,0800,1459,5,5,*,11:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003332, 7410001, 1,
   'table1Row14',
   '00:00-02:00,2P,*,0800,1459,6,6,*,10:15',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003333, 7410001, 1,
   'table1Row15',
   '00:00-02:00,2P,*,0800,1459,7,7,*,09:30',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003334, 7410001, 1,
   'table1Row16',
   '00:00-02:00,2P,*,0800,1459,8,99,*,09:00',
   'ROIS', CURRENT_TIMESTAMP);

-- Local time of start 1500-2159
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003335, 7410001, 1,
   'table1Row17',
   '00:00-02:00,2P,*,1500,2159,1,1,*,13:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003336, 7410001, 1,
   'table1Row18',
   '00:00-02:00,2P,*,1500,2159,2,2,*,12:15',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003337, 7410001, 1,
   'table1Row19',
   '00:00-02:00,2P,*,1500,2159,3,3,*,11:30',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003338, 7410001, 1,
   'table1Row20',
   '00:00-02:00,2P,*,1500,2159,4,4,*,10:45',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003339, 7410001, 1,
   'table1Row21',
   '00:00-02:00,2P,*,1500,2159,5,5,*,10:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003340, 7410001, 1,
   'table1Row22',
   '00:00-02:00,2P,*,1500,2159,6,6,*,09:15',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003341, 7410001, 1,
   'table1Row23',
   '00:00-02:00,2P,*,1500,2159,7,7,*,09:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003342, 7410001, 1,
   'table1Row24',
   '00:00-02:00,2P,*,1500,2159,8,99,*,09:00',
   'ROIS', CURRENT_TIMESTAMP);

-- Local time of start 2200-0559
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003343, 7410001, 1,
   'table1Row25',
   '00:00-02:00,2P,*,2200,0559,1,1,*,11:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003344, 7410001, 1,
   'table1Row26',
   '00:00-02:00,2P,*,2200,0559,2,2,*,10:15',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003345, 7410001, 1,
   'table1Row27',
   '00:00-02:00,2P,*,2200,0559,3,3,*,09:30',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003346, 7410001, 1,
   'table1Row28',
   '00:00-02:00,2P,*,2200,0559,4,4,*,09:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003347, 7410001, 1,
   'table1Row29',
   '00:00-02:00,2P,*,2200,0559,5,5,*,09:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003348, 7410001, 1,
   'table1Row30',
   '00:00-02:00,2P,*,2200,0559,6,6,*,09:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003349, 7410001, 1,
   'table1Row31',
   '00:00-02:00,2P,*,2200,0559,7,7,*,09:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003350, 7410001, 1,
   'table1Row32',
   '00:00-02:00,2P,*,2200,0559,8,99,*,09:00',
   'ROIS', CURRENT_TIMESTAMP);

-- ===================================================
-- (2.2) Rows from Table B (TZ Diff 02:01-24:00, Basic)
--     Applies all day (0000-2359)
-- ===================================================

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003351, 7410001, 1,
   'table1Row33',
   '02:01-24:00,2P,*,0000,2359,1,1,*,12:30',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003352, 7410001, 1,
   'table1Row34',
   '02:01-24:00,2P,*,0000,2359,2,2,*,12:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003353, 7410001, 1,
   'table1Row35',
   '02:01-24:00,2P,*,0000,2359,3,3,*,11:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003354, 7410001, 1,
   'table1Row36',
   '02:01-24:00,2P,*,0000,2359,4,4,*,10:30',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003355, 7410001, 1,
   'table1Row37',
   '02:01-24:00,2P,*,0000,2359,5,5,*,10:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003356, 7410001, 1,
   'table1Row38',
   '02:01-24:00,2P,*,0000,2359,6,99,*,09:00',
   'ROIS', CURRENT_TIMESTAMP);

-- ===================================================
-- (2.3) Rows from Augmented Crew (3 pilots and 4 pilots, TZ Diff 00:00-24:00, 3P/4P)
--     Applies all day (0000-2359)
-- ===================================================

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003357, 7410001, 1,
   'table1Row39',
   '00:00-24:00,3P,3,0000,2359,1,1,*,15:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003358, 7410001, 1,
   'table1Row40',
   '00:00-24:00,4P,3,0000,2359,1,1,*,18:00',
   'ROIS', CURRENT_TIMESTAMP);

-- 3) Table 2 header (control parameters)
-- INCLUDE DEADHEAD SECTORS WITHIN FDP: Y/N; when Y, non-operating flight sectors count towards sector total.
-- GLOBAL BUFFER MINUTES: integer buffer to apply in checks (duty may exceed MAX FDP by this many minutes before violation).
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003359, 7410001, 1,
   'table2Header',
   'INCLUDE DEADHEAD SECTORS WITHIN FDP,GLOBAL BUFFER MINUTES',
   'ROIS', CURRENT_TIMESTAMP);

-- Table 2 - single control row: include DHD sectors, 30-minute global buffer
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003360, 7410001, 1,
   'table2Row1',
   'Y,30',
   'ROIS', CURRENT_TIMESTAMP);


-- 7413 法规
-- ANR (Singapore) CC augmented MAX FDP limit (Rule 7413)
-- Dependent rule of 7410: when a 7410 table 1 row matches, apply all matching 7413 rows
-- and use the maximum MAX FDP among (7410 + 7413) as the effective MAX FDP limit.
-- Has sector matches any duty segment (operating or non-operating) by endpoints.

INSERT INTO `rule`(
  `id`, `function`, `instance`, `class`,
  `description`, `reference`, `category`,
  `store_structure`, `source`, `detail`,
  `overridability`, `severity`,
  `filiale`, `division`, `owner`,
  `locked`, `modified_by`, `last_modified`
)
VALUES
  (7413001, 7413, '001', 'P',
   'ANR CC Augmented MAX FDP Limit', 'ANR',
   'FDP',
   'Table',
   'ANR',
   'Cabin crew augmented MAX FDP limit based on sector endpoints and fly time',
   'S', 2,
   'ANR', 'C', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174330, 7413001, 1,
   'tableHeader',
   'COMPOSITION,REST FACILITY,FDP RANGE,DUTY START STATION,HAS SECTOR,SECTOR MIN FLY TIME,MAX FDP',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(`id`,`rule_id`,`phase_id`,`param_names`,`param_values`,`modified_by`,`last_modified`) VALUES
  (208174331, 7413001, 1, 'tableRow1', '*,3,00:00-14:00,SIN,SIN-*,09:00,14:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`,`rule_id`,`phase_id`,`param_names`,`param_values`,`modified_by`,`last_modified`) VALUES
  (208174332, 7413001, 1, 'tableRow2', '*,3,00:00-14:00,!SIN,*-SIN,09:00,14:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`,`rule_id`,`phase_id`,`param_names`,`param_values`,`modified_by`,`last_modified`) VALUES
  (208174333, 7413001, 1, 'tableRow3', '*,3,14:01-16:00,SIN,SIN-*,12:00,16:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`,`rule_id`,`phase_id`,`param_names`,`param_values`,`modified_by`,`last_modified`) VALUES
  (208174334, 7413001, 1, 'tableRow4', '*,3,14:01-16:00,!SIN,*-SIN,13:00,16:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`,`rule_id`,`phase_id`,`param_names`,`param_values`,`modified_by`,`last_modified`) VALUES
  (208174335, 7413001, 1, 'tableRow5', '*,3,16:01-19:00,SIN,SIN-*,14:00,19:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`,`rule_id`,`phase_id`,`param_names`,`param_values`,`modified_by`,`last_modified`) VALUES
  (208174336, 7413001, 1, 'tableRow6', '*,3,16:01-19:00,!SIN,*-SIN,15:00,19:00', 'ROIS', CURRENT_TIMESTAMP);


-- 7411 法规
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
  (200003361, 7411001, 1,
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
  (200003362, 7411001, 1,
   'tableRow1',
   '0701,0900,00:00-02:00,2',
   'ROIS', CURRENT_TIMESTAMP);

-- Row 2: 09:00 < length <= 11:00, TZ diff 00:00-02:00 (Table A), counts as 3 sectors
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003363, 7411001, 1,
   'tableRow2',
   '0901,1100,00:00-02:00,3',
   'ROIS', CURRENT_TIMESTAMP);

-- Row 3: length > 11:00 (11:00-24:00], TZ diff 00:00-02:00 (Table A), counts as 4 sectors
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003364, 7411001, 1,
   'tableRow3',
   '1101,9900,00:00-02:00,4',
   'ROIS', CURRENT_TIMESTAMP);

-- Row 4: 07:00 < length <= 09:00, TZ diff 02:01-24:00 (Table B), counts as 3 sectors
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003365, 7411001, 1,
   'tableRow4',
   '0701,0900,02:01-24:00,3',
   'ROIS', CURRENT_TIMESTAMP);

-- Row 5: 09:00 < length <= 11:00, TZ diff 02:01-24:00 (Table B), counts as 4 sectors
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003366, 7411001, 1,
   'tableRow5',
   '0901,1100,02:01-24:00,4',
   'ROIS', CURRENT_TIMESTAMP);

-- Row 6: length > 11:00 (11:00-24:00], TZ diff 02:01-24:00 (Table B), counts as 5 sectors
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003367, 7411001, 1,
   'tableRow6',
   '1101,9900,02:01-24:00,5',
   'ROIS', CURRENT_TIMESTAMP);

-- 7205 ??
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
-- Flight Crew (division P) - 90 hours DP in any 14 consecutive local days
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
  (7205010, 7205, '001', 'B',
   'ANR Max Duty Period - Flight Crew (14 Consecutive Days)', 'ANR',
   'Duty',
   'Table',
   'ANR',
   'Ensures each flight crew member accumulates no more than 90 duty hours in any consecutive 14 local days',
   'S', 2,
   'ANR', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- Table header (adds the Limit DP Range column alongside BLH/FDP placeholders)
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003381, 7205010, 1,
   'Bases,Ranks,Fleets,Teams,Compositions,Duty Assignments,Duty Type,Period,Unit,Limit BLH Range,Limit FDP Range,Limit DP Range',
   'Bases,Ranks,Fleets,Teams,Compositions,Duty Assignments,Duty Type,Period,Unit,Limit BLH Range,Limit FDP Range,Limit DP Range',
   'ROIS', CURRENT_TIMESTAMP);

-- Flight crew threshold: Ranks = FD, DP limit 00:00-90:01 (exclusive upper bound)
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003382, 7205010, 1,
   'tableRow1',
   '*,FD,*,*,*,*,*,14,CD,*,*,00:00-90:01',
   'ROIS', CURRENT_TIMESTAMP);

-- ---------------------------------------------------------------------------
-- Cabin Crew (division C) - 100 hours DP in any 14 consecutive local days
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
  (7205011, 7205, '001', 'B',
   'ANR Max Duty Period - Cabin Crew (14 Consecutive Days)', 'ANR',
   'Duty',
   'Table',
   'ANR',
   'Ensures each cabin crew member accumulates no more than 100 duty hours in any consecutive 14 local days',
   'S', 2,
   'ANR', 'C', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- Table header for cabin division (same structure as flight crew)
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003383, 7205011, 1,
   'Bases,Ranks,Fleets,Teams,Compositions,Duty Assignments,Duty Type,Period,Unit,Limit BLH Range,Limit FDP Range,Limit DP Range',
   'Bases,Ranks,Fleets,Teams,Compositions,Duty Assignments,Duty Type,Period,Unit,Limit BLH Range,Limit FDP Range,Limit DP Range',
   'ROIS', CURRENT_TIMESTAMP);

-- Cabin crew threshold: Ranks = CC, DP limit 00:00-100:01
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003384, 7205011, 1,
   'tableRow1',
   '*,CC,*,*,*,*,*,14,CD,*,*,00:00-100:01',
   'ROIS', CURRENT_TIMESTAMP);


-- 7405 ??
-- ANR ULR duty definition (Rule 7405)
-- Identifies ULR duties based on division, duty endpoints, and FDP threshold.
-- MIN FDP values are exclusive (duty FDP must be greater than the configured value).

-- OPTIONAL: backup existing rule records before applying
-- CREATE TABLE `rule_backup_7405` LIKE `rule`;
-- INSERT INTO `rule_backup_7405` SELECT * FROM `rule`;
-- CREATE TABLE `rule_parameter_backup_7405` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7405` SELECT * FROM `rule_parameter`;

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
   'ANR',
   'Table',
   'ANR',
   'Defines when a duty is treated as ULR based on division, endpoints, and FDP length',
   'S', 2,
   'ANR', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- Parameters: division, duty endpoints, and exclusive FDP threshold
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003385, 7405001, 1,
   'tableHeader',
   'Division,Duty Start Station,Duty End Station,MIN FDP (HH:MM)',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003386, 7405001, 1,
   'tableRow1',
   'P,*,*,18:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003387, 7405001, 1,
   'tableRow2',
   'C,SIN,*,19:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003388, 7405001, 1,
   'tableRow3',
   'C,*,SIN,18:00',
   'ROIS', CURRENT_TIMESTAMP);


-- 7412 ??
-- ANR (Singapore) minimum rest period between duties (Rule 7412)
-- DP range bounds are inclusive on both ends: [HH:mm,HH:mm]
-- Local night definition follows 2014 regulation (8 consecutive hours inside 22:00-08:00)

-- OPTIONAL: backup existing rule records before applying
-- CREATE TABLE `rule_backup_7412` LIKE `rule`;
-- INSERT INTO `rule_backup_7412` SELECT * FROM `rule`;
-- CREATE TABLE `rule_parameter_backup_7412` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7412` SELECT * FROM `rule_parameter`;

INSERT INTO `rule`(
  `id`, `function`, `instance`, `class`,
  `description`, `reference`, `category`,
  `store_structure`, `source`, `detail`,
  `overridability`, `severity`,
  `filiale`, `division`, `owner`,
  `locked`, `modified_by`, `last_modified`
)
VALUES
  (7412001, 7412, '001', 'P',
   'ANR Minimum Rest Between Consecutive Duties', 'ANR',
   'Rest',
   'MultiTable',
   'ANR',
   'Minimum rest between consecutive duties based on duty assignments, DP length, and local night coverage',
   'S', 2,
   'ANR', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- Table header for rest rows
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003389, 7412001, 1,
   'table1Header',
   'CURRENT DUTY PATTERN,NEXT DUTY PATTERN,CURRENT DUTY ASSIGNMENTS,NEXT DUTY ASSIGNMENTS,DP RANGE,has Local Night(Y/N),MIN REST TIME,INCREMENTAL REST PER DP HOUR,MIN LOCAL NIGHTS',
   'ROIS', CURRENT_TIMESTAMP);

-- Rest requirement rows
INSERT INTO `rule_parameter`(`id`,`rule_id`,`phase_id`,`param_names`,`param_values`,`modified_by`,`last_modified`) VALUES
  (200003390, 7412001, 1, 'table1Row1',  '*,*,FLY|MVO,*,*,Y,10:00,*,*',       'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`,`rule_id`,`phase_id`,`param_names`,`param_values`,`modified_by`,`last_modified`) VALUES
  (200003391, 7412001, 1, 'table1Row2',  '*,*,FLY|MVO,*,*,N,12:00,*,*',       'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`,`rule_id`,`phase_id`,`param_names`,`param_values`,`modified_by`,`last_modified`) VALUES
  (200003392, 7412001, 1, 'table1Row3',  '*,*,FLY|MVO,*,10:01-11:00,*,11:00,*,*', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`,`rule_id`,`phase_id`,`param_names`,`param_values`,`modified_by`,`last_modified`) VALUES
  (200003393, 7412001, 1, 'table1Row4',  '*,*,FLY|MVO,*,11:01-12:00,*,12:00,*,*', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`,`rule_id`,`phase_id`,`param_names`,`param_values`,`modified_by`,`last_modified`) VALUES
  (200003394, 7412001, 1, 'table1Row5',  '*,*,FLY|MVO,*,12:01-13:00,*,13:00,*,*', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`,`rule_id`,`phase_id`,`param_names`,`param_values`,`modified_by`,`last_modified`) VALUES
  (200003395, 7412001, 1, 'table1Row6',  '*,*,FLY|MVO,*,13:01-14:00,*,14:00,*,*', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`,`rule_id`,`phase_id`,`param_names`,`param_values`,`modified_by`,`last_modified`) VALUES
  (200003396, 7412001, 1, 'table1Row7',  '*,*,FLY|MVO,*,14:01-15:00,*,15:00,*,*', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`,`rule_id`,`phase_id`,`param_names`,`param_values`,`modified_by`,`last_modified`) VALUES
  (200003397, 7412001, 1, 'table1Row8',  '*,*,FLY|MVO,*,15:01-16:00,*,16:00,*,*', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`,`rule_id`,`phase_id`,`param_names`,`param_values`,`modified_by`,`last_modified`) VALUES
  (200003398, 7412001, 1, 'table1Row9',  '*,*,FLY|MVO,*,16:01-99:00,*,24:00,*,1', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`,`rule_id`,`phase_id`,`param_names`,`param_values`,`modified_by`,`last_modified`) VALUES
  (200003399, 7412001, 1, 'table1Row10', '*,*,*,FLY|MVO,*,Y,10:00,*,*',       'ROIS', CURRENT_TIMESTAMP);

  -- Table 2 (control parameters):
  --   SERVICE TYPE: '*' (any), 'J' (passenger), 'F' (freighter)
  --   FLEET GROUP: '*' (any), otherwise '|' separated fleet groups
  --   IGNORE INTERMEDIATE DUTY ASSIGNMENTS:
  --     - '|' separated assignments to skip as rest boundaries (applies in the middle and at pairing ends)
  --     - '*' / 'NO' / 'NONE' means disabled for rule 7412
  --   ASSIGNMENTS REDUCE REST AND LOCAL NIGHT:
  --     - 'NO' / 'NONE' means intermediate duties do not reduce rest/LN
  --     - '*' means all intermediate duties reduce rest/LN
  --     - otherwise: only assignments in the list reduce rest/LN
  INSERT INTO `rule_parameter`(
    `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
    `modified_by`, `last_modified`
  )
  VALUES
    (2000033890, 7412001, 1,
     'table2Header',
     'SERVICE TYPE,FLEET GROUP,IGNORE INTERMEDIATE DUTY ASSIGNMENTS,ASSIGNMENTS REDUCE REST AND LOCAL NIGHT',
     'ROIS', CURRENT_TIMESTAMP);

  INSERT INTO `rule_parameter`(
    `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
    `modified_by`, `last_modified`
  )
  VALUES
    (2000033891, 7412001, 1,
     'table2Row1',
     '*,*,NO,NO',
     'ROIS', CURRENT_TIMESTAMP);


-- 7414 ??
-- ANR (Singapore) consecutive special duty rest requirement (Rule 7414)
-- Applies to early start, late finish, or duties with take-off/landing in WOCL.

-- OPTIONAL: backup existing rule records before applying
-- CREATE TABLE `rule_backup_7414` LIKE `rule`;
-- INSERT INTO `rule_backup_7414` SELECT * FROM `rule`;
-- CREATE TABLE `rule_parameter_backup_7414` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7414` SELECT * FROM `rule_parameter`;

INSERT INTO `rule`(
  `id`, `function`, `instance`, `class`,
  `description`, `reference`, `category`,
  `store_structure`, `source`, `detail`,
  `overridability`, `severity`,
  `filiale`, `division`, `owner`,
  `locked`, `modified_by`, `last_modified`
)
VALUES
  (7414001, 7414, '001', 'P',
   'ANR Consecutive Special Duty Rest Requirement', 'ANR',
   'ANR',
   'MultiTable',
   'ANR',
   'Ensure rest between consecutive early start/late finish/WOCL duties meets ANR limits',
   'S', 2,
   'ANR', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003400, 7414001, 1,
   'table1Header',
   'INCLUDE TRAILING DEADHEAD,REST TYPE,NUM CONSECUTIVE DUTIES,MIN REST TIME,MIN LOCAL NIGHTS',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003401, 7414001, 1,
   'table1Row1',
   'Y,IN,3,24:00,1',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003407, 7414001, 1,
   'table1Row2',
   'Y,PRE,2,24:00,1',
   'ROIS', CURRENT_TIMESTAMP);

-- Table 2 control parameters
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003408, 7414001, 1,
   'table2Header',
   'IGNORE INTERMEDIATE DUTY ASSIGNMENTS,ASSIGNMENTS REDUCE REST AND LOCAL NIGHT',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003409, 7414001, 1,
   'table2Row1',
   'NO,NO',
   'ROIS', CURRENT_TIMESTAMP);

-- 7415 法规
-- ANR (Singapore) consecutive working day limit between days off (Rule 7415)
-- Relies on the ANR day off definition (Rule 7401) to determine whether a rest
-- period qualifies as a day off.

-- OPTIONAL: backup existing rule records before applying
-- CREATE TABLE `rule_backup_7415` LIKE `rule`;
-- INSERT INTO `rule_backup_7415` SELECT * FROM `rule`;
-- CREATE TABLE `rule_parameter_backup_7415` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7415` SELECT * FROM `rule_parameter`;

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
  (7415001, 7415, '001', 'P',
   'ANR Max Consecutive Working Days Between Day Offs', 'ANR',
   'ANR',
   'Table',
   'ANR',
   'Checks that no more than 7 consecutive working days occur between ANR day offs',
   'S', 2,
   'ANR', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 2) Table header
-- Columns:
--   SERVICE TYPE           : '*' (any), 'J' (passenger), 'F' (freighter)
--   FLEET GROUP            : '*' (any), otherwise '|' separated fleet groups
--   MAX WORKING DAYS       : maximum allowed consecutive working days (default 7)
--   LAST DAY BUFFER HHMM   : latest allowed rest-start time on the 7th day (default 21:00)
--   WORK DAY ENDS AT       : TRANSPORT (default) or DEBRIEF
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003368, 7415001, 1,
   'tableHeader',
   'SERVICE TYPE,FLEET GROUP,MAX WORKING DAYS,LAST DAY BUFFER HHMM,WORK DAY ENDS AT',
   'ROIS', CURRENT_TIMESTAMP);

-- 3) Configuration row
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003369, 7415001, 1,
   'tableRow1',
   '*,*,7,21:00,TRANSPORT',
   'ROIS', CURRENT_TIMESTAMP);


-- 7416 法规
-- ANR (Singapore) minimum days off in consecutive periods (Rule 7416)
-- Relies on the ANR day off definition (Rule 7401) to determine whether rest
-- periods qualify as ANR day offs.

-- OPTIONAL: backup existing rule records before applying
-- CREATE TABLE `rule_backup_7416` LIKE `rule`;
-- INSERT INTO `rule_backup_7416` SELECT * FROM `rule`;
-- CREATE TABLE `rule_parameter_backup_7416` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7416` SELECT * FROM `rule_parameter`;

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
  (7416001, 7416, '001', 'P',
   'ANR Min Days Off In Consecutive Periods', 'ANR',
   'ANR',
   'Table',
   'ANR',
   'Checks that each rolling period has at least the configured number of ANR day offs',
   'S', 2,
   'ANR', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 2) Table header
-- Columns:
--   SERVICE TYPE  : '*' (any), 'J' (passenger), 'F' (freighter)
--   FLEET GROUP   : '*' (any), otherwise '|' separated fleet groups
--   UNIT          : CD (consecutive days), CW (consecutive weeks), CM (consecutive months)
--   PERIOD        : length of the window expressed in UNIT
--   MIN DAYS OFF  : minimum number of ANR day offs required in each window
--   WEEK START ON : 1=Monday, 0 or 7=Sunday (only used when UNIT = CW)
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003370, 7416001, 1,
   'tableHeader',
   'SERVICE TYPE,FLEET GROUP,UNIT,PERIOD,MIN DAYS OFF,WEEK START ON',
   'ROIS', CURRENT_TIMESTAMP);

-- 3) Configuration row
-- Example: at least 2 ANR day offs in every 2 consecutive calendar weeks,
-- with calendar week starting on Monday.
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003371, 7416001, 1,
   'tableRow1',
   '*,*,CW,2,2,1',
   'ROIS', CURRENT_TIMESTAMP);

-- 7435 法规
-- CA ULR standby pairing minimum calendar days (Rule 7435)
-- Pairings containing ULR duties and standby must span the configured base-local calendar days.
INSERT INTO `rule`(`id`, `function`, `instance`, `class`, `description`, `reference`, `category`, `store_structure`, `source`, `detail`, `overridability`, `severity`, `filiale`, `division`, `owner`, `locked`, `modified_by`, `last_modified`)
VALUES (7435001, 7435, '001', 'P', 'CA ULR Standby Pairing Minimum Days', 'SQ', 'Pairing', 'Table', 'Company', 'Pairings with ULR duties and standby must span the configured base-local calendar days', 'H', 2, 'SQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- Parameters: Service Type,Fleet Group,Has ULR Duty,Layover Airport,Layover Country,Has Duty Assignment,Min Pairing Days,Pairing Length Ends At
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES (200003375, 7435001, 1, 'tableHeader', 'Service Type,Fleet Group,Has ULR Duty,Layover Airport,Layover Country,Has Duty Assignment,Min Pairing Days,Pairing Length Ends At', 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES (200003376, 7435001, 1, 'tableRow1', '*,*,Y,*,*,SBY,6,TRANSPORT', 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES (200003377, 7435001, 1, 'tableRow2', '*,*,*,*,US,SBY,6,TRANSPORT', 'ROIS', CURRENT_TIMESTAMP);


-- 7450 ??
-- SQ (Collective Agreement) FDP-based sector limitation (Rule 7450)
-- Limits augmented (3P/4P) duties by sector BLH/FDP and sector count.

-- OPTIONAL: backup existing rule entries before running
-- CREATE TABLE `rule_backup_7450` LIKE `rule`;
-- INSERT INTO `rule_backup_7450` SELECT * FROM `rule` WHERE `function` = 7450;
-- CREATE TABLE `rule_parameter_backup_7450` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7450`
--   SELECT * FROM `rule_parameter` WHERE `rule_id` BETWEEN 7450001 AND 7450999;

INSERT INTO `rule`(
  `id`, `function`, `instance`, `class`,
  `description`, `reference`, `category`,
  `store_structure`, `source`, `detail`,
  `overridability`, `severity`,
  `filiale`, `division`, `owner`,
  `locked`, `modified_by`, `last_modified`
)
VALUES
  (7450001, 7450, '001', 'P',
   'SQ FDP-based sector limit', 'SQ',
   'CA',
   'Table',
   'SQ',
   'Augmented (3P/4P) duties are limited to 1 or 2 sectors based on FDP duration; last deadhead beyond FDP is excluded.',
   'H', 2,
   'SQ', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- Table 1 header
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003402, 7450001, 1,
   'tableHeader',
   'COMPOSITION,SECTOR BLH LOWER,SECTOR BLH UPPER,FDP LOWER,FDP UPPER,MAX SECTORS',
   'ROIS', CURRENT_TIMESTAMP);

-- Table 2 header (control parameters):
--   SERVICE TYPE : '*' (any), 'J' (passenger), 'F' (freighter)
--   FLEET GROUP  : '*' (any), otherwise '|' separated fleet groups
--   COUNT DEADHEAD SECTORS        : Y/N
--   EXCLUDE FINAL DEADHEAD SECTORS: Y/N
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003403, 7450001, 1,
   'tableRow1',
   '3P|4P,*,*,00:00,13:00,2',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003404, 7450001, 1,
   'tableRow2',
   '3P|4P,*,*,13:01,99:00,1',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003405, 7450001, 1,
   'table2Header',
   'SERVICE TYPE,FLEET GROUP,COUNT DEADHEAD SECTORS,EXCLUDE FINAL DEADHEAD SECTORS',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200003406, 7450001, 1,
   'table2Row1',
   '*,*,Y,N',
   'ROIS', CURRENT_TIMESTAMP);

-- 7451 法规
-- SQ operational coterminal duty connection restriction (Rule 7451)
-- Controls which slip connections between coterminal airports are NOT allowed.
-- Coterminal is determined by airport city code (AIRPORT.CITY).

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

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200074510, 7451001, 1,
   'tableHeader',
   'PREV DUTY ARRIVAL,PREV DUTY ASSIGNMENT,NEXT DUTY DEPART,NEXT DUTY ASSIGNMENT,ACTIVE',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200074511, 7451001, 1,
   'tableRow1',
   'LHR,*,LGW,*,Y',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200074512, 7451001, 1,
   'tableRow2',
   'LGW,*,LHR,MVP,Y',
   'ROIS', CURRENT_TIMESTAMP);

-- 7460 法规
-- SQ mid-duty base turn restriction (Rule 7460)
-- Restricts duties that pass through crew base mid-duty when
-- the duty does not start or end at the base.

-- Optional backup
-- CREATE TABLE `rule_backup_7460` LIKE `rule`;
-- INSERT INTO `rule_backup_7460` SELECT * FROM `rule`;
-- CREATE TABLE `rule_parameter_backup_7460` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7460` SELECT * FROM `rule_parameter`;

-- Insert rule definition
INSERT INTO `rule`(`id`, `function`, `instance`, `class`, `description`, `reference`, `category`, `store_structure`, `source`, `detail`, `overridability`, `severity`, `filiale`, `division`, `owner`, `locked`, `modified_by`, `last_modified`)
VALUES (7460001, 7460, '001', 'P', 'Restrict Mid Duty Base Turn', 'SQ', 'Duty', 'Table', 'Company', 'Restrict duties that pass through crew base mid-duty when the duty does not start or end at base', 'H', 2, 'SQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- Parameters: restrict duty patterns where mid-duty base turns are enforced
-- Only rows with ACTIVE = 'Y' are loaded by the engine (others may hold comments).
-- Duty Start Station,Duty End Station,ACTIVE
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES (200003372, 7460001, 1, 'tableHeader', 'Duty Start Station,Duty End Station,ACTIVE', 'ROIS', CURRENT_TIMESTAMP);

-- Example of a comment/inactive row (ignored by backend)
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES (200003373, 7460001, 1, 'tableRow1', '*,!(SIN|KUL),N', 'ROIS', CURRENT_TIMESTAMP);

-- Active restriction
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`)
VALUES (200003374, 7460001, 1, 'tableRow2', '!(SIN),!(SIN),Y', 'ROIS', CURRENT_TIMESTAMP);
