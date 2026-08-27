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
--   COMPOSITION:     crew composition (e.g. Basic, 3P), '|' separated, '*' for any
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
  (208174100, 7410001, 1,
   'table1Header',
   'TZ DIFF,COMPOSITION,REST FACILITY,REPORT START,REPORT END,SECTOR LOWER,SECTORS UPPER,FDP RANGE,MAX FDP',
   'ROIS', CURRENT_TIMESTAMP);

-- ===================================================
-- (2.1) Rows from Table A (TZ Diff 00:00-02:00, Basic)
-- ===================================================

-- Local time of start 0600–0759
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174101, 7410001, 1,
   'table1Row1',
   '00:00-02:00,Basic,*,0600,0759,1,1,*,13:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174102, 7410001, 1,
   'table1Row2',
   '00:00-02:00,Basic,*,0600,0759,2,2,*,12:15',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174103, 7410001, 1,
   'table1Row3',
   '00:00-02:00,Basic,*,0600,0759,3,3,*,11:30',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174104, 7410001, 1,
   'table1Row4',
   '00:00-02:00,Basic,*,0600,0759,4,4,*,10:45',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174105, 7410001, 1,
   'table1Row5',
   '00:00-02:00,Basic,*,0600,0759,5,5,*,10:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174106, 7410001, 1,
   'table1Row6',
   '00:00-02:00,Basic,*,0600,0759,6,6,*,09:15',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174107, 7410001, 1,
   'table1Row7',
   '00:00-02:00,Basic,*,0600,0759,7,7,*,09:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174108, 7410001, 1,
   'table1Row8',
   '00:00-02:00,Basic,*,0600,0759,8,99,*,09:00',
   'ROIS', CURRENT_TIMESTAMP);

-- Local time of start 0800–1459
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174109, 7410001, 1,
   'table1Row9',
   '00:00-02:00,Basic,*,0800,1459,1,1,*,14:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174110, 7410001, 1,
   'table1Row10',
   '00:00-02:00,Basic,*,0800,1459,2,2,*,13:15',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174111, 7410001, 1,
   'table1Row11',
   '00:00-02:00,Basic,*,0800,1459,3,3,*,12:30',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174112, 7410001, 1,
   'table1Row12',
   '00:00-02:00,Basic,*,0800,1459,4,4,*,11:45',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174113, 7410001, 1,
   'table1Row13',
   '00:00-02:00,Basic,*,0800,1459,5,5,*,11:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174114, 7410001, 1,
   'table1Row14',
   '00:00-02:00,Basic,*,0800,1459,6,6,*,10:15',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174115, 7410001, 1,
   'table1Row15',
   '00:00-02:00,Basic,*,0800,1459,7,7,*,09:30',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174116, 7410001, 1,
   'table1Row16',
   '00:00-02:00,Basic,*,0800,1459,8,99,*,09:00',
   'ROIS', CURRENT_TIMESTAMP);

-- Local time of start 1500–2159
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174117, 7410001, 1,
   'table1Row17',
   '00:00-02:00,Basic,*,1500,2159,1,1,*,13:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174118, 7410001, 1,
   'table1Row18',
   '00:00-02:00,Basic,*,1500,2159,2,2,*,12:15',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174119, 7410001, 1,
   'table1Row19',
   '00:00-02:00,Basic,*,1500,2159,3,3,*,11:30',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174120, 7410001, 1,
   'table1Row20',
   '00:00-02:00,Basic,*,1500,2159,4,4,*,10:45',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174121, 7410001, 1,
   'table1Row21',
   '00:00-02:00,Basic,*,1500,2159,5,5,*,10:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174122, 7410001, 1,
   'table1Row22',
   '00:00-02:00,Basic,*,1500,2159,6,6,*,09:15',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174123, 7410001, 1,
   'table1Row23',
   '00:00-02:00,Basic,*,1500,2159,7,7,*,09:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174124, 7410001, 1,
   'table1Row24',
   '00:00-02:00,Basic,*,1500,2159,8,99,*,09:00',
   'ROIS', CURRENT_TIMESTAMP);

-- Local time of start 2200–0559
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174125, 7410001, 1,
   'table1Row25',
   '00:00-02:00,Basic,*,2200,0559,1,1,*,11:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174126, 7410001, 1,
   'table1Row26',
   '00:00-02:00,Basic,*,2200,0559,2,2,*,10:15',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174127, 7410001, 1,
   'table1Row27',
   '00:00-02:00,Basic,*,2200,0559,3,3,*,09:30',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174128, 7410001, 1,
   'table1Row28',
   '00:00-02:00,Basic,*,2200,0559,4,4,*,09:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174129, 7410001, 1,
   'table1Row29',
   '00:00-02:00,Basic,*,2200,0559,5,5,*,09:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174130, 7410001, 1,
   'table1Row30',
   '00:00-02:00,Basic,*,2200,0559,6,6,*,09:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174131, 7410001, 1,
   'table1Row31',
   '00:00-02:00,Basic,*,2200,0559,7,7,*,09:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174132, 7410001, 1,
   'table1Row32',
   '00:00-02:00,Basic,*,2200,0559,8,99,*,09:00',
   'ROIS', CURRENT_TIMESTAMP);

-- ===================================================
-- (2.2) Rows from Table B (TZ Diff 02:01-24:00, Basic)
--     Applies all day (0000–2359)
-- ===================================================

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174133, 7410001, 1,
   'table1Row33',
   '02:01-24:00,Basic,*,0000,2359,1,1,*,12:30',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174134, 7410001, 1,
   'table1Row34',
   '02:01-24:00,Basic,*,0000,2359,2,2,*,12:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174135, 7410001, 1,
   'table1Row35',
   '02:01-24:00,Basic,*,0000,2359,3,3,*,11:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174136, 7410001, 1,
   'table1Row36',
   '02:01-24:00,Basic,*,0000,2359,4,4,*,10:30',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174137, 7410001, 1,
   'table1Row37',
   '02:01-24:00,Basic,*,0000,2359,5,5,*,10:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174138, 7410001, 1,
   'table1Row38',
   '02:01-24:00,Basic,*,0000,2359,6,99,*,09:00',
   'ROIS', CURRENT_TIMESTAMP);

-- ===================================================
-- (2.3) Rows from Augmented Crew (3 pilots and 4 pilots, TZ Diff 00:00-24:00, 3P/4P)
--     Applies all day (0000–2359)
-- ===================================================

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174139, 7410001, 1,
   'table1Row39',
   '00:00-24:00,3P,3,0000,2359,1,1,*,15:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174140, 7410001, 1,
   'table1Row40',
   '00:00-24:00,4P,3,0000,2359,1,1,*,18:00',
   'ROIS', CURRENT_TIMESTAMP);

-- 3) Table 2 header (control parameters)
-- GLOBAL BUFFER MINUTES: integer buffer to apply in checks (duty may exceed MAX FDP by this many minutes before violation).
-- COUNT DEADHEAD SECTORS: Y/N; when Y, non-operating flight sectors count towards sector total.
-- EXCLUDE FINAL DEADHEAD SECTORS: Y/N; when Y, trailing deadhead sectors after the final operating leg are ignored.
-- APPLY REPORT TIME DIFFERENCE: Y/N; when Y, MAX FDP = FD base MAX FDP + (CC report minutes - FD report minutes).
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174104, 7410001, 1,
   'table2Header',
   'GLOBAL BUFFER MINUTES,COUNT DEADHEAD SECTORS,EXCLUDE FINAL DEADHEAD SECTORS,APPLY REPORT TIME DIFFERENCE',
   'ROIS', CURRENT_TIMESTAMP);

-- Table 2 - single control row: 30-minute global buffer, count DHD sectors, include final DHD sectors
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174105, 7410001, 1,
   'table2Row1',
   '30,Y,N,N',
   'ROIS', CURRENT_TIMESTAMP);

