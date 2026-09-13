-- Align EK/ET flight data with F8: flight_assignment 'PAX'/NULL -> 'FLY'.
-- Target: live schema from DATABASE_URL search_path (f8_sit_live).
--
-- Business background
--   EK was seeded from the synthetic fixture `.agents/skills/142-flight-schedule-seed-generator/
--   fixtures/ek-dxb-a380.json`, which hardcodes "flightAssignment": "PAX"; ET's real SSIM load
--   (`scripts/load-ssim-flights.mjs`) never wrote the column at all (NULL). `PAX` is not
--   "passenger service" in this column — `flt_type` is. Per the assignment dictionary
--   (`sql/seed/03-assignment.sql`) `flight_assignment='PAX'` means **Positioning** (group DHD),
--   so every EK/ET leg looked like a repositioning leg:
--     * `live-server/src/services/pairing/pairing-build-service.ts` copies
--       `flight.flight_assignment` into `pairing_segment.seg_assignment` (`?? 'FLY'`), so pairings
--       built from EK/ET flights came out as PAX/positioning duties, not operating duties;
--     * `live-server/scripts/live-legality.mjs` exposes it as the segment `Attributes` value
--       (`coalesce(ps.seg_assignment, f.flight_assignment, '*')`);
--     * duty FDP/credit computation keys off the same code.
--   F8's inbound connector writes `flight_assignment='FLY'` for every operating flight it imports
--   (`live-server/src/workers/flight-inbound-worker.ts`), so EK/ET is now aligned to that value.
--
-- Scope: `airline IN ('EK','ET')`, all dates (both carriers are demo/synthetic data only on this
--   DB, and every EK/ET row is scenario_id = 0 / live). `flt_type` is intentionally untouched —
--   it stays 'PAX' (passenger service) / 'FRT' and is a different concept.
--
-- Idempotent: a second run updates 0 rows and the verification block still passes.

BEGIN;

CREATE TEMP TABLE ek_et_legs_to_fly ON COMMIT DROP AS
SELECT id
FROM flight
WHERE airline IN ('EK', 'ET')
  AND coalesce(flight_assignment, '') <> 'FLY';

UPDATE flight f
SET flight_assignment = 'FLY',
    updated_by = 'ek_et_flt_to_fly_2026-09-13',
    updated_at = now()
FROM ek_et_legs_to_fly t
WHERE f.id = t.id;

DO $$
DECLARE
  leftover int;
  total int;
BEGIN
  SELECT count(*)::int INTO leftover
  FROM flight
  WHERE airline IN ('EK', 'ET')
    AND coalesce(flight_assignment, '') <> 'FLY';
  IF leftover <> 0 THEN
    RAISE EXCEPTION 'EK/ET flight_assignment FLY leftover: %', leftover;
  END IF;

  SELECT count(*)::int INTO total
  FROM flight
  WHERE airline IN ('EK', 'ET') AND flight_assignment = 'FLY';
  RAISE NOTICE 'EK/ET flights with flight_assignment=FLY: %', total;
END $$;

COMMIT;
