-- F8 roster_period 2025 backfill (f8 / f8_sit_live / f8_uat_live)
-- 2025 historical periods were missing; this mirrors the 2026 seed exactly so
-- imported 2025 roster/historical data can reference 2025RPxx. Idempotent.
--
-- F8 convention (same as sql/seed/roster-period-2026-2036.sql):
--   RP01 Jan 01 – Jan 30 | RP02 Jan 31 – Mar 01 | RP03 Mar 02 – Mar 31
--   RP04–12 full calendar months
--   roster_publication_date = 20th of the period month
--   paid_date = 1st of the next month (RP12 → next year-01-01)
-- PBS window cadence (derived from the 2026 sample, holds for all 12 periods):
--   pbs_bid_open_at       = first Friday of the prior month, 00:00
--   pbs_bid_close_at      = +7 days, 23:59
--   pbs_award_publish_at  = +17 days, 23:59
--   pbs_status            = DRAFT
--
-- Apply once per schema (search_path = f8, f8_sit_live, f8_uat_live).
-- ON CONFLICT targets the partial unique index on pbs_period_code (WHERE NOT NULL).

INSERT INTO roster_period
  (created_by, year, name, roster_period, rp_start, rp_end,
   roster_publication_date, paid_date, lock_status,
   pbs_period_code, pbs_bid_open_at, pbs_bid_close_at, pbs_award_publish_at, pbs_status)
WITH gen AS (
  SELECT m FROM generate_series(1, 12) AS m
),
ps AS (  -- period month first day
  SELECT m, make_date(2025, m, 1) AS d0 FROM gen
),
pv AS (  -- prior month first day (RP01 → Dec 2024)
  SELECT ps.*,
         CASE WHEN m = 1 THEN make_date(2024, 12, 1) ELSE make_date(2025, m - 1, 1) END AS pm0
  FROM ps
),
ff AS (  -- first Friday of prior month
  SELECT pv.*, pv.pm0 + ((5 - extract(dow from pv.pm0)::int + 7) % 7) AS first_fri
  FROM pv
)
SELECT
  'seed',
  '2025',
  '2025-' || lpad(m::text, 2, '0'),
  '2025RP' || lpad(m::text, 2, '0'),
  CASE
    WHEN m = 1 THEN make_timestamp(2025, 1, 1, 0, 0, 0)
    WHEN m = 2 THEN make_timestamp(2025, 1, 31, 0, 0, 0)
    WHEN m = 3 THEN make_timestamp(2025, 3, 2, 0, 0, 0)
    ELSE d0
  END,
  CASE
    WHEN m = 1 THEN make_timestamp(2025, 1, 30, 0, 0, 0)
    WHEN m = 2 THEN make_timestamp(2025, 3, 1, 0, 0, 0)
    WHEN m = 3 THEN make_timestamp(2025, 3, 31, 0, 0, 0)
    WHEN m IN (4, 6, 9, 11) THEN make_timestamp(2025, m, 30, 0, 0, 0)
    ELSE make_timestamp(2025, m, 31, 0, 0, 0)
  END,
  make_timestamptz(2025, m, 20, 0, 0, 0, 'UTC'),
  CASE WHEN m = 12 THEN make_timestamptz(2026, 1, 1, 0, 0, 0, 'UTC')
       ELSE make_timestamptz(2025, m + 1, 1, 0, 0, 0, 'UTC') END,
  0,
  to_char(d0, 'Mon YYYY'),
  first_fri::timestamp,
  (first_fri + 7)::timestamp + time '23:59',
  (first_fri + 17)::timestamp + time '23:59',
  'DRAFT'
FROM ff
ORDER BY m
ON CONFLICT (pbs_period_code) WHERE pbs_period_code IS NOT NULL DO NOTHING;
