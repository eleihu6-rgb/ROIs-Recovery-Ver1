-- 2026-06-15  Point test scenarios 6 / 460 at the 14-rule Rust ruleset for legality testing.
-- pbs_solver_ruleset == legacy workset 103 (the migrated Rust rules). The scenario-legality
-- worker reads scenario.rule_group_code, so this is the only switch needed to exercise the
-- full 14-rule pass against these scenarios in Playwright.
update scenario set rule_group_code = 'pbs_solver_ruleset', updated_at = now()
 where id in (6, 460);
