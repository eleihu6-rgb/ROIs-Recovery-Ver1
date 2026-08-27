# Plan: Rule 2015 DO Start Time for 7505/7507

See design: `docs/superpowers/specs/2026-08-16-rule-2015-do-start-time-design.md`.

## Summary

- Definition rule **2015** (`DO Start Time` HH:MM); F8 seed `01:00`.
- Only `count_days_off` (7505/7507) applies grace; missing 2015 → `do_start_min=0` (unchanged paint).
- Live/Scenario: `--do-start-min` on check-7505/7507; `RULE_RECHECK_DEPS['2015']`.
- PBS: `rule_params` + `engine_builder` + PyO3 Engine field.
