-- SQ Max Duty Period Rule (Rule 7434)
-- Restricts maximum duty period based on duty assignment, fleet, composition, fleet changes, and assignments after FDP.

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
  (7434001, 7434, '001', 'P',
   'SQ Max Duty Period Rule', 'SQ',
   'DUTY',
   'Table',
   'SQ',
   'Restricts maximum duty period based on duty assignment, fleet, composition, fleet changes, and assignments after FDP.',
   'H', 2,
   'SQ', 'P', 'S',
   NULL, 'GEMINI', CURRENT_TIMESTAMP)
ON DUPLICATE KEY UPDATE
  `function`=VALUES(`function`), `instance`=VALUES(`instance`), `class`=VALUES(`class`),
  `description`=VALUES(`description`), `reference`=VALUES(`reference`), `category`=VALUES(`category`),
  `store_structure`=VALUES(`store_structure`), `source`=VALUES(`source`), `detail`=VALUES(`detail`),
  `overridability`=VALUES(`overridability`), `severity`=VALUES(`severity`), `filiale`=VALUES(`filiale`),
  `division`=VALUES(`division`), `owner`=VALUES(`owner`), `locked`=VALUES(`locked`),
  `modified_by`=VALUES(`modified_by`), `last_modified`=VALUES(`last_modified`);

-- 2) Table header
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174340, 7434001, 1,
   'tableHeader',
   'SERVICE TYPE,FLEET GROUP,FLEET,COMPOSITION,FLEET CHANGE,FLEET GROUP CHANGE,DUTY ASSIGNMENT,HAS ASSIGNMENT AFTER FDP,MAX DP,MAX FDP',
   'GEMINI', CURRENT_TIMESTAMP)
ON DUPLICATE KEY UPDATE
  `rule_id`=VALUES(`rule_id`), `phase_id`=VALUES(`phase_id`), `param_names`=VALUES(`param_names`),
  `param_values`=VALUES(`param_values`), `modified_by`=VALUES(`modified_by`), `last_modified`=VALUES(`last_modified`);

-- 3) Parameter Row: Example default case
INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174341, 7434001, 1,
   'tableRow1',
   '*,*,*,*,*,*,*,DHD,*,14:00',
   'ROIS', CURRENT_TIMESTAMP)
ON DUPLICATE KEY UPDATE
  `rule_id`=VALUES(`rule_id`), `phase_id`=VALUES(`phase_id`), `param_names`=VALUES(`param_names`),
  `param_values`=VALUES(`param_values`), `modified_by`=VALUES(`modified_by`), `last_modified`=VALUES(`last_modified`);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (208174342, 7434001, 1,
   'tableRow2',
   '*,*,*,*,*,Y,*,*,14:00,*',
   'ROIS', CURRENT_TIMESTAMP)
ON DUPLICATE KEY UPDATE
  `rule_id`=VALUES(`rule_id`), `phase_id`=VALUES(`phase_id`), `param_names`=VALUES(`param_names`),
  `param_values`=VALUES(`param_values`), `modified_by`=VALUES(`modified_by`), `last_modified`=VALUES(`last_modified`);
