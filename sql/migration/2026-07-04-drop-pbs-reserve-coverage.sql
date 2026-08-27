-- Drop obsolete PBS Reserve coverage seed table.
--
-- The Reserve page now computes Need / Off from live RES pairing, crew base,
-- and manday daily data at request time. Keeping this old seed table would
-- make future development treat stale demo data as an authority.
--
-- Multi-schema execution: run with search_path set to the target PBS schema.

drop table if exists pbs_reserve_coverage;
