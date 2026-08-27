-- F8 Q1 roster_period date correction
-- RP1: Jan 01 – Jan 30 (was Jan 01 – Jan 31)
-- RP2: Jan 31 – Mar 01 (was Feb 01 – Mar 01)
-- RP3+ unchanged. Idempotent.

update roster_period
   set rp_end = make_timestamptz(
                  (substring(roster_period from 1 for 4))::int, 1, 30,
                  0, 0, 0, 'UTC'),
       updated_by = 'migration',
       updated_at = now()
 where roster_period ~ '^[0-9]{4}RP01$'
   and rp_end::date = make_date((substring(roster_period from 1 for 4))::int, 1, 31);

update roster_period
   set rp_start = make_timestamptz(
                    (substring(roster_period from 1 for 4))::int, 1, 31,
                    0, 0, 0, 'UTC'),
       updated_by = 'migration',
       updated_at = now()
 where roster_period ~ '^[0-9]{4}RP02$'
   and rp_start::date = make_date((substring(roster_period from 1 for 4))::int, 2, 1);
