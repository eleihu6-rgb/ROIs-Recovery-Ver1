-- Reverse EK PAX→DHD from 2026-09-07: these EK rings are operating flights, not deadhead.
-- Scope: only pairings stamped flt_to_fly_2026-09-07 that have EK segments.
-- Do not touch F8 / other DHD rows.

BEGIN;

CREATE TEMP TABLE ek_fly_pairings ON COMMIT DROP AS
SELECT DISTINCT p.id
FROM pairing p
JOIN pairing_segment ps ON ps.pairing_id = p.id
WHERE p.updated_by = 'flt_to_fly_2026-09-07'
  AND ps.airline = 'EK';

UPDATE pairing_segment ps
SET seg_assignment = 'FLY',
    updated_by = 'ek_dhd_to_fly_2026-09-08',
    updated_at = now()
FROM ek_fly_pairings t
WHERE ps.pairing_id = t.id
  AND ps.airline = 'EK'
  AND upper(btrim(ps.seg_assignment)) = 'DHD';

UPDATE roster_flight rf
SET assignment = 'FLY',
    updated_by = 'ek_dhd_to_fly_2026-09-08',
    updated_at = now()
FROM ek_fly_pairings t
WHERE rf.pairing_id = t.id
  AND rf.assignment = 'DHD';

DO $$
DECLARE leftover int;
BEGIN
  SELECT count(*)::int INTO leftover
  FROM pairing_segment ps
  JOIN ek_fly_pairings t ON t.id = ps.pairing_id
  WHERE ps.airline = 'EK'
    AND upper(btrim(ps.seg_assignment)) = 'DHD';
  IF leftover <> 0 THEN
    RAISE EXCEPTION 'EK DHD leftover on remapped pairings: %', leftover;
  END IF;
END $$;

COMMIT;
