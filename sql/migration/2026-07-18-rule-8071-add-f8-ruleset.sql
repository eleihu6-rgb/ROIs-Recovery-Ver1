-- =============================================================================
-- 2026-07-18 rule 8071 Max PTNs for 777
-- Adds the F8 Model A system template rule and enables it in default worksets.
-- =============================================================================

set search_path = f8;

begin;

insert into rule (
    created_by,
    created_at,
    updated_by,
    updated_at,
    function,
    instance,
    class,
    description,
    reference,
    category,
    store_structure,
    source,
    detail,
    overridability,
    severity,
    filiale,
    division,
    owner,
    locked,
    exception_code,
    rule_id,
    param_json
)
select
    'migration',
    now(),
    'migration',
    now(),
    8071,
    '001',
    coalesce((select class from rule where function = 8056 limit 1), 'R'),
    'Max PTNs for 777',
    coalesce((select reference from rule where function = 8056 limit 1), 'F8'),
    coalesce((select category from rule where function = 8056 limit 1), 'RULE'),
    coalesce((select store_structure from rule where function = 8056 limit 1), 'Table'),
    coalesce((select source from rule where function = 8056 limit 1), 'R'),
    '13.1 Max number N of Standby trips within a planning period',
    coalesce((select overridability from rule where function = 8056 limit 1), 'S'),
    coalesce((select severity from rule where function = 8056 limit 1), 1),
    'F8',
    'P',
    'S',
    '0',
    '',
    8071001,
    '{
      "tables": [
        {
          "header": [
            "Bases",
            "Ranks",
            "Fleets",
            "Crew Teams",
            "Labels",
            "Attributes",
            "Override Duty Attributes",
            "Assignment Groups",
            "Qualifiers",
            "Flights",
            "Destinations",
            "Positions",
            "Period",
            "Unit",
            "Max Times",
            "Min Times",
            "Check Mode"
          ],
          "rows": [
            ["*", "*", "*", "*", "*", "*", "*", "FLY", "*", "*", "*", "*", "1", "CM", "11", "0", "*"]
          ]
        }
      ]
    }'::jsonb
where not exists (
    select 1 from rule where rule_id = 8071001
);

update rule
   set function = 8071,
       instance = '001',
       class = coalesce((select class from rule where function = 8056 limit 1), class, 'R'),
       description = 'Max PTNs for 777',
       reference = coalesce((select reference from rule where function = 8056 limit 1), reference, 'F8'),
       category = coalesce((select category from rule where function = 8056 limit 1), category, 'RULE'),
       store_structure = coalesce((select store_structure from rule where function = 8056 limit 1), store_structure, 'Table'),
       source = coalesce((select source from rule where function = 8056 limit 1), source, 'R'),
       detail = '13.1 Max number N of Standby trips within a planning period',
       overridability = coalesce((select overridability from rule where function = 8056 limit 1), overridability, 'S'),
       severity = coalesce((select severity from rule where function = 8056 limit 1), severity, 1),
       filiale = 'F8',
       division = 'P',
       owner = 'S',
       locked = '0',
       exception_code = coalesce(exception_code, ''),
       param_json = case
         when param_json is null or not (param_json ? 'tables') then '{
           "tables": [
             {
               "header": [
                 "Bases",
                 "Ranks",
                 "Fleets",
                 "Crew Teams",
                 "Labels",
                 "Attributes",
                 "Override Duty Attributes",
                 "Assignment Groups",
                 "Qualifiers",
                 "Flights",
                 "Destinations",
                 "Positions",
                 "Period",
                 "Unit",
                 "Max Times",
                 "Min Times",
                 "Check Mode"
               ],
               "rows": [
                 ["*", "*", "*", "*", "*", "*", "*", "FLY", "*", "*", "*", "*", "1", "CM", "11", "0", "*"]
               ]
             }
           ]
         }'::jsonb
         else param_json
       end,
       updated_by = 'migration',
       updated_at = now()
 where rule_id = 8071001;

insert into rule_set (created_by, created_at, updated_by, updated_at, workset_id, rule_id)
select 'migration', now(), 'migration', now(), ws.workset_id, 8071001
  from (values (103::bigint), (433::bigint)) as ws(workset_id)
 where exists (select 1 from workset where id = ws.workset_id)
   and not exists (
   select 1 from rule_set rs
    where rs.workset_id = ws.workset_id
      and rs.rule_id = 8071001
 );

commit;
