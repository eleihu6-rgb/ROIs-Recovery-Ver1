-- =============================================================================
-- 2026-06-15  Rule 8002/006 — add a 4th row: monthly CREDIT-HOUR (CH) min/max band
-- =============================================================================
-- Enriches 8002 (MAX_CUM_BLOCK) with a STANDALONE credit-hours utilisation check.
-- Existing 3 rows are Type=BH (rolling 28/100/200 CD block windows). The new row:
--
--   Bases=* Ranks=* Fleets=* Teams=*  Period=1  Unit=CM(calendar month)
--   Prorated=Y  Max Limits=75:00  Min Limits=65:00  Type=CH
--
-- Type=CH = "Credit Hour" — the exact type the C++ 8002 already supports
-- (rule8002.cpp:657-684): violate if totalCredit > Max || totalCredit < Min. 8002 fires
-- the warning BY ITSELF: it computes the crew's monthly credit hours standalone (Σ
-- per-activity credit over the calendar month) and warns when above 75:00 or below 65:00
-- (prorated by the crew's availability). It does NOT depend on the 7502 calculator.
--
-- Header order (verified): [...,Period(4),Unit(5),Prorated(6),Max(7),Min(8),Type(9)].
-- Idempotent. F8 schema (search_path).
-- =============================================================================

-- 1. Normalise any earlier 'Credit' label on this row to the C++ type code 'CH'.
update rule
   set param_json = jsonb_set(
         param_json::jsonb,
         '{tables,0,rows}',
         (select jsonb_agg(
                   case when r->>9 = 'Credit' then jsonb_set(r, '{9}', '"CH"'::jsonb) else r end)
            from jsonb_array_elements(param_json::jsonb #> '{tables,0,rows}') r)
       )
 where function = 8002 and instance = '006'
   and exists (
     select 1 from jsonb_array_elements(param_json::jsonb #> '{tables,0,rows}') r
      where r->>9 = 'Credit'
   );

-- 2. Append the CH credit-band row if no credit-hour row exists yet.
update rule
   set param_json = jsonb_set(
         param_json::jsonb,
         '{tables,0,rows}',
         (param_json::jsonb #> '{tables,0,rows}')
           || '[["*","*","*","*","1","CM","Y","75:00","65:00","CH"]]'::jsonb,
         false
       )
 where function = 8002 and instance = '006'
   and not exists (
     select 1 from jsonb_array_elements(param_json::jsonb #> '{tables,0,rows}') r
      where r->>9 in ('CH', 'Credit')
   );
