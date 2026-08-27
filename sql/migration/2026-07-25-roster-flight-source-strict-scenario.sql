-- 2026-07-25 — roster_flight.source Phase 2 lockdown.
-- SCENARIO schema ONLY. Run with: SET search_path TO scenario;
-- Precondition: Phase 1 backfill complete; no NULL/wrong-value rows remain.

alter table roster_flight alter column source set not null;
alter table roster_flight drop constraint if exists chk_roster_flight_source_pa_ma_cr;
alter table roster_flight add constraint chk_roster_flight_source_scenario
  check (source in ('PA', 'MA', 'CR'));
