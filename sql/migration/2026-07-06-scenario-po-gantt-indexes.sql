-- Speed up DB-backed PO Scenario Gantt opening after S3 PRG imports.
-- PO scenarios read pairings, segments, and flights by scenario_id from scenario mirror tables.

create index if not exists idx_scenario_flight_scenario_dep
    on scenario.flight (scenario_id, sch_dep_dt_utc);

create index if not exists idx_scenario_pairing_segment_active_scenario_pair
    on scenario.pairing_segment (scenario_id, pairing_id, duty_seq, seg_seq)
    where is_deleted = 0;
