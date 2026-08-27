-- Migration: normalize workset field values (filiale / division / type / category).
--
-- Per the agreed rules:
--  1. filiale  ← dictionary DEFAULT.AIRLINE ('F8') wherever empty (72 rows were blank).
--  2. division ← only valid dictionary DIVISION codes (P, C); anything else ('A', 72 rows,
--     mostly the auto-generated empty RO worksets) → 'P' (Pilot, the default).
--  3. type     ← the rule worksets (currently type='CU' that map >=1 rule_set entry, i.e.
--     103/433) become type='R'; CQF worksets would be 'C' (none exist yet); PO/RO/TO unchanged.
--  4. category ← by type:  PO/RO/TO → 'OPTIMIZER',  R → 'RULE',  C → 'CQF'.
--
-- Also deletes the stray empty CU worksets left over from Phase-2b e2e runs (name 'QA-%',
-- 0 rules) so they don't pollute the RuleSet picker.
--
-- Idempotent: re-running is a no-op once values are normalized.

set search_path = f8;

begin;

-- 0) drop empty e2e leftover CU worksets (QA-Set-*, no rules)
delete from workset w
 where w.type = 'CU' and w.name like 'QA-%'
   and not exists (select 1 from rule_set rs where rs.workset_id = w.id);

-- 1) filiale ← dictionary DEFAULT.AIRLINE
update workset
   set filiale = (select code_value from dictionary where parent_code = 'DEFAULT' and code = 'AIRLINE'),
       updated_by = 'migration', updated_at = now()
 where filiale is null or filiale = '';

-- 2) division ← 'P' when not a configured DIVISION code
update workset
   set division = 'P', updated_by = 'migration', updated_at = now()
 where division not in (select code from dictionary where parent_code = 'DIVISION');

-- 3) rule worksets (CU mapping >=1 rule) → type 'R'
update workset w
   set type = 'R', updated_by = 'migration', updated_at = now()
 where w.type = 'CU'
   and exists (select 1 from rule_set rs where rs.workset_id = w.id);

-- 4) category by type
update workset
   set category = case
         when type in ('PO', 'RO', 'TO') then 'OPTIMIZER'
         when type = 'R' then 'RULE'
         when type = 'C' then 'CQF'
         else category
       end,
       updated_by = 'migration', updated_at = now()
 where type in ('PO', 'RO', 'TO', 'R', 'C');

commit;
