-- Rule 2015/001 DO Start Time Definition for Min-GDO (7505/7507) paint grace.
-- Idempotent: safe on envs that already applied seed 07-rule.sql updates.

insert into rule (
  created_by, created_at, updated_by, updated_at,
  function, instance, class, description, reference, category, store_structure, source, detail,
  overridability, severity, filiale, division, owner, locked, exception_code, rule_id, param_json
)
select
  'system', now(), 'system', now(),
  2015, '001', 'B', 'DO Start Time Definition', 'ROIs', 'Definition', 'Table', 'Company',
  'DO Start Time — duty ending before this local home-base clock does not occupy that calendar day for Min-GDO (7505/7507)',
  'S', 1, 'F8', 'P', 'S', '1', '', 2015001,
  '{"tables": [{"rows": [["01:00"]], "header": ["DO Start Time"]}]}'::jsonb
where not exists (
  select 1 from rule where rule_id = 2015001
);

insert into rule_set (created_by, created_at, updated_by, updated_at, workset_id, rule_id)
select 'system', now(), 'system', now(), 103, 2015001
where not exists (
  select 1 from rule_set where workset_id = 103 and rule_id = 2015001
);

insert into rule_set (created_by, created_at, updated_by, updated_at, workset_id, rule_id)
select 'system', now(), 'system', now(), 433, 2015001
where not exists (
  select 1 from rule_set where workset_id = 433 and rule_id = 2015001
);
