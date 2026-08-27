-- 2026-08-08 Crew-specific rule 7500 reference timezone at duty end / rest start.
--
-- Run once under each target schema search_path that owns roster_flight
-- (for example f8_sit_live and f8_sit_scenario).
--
-- duty_ref_tz is the duty-start acclimatisation reference timezone. Rules
-- 7501/7508 also need the reference timezone at duty end when evaluating the
-- following local night, so persist the second value at the same granularity.

alter table roster_flight
  add column if not exists duty_end_ref_tz integer;

comment on column roster_flight.duty_end_ref_tz is
  'Crew-specific rule 7500 acclimatisation reference timezone at duty end / rest start, minutes east of UTC; repeated for every segment row in crew + pairing + duty.';
