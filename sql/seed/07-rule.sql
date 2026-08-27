-- =============================================================
-- 07-rule.sql
-- Canonical Model A rule seed (RULE worksets + rules + membership)
--
-- Purpose:
--   Provision the single rule model (Model A) for a fresh airline:
--     workset  (category='RULE') — the RULE rulesets
--     rule     (with param_json) — the RUST/legality rule definitions
--     rule_set                   — workset⇄rule membership
--   Model B (rule_template / rule_instance / rule_group /
--   rule_group_instance / rule_parameter) was dropped; without this
--   seed a fresh `init-airline.sh` would provision ZERO rules.
--
--   Generated from the f8 source-of-truth data (2026-06-23).
--   Two RULE worksets seeded with explicit ids:
--     103 "PBS Solver Ruleset"  — default ruleset (scenario.ruleset_id
--                                 defaults to 103; /rulesets isDefault badge keys on 103)
--     433 "F8 Full Ruleset"
--   rule.rule_id is the composite (function*1000 + instance) bigint and
--   is the join key to rule_set.rule_id.
--
-- Idempotency:
--   All three tables have a single UNIQUE constraint = PRIMARY KEY (id).
--   There is NO unique index on rule.rule_id or rule_set(workset_id,rule_id),
--   so idempotency keys on the explicit PK id via OVERRIDING SYSTEM VALUE
--   + ON CONFLICT (id) DO NOTHING. Re-running is a clean no-op.
--
-- filiale assumption:
--   workset.filiale / rule.filiale have NO column default (rule.filiale is
--   NOT NULL; both carry chk_*_filiale_upper requiring UPPER). The value is
--   therefore written explicitly = 'F8' (this airline). For a new airline,
--   substitute the airline's upper-case two-letter code, or regenerate this
--   file from that airline's converted data.
--
-- Run (f8 schema):
--   PGPASSWORD=... psql -h localhost -U f8 -d rois -v ON_ERROR_STOP=1 -1 -f sql/seed/07-rule.sql
--
-- Changelog: 2026-06-23 initial version (replaces dropped Model B seeds)
-- =============================================================

-- ---------------------------------------------------------------
-- 1) RULE worksets (the rulesets) — explicit ids 103 / 433
-- ---------------------------------------------------------------
INSERT INTO workset (id, created_by, created_at, updated_by, updated_at, filiale, division, name, category, type)
OVERRIDING SYSTEM VALUE VALUES
  (103, 'system', now(), 'system', now(), 'F8', 'P', 'PBS Solver Ruleset', 'RULE', 'R'),
  (433, 'system', now(), 'system', now(), 'F8', 'P', 'F8 Full Ruleset', 'RULE', 'R')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------
-- 2) rule definitions (incl. param_json legality/RUST params)
-- ---------------------------------------------------------------
INSERT INTO rule (id, created_by, created_at, updated_by, updated_at, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, exception_code, rule_id, param_json)
OVERRIDING SYSTEM VALUE VALUES
  (29, 'system', now(), 'system', now(), 2014, '001', 'B', 'Local Night Definition', 'ROIs', 'Definition', 'Table', 'Company', 'Local Night Definition', 'S', 1, 'F8', 'P', 'S', '1', '', 2014001, '{"tables": [{"rows": [["22:30", "09:30", "09:00"]], "header": ["Local Night Start", "Local Night End", "Min Interval Hours"]}]}'::jsonb),
  (34, 'system', now(), 'system', now(), 2015, '001', 'B', 'DO Start Time Definition', 'ROIs', 'Definition', 'Table', 'Company', 'DO Start Time — duty ending before this local home-base clock does not occupy that calendar day for Min-GDO (7505/7507)', 'S', 1, 'F8', 'P', 'S', '1', '', 2015001, '{"tables": [{"rows": [["01:00", "DO", "DO"]], "header": ["Start Time", "Assignments", "Assignment Groups"]}]}'::jsonb),
  (30, 'system', now(), 'system', now(), 7272, '001', 'R', 'Calculate DP of the Reserves', 'F8', 'Definition', 'Table', 'Company', 'Calculate DP of the Reserves', 'S', 2, 'F8', 'P', 'S', '1', '', 7272001, '{"tables": [{"rows": [["SBY|PRAM|PRPM", "00:00", "0.33", "00:00", "00:00"]], "header": ["Assignments", "Standby Offset", "Rate", "SBY Limit", "Notification Limit"]}]}'::jsonb),
  (26, 'system', now(), 'system', now(), 7500, '001', 'R', 'Basic definition of Acc State', 'Duty', 'Definition', 'MultiTable', 'Company', 'Basic definition of Acc State', 'H', 2, 'F8', 'P', 'S', '1', '', 7500001, '{"tables": [{"rows": [["00:00-04:00", "72:00-96:00"], ["04:00-24:00", "96:00-999:00"]], "header": ["TZ Diff", "Stay Duration"]}, {"rows": [["24:00", "01:00"]], "header": ["Stay Duration per X Hours", "ACC Time Zone Adjust X Hours"]}]}'::jsonb),
  (23, 'system', now(), 'system', now(), 7501, '001', 'R', 'Single Day Free from Duty in Rolling Hours', 'F8', 'Duty', 'Table', 'F8', 'Single Day Free from Duty in Rolling Days', 'S', 1, 'F8', 'P', 'S', '1', '', 7501001, '{"tables": [{"rows": [["*", "*", "*", "*", "168", "RH", "00:00", "1"], ["*", "*", "*", "*", "672", "RH", "00:00", "4"]], "header": ["Bases", "Ranks", "Fleets", "Teams", "Period", "Unit", "Duty End Buffer", "Min Limits"]}]}'::jsonb),
  (19, 'system', now(), 'system', now(), 7502, '001', 'R', 'The Calculation of Credit Hours', 'F8', 'Definition', 'Table', 'F8', 'The Calculation of Credit Hours', 'S', 1, 'F8', 'P', 'S', '1', '', 7502001, '{"tables": [{"rows": [["*", "*", "*", "*", "VAC|SBY", "*", "04:00", "*", "*", "START"], ["*", "*", "*", "*", "FLY", "*", "*", "1.0", "*", "START"], ["*", "*", "*", "*", "GND", "*", "*", "*", "0.5", "START"]], "header": ["Bases", "Ranks", "Fleets", "Teams", "Assignment Groups", "Assignments", "Minimum CH", "FT Ratio", "DP Ratio", "Split Method(SPAN/START)"]}]}'::jsonb),
  (24, 'system', now(), 'system', now(), 7503, '001', 'R', 'Limits of Consecutive WOCLs', 'F8', 'Duty', 'Table', 'F8', 'Limits of Consecutive WOCLs', 'S', 1, 'F8', 'P', 'S', '1', '', 7503001, '{"tables": [{"rows": [["*", "*", "*", "*", "02:00", "05:59", "2"]], "header": ["Bases", "Ranks", "Fleets", "Teams", "WOCL Start", "WOCL End", "Max Consecutive WOCLs"]}]}'::jsonb),
  (25, 'system', now(), 'system', now(), 7504, '001', 'R', 'Spacing Rule - WOCL', 'F8', 'Duty', 'Table', 'F8', '7504', 'S', 1, 'F8', 'P', 'S', '1', '', 7504001, '{"tables": [{"rows": [["*", "*", "*", "*", "*", "*", "FLY", "FLY", "WOCL", "WOCL", "N", "Y", "D", "55", "RH"]], "header": ["Bases", "Ranks", "Fleets", "Teams", "Prev Assignment Groups", "Next Assignment Groups", "Prev Assignments", "Next Assignments", "Prev Attributes", "Next Attributes", "Apply Prelabelled Attributes", "Utilize Post Rest", "Level", "Min Period", "Unit"]}]}'::jsonb),
  (28, 'system', now(), 'system', now(), 7505, '001', 'R', 'Min # GDOs in a RP', 'ROIs', 'DO', 'Table', 'ROIs', 'Crew must have minimum X days off in a rostering period', 'S', 1, 'F8', 'P', 'S', '1', '', 7505001, '{"tables": [{"rows": [["*", "*", "*", "*", "DO", "13", "1", "RP", "31-31", "Y", "Y", "N", "LEAVE|MLOA|PATL|RSGN|UAV|WCB|WCNW", "0-0"], ["*", "*", "*", "*", "DO", "12", "1", "RP", "31-31", "Y", "Y", "N", "LEAVE|MLOA|PATL|RSGN|UAV|WCB|WCNW", "1-2"], ["*", "*", "*", "*", "DO", "11", "1", "RP", "31-31", "Y", "Y", "N", "LEAVE|MLOA|PATL|RSGN|UAV|WCB|WCNW", "3-4"], ["*", "*", "*", "*", "DO", "10", "1", "RP", "31-31", "Y", "Y", "N", "LEAVE|MLOA|PATL|RSGN|UAV|WCB|WCNW", "5-7"], ["*", "*", "*", "*", "DO", "9", "1", "RP", "31-31", "Y", "Y", "N", "LEAVE|MLOA|PATL|RSGN|UAV|WCB|WCNW", "8-9"], ["*", "*", "*", "*", "DO", "8", "1", "RP", "31-31", "Y", "Y", "N", "LEAVE|MLOA|PATL|RSGN|UAV|WCB|WCNW", "10-12"], ["*", "*", "*", "*", "DO", "7", "1", "RP", "31-31", "Y", "Y", "N", "LEAVE|MLOA|PATL|RSGN|UAV|WCB|WCNW", "13-14"], ["*", "*", "*", "*", "DO", "6", "1", "RP", "31-31", "Y", "Y", "N", "LEAVE|MLOA|PATL|RSGN|UAV|WCB|WCNW", "15-17"], ["*", "*", "*", "*", "DO", "5", "1", "RP", "31-31", "Y", "Y", "N", "LEAVE|MLOA|PATL|RSGN|UAV|WCB|WCNW", "18-19"], ["*", "*", "*", "*", "DO", "4", "1", "RP", "31-31", "Y", "Y", "N", "LEAVE|MLOA|PATL|RSGN|UAV|WCB|WCNW", "20-22"], ["*", "*", "*", "*", "DO", "3", "1", "RP", "31-31", "Y", "Y", "N", "LEAVE|MLOA|PATL|RSGN|UAV|WCB|WCNW", "23-24"], ["*", "*", "*", "*", "DO", "2", "1", "RP", "31-31", "Y", "Y", "N", "LEAVE|MLOA|PATL|RSGN|UAV|WCB|WCNW", "25-27"], ["*", "*", "*", "*", "DO", "1", "1", "RP", "31-31", "Y", "Y", "N", "LEAVE|MLOA|PATL|RSGN|UAV|WCB|WCNW", "28-29"], ["*", "*", "*", "*", "DO", "0", "1", "RP", "31-31", "Y", "Y", "N", "LEAVE|MLOA|PATL|RSGN|UAV|WCB|WCNW", "30-31"], ["*", "*", "*", "*", "DO", "12", "1", "RP", "30-30", "Y", "Y", "N", "LEAVE|MLOA|PATL|RSGN|UAV|WCB|WCNW", "0-1"], ["*", "*", "*", "*", "DO", "11", "1", "RP", "30-30", "Y", "Y", "N", "LEAVE|MLOA|PATL|RSGN|UAV|WCB|WCNW", "2-3"], ["*", "*", "*", "*", "DO", "10", "1", "RP", "30-30", "Y", "Y", "N", "LEAVE|MLOA|PATL|RSGN|UAV|WCB|WCNW", "4-6"], ["*", "*", "*", "*", "DO", "9", "1", "RP", "30-30", "Y", "Y", "N", "LEAVE|MLOA|PATL|RSGN|UAV|WCB|WCNW", "7-8"], ["*", "*", "*", "*", "DO", "8", "1", "RP", "30-30", "Y", "Y", "N", "LEAVE|MLOA|PATL|RSGN|UAV|WCB|WCNW", "9-11"], ["*", "*", "*", "*", "DO", "7", "1", "RP", "30-30", "Y", "Y", "N", "LEAVE|MLOA|PATL|RSGN|UAV|WCB|WCNW", "12-13"], ["*", "*", "*", "*", "DO", "6", "1", "RP", "30-30", "Y", "Y", "N", "LEAVE|MLOA|PATL|RSGN|UAV|WCB|WCNW", "14-16"], ["*", "*", "*", "*", "DO", "5", "1", "RP", "30-30", "Y", "Y", "N", "LEAVE|MLOA|PATL|RSGN|UAV|WCB|WCNW", "17-18"], ["*", "*", "*", "*", "DO", "4", "1", "RP", "30-30", "Y", "Y", "N", "LEAVE|MLOA|PATL|RSGN|UAV|WCB|WCNW", "19-21"], ["*", "*", "*", "*", "DO", "3", "1", "RP", "30-30", "Y", "Y", "N", "LEAVE|MLOA|PATL|RSGN|UAV|WCB|WCNW", "22-23"], ["*", "*", "*", "*", "DO", "2", "1", "RP", "30-30", "Y", "Y", "N", "LEAVE|MLOA|PATL|RSGN|UAV|WCB|WCNW", "24-26"], ["*", "*", "*", "*", "DO", "1", "1", "RP", "30-30", "Y", "Y", "N", "LEAVE|MLOA|PATL|RSGN|UAV|WCB|WCNW", "27-28"], ["*", "*", "*", "*", "DO", "0", "1", "RP", "30-30", "Y", "Y", "N", "LEAVE|MLOA|PATL|RSGN|UAV|WCB|WCNW", "29-30"]], "header": ["Bases", "Ranks", "Fleets", "Crew Teams", "DO Assignment Group", "Min DO", "Period", "Unit", "RP Days Range", "Utilize Post Duty Rest", "Count Blank Day", "Count Layover", "Leave Assignments", "Leave Days Range"]}]}'::jsonb),
  (27, 'system', now(), 'system', now(), 7506, '001', 'R', 'One Checkin Per Day. ', 'ROIs', 'Roster', 'Table', 'ROIs', 'One Checkin Per Day. ', 'S', 1, 'F8', 'P', 'S', '1', '', 7506001, '{"tables": [{"rows": [["*", "*", "*", "*", "FLY"]], "header": ["Bases", "Ranks", "Fleets", "Crew Teams", "Assignments"]}]}'::jsonb),
  (32, 'system', now(), 'system', now(), 7507, '001', 'R', 'Min # GDOs in a RP (fly/reserve filters)', 'ROIs', 'DO', 'Table', 'ROIs', 'Crew must have minimum X days off in a rostering period when fly/reserve day counts match the row filters', 'S', 1, 'F8', 'P', 'S', '0', '', 7507001, '{"tables": [{"rows": [["*", "*", "*", "*", "DO", "0", "1", "RP", "0-31", "Y", "Y", "N", "0-31", "*", "0-31", "*", "*", "0-31"]], "header": ["Bases", "Ranks", "Fleets", "Crew Teams", "DO Assignment Group", "Min DO", "Period", "Unit", "RP Days Range", "Utilize Post Duty Rest", "Count Blank Day", "Count Layover", "NUM FLY DAY", "FLY ASSIGNMENTS", "NUM RESERVES", "RES ASSIGNMENTS", "Leave Assignments", "Leave Days Range"]}]}'::jsonb),
  (33, 'system', now(), 'system', now(), 7508, '001', 'R', 'Single Day Free from Duty in Calendar Days', 'F8', 'Duty', 'Table', 'F8', 'Single Day Free from Duty in Calendar Days', 'S', 1, 'F8', 'P', 'S', '1', '', 7508001, '{"tables": [{"rows": [["*", "*", "*", "*", "168", "RH", "Y", "Y", "00:00", "1"], ["*", "*", "*", "*", "672", "RH", "Y", "Y", "00:00", "4"]], "header": ["Bases", "Ranks", "Fleets", "Teams", "Period", "Unit", "Duty Report", "Duty Release", "Duty End Buffer", "Min Limits"]}]}'::jsonb),
  (35, 'system', now(), 'system', now(), 7509, '001', 'R', 'Avoid Co-pairing', 'F8', 'Roster', 'Table', 'F8', 'Avoid Co-pairing', 'S', 1, 'F8', 'P', 'S', '1', '', 7509001, '{"tables": [{"rows": [], "header": ["Crew A", "Crew B", "Eff Date", "Exp Date"]}]}'::jsonb),
  (17, 'system', now(), 'system', now(), 8002, '001', 'B', 'Maximum Flight Time', 'Flair', 'Rest', 'Table', 'CCAR-121-487(a) 497(a)', 'Periodical BH/FDP/DP Limitation', 'S', 1, 'F8', 'P', 'S', '1', '', 8002001, '{"tables": [{"rows": [["*", "*", "*", "*", "28", "CD", "Y", "59:00", "00:00", "BH"], ["*", "*", "*", "*", "90", "CD", "Y", "300:00", "00:00", "BH"], ["*", "*", "*", "*", "365", "CD", "Y", "1000:00", "00:00", "BH"]], "header": ["Bases", "Ranks", "Fleets", "Crew Teams", "Period", "Unit", "Prorated", "Max Limits", "Min Limits", "Type"]}]}'::jsonb),
  (20, 'system', now(), 'system', now(), 8002, '002', 'B', 'Maximum Hours of Work', 'Flair', 'Rest', 'Table', 'CCAR-121-487(a) 497(a)', 'Periodical BH/FDP/DP Limitation', 'S', 1, 'F8', 'P', 'U', '0', '', 8002002, '{"tables": [{"rows": [["*", "*", "*", "*", "7", "CD", "Y", "60:00", "00:00", "DP"], ["*", "*", "*", "*", "28", "CD", "Y", "192:00", "00:00", "DP"], ["*", "*", "*", "*", "365", "CD", "Y", "2200:00", "00:00", "DP"]], "header": ["Bases", "Ranks", "Fleets", "Crew Teams", "Period", "Unit", "Prorated", "Max Limits", "Min Limits", "Type"]}]}'::jsonb),
  (22, 'system', now(), 'system', now(), 8004, '001', 'R', 'Basic Competency-F8', 'ROIs', 'Basic', 'Table', 'General', 'Basic Base, Rank,Fleet Competency', 'S', 1, 'F8', 'P', 'S', '1', '', 8004001, '{"tables": [{"rows": [["*", "*", "*", "BASE", "Y", "0", "CD", "FLY"], ["*", "*", "*", "RANK", "N", "0", "CD", "FLY"], ["*", "*", "*", "FLEET", "N", "0", "CD", "FLY"]], "header": ["Base", "Rank", "Fleet", "Type", "Enable Check", "Grace Period", "Unit", "Assignments"]}]}'::jsonb),
  (21, 'system', now(), 'system', now(), 8030, '001', 'R', 'Age Restriction', 'ROIs', 'Qual', 'Table', 'ZH Company', 'Max Age Limitation', 'S', 1, 'F8', 'P', 'S', '1', '', 8030001, '{"tables": [{"rows": [["P", "*", "65", "1"]], "header": ["Division", "Airport", "Age Define", "Max Number"]}]}'::jsonb),
  (18, 'system', now(), 'system', now(), 8056, '001', 'R', 'Roster Spacing', 'Flair', 'Rest', 'Table', 'General', 'Roster spacing', 'S', 1, 'F8', 'P', 'S', '1', '', 8056001, '{"tables": [{"rows": [["*", "*", "*", "*", "*", "*", "FLY", "*", "*", "*", "*", "*", "*", "FLY|SBY|SIM", "*", "*", "*", "*", "13", "RH", "Y", "*", "*", "Y"]], "header": ["Bases", "Ranks", "Fleets", "Crew Teams", "Attribute A", "Label A", "Assignment Group A", "Qualifier A", "Airport A", "Roles A", "Is Requested A", "Attribute B", "Label B", "Assignment Group B", "Qualifier B", "Airport B", "Roles B", "Is Requested B", "Space", "Unit", "Directional", "Is Location Equal Base A", "Is Location Equal Base B", "Utilize Post Duty Rest"]}]}'::jsonb),
  (31, 'system', now(), 'system', now(), 1001, '001', 'R', 'Assignment Overlap', 'ROIs', 'Roster', 'Table', 'ROIs', 'Assignment Overlap', 'S', 1, 'F8', 'P', 'S', '1', '', 1001001, '{"tables": [{"rows": [["FLY", "*", "Y", "*", "*", "*", "L|O"], ["SBY", "*", "Y", "*", "*", "*", "L|O"], ["FLY", "*", "Y", "*", "DO", "*", "*"], ["SBY", "*", "Y", "*", "DO", "*", "*"]], "header": ["Assignment Group Before", "Assignment Before", "Assignment Rest Before", "Assignment Type Before", "Assignment Group After", "Assignment After", "Assignment Type After"]}]}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------
-- 3) rule_set membership (workset_id ∈ {103,433} ⇄ rule.rule_id)
-- ---------------------------------------------------------------
INSERT INTO rule_set (id, created_by, created_at, updated_by, updated_at, workset_id, rule_id)
OVERRIDING SYSTEM VALUE VALUES
  (48, 'system', now(), 'system', now(), 103, 2014001),
  (60, 'system', now(), 'system', now(), 103, 2015001),
  (54, 'system', now(), 'system', now(), 103, 7272001),
  (49, 'system', now(), 'system', now(), 103, 7500001),
  (47, 'system', now(), 'system', now(), 103, 7501001),
  (44, 'system', now(), 'system', now(), 103, 7502001),
  (50, 'system', now(), 'system', now(), 103, 7503001),
  (51, 'system', now(), 'system', now(), 103, 7504001),
  (52, 'system', now(), 'system', now(), 103, 7505001),
  (53, 'system', now(), 'system', now(), 103, 7506001),
  (57, 'system', now(), 'system', now(), 103, 7507001),
  (59, 'system', now(), 'system', now(), 103, 7508001),
  (62, 'system', now(), 'system', now(), 103, 7509001),
  (15, 'system', now(), 'system', now(), 103, 8002001),
  (18, 'system', now(), 'system', now(), 103, 8002002),
  (46, 'system', now(), 'system', now(), 103, 8004001),
  (45, 'system', now(), 'system', now(), 103, 8030001),
  (43, 'system', now(), 'system', now(), 103, 8056001),
  (33, 'system', now(), 'system', now(), 433, 2014001),
  (61, 'system', now(), 'system', now(), 433, 2015001),
  (32, 'system', now(), 'system', now(), 433, 7272001),
  (30, 'system', now(), 'system', now(), 433, 7500001),
  (40, 'system', now(), 'system', now(), 433, 7501001),
  (37, 'system', now(), 'system', now(), 433, 7502001),
  (39, 'system', now(), 'system', now(), 433, 7503001),
  (41, 'system', now(), 'system', now(), 433, 7504001),
  (38, 'system', now(), 'system', now(), 433, 7505001),
  (36, 'system', now(), 'system', now(), 433, 7506001),
  (58, 'system', now(), 'system', now(), 433, 7507001),
  (60, 'system', now(), 'system', now(), 433, 7508001),
  (63, 'system', now(), 'system', now(), 433, 7509001),
  (42, 'system', now(), 'system', now(), 433, 8002001),
  (34, 'system', now(), 'system', now(), 433, 8002002),
  (31, 'system', now(), 'system', now(), 433, 8004001),
  (29, 'system', now(), 'system', now(), 433, 8030001),
  (35, 'system', now(), 'system', now(), 433, 8056001),
  (55, 'system', now(), 'system', now(), 103, 1001001),
  (56, 'system', now(), 'system', now(), 433, 1001001)
ON CONFLICT (id) DO NOTHING;
