# Inspected source inventory

2026-09-14 · Read-only evidence, not a runtime certification.

A supporting agent located the candidates below. The primary agent reviewed the actual off-day counting, optimizer suppression, rolling-window entry point, assignment-group matching and PyO3 dispatch before incorporating them into the design.

| Candidate | Confirmed source | Reuse / gap |
|---|---|---|
| 7505 minimum off days | `rule-engine-rs/src/lib.rs`: `count_days_off`, `check_min_days_off_app` | Counts within one roster-period window; supports blank and code/group matching. Has legacy-specific layover/exceptions/rest behavior. Not an exact rolling/consecutive match. |
| 7508 rolling calendar free days | `rule-engine-rs/src/rules/rule7508.rs`: `check_rule7508_structured_focused` | Rolling qualifying free-day logic, scope and report/release/buffers; not the requested consecutive-off contract. |
| 7305 max consecutive duties | `rule-engine-rs/src/rules/rule7305.rs`: `assignment_group_matches`, `Rule7305ConsecutiveType` | Group-map matching is relevant; a maximum work run is not equivalent to minimum consecutive off days. |
| Rust-side optimizer connector | `rule-engine-rs/py/src/lib.rs`: `check_7505_structured`, `Engine.check_line` | Dispatches 7505, 7507, 7508 and 7305; confirms Rust-side availability only. |
| Tests present | `rule-engine-rs/tests/rule_7505_tests.rs`, `rule-engine-rs/tests/rule_7305_tests.rs`, `rule-engine-rs/py/tests/test_engine_phase2_7505.py` | Existing test sources, not executed in this design task. |

Observed caution: 7505 optimizer mode can suppress existing shortfalls when all overlapping activities are preassigned. Reusing this behavior requires explicit agreement about inherited violations; it is not automatically the requested new-customer policy. Off-day eligibility in the proposed example deliberately needs a new reviewed contract rather than silently copying the legacy special cases.

Current functions include fixed-offset and 86,400-second date arithmetic. A timezone-aware calendar/DST contract must be verified independently before claiming faithful support; existing local-day naming alone is not proof of DST correctness.

`pbs-engine/` is absent from this checkout. No active PBS solver run, caller inspection, performance measurement, database mapping audit or end-to-end Gantt validation was performed. No minimum-Y-consecutive-off-days implementation was identified in this bounded inspection; this is a candidate gap, not an exhaustive audit of all Legend C++ intellectual property. Full matching needs the customer's actual source clause and a curated legacy/Rust inventory.
