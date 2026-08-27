-- ============================================================
-- PBS crew bid import performance timings
-- ============================================================
-- Adds persisted run-level performance timings for import diagnostics.
-- Execute with search_path pointing at the target PBS schema.

alter table pbs_crew_bid_import_run
    add column if not exists performance_json jsonb;

