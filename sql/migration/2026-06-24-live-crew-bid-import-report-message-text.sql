-- ============================================================
-- PBS crew bid import report message length fix
-- ============================================================
-- Execute with search_path pointing at the target PBS schema.

alter table pbs_crew_bid_import_item
    alter column message type text;

alter table pbs_crew_bid_import_problem
    alter column message type text;
