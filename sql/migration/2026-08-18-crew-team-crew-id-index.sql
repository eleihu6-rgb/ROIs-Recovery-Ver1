-- =============================================================================
-- 2026-08-18  crew_team: index on crew_id for 8072 (and other) LATERAL lookups.
-- =============================================================================
-- 8072 qualificationFlightSegments joins crew_team per crew-on-segment row:
--   WHERE ct.crew_id = rf.crew_id AND ct.is_valid = 1 AND date overlap
-- Sibling tables (crew_base / crew_fleet / crew_qualification) already have
-- crew_id indexes. Without this, Postgres seq-scans crew_team on every loop.
--
-- Run with search_path set to the target live schema
-- (f8_dev_live / f8_sit_live / f8_uat_live). Does not change rule math.
-- =============================================================================

create index if not exists idx_crew_team_crew_id on crew_team (crew_id);
