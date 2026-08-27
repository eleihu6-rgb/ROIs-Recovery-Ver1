# Rule 7505 Unified Structured Scope Design

## Goal

Unify rule 7505 scope handling across PBS solver, Live legality, and Scenario legality.

Rule 7505 `Bases`, `Ranks`, `Fleets`, and `Crew Teams` filtering must be evaluated by the Rust rule path instead of being reimplemented separately in JS/Python callers.

## Current State

Live/Scenario currently call `check-7505` from `live-server/scripts/legality-recheck-core.mjs`.

`check-7505` accepts only:

- `R`: days-off band row
- `A`: crew activity row

Because the binary does not understand `Bases`, `Ranks`, `Fleets`, or `Crew Teams`, Live/Scenario currently pre-filter applicable 7505 rows in JS before invoking the binary.

PBS solver does not use the `check-7505` CLI binary for optimization. It uses the PyO3 `Engine` path with `days_off_rules` from `pbs-engine/ColumnModelSolver_python/rules/rust/rule_params.py`. That means making only the CLI binary structured would not fully unify PBS, Live, and Scenario.

## Target Architecture

Rule 7505 gets one shared Rust scope model used by both:

- `rule-engine-rs/src/bin/check_7505.rs` for Live/Scenario CLI checks.
- `rule-engine-rs/py/src/lib.rs` PyO3 `Engine` for PBS solver optimization.

The rule callers provide raw rule rows and crew scope data. Rust decides whether a row applies to a crew.

## Scope Semantics

For each 7505 rule row:

- `Bases`, `Ranks`, `Fleets`, and `Crew Teams` are crew applicability filters.
- `*` or empty means no restriction.
- Pipe-separated values are OR within one dimension, for example `YYZ|YVR`.
- Dimensions combine with AND, for example `Bases=YYZ` and `Ranks=CA` requires both.
- B/R/F use effective-dated crew qualification rows.
- Crew Teams use effective-dated crew team rows.
- A crew with no matching row in a non-wildcard dimension does not match that 7505 rule row.

## Rust Shared Model

Add a shared 7505 scope structure in the Rust rule code, near existing `DaysOffRow`:

- `DaysOffScope`
  - `bases: Vec<String>`
  - `ranks: Vec<String>`
  - `fleets: Vec<String>`
  - `teams: Vec<String>`
- `ScopedDaysOffRow`
  - `scope: DaysOffScope`
  - `row: DaysOffRow`

Add shared matching helpers:

- `scope_matches_7505(scope, crew_scope, checked_start, checked_end) -> bool`
- `filter_days_off_rows_for_crew(scoped_rows, crew_scope, checked_start, checked_end) -> Vec<DaysOffRow>`

The existing `check_min_days_off()` kernel remains the days-off calculator. It receives only the rows already matched by the shared Rust scope helper.

## CLI Input Contract

Extend `check-7505` to accept structured input:

- `R bases ranks fleets teams min_do rp_lo rp_hi leave_lo leave_hi do_codes leave_codes count_blank count_post_rest period unit`
- `Q crew dim value eff_day exp_day`
- `T crew team eff_day exp_day`
- `A crew code start_secs end_secs rest_secs`

Compatibility:

- Keep supporting the legacy 12-column `R` row as wildcard scope.
- Legacy `T crew team` without dates is accepted as open-ended.

This lets old diagnostics keep running while Live/Scenario move to the structured contract.

## Live/Scenario Changes

Update `rule7505()` in `live-server/scripts/legality-recheck-core.mjs`:

- Stop doing JS-side B/R/F/Teams row matching.
- Build structured `R` rows that include `Bases`, `Ranks`, `Fleets`, and `Crew Teams`.
- If any row has non-wildcard B/R/F, require `source.crewQualEntries()`, then emit `Q` lines.
- If any row has non-wildcard `Crew Teams`, require `source.crewTeams()`, then emit `T` lines.
- Keep the existing per-crew local RP window and per-crew binary invocation.
- Keep warning-and-skip behavior when required source data is unavailable.

Update `live-server/scripts/check-7505-gdo.mjs` to generate the same structured input as production recheck.

## PBS Solver Changes

Update the PyO3 `Engine` 7505 path:

- Extend `days_off_rules` parsing in `pbs-engine/ColumnModelSolver_python/rules/rust/rule_params.py` so it preserves B/R/F/Teams scope instead of discarding or only warning.
- Pass scoped 7505 rows into `rois_rule_engine_rs.Engine(...)`.
- In `rule-engine-rs/py/src/lib.rs`, convert per-crew B/R/F and `crew_teams` data into the same Rust 7505 crew scope model.
- Before each 7505 check in optimization, filter `days_off_rules` through the shared Rust 7505 scope helper.

This makes PBS solver enforce the same 7505 row applicability as Live/Scenario.

## Tests

Rust:

- `check-7505` structured `R/Q/T/A` input matches B/R/F/Teams and emits a violation.
- Nonmatching B/R/F/Teams produces no violation.
- Legacy 12-column `R` rows still work.
- Shared 7505 scope helper covers wildcard, OR within dimension, AND across dimensions, and missing crew data.
- PyO3 Engine 7505 applies a scoped row only to matching crew.

Live-server:

- `rule7505()` emits structured `R/Q/T/A` input.
- Missing `crewQualEntries()` skips non-wildcard B/R/F rows before calling the binary.
- Missing `crewTeams()` skips non-wildcard team rows before calling the binary.
- Existing per-crew RP window behavior remains unchanged.

PBS:

- `rule_params.py` preserves B/R/F/Teams in 7505 `days_off_rules`.
- Engine builder passes `crew_teams` and qualification arrays into the PyO3 Engine.
- A scoped 7505 row affects matching crew and does not affect nonmatching crew.

## Rollout

Implement in this order:

1. Rust shared 7505 scope model and CLI structured input, with legacy input compatibility.
2. Live/Scenario `rule7505()` structured input migration.
3. `check-7505-gdo.mjs` structured input migration.
4. PBS solver PyO3 `days_off_rules` scope migration.

Each phase must have focused tests before implementation and must preserve current wildcard behavior.

## Non-Goals

- Do not change the 7505 days-off counting algorithm.
- Do not change 7505 parameter names in database rows.
- Do not change other rules in this phase.
- Do not remove legacy `check-7505` input compatibility in this phase.

## Acceptance Criteria

- Live, Scenario, and PBS solver use the same Rust 7505 scope semantics.
- A 7505 row with non-wildcard B/R/F/Teams applies only to matching crew in all three paths.
- A wildcard 7505 row behaves exactly as before.
- Focused Rust, Live-server, and PBS tests pass.
