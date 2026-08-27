-- 2026-07-25 — roster_flight.source Phase 2 lockdown.
-- LIVE (f8) schema ONLY. Run with: SET search_path TO f8;
-- Precondition: Phase 1 backfill complete; no NULL/wrong-value rows remain.

alter table roster_flight alter column source set not null;
alter table roster_flight drop constraint if exists chk_roster_flight_source_pa_ma_cr;
alter table roster_flight add constraint chk_roster_flight_source_live
  check (source in ('IMP', 'MA', 'CR'));
