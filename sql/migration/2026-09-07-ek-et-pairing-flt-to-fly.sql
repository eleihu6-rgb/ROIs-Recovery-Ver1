-- Align EK/ET pairing codes with F8: FLT → FLY, PAX → DHD.
-- Target: live schema from DATABASE_URL search_path (dev_live).
-- Idempotent: second run updates 0 rows.

BEGIN;

CREATE TEMP TABLE ek_et_flt_pairings ON COMMIT DROP AS
SELECT id
FROM pairing
WHERE assignment_group = 'FLT'
  AND coalesce(is_deleted, 0) = 0;

UPDATE pairing p
SET assignment_group = 'FLY',
    assignment = 'FLY',
    updated_by = 'flt_to_fly_2026-09-07',
    updated_at = now()
FROM ek_et_flt_pairings t
WHERE p.id = t.id;

UPDATE pairing_segment ps
SET seg_assignment = CASE
      WHEN upper(btrim(ps.seg_assignment)) = 'PAX' THEN 'DHD'
      WHEN upper(btrim(ps.seg_assignment)) = 'FLT' THEN 'FLY'
      ELSE ps.seg_assignment
    END,
    updated_by = 'flt_to_fly_2026-09-07',
    updated_at = now()
FROM ek_et_flt_pairings t
WHERE ps.pairing_id = t.id
  AND upper(btrim(coalesce(ps.seg_assignment, ''))) IN ('FLT', 'PAX');

UPDATE roster_flight rf
SET assignment_group = CASE
      WHEN rf.assignment_group = 'FLT' THEN 'FLY'
      ELSE rf.assignment_group
    END,
    assignment = CASE
      WHEN rf.assignment = 'PAX' THEN 'DHD'
      WHEN rf.assignment = 'FLT' THEN 'FLY'
      ELSE rf.assignment
    END,
    updated_by = 'flt_to_fly_2026-09-07',
    updated_at = now()
FROM ek_et_flt_pairings t
WHERE rf.pairing_id = t.id
  AND (
    rf.assignment_group = 'FLT'
    OR rf.assignment IN ('FLT', 'PAX')
  );

DO $$
DECLARE
  leftover_pairing int;
  leftover_seg int;
  leftover_roster int;
BEGIN
  SELECT count(*)::int INTO leftover_pairing
  FROM pairing
  WHERE assignment_group = 'FLT'
    AND coalesce(is_deleted, 0) = 0;
  IF leftover_pairing <> 0 THEN
    RAISE EXCEPTION 'pairing FLT leftover: %', leftover_pairing;
  END IF;

  SELECT count(*)::int INTO leftover_seg
  FROM pairing_segment ps
  JOIN ek_et_flt_pairings t ON t.id = ps.pairing_id
  WHERE upper(btrim(coalesce(ps.seg_assignment, ''))) IN ('FLT', 'PAX');
  IF leftover_seg <> 0 THEN
    RAISE EXCEPTION 'pairing_segment FLT/PAX leftover: %', leftover_seg;
  END IF;

  SELECT count(*)::int INTO leftover_roster
  FROM roster_flight rf
  JOIN ek_et_flt_pairings t ON t.id = rf.pairing_id
  WHERE rf.assignment_group = 'FLT'
     OR rf.assignment IN ('FLT', 'PAX');
  IF leftover_roster <> 0 THEN
    RAISE EXCEPTION 'roster_flight FLT/PAX leftover: %', leftover_roster;
  END IF;
END $$;

COMMIT;
