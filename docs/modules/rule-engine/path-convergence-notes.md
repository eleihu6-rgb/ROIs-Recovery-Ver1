# Rule Engine Path Convergence Notes

Date: 2026-07-25

The active F8 legality implementation keeps separate runtime entrypoints but now uses a common Rust rule namespace:

```text
rule-engine-rs/src/rules/<rule>.rs
  <- rule-engine-rs/py/src/lib.rs for PBS solver PyO3 checks
  <- rule-engine-rs/src/bin/check_*.rs for Live/Scenario batch checks
  <- live-server/scripts/legality-recheck-core.mjs as the shared Live/Scenario feeder
```

This is intentionally not a monolithic engine merge. PBS still uses the in-process PyO3 hot path, and Live/Scenario still use batch binaries and persisted `rule_violation` rows.

Current shared modules:

- Violation rules: `rule1001`, `rule7501`, `rule7503`, `rule7504`, `rule7505`, `rule7506`, `rule8002`, `rule8004`, `rule8030`, `rule8056`, `rule8071`, `rule8072`.
- Calculator/helper contracts: `rule7272`, `rule7502`, plus `rule8002` credit-band helpers.

PBS runtime decision for 8071/8072:

- `8071` is wired into PBS PyO3 `check_line` as a per-crew roster-property count rule.
- `8072` is wired into PBS as a complement-aware checker that maintains dynamic crew-on-flight state during assignment construction. It is intentionally not treated as an ordinary per-crew `check_line` rule.
- PBS rule gates classify `8072` under `complement_check_functions`; it should not appear in `unwired_functions` when enabled by a RuleSet.

Residual risk:

- Shared modules remove adapter-level duplication, but parity still depends on source feeders providing equivalent business data. The largest remaining data-risk surface is `8002` because it depends on manday metrics, credit attribution, Crew Teams, rolling windows, and fallback history synthesis.
