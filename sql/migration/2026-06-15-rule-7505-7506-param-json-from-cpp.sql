-- ============================================================
-- 2026-06-15  Rule 7505/002 + 7506/002 — supplement legacy rule.param_json
-- ============================================================
-- Background:
--   Workset 433 ("F8 Full Ruleset", 14 rules) had 3 rules with param_json = NULL
--   (the Legality tab shows them as "No configurable parameters"):
--     7272/001  Calculate DP of the Reserves   (CALC rule, TG-origin — left as-is,
--                                                no single canonical F8 threshold;
--                                                its gtest RATE is test-parameterised)
--     7505/002  Min # GDOs in a RP
--     7506/002  One Checkin Per Day.
--   The Rust rule engine reads params from `rule.param_json`, so a NULL there makes
--   the migrated checker a silent no-op. This migration fills 7505 + 7506 from the
--   proven C++ oracle (the param maps the *_gtest.cpp fixtures validate against).
--
-- Param authority (faithful CSV mirror, title-case headers per existing rows):
--   {"tables":[{"header":[...],"rows":[[...]]}]}
--
--   7505/002  crewrule-dev/RuleEngine/rule/rule7505/MinimumDaysOffForCARSRuleParam.cpp
--             + RuleTest/rule7505_gtest.cpp::make7505002JuneRpInput()
--             => Min DO 12 per RP (calendar month, 30-30 day RP), DO group "DO",
--                utilize post-duty rest, count blank days, don't count layovers,
--                leave assignment VAC counts 0-1 days. gtest: "June RP must flag
--                DO count below minimum 12".
--   7506/002  crewrule-dev/RuleEngine/rule/rule7506/SingleDailyCheckinForCARSRuleParam.cpp
--             + RuleTest/rule7506_gtest.cpp::make7506Input()
--             => at most one check-in (roster start) per crew-base-local calendar day
--                for the checked assignment group(s); F8 oracle config = "FLY".
--
-- 幂等：只在 param_json 仍为 NULL 时写入；二次执行跳过。
-- Schema：无前缀，通过 SET search_path 切换（航司 schema = 二字码小写）。
-- ============================================================

-- 7505/002  Min # GDOs in a RP
UPDATE rule
SET param_json = '{"tables":[{"header":["Bases","Ranks","Fleets","Teams","DO Assignment Group","Min DO","Period","Unit","RP Days Range","Utilize Post Duty Rest","Count Blank Day","Count Layover","Leave Assignments","Leave Days Range"],"rows":[["*","*","*","*","DO","12","1","RP","30-30","Y","Y","N","VAC","0-1"]]}]}'::jsonb,
    updated_at = now()
WHERE function = 7505 AND instance = '002' AND param_json IS NULL;

-- 7506/002  One Checkin Per Day.
UPDATE rule
SET param_json = '{"tables":[{"header":["Bases","Ranks","Fleets","Teams","Assignments"],"rows":[["*","*","*","*","FLY"]]}]}'::jsonb,
    updated_at = now()
WHERE function = 7506 AND instance = '002' AND param_json IS NULL;
