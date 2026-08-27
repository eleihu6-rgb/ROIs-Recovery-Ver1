-- =============================================================================
-- 2026-07-08 rule 1001 Assignment Overlap
-- Adds Model A system template rule 1001/001 and enables it in F8 default worksets.
-- =============================================================================

set search_path = f8;

begin;

insert into rule (
    created_by, created_at, updated_by, updated_at,
    function, instance, class, description, reference, category,
    store_structure, source, detail, overridability, severity,
    filiale, division, owner, locked, exception_code, rule_id, param_json
)
select
    'system', now(), 'system', now(),
    1001, '001', 'R', 'Assignment Overlap', 'ROIs', 'Roster',
    'Table', 'ROIs', 'Assignment Overlap', 'S', 1,
    'F8', 'P', 'S', '1', '', 1001001,
    '{"tables": [{"rows": [["FLY", "*", "Y", "*", "*", "*", "L|O", "Y"], ["SBY", "*", "Y", "*", "*", "*", "L|O", "Y"], ["FLY", "*", "Y", "*", "DO", "*", "*", "Y"], ["SBY", "*", "Y", "*", "DO", "*", "*", "Y"]], "header": ["Assignment Group Before", "Assignment Before", "Assignment Rest Before", "Assignment Type Before", "Assignment Group After", "Assignment After", "Assignment Type After", "Overlap"]}]}'::jsonb
where not exists (
    select 1 from rule where rule_id = 1001001
);

insert into rule_set (created_by, created_at, updated_by, updated_at, workset_id, rule_id)
select 'system', now(), 'system', now(), v.workset_id, 1001001
from (values (103), (433)) as v(workset_id)
where exists (select 1 from workset w where w.id = v.workset_id)
  and not exists (
    select 1 from rule_set rs
    where rs.workset_id = v.workset_id
      and rs.rule_id = 1001001
  );

commit;
