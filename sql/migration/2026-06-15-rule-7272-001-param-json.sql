-- ============================================================
-- 2026-06-15  Rule 7272/001 — supplement legacy rule.param_json
-- ============================================================
-- Background:
--   Workset 433 ("F8 Full Ruleset", 14 rules). 7272/001 "Calculate DP of the
--   Reserves" was the last member still carrying param_json = NULL (its 旧表无参数,
--   阈值原本来自 C++, 且 gtest 把 RATE 参数化, 故无单一 canonical 值可迁移)。
--   The rule engine reads thresholds from rule.param_json, so a NULL there makes
--   the migrated checker a silent no-op.
--
-- Param authority: provided by product (F8 standby DP config), faithful CSV mirror.
--   Headers map 1:1 to C++ CalculateStandbyDPForTGRuleParam:
--     Assignments        -> ASSIGNMENTS         (pipe-delimited reserve codes)
--     Standby Offset     -> STANDBY OFFSET      (HH:MM)
--     Rate               -> RATE                (double, DP credit rate)
--     SBY Limit          -> SBY LIMIT           (HH:MM)
--     Notification Limit -> NOTIFICATION LIMIT  (HH:MM)
--   Values: SBY|PRAM|PRPM, 00:00, 0.33, 00:00, 00:00
--
-- 幂等：只在 param_json 仍为 NULL 时写入；二次执行跳过。
-- Schema：无前缀，通过 SET search_path 切换（航司 schema = 二字码小写）。
-- ============================================================

UPDATE rule
SET param_json = '{"tables":[{"header":["Assignments","Standby Offset","Rate","SBY Limit","Notification Limit"],"rows":[["SBY|PRAM|PRPM","00:00","0.33","00:00","00:00"]]}]}'::jsonb,
    updated_at = now()
WHERE function = 7272 AND instance = '001' AND param_json IS NULL;
