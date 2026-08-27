-- Migration: repair Legality-page workset category/type values.
--
-- New Legality rule sets must be workset.category='RULE' and workset.type='R'.
-- A backend default bug created empty rule-set worksets as category null / type 'CU',
-- making them disappear after refresh. This migration repairs those rows without
-- touching optimizer worksets (PO/RO/TO).

set search_path = f8;

begin;

update workset w
   set category = 'RULE',
       type = 'R',
       updated_by = 'migration',
       updated_at = now()
 where coalesce(w.type, '') not in ('PO', 'RO', 'TO')
     and (
        exists (select 1 from rule_set rs where rs.workset_id = w.id)
        or (coalesce(w.type, '') = 'CU' and (w.category is null or w.category = ''))
       )
   and (coalesce(w.category, '') <> 'RULE' or coalesce(w.type, '') <> 'R');

commit;
