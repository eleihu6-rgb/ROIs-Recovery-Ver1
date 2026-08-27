-- =============================================================================
-- 2026-08-13 Rule 7305 F8 ruleset configuration
--
-- Adds rule 7305/001, "Max Consecutive Duty Times Limitation", with the
-- positional 12-cell parameter layout consumed by the Rust rule engine.
--
-- Run with the target airline schema (for example f8_sit_live) as the active
-- search_path. Object references intentionally have no schema prefix.
-- =============================================================================

begin;

do $$
begin
  if not exists (select 1 from workset where id = 103) then
    raise exception 'Required workset 103 does not exist';
  end if;

  if not exists (select 1 from workset where id = 433) then
    raise exception 'Required workset 433 does not exist';
  end if;
end
$$;

insert into rule (
    created_by, created_at, updated_by, updated_at,
    function, instance, class, description, reference, category, store_structure,
    source, detail, overridability, severity, filiale, division, owner, locked,
    exception_code, rule_id, param_json
)
select
    'migration', now(), 'migration', now(),
    7305, '001', 'R',
    'Max Consecutive Duty Times Limitation',
    'F8',
    'Duty',
    'Table',
    'F8',
    'Max Consecutive Duty Times Limitation',
    'S',
    2,
    'F8',
    'P',
    'S',
    '1',
    '',
    7305001,
    '{
      "tables": [
        {
          "header": [
            "Bases",
            "Ranks",
            "Positions",
            "Fleets",
            "CREW TEAMS",
            "Assignment Groups",
            "Assignments",
            "Labels",
            "Attributes",
            "Consecutive Type (T/D)",
            "Max Consecutive Times",
            "Severity"
          ],
          "rows": [
            ["*", "*", "*", "*", "*", "*", "*", "*", "*", "T", "0", "0"]
          ]
        }
      ]
    }'::jsonb
where not exists (
    select 1
      from rule
     where rule_id = 7305001
);

update rule
   set function = 7305,
       instance = '001',
       class = 'R',
       description = 'Max Consecutive Duty Times Limitation',
       reference = 'F8',
       category = 'Duty',
       store_structure = 'Table',
       source = 'F8',
       detail = 'Max Consecutive Duty Times Limitation',
       overridability = 'S',
       severity = 2,
       filiale = 'F8',
       division = 'P',
       owner = 'S',
       locked = '1',
       exception_code = '',
       param_json = '{
         "tables": [
           {
             "header": [
               "Bases",
               "Ranks",
               "Positions",
               "Fleets",
               "CREW TEAMS",
               "Assignment Groups",
               "Assignments",
               "Labels",
               "Attributes",
               "Consecutive Type (T/D)",
               "Max Consecutive Times",
               "Severity"
             ],
             "rows": [
               ["*", "*", "*", "*", "*", "*", "*", "*", "*", "T", "0", "0"]
             ]
           }
         ]
       }'::jsonb,
       updated_by = 'migration',
       updated_at = now()
 where rule_id = 7305001;

insert into rule_set (
    created_by, created_at, updated_by, updated_at, workset_id, rule_id
)
select
    'migration', now(), 'migration', now(), ws.workset_id, 7305001
  from (values (103::bigint), (433::bigint)) as ws(workset_id)
 where not exists (
     select 1
       from rule_set rs
      where rs.workset_id = ws.workset_id
        and rs.rule_id = 7305001
 );

commit;
