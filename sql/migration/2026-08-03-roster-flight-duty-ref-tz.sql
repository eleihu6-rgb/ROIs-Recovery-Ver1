-- Crew-specific rule 7500 acclimatisation reference timezone.
--
-- pairing_segment.duty_ref_tz is pairing-level compatibility data. The same
-- pairing may be rostered to multiple crews whose reference timezone differs,
-- so the authoritative value is stored at crew + pairing + duty granularity
-- and repeated on every segment row in that duty.

alter table roster_flight
  add column if not exists duty_ref_tz integer;

comment on column roster_flight.duty_ref_tz is
  'Crew-specific rule 7500 acclimatisation reference timezone in minutes east of UTC; repeated for every segment row in crew + pairing + duty.';

create index if not exists idx_roster_flight_crew_pair_duty_ref
  on roster_flight (crew_id, pairing_id, duty_seq)
  where is_deleted = 0 and pairing_id is not null;

alter table scenario.roster_flight
  add column if not exists duty_ref_tz integer;

comment on column scenario.roster_flight.duty_ref_tz is
  'Crew-specific rule 7500 acclimatisation reference timezone in minutes east of UTC; repeated for every segment row in crew + pairing + duty.';

create index if not exists idx_scenario_roster_flight_crew_pair_duty_ref
  on scenario.roster_flight (scenario_id, crew_id, pairing_id, duty_seq)
  where is_deleted = 0 and pairing_id is not null;
