-- Live Gantt initial-load read path.
-- Run outside a transaction and set search_path to the intended Live schema first.
-- These indexes are additive and idempotent; CONCURRENTLY avoids blocking roster writes.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_roster_flight_gantt_crew_sch_active
  ON roster_flight (crew_id, sch_str_dt_utc)
  WHERE is_deleted = 0;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pairing_gantt_division_sch_active
  ON pairing (division, sch_str_dt_utc)
  WHERE is_deleted = 0;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pairing_segment_gantt_pair_duty_seg_active
  ON pairing_segment (pairing_id, duty_seq, seg_seq)
  WHERE is_deleted = 0;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pairing_composition_gantt_pair_active
  ON pairing_composition (pairing_id)
  WHERE is_deleted = 0;
