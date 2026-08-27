# Rule Engine Path Convergence Matrix

Date: 2026-07-25

## Purpose

ROIS currently has three legality execution paths that partly share Rust kernels and partly duplicate orchestration:

- PBS solver: Python calls the PyO3 module `rois_rule_engine_rs.Engine` in-process.
- Live/Scenario legality recheck: `live-server/scripts/legality-recheck-core.mjs` reads DB data through Live/Scenario source adapters, spawns `rule-engine-rs` `check-*` binaries, and persists `rule_violation`.
- Rust core tests and demos: `rule-engine-rs/src/lib.rs`, `rule-engine-rs/src/engine.rs`, and `rule-engine-rs/src/bin/check_*.rs`.

The goal is not to force one runtime entrypoint. The goal is to converge every rule onto one shared Rust semantic core:

```text
shared Rust rule model + evaluator
  <- PBS PyO3 adapter
  <- Live/Scenario binary adapter
```

Adapters may remain separate because their data sources, performance profile, and output ownership differ.

## Target Pattern

For every legality rule, migrate in two steps:

1. Move the complete rule parameter model, input model, evaluator, and violation shape into a shared Rust rule module.
2. Make both callers feed that shared module:
   - PyO3 converts ro_input/dense solver arrays into the shared input model.
   - Live/Scenario `legality-recheck-core.mjs` converts DB source-adapter rows into the binary input model, then persists the shared violation output.

The Live and Scenario paths must remain unified through `legality-recheck-core.mjs`; source differences belong in the existing Live/Scenario source adapters.

## Active Rule Matrix

| Rule | Current PBS PyO3 path | Current Live/Scenario path | Shared core status | Known convergence gap | Migration priority |
|---|---|---|---|---|---|
| 1001 Assignment Overlap | Wired through PyO3 only when present in RuleSet; no forced-on behavior | `rule1001` uses `check-1001` | Shared contract exported through `rules::rule1001`; PyO3 and binary adapters import through shared namespace | None known at adapter level; keep fixture coverage for overlap semantics | Batch A |
| 7501 Single Day Free From Duty | Wired through PyO3 `check_7501` | `rule7501` uses `check-7501` | Shared contract exported through `rules::rule7501`; PyO3 and binary adapters import through shared namespace | Residual business validation: Live/Scenario and solver source rows must keep rest-vs-ground meaning aligned | Batch B |
| 7503 Consecutive WOCL | Wired through PyO3 WOCL check | `rule7503` uses `check-7503` | Shared contract exported through `rules::rule7503`; PyO3 and binary adapters import through shared namespace | Residual business validation: 7500/ref-timezone source equivalence across paths | Batch B |
| 7504 WOCL Spacing | Wired with structured rule rows | `rule7504` uses structured `check-7504` tagged input from `legality-recheck-core.mjs` | Shared structured evaluator exported through `rules::rule7504`; PyO3 and binary adapters import through shared namespace | None known for the fields identified in this pass; missing source data now warns/skips instead of wildcarding | Batch A, proving rule |
| 7505 Minimum GDOs | Wired with structured rows plus legacy scalar fallback | `rule7505` uses `check-7505` | Shared contract exported through `rules::rule7505`; PyO3 and binary adapters import through shared namespace | Residual business validation: qualification scope and leave/post-rest feeder meaning across data sources | Batch B |
| 7506 One Check-in Per Day | Wired through PyO3 `check_7506` | `rule7506` uses `check-7506` | Shared contract exported through `rules::rule7506`; PyO3 and binary adapters import through shared namespace | Residual business validation: crew-local day offset derivation must stay aligned | Batch B |
| 8002 Cumulative Limits | Wired through PyO3 full `cum_rules` path | `rule8002` uses `check-8002-full`; credit-band diagnostic uses `check-8002-credit`; ruletool reuses credit helpers | Shared contract exported through `rules::rule8002`; PyO3 and full/credit binaries import through shared namespace | Most complex residual area: source data completeness for manday metrics, fallback BLH synthesis, Crew Teams gaps, unsupported types, and window attribution | Batch D |
| 8004 Basic Competency | Wired through PyO3 `check_8004` | `rule8004` uses `check-8004` | Shared contract exported through `rules::rule8004`; PyO3 and binary adapters import through shared namespace | Confirm Live/Scenario pairing base and crew-base qualification source match solver input semantics | Batch C |
| 8030 Pilot Age | Wired through PyO3 `check_8030` | `rule8030` uses `check-8030` | Shared contract exported through `rules::rule8030`; PyO3 and binary adapters import through shared namespace | Confirm complement construction per pairing/flight is equivalent in solver dense arrays and persisted recheck rows | Batch C |
| 8056 Roster Spacing | Wired with grouped param rows and fallback scalar spacing | `rule8056` uses `check-8056` | Shared contract exported through `rules::rule8056`; PyO3 and binary adapters import through shared namespace | Residual business validation: post-duty-rest/location/role/requested source fields across paths | Batch A |
| 8071 Roster Properties | Wired through PyO3 `check_line` | `rule8071` uses `check-8071` | Shared contract exported through `rules::rule8071`; PyO3 and binary adapters import through shared namespace | None known after PBS runtime wiring | Batch C |
| 8072 Min/Max Qualified Crew | Wired through PBS complement-aware PyO3 checker using crew-on-flight state | `rule8072` uses `check-8072` | Shared contract exported through `rules::rule8072`; PyO3 complement checker and binary adapter import through shared namespace | Cross-crew rule: must remain complement-aware, not ordinary per-crew `check_line` | Batch C |

## Calculator / Helper Matrix

| Function | Current path | Role | Convergence decision |
|---|---|---|---|
| 7500 Acclimatization | PyO3 reads definition inputs to support WOCL/rest checks | Definition/helper, not persisted as a violation rule | Keep as shared support model for 7501/7503/7504/8056; do not persist standalone violations unless product rules change |
| 7272 Standby DP | `check-7272` binary imports `rules::rule7272` | Calculator/helper | Keep binary calculator; typed standby input/output contract is available under shared rule modules |
| 7502 Credit Hours | `check-7502` binary and `ruletool` import `rules::rule7502` helpers | Calculator/helper | Keep calculator path; shared credit model is reused with 8002 credit/manday code |
| 8002-credit | `check-8002-credit` standalone binary imports `rules::rule8002` credit-band helper | Narrow credit-band checker | Remains a diagnostic/persist helper binary, but no separate semantic implementation |
| ruletool | Scenario manday materialization imports `rules::rule7502` and `rules::rule8002` helpers | Batch aggregation, not a legality violation checker | Keep separate runtime entrypoint; credit and band semantics share the same Rust helpers |

## Migration Order

1. Batch A: `7504`, `8056`, `1001`
   - These are duty/assignment spacing and overlap rules.
   - `7504` is the proving rule because it already exposes the parameter mismatch between PyO3 and Live/Scenario binary paths.
   - Exit criteria: the same fixture can run through PyO3 and binary paths with matching violation rows.

2. Batch B: `7501`, `7503`, `7505`, `7506`
   - These depend on local-night, WOCL, ground duty, days off, and roster-period window semantics.
   - Exit criteria: Live/Scenario and PyO3 share typed rest/day-off input models, with any unavailable source field handled by explicit warning or documented skip.

3. Batch C: `8004`, `8030`, `8071`, `8072`
   - Qualification/complement/property rules.
   - `8071` is wired through the PBS per-crew PyO3 line check; `8072` is wired through an incremental complement-aware gate because it depends on crew-on-flight state.

4. Batch D: `8002`
   - Most sensitive rule due to rolling windows, manday metrics, BLH/DP/FT/CH, qualification gates, and fallback history synthesis.
   - Do after the common model/adapter pattern has been proven on simpler rules.

## Required Per-Rule Deliverables

Each rule is complete only when all applicable paths use the same shared Rust evaluator:

- Shared Rust typed params, typed input rows, evaluator, and violation output.
- Rust unit tests for the shared evaluator.
- PyO3 tests when the rule is in the PBS solver path.
- Binary input/parser tests for Live/Scenario batch recheck.
- Live/Scenario `legality-recheck-core.mjs` tests or fixtures proving the source adapter feeds the complete model.
- A parity fixture comparing PyO3 vs binary output whenever both paths support the rule.

If a source path lacks data for a parameter, the implementation must either add the source data or explicitly warn-and-skip affected rows. It must not silently treat missing data as wildcard.

## Notes For Implementation Planning

- Do not merge `py/src/lib.rs` and `src/engine.rs` into one large orchestrator as the first step.
- Do not fork Live and Scenario legality logic; keep `legality-recheck-core.mjs` as the shared batch recheck layer.
- Prefer one focused shared module per rule under `rule-engine-rs/src/` before extracting broader abstractions.
- Preserve solver performance: PBS remains in-process through PyO3; Live/Scenario may continue to use release binaries for batch recheck.
- Update this matrix whenever a rule reaches parity or a documented Live/Scenario-only/PBS-only decision is made.
