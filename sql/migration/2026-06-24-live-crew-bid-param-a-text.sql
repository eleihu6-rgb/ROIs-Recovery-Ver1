-- ============================================================
-- PBS crew bid import pairing list storage fix
-- ============================================================
-- Execute with search_path pointing at the target PBS schema.

alter table pbs_bid_group
    alter column param_a type text,
    alter column param_b type text,
    alter column param_c type text;

alter table pbs_bid_condition
    alter column param_a type text,
    alter column param_b type text,
    alter column param_c type text;
