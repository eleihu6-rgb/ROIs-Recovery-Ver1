\set ON_ERROR_STOP on

BEGIN;

\echo 'Before update: DH rows by schema'
SELECT 'f8' AS schema_name, COUNT(*) AS dh_rows
FROM f8.pairing_segment
WHERE seg_assignment = 'DH'
UNION ALL
SELECT 'f8_sit_live', COUNT(*)
FROM f8_sit_live.pairing_segment
WHERE seg_assignment = 'DH'
UNION ALL
SELECT 'f8_uat_live', COUNT(*)
FROM f8_uat_live.pairing_segment
WHERE seg_assignment = 'DH'
UNION ALL
SELECT 'f8_sit_scenario', COUNT(*)
FROM f8_sit_scenario.pairing_segment
WHERE seg_assignment = 'DH'
UNION ALL
SELECT 'f8_uat_scenario', COUNT(*)
FROM f8_uat_scenario.pairing_segment
WHERE seg_assignment = 'DH'
UNION ALL
SELECT 'scenario', COUNT(*)
FROM scenario.pairing_segment
WHERE seg_assignment = 'DH'
ORDER BY schema_name;

\echo 'Updating f8.pairing_segment'
UPDATE f8.pairing_segment
SET seg_assignment = 'DHD',
    updated_by = 'DATA_FIX_DH_TO_DHD',
    updated_at = NOW()
WHERE seg_assignment = 'DH';

\echo 'Updating f8_sit_live.pairing_segment'
UPDATE f8_sit_live.pairing_segment
SET seg_assignment = 'DHD',
    updated_by = 'DATA_FIX_DH_TO_DHD',
    updated_at = NOW()
WHERE seg_assignment = 'DH';

\echo 'Updating f8_uat_live.pairing_segment'
UPDATE f8_uat_live.pairing_segment
SET seg_assignment = 'DHD',
    updated_by = 'DATA_FIX_DH_TO_DHD',
    updated_at = NOW()
WHERE seg_assignment = 'DH';

\echo 'Updating f8_sit_scenario.pairing_segment'
UPDATE f8_sit_scenario.pairing_segment
SET seg_assignment = 'DHD',
    updated_by = 'DATA_FIX_DH_TO_DHD',
    updated_at = NOW()
WHERE seg_assignment = 'DH';

\echo 'Updating f8_uat_scenario.pairing_segment'
UPDATE f8_uat_scenario.pairing_segment
SET seg_assignment = 'DHD',
    updated_by = 'DATA_FIX_DH_TO_DHD',
    updated_at = NOW()
WHERE seg_assignment = 'DH';

\echo 'Updating scenario.pairing_segment'
UPDATE scenario.pairing_segment
SET seg_assignment = 'DHD',
    updated_by = 'DATA_FIX_DH_TO_DHD',
    updated_at = NOW()
WHERE seg_assignment = 'DH';

DO $$
DECLARE
  remaining_dh BIGINT;
BEGIN
  SELECT SUM(dh_rows)
  INTO remaining_dh
  FROM (
    SELECT COUNT(*) AS dh_rows FROM f8.pairing_segment WHERE seg_assignment = 'DH'
    UNION ALL
    SELECT COUNT(*) FROM f8_sit_live.pairing_segment WHERE seg_assignment = 'DH'
    UNION ALL
    SELECT COUNT(*) FROM f8_uat_live.pairing_segment WHERE seg_assignment = 'DH'
    UNION ALL
    SELECT COUNT(*) FROM f8_sit_scenario.pairing_segment WHERE seg_assignment = 'DH'
    UNION ALL
    SELECT COUNT(*) FROM f8_uat_scenario.pairing_segment WHERE seg_assignment = 'DH'
    UNION ALL
    SELECT COUNT(*) FROM scenario.pairing_segment WHERE seg_assignment = 'DH'
  ) counts;

  IF remaining_dh <> 0 THEN
    RAISE EXCEPTION 'DH rows remain after update: %', remaining_dh;
  END IF;
END
$$;

COMMIT;

\echo 'After update: DH and DHD rows by schema'
SELECT 'f8' AS schema_name,
       COUNT(*) FILTER (WHERE seg_assignment = 'DH') AS dh_rows,
       COUNT(*) FILTER (WHERE seg_assignment = 'DHD') AS dhd_rows
FROM f8.pairing_segment
UNION ALL
SELECT 'f8_sit_live',
       COUNT(*) FILTER (WHERE seg_assignment = 'DH'),
       COUNT(*) FILTER (WHERE seg_assignment = 'DHD')
FROM f8_sit_live.pairing_segment
UNION ALL
SELECT 'f8_uat_live',
       COUNT(*) FILTER (WHERE seg_assignment = 'DH'),
       COUNT(*) FILTER (WHERE seg_assignment = 'DHD')
FROM f8_uat_live.pairing_segment
UNION ALL
SELECT 'f8_sit_scenario',
       COUNT(*) FILTER (WHERE seg_assignment = 'DH'),
       COUNT(*) FILTER (WHERE seg_assignment = 'DHD')
FROM f8_sit_scenario.pairing_segment
UNION ALL
SELECT 'f8_uat_scenario',
       COUNT(*) FILTER (WHERE seg_assignment = 'DH'),
       COUNT(*) FILTER (WHERE seg_assignment = 'DHD')
FROM f8_uat_scenario.pairing_segment
UNION ALL
SELECT 'scenario',
       COUNT(*) FILTER (WHERE seg_assignment = 'DH'),
       COUNT(*) FILTER (WHERE seg_assignment = 'DHD')
FROM scenario.pairing_segment
ORDER BY schema_name;
