-- 2026/04/15 Rule 7009 (SQ): rename period display headers.
-- Behavior is unchanged; the engine also accepts the legacy header names.
-- This migration updates only SQ 7009 table headers and is idempotent.

UPDATE rule_parameter rp
JOIN rule r ON rp.rule_id = r.id
SET rp.param_values = REPLACE(
                        REPLACE(rp.param_values,
                                'Prev Roster Start',
                                'Prev Level Check Period'),
                        'Next Roster End',
                        'Next Level Check Period')
WHERE r.`function` = 7009
  AND r.filiale = 'SQ'
  AND rp.param_names LIKE 'table%Header%'
  AND (
        rp.param_values LIKE '%Prev Roster Start%'
        OR rp.param_values LIKE '%Next Roster End%'
      );
