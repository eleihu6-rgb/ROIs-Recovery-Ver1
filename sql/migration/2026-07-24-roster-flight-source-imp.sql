-- 2026-07-24 — roster_flight.source IMP domain split (Phase 1: non-breaking)
-- Adds IMP (external interface import) as a legal source value. Phase 2 will
-- tighten to per-table strict CHECK + NOT NULL after SIT validation.
--
-- RUN INSTRUCTIONS (this file is run per-schema via SET search_path):
--   * LIVE schema (search_path = f8):    run Section A + Section B + Section C
--   * SCENARIO schema (search_path = scenario): run Section A + Section C ONLY
--     (scenario KEEPS PA as lead-in; never run PA->IMP here)

-- === Section A: widen roster_flight.source CHECK (BOTH schemas) ===
alter table roster_flight
  drop constraint if exists chk_roster_flight_source_pa_ma_cr;
alter table roster_flight
  add constraint chk_roster_flight_source_pa_ma_cr
      check (source is null or source in ('IMP', 'PA', 'MA', 'CR'));

-- === Section B: backfill — LIVE schema ONLY (do NOT run on scenario) ===
-- Live PA was used for imports -> IMP. NULLs are overwhelmingly legacy imports
-- (created_by F8_IMPORT) -> IMP. MA/CR unchanged.
update roster_flight set source = 'IMP' where source = 'PA';
update roster_flight set source = 'IMP' where source is null;

-- === Section C: roster_publish_adjust old/new source — LIVE schema ONLY ===
-- (roster_publish_adjust exists only in the live schema.)
alter table roster_publish_adjust
  add column if not exists old_source varchar(12) null,
  add column if not exists new_source varchar(12) null;
comment on column roster_publish_adjust.old_source is 'Previous snapshot roster_flight.source (IMP/MA/CR); null for ADD';
comment on column roster_publish_adjust.new_source is 'Current roster_flight.source (IMP/MA/CR); null for DELETE';
