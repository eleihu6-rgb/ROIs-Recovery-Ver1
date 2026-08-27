-- =============================================================================
-- 2026-07-30 rule 7507 Min # GDOs with fly/reserve day filters
-- Adds 7507/001 (single wildcard template row) and enables it in worksets 103/433.
-- Usage: run under the target live schema search_path (f8 or f8_sit_live).
-- =============================================================================

set search_path = f8;

begin;

insert into rule (
    created_by, created_at, updated_by, updated_at,
    function, instance, class, description, reference, category, store_structure,
    source, detail, overridability, severity, filiale, division, owner, locked,
    exception_code, rule_id, param_json
)
select
    'migration', now(), 'migration', now(),
    7507, '001',
    coalesce((select class from rule where function = 7505 limit 1), 'R'),
    'Min # GDOs in a RP (fly/reserve filters)',
    coalesce((select reference from rule where function = 7505 limit 1), 'ROIs'),
    coalesce((select category from rule where function = 7505 limit 1), 'DO'),
    coalesce((select store_structure from rule where function = 7505 limit 1), 'Table'),
    coalesce((select source from rule where function = 7505 limit 1), 'ROIs'),
    'Crew must have minimum X days off in a rostering period when fly/reserve day counts match the row filters',
    coalesce((select overridability from rule where function = 7505 limit 1), 'S'),
    coalesce((select severity from rule where function = 7505 limit 1), 1),
    'F8', 'P', 'S', '0', '', 7507001,
    '{
      "tables": [
        {
          "header": [
            "Bases",
            "Ranks",
            "Fleets",
            "Crew Teams",
            "DO Assignment Group",
            "Min DO",
            "Period",
            "Unit",
            "RP Days Range",
            "Utilize Post Duty Rest",
            "Count Blank Day",
            "Count Layover",
            "NUM FLY DAY",
            "FLY ASSIGNMENTS",
            "NUM RESERVES",
            "RES ASSIGNMENTS",
            "Leave Assignments",
            "Leave Days Range"
          ],
          "rows": [
            ["*", "*", "*", "*", "DO", "0", "1", "RP", "0-31", "Y", "Y", "N", "0-31", "*", "0-31", "*", "*", "0-31"]
          ]
        }
      ]
    }'::jsonb
where not exists (
    select 1 from rule where rule_id = 7507001
);

update rule
   set function = 7507,
       instance = '001',
       class = coalesce((select class from rule where function = 7505 limit 1), class, 'R'),
       description = 'Min # GDOs in a RP (fly/reserve filters)',
       reference = coalesce((select reference from rule where function = 7505 limit 1), reference, 'ROIs'),
       category = coalesce((select category from rule where function = 7505 limit 1), category, 'DO'),
       store_structure = coalesce((select store_structure from rule where function = 7505 limit 1), store_structure, 'Table'),
       source = coalesce((select source from rule where function = 7505 limit 1), source, 'ROIs'),
       detail = 'Crew must have minimum X days off in a rostering period when fly/reserve day counts match the row filters',
       overridability = coalesce((select overridability from rule where function = 7505 limit 1), overridability, 'S'),
       severity = coalesce((select severity from rule where function = 7505 limit 1), severity, 1),
       filiale = 'F8',
       division = 'P',
       owner = 'S',
       locked = '0',
       exception_code = coalesce(exception_code, ''),
       param_json = '{
         "tables": [
           {
             "header": [
               "Bases",
               "Ranks",
               "Fleets",
               "Crew Teams",
               "DO Assignment Group",
               "Min DO",
               "Period",
               "Unit",
               "RP Days Range",
               "Utilize Post Duty Rest",
               "Count Blank Day",
               "Count Layover",
               "NUM FLY DAY",
               "FLY ASSIGNMENTS",
               "NUM RESERVES",
               "RES ASSIGNMENTS",
               "Leave Assignments",
               "Leave Days Range"
             ],
             "rows": [
               ["*", "*", "*", "*", "DO", "0", "1", "RP", "0-31", "Y", "Y", "N", "0-31", "*", "0-31", "*", "*", "0-31"]
             ]
           }
         ]
       }'::jsonb,
       updated_by = 'migration',
       updated_at = now()
 where rule_id = 7507001;

insert into rule_set (created_by, created_at, updated_by, updated_at, workset_id, rule_id)
select 'migration', now(), 'migration', now(), ws.workset_id, 7507001
  from (values (103::bigint), (433::bigint)) as ws(workset_id)
 where exists (select 1 from workset where id = ws.workset_id)
   and not exists (
     select 1 from rule_set rs
      where rs.workset_id = ws.workset_id and rs.rule_id = 7507001
   );

commit;
