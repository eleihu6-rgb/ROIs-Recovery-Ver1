-- =============================================================================
-- 2026-06-14  Gantt rule: max_ft_flair_f8_p 28-day Block limit 112h → 40h
-- =============================================================================
-- The live gantt computes rule 8002 (max flight time) from the NEW-model instance
-- max_ft_flair_f8_p (group flair_gantt_rule, the default GANTT rule set) — NOT the
-- legacy rule.param_json. To make the gantt enforce 40h/28d (matching the legacy
-- 8002/006 change), lower the 28-day period limit_minutes 6720 → 2400.
--
-- Idempotent: only updates when periods[0] is still the 28-day / 6720 entry.
-- =============================================================================

update rule_instance
   set params = jsonb_set(params, '{periods,0,limit_minutes}', '2400'::jsonb)
 where instance_code = 'max_ft_flair_f8_p'
   and is_deleted = 0
   and params #>> '{periods,0,days}' = '28'
   and params #>> '{periods,0,limit_minutes}' = '6720';
