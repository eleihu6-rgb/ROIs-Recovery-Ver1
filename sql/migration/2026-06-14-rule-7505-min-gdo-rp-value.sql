-- ============================================================
-- 2026-06-14  Rule 7505/002 (Min # GDOs in a RP) — recover the F8 limit
-- ============================================================
-- Background:
--   The WS103 migration (2026-06-10) created min_gdo_rp_f8_p with empty params
--   '{"windows":[]}' (flagged "无具体参数，待补充"), which makes the checker a
--   silent no-op. The real value was recovered from the old C++ engine:
--     crewrule-dev/RuleEngine/rule/rule7505/ (MinimumDaysOffForCARS), whose
--     gtest asserts "June RP must flag DO count below minimum 12".
--   => F8 requires a minimum of 12 GDOs per roster period (calendar month).
--
--   The new min_gdo_count template's legacy "min_gdo" format counts GDOs across
--   the whole bid period (= roster period), matching the C++ RP semantics exactly
--   (see MinGdoChecker legacy branch). We therefore use {"min_gdo":12} rather than
--   a rolling-window approximation.
--
-- 幂等：只在尚未配置 min_gdo 时更新；二次执行跳过。
-- Schema：无前缀，通过 SET search_path 切换。
-- ============================================================

UPDATE rule_instance
SET params = '{"min_gdo":12}', updated_at = now()
WHERE instance_code = 'min_gdo_rp_f8_p'
  AND is_deleted = 0
  AND NOT (params ? 'min_gdo');
