-- 2026-08-23 Rule 7509/001 "Avoid Co-pairing".
-- Idempotently provisions the rule catalog row and enables it in the active
-- PBS Solver Ruleset (workset 103). No roster schema changes are required.

begin;

do $$
begin
  if not exists (select 1 from workset where id = 103) then
    raise exception 'Required workset 103 does not exist';
  end if;

  -- A deployed 7509 row may already contain planner-configured crew pairs.
  -- Refuse to replace a non-empty table with an incompatible header; the
  -- migration below only initializes missing/empty metadata and preserves an
  -- already-correct parameter table.
  if exists (
    select 1
      from rule
     where rule_id = 7509001
       and jsonb_array_length(coalesce(param_json#>'{tables,0,rows}', '[]'::jsonb)) > 0
       and param_json#>'{tables,0,header}' is distinct from '["Crew A", "Crew B", "Eff Date", "Exp Date"]'::jsonb
  ) then
    raise exception 'Existing 7509/001 parameters have an incompatible header; manual migration required';
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
    7509, '001', 'R', 'Avoid Co-pairing', 'F8', 'Roster', 'Table',
    'F8', 'Avoid Co-pairing', 'S', 1, 'F8', 'P', 'S', '1', '',
    7509001,
    '{"tables": [{"rows": [], "header": ["Crew A", "Crew B", "Eff Date", "Exp Date"]}]}'::jsonb
where not exists (
  select 1 from rule where rule_id = 7509001
);

update rule
   set function = 7509,
       instance = '001',
       class = 'R',
       description = 'Avoid Co-pairing',
       reference = 'F8',
       category = 'Roster',
       store_structure = 'Table',
       source = 'F8',
       detail = 'Avoid Co-pairing',
       overridability = 'S',
       severity = 1,
       filiale = 'F8',
       division = 'P',
       owner = 'S',
       locked = '1',
       exception_code = '',
       param_json = case
         when param_json#>'{tables,0,header}' is distinct from '["Crew A", "Crew B", "Eff Date", "Exp Date"]'::jsonb
           then '{"tables": [{"rows": [], "header": ["Crew A", "Crew B", "Eff Date", "Exp Date"]}]}'::jsonb
         else param_json
       end,
       updated_by = 'migration',
       updated_at = now()
 where rule_id = 7509001;

insert into rule_set (
    created_by, created_at, updated_by, updated_at, workset_id, rule_id
)
select 'migration', now(), 'migration', now(), 103, 7509001
where not exists (
  select 1 from rule_set where workset_id = 103 and rule_id = 7509001
);

commit;
