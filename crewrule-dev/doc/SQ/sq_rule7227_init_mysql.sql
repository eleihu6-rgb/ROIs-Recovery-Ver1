-- SQ layover restriction (Rule 7227)
-- Release 2.0 init script.
-- Intent:
--   With FORCE NOT LAYOVER = Y and ARVS = !(TFU|KTM|CKG|PUS),
--   the last segment of each non-final duty cannot end at airports
--   except TFU/KTM/CKG/PUS.

-- Insert SQ-specific rule instance (instance 001).
INSERT INTO `rule`(
  `id`, `function`, `instance`, `class`,
  `description`, `reference`, `category`,
  `store_structure`, `source`, `detail`,
  `overridability`, `severity`,
  `filiale`, `division`, `owner`,
  `locked`, `modified_by`, `last_modified`
)
VALUES
  (7227001, 7227, '001', 'P',
   'Layover restriction for SQ (allowed layover stations only)',
   'SQ', 'Pairing',
   'Table', 'Company',
   'FORCE NOT LAYOVER on ARVS exclude list for non-final duties.',
   'H', 2,
   'SQ', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200072270, 7227001, 1, 'tableHeader',
   'Pairing Base,Assignments,Airline Code,Flight Fleets,Flight Numbers,Deps,Arvs,Start Date,End Date,Force Layover,Force Not Layover',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(
  `id`, `rule_id`, `phase_id`, `param_names`, `param_values`,
  `modified_by`, `last_modified`
)
VALUES
  (200072271, 7227001, 1, 'tableRow1',
   '*,*,*,737|73M,*,*,!(SIN|TFU|KTM|CKG|PUS),*,*,N,Y',
   'ROIS', CURRENT_TIMESTAMP);
