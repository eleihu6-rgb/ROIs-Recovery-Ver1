# Rule Engine Path Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converge all current ROIS legality rules onto shared Rust semantic cores while preserving separate PBS PyO3 and Live/Scenario binary adapters.

**Architecture:** Each rule should own typed Rust params, typed input rows, evaluator logic, and violation output in the shared Rust crate. PBS PyO3 and Live/Scenario binaries remain adapters that feed the same evaluator. Live and Scenario must continue sharing `live-server/scripts/legality-recheck-core.mjs`; source differences stay in source adapters.

**Tech Stack:** Rust 2021 std-only core crate, PyO3 connector via `rule-engine-rs/py`, Node 22 ESM legality scripts, PostgreSQL-backed Live/Scenario source adapters, Cargo tests, Pytest, Node test runner/Vitest where existing.

## Global Constraints

- Do not merge `rule-engine-rs/py/src/lib.rs` and `rule-engine-rs/src/engine.rs` into one large orchestrator.
- Do not fork Live and Scenario legality logic; keep shared batch recheck behavior in `legality-recheck-core.mjs`.
- Do not silently wildcard missing source data. Add source fields or explicitly warn-and-skip affected rule rows.
- Preserve PBS solver hot-path performance by keeping the in-process PyO3 adapter.
- Preserve Live/Scenario persisted `rule_violation` output contracts unless a separate migration is approved.
- Follow TDD: write failing tests before production changes for each rule batch.

---

## Task 1: Establish Shared Rule Module Convention

**Files:**
- Create: `rule-engine-rs/src/rules/mod.rs`
- Modify: `rule-engine-rs/src/lib.rs`
- Test: `rule-engine-rs/tests/rule_path_convergence_tests.rs`

**Interfaces:**
- Produces: a stable place for shared per-rule modules under `rois_rule_engine::rules`.
- Produces: a test-only smoke assertion that the module namespace exists before rule-specific migrations begin.

- [ ] **Step 1: Write the failing test**

Create `rule-engine-rs/tests/rule_path_convergence_tests.rs`:

```rust
#[test]
fn shared_rules_namespace_is_available() {
    let _ = rois_rule_engine::rules::RULE_PATH_CONVERGENCE_MARKER;
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cargo test --manifest-path rule-engine-rs/Cargo.toml shared_rules_namespace_is_available
```

Expected: FAIL because `rois_rule_engine::rules` or `RULE_PATH_CONVERGENCE_MARKER` does not exist.

- [ ] **Step 3: Add the shared namespace**

Create `rule-engine-rs/src/rules/mod.rs`:

```rust
//! Shared legality rule modules used by PyO3 and batch binary adapters.

pub const RULE_PATH_CONVERGENCE_MARKER: &str = "shared-rule-modules";
```

Modify `rule-engine-rs/src/lib.rs` near the existing module declarations:

```rust
pub mod rules;
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cargo test --manifest-path rule-engine-rs/Cargo.toml shared_rules_namespace_is_available
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add rule-engine-rs/src/lib.rs rule-engine-rs/src/rules/mod.rs rule-engine-rs/tests/rule_path_convergence_tests.rs
git commit -m "refactor: establish shared rule module namespace" -m "Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 2: Batch A Proving Rule - 7504 Shared Evaluator

**Files:**
- Modify: `rule-engine-rs/src/lib.rs`
- Create: `rule-engine-rs/src/rules/rule7504.rs`
- Modify: `rule-engine-rs/src/rules/mod.rs`
- Modify: `rule-engine-rs/py/src/lib.rs`
- Modify: `rule-engine-rs/src/bin/check_7504.rs`
- Test: `rule-engine-rs/tests/rule_7504_tests.rs`
- Test: `rule-engine-rs/py/tests/test_engine_rest_wocl.py`

**Interfaces:**
- Produces: `rules::rule7504::Rule7504Row`, `Rule7504Duty`, `Rule7504CrewContext`, `Rule7504Violation`, and `check_rule7504_structured(...)`.
- Consumes: existing `check_min_space_wocl_app`, `check_min_space_wocl_cd_app`, `BaseQual`, and qualification helpers already present in core or migrated locally.
- PyO3 and `check-7504` must call `check_rule7504_structured(...)` for structured rows.

- [ ] **Step 1: Write failing Rust tests for structured row behavior**

Extend `rule-engine-rs/tests/rule_7504_tests.rs` with tests that prove:

```rust
#[test]
fn structured_7504_filters_by_assignment_group_and_attribute() {
    // Row requires FLY -> FLY and WOCL -> WOCL.
    // Candidate pair without WOCL attribute must not fire when apply_prelabelled_attributes=true.
    // Same pair with WOCL attributes must fire.
}

#[test]
fn structured_7504_uses_post_rest_when_requested() {
    // Earlier duty has duty end too close but post-rest end far enough.
    // utilize_post_rest=true must make the pair legal.
}

#[test]
fn structured_7504_cd_and_rh_units_share_the_same_row_model() {
    // Same row model can run RH and CD by changing unit only.
}
```

Use concrete UTC timestamps matching the existing 7504 tests and assert exact violation count, triggering pairing id, actual value, and limit value.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cargo test --manifest-path rule-engine-rs/Cargo.toml rule_7504 -- --nocapture
```

Expected: FAIL because structured 7504 types/functions do not exist.

- [ ] **Step 3: Implement shared 7504 model and evaluator**

Create `rule-engine-rs/src/rules/rule7504.rs` with typed params/input and a small adapter around existing simple kernels:

```rust
use crate::{check_min_space_wocl_app, check_min_space_wocl_cd_app, Application, BaseQual, WoclSpacingDuty, WoclSpacingViolation};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rule7504Row {
    pub prev_assignment_groups: Vec<String>,
    pub next_assignment_groups: Vec<String>,
    pub prev_assignments: Vec<String>,
    pub next_assignments: Vec<String>,
    pub prev_attributes: Vec<String>,
    pub next_attributes: Vec<String>,
    pub apply_prelabelled_attributes: bool,
    pub utilize_post_rest: bool,
    pub bases: Vec<String>,
    pub ranks: Vec<String>,
    pub fleets: Vec<String>,
    pub teams: Vec<String>,
    pub level: String,
    pub min_period: i64,
    pub unit: String,
    pub wocl_window: Option<(i64, i64)>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rule7504Duty {
    pub pairing_id: i64,
    pub start_utc: i64,
    pub end_duty_utc: i64,
    pub end_including_rest_utc: i64,
    pub offset_min: i64,
    pub assignment_group: String,
    pub assignment: String,
    pub attributes: String,
    pub is_pre_assigned: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Rule7504CrewContext {
    pub base_quals: Vec<BaseQual>,
    pub rank_quals: Vec<BaseQual>,
    pub fleet_quals: Vec<BaseQual>,
    pub teams: Vec<String>,
}

pub type Rule7504Violation = WoclSpacingViolation;

pub fn check_rule7504_structured(
    crew_id: &str,
    row: &Rule7504Row,
    crew: &Rule7504CrewContext,
    duties: &[Rule7504Duty],
    fallback_wocl_window: Option<(i64, i64)>,
    app: Application,
) -> Vec<Rule7504Violation> {
    // Minimal implementation for Task 2:
    // - select row.wocl_window.or(fallback_wocl_window), else return [].
    // - skip unsupported level values outside D/P.
    // - filter consecutive pairing duties by assignment group, assignment, and attributes.
    // - apply post rest by replacing the current duty end with end_including_rest_utc when row.utilize_post_rest is true.
    // - pass the selected two duties and PA flags into the RH or CD core function.
    // - preserve existing WoclSpacingViolation output.
}
```

Wire `rule-engine-rs/src/rules/mod.rs`:

```rust
pub mod rule7504;
```

Keep implementation minimal and move only helper logic needed for the tests. If qualification scope is not implemented in this task, row scope fields must be preserved in the type and ignored only when wildcard/empty; add explicit tests before non-wildcard support.

- [ ] **Step 4: Run Rust tests to verify green**

Run:

```bash
cargo test --manifest-path rule-engine-rs/Cargo.toml rule_7504
```

Expected: PASS.

- [ ] **Step 5: Rewire PyO3 7504 to shared evaluator**

Modify `rule-engine-rs/py/src/lib.rs` so `check_structured_wocl` converts its existing `WoclSpacingRule` and `CrewLineDuty` values into `rules::rule7504` types and calls `check_rule7504_structured(...)`.

No public Python API shape changes are allowed in this step.

- [ ] **Step 6: Run PyO3 7504 tests**

Run:

```bash
cd rule-engine-rs/py && pytest tests/test_engine_rest_wocl.py -q
```

Expected: PASS.

- [ ] **Step 7: Rewire `check-7504` binary to structured shared evaluator**

Modify `rule-engine-rs/src/bin/check_7504.rs` to support two input modes:

```text
legacy TSV: crew pairing start end offset
structured tagged TSV:
  R <row fields...>
  D <crew duty fields...>
```

The legacy mode must keep current behavior. The structured mode must call `check_rule7504_structured(...)`.

- [ ] **Step 8: Add binary structured parser tests**

Add a Rust integration test or CLI fixture test proving `check-7504 --emit-tsv` produces the same output for the structured fixture as the PyO3 structured case.

- [ ] **Step 9: Run binary tests**

Run:

```bash
cargo test --manifest-path rule-engine-rs/Cargo.toml rule_7504
cargo build --release --manifest-path rule-engine-rs/Cargo.toml --bin check-7504
```

Expected: PASS / build exit 0.

- [ ] **Step 10: Commit**

```bash
git add rule-engine-rs/src rule-engine-rs/tests rule-engine-rs/py/src/lib.rs rule-engine-rs/py/tests
git commit -m "refactor: share structured 7504 evaluator across rule paths" -m "Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 3: Feed Complete 7504 Data From Live/Scenario

**Files:**
- Modify: `live-server/scripts/legality-recheck-core.mjs`
- Modify: `live-server/scripts/scenario-legality.mjs`
- Modify: `live-server/scripts/live-legality.mjs`
- Test: `live-server/scripts/__tests__/legality-recheck-core.test.mjs`

**Interfaces:**
- Consumes: structured `check-7504` tagged TSV mode from Task 2.
- Produces: Live/Scenario `rule7504` feeder that parses full param rows and sends complete rule and duty context.

- [ ] **Step 1: Write failing Node tests**

Extend `live-server/scripts/__tests__/legality-recheck-core.test.mjs` with tests for:

```js
test('rule7504 builds structured row fields for assignment and attribute filters', async () => {
  // Mock source with one 7504 row requiring FLY->FLY and WOCL->WOCL.
  // Assert runBin receives tagged R/D input containing those fields.
})

test('rule7504 warns and skips non-wildcard crew-team rows when source lacks crew team data', async () => {
  // Mock source without crew team accessor and a row with Crew Teams != *.
  // Assert ctx.log contains explicit skip/warn text.
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm --prefix live-server test -- scripts/__tests__/legality-recheck-core.test.mjs --run
```

Expected: FAIL because `rule7504` still emits legacy `check-7504` input.

- [ ] **Step 3: Implement structured Live/Scenario 7504 feeder**

Modify `rule7504` in `legality-recheck-core.mjs`:

- Parse `Prev/Next Assignment Group`, `Prev/Next Assignment`, `Prev/Next Attributes`, `Apply Prelabelled Attributes`, `Utilize Post Rest`, `Bases`, `Ranks`, `Fleets`, `Crew Teams`, `Level`, `Min Period`, `Unit`, and WOCL window.
- Build `R` tagged rows for `check-7504`.
- Build `D` tagged rows from `source.flyDuties(true)` plus available assignment/group/attribute/base/rank/fleet/team context.
- If a non-wildcard field cannot be sourced, log a warning and skip only the affected row.
- Keep legacy behavior only as fallback when no structured row fields are present.

- [ ] **Step 4: Ensure Live and Scenario source adapters expose required fields**

Inspect `liveSource` and `scenarioSource` accessors used by `rule7504`. Add fields to existing duty rows only where the source already has authoritative data. Do not invent defaults for business filters.

- [ ] **Step 5: Run Node tests**

Run:

```bash
npm --prefix live-server test -- scripts/__tests__/legality-recheck-core.test.mjs --run
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add live-server/scripts
git commit -m "refactor: feed structured 7504 data from live and scenario recheck" -m "Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 4: Batch A Parity For 8056 And 1001

**Files:**
- Modify/Create: `rule-engine-rs/src/rules/rule8056.rs`
- Modify/Create: `rule-engine-rs/src/rules/rule1001.rs`
- Modify: `rule-engine-rs/py/src/lib.rs`
- Modify: `rule-engine-rs/src/bin/check_8056.rs`
- Modify: `rule-engine-rs/src/bin/check_1001.rs`
- Modify: `pbs-engine/ColumnModelSolver_python/rules/rust/rule_gates.py`
- Test: existing rule tests and new parity fixtures.

**Interfaces:**
- Produces: shared typed models for 8056 and 1001.
- Fixes: 1001 must obey RuleSet gating instead of being forced on unconditionally.

- [ ] **Step 1: Add failing gate test for 1001**

Add a PBS unit test proving `build_rust_rule_gates` does not include `1001` in `actual_check_functions` when RuleSet lacks 1001.

- [ ] **Step 2: Add failing parity tests for 8056 structured params**

Add Rust/PyO3 fixture tests covering grouped assignment filters, post-duty-rest use, location/role/requested filters where current params support them.

- [ ] **Step 3: Implement shared 1001 and 8056 typed models**

Move model parsing and evaluator calls into `rule-engine-rs/src/rules/rule1001.rs` and `rule-engine-rs/src/rules/rule8056.rs`.

- [ ] **Step 4: Rewire PyO3 and binaries**

PyO3 and `check-1001`/`check-8056` must call the shared modules and preserve existing output strings/TSV rows.

- [ ] **Step 5: Run verification**

Run:

```bash
cargo test --manifest-path rule-engine-rs/Cargo.toml rule_8056
cargo test --manifest-path rule-engine-rs/Cargo.toml rule_overlap
cd rule-engine-rs/py && pytest tests -q
pytest pbs-engine/tests/unit/test_rust_checker_rule_1001_params.py -q
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add rule-engine-rs pbs-engine
git commit -m "refactor: converge batch A spacing and overlap rules" -m "Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 5: Batch B Rest, WOCL, And Day-Off Rules

**Files:**
- Modify/Create: `rule-engine-rs/src/rules/rule7501.rs`
- Modify/Create: `rule-engine-rs/src/rules/rule7503.rs`
- Modify/Create: `rule-engine-rs/src/rules/rule7505.rs`
- Modify/Create: `rule-engine-rs/src/rules/rule7506.rs`
- Modify: PyO3 and matching `check-*` binaries.
- Test: `rule-engine-rs/tests/rule_7501_tests.rs`, `rule_7503_tests.rs`, `rule_7505_tests.rs`, `rule_7506_tests.rs`, PyO3 tests, Live/Scenario feeder tests.

**Interfaces:**
- Produces: shared rest/day-off input model carrying ground-duty flags, local-night rows, RP windows, post-rest options, blank/layover/leave counting, and checked assignment groups.

- [ ] **Step 1: Write failing parity fixtures**

Create one fixture per rule where PyO3 and binary currently have equivalent intended behavior. Add a second fixture for each known risk dimension:

```text
7501: ground duty that is rest vs work
7503: ground duty included in WOCL run
7505: blank/layover/post-rest and leave range
7506: crew-local day boundary
```

- [ ] **Step 2: Implement shared typed models**

Create focused modules for each rule and move only the model/evaluator logic needed by both adapters.

- [ ] **Step 3: Rewire PyO3 and binaries**

Adapters must convert into shared models and preserve output contracts.

- [ ] **Step 4: Run verification**

Run:

```bash
cargo test --manifest-path rule-engine-rs/Cargo.toml rule_7501
cargo test --manifest-path rule-engine-rs/Cargo.toml rule_7503
cargo test --manifest-path rule-engine-rs/Cargo.toml rule_7505
cargo test --manifest-path rule-engine-rs/Cargo.toml rule_7506
cd rule-engine-rs/py && pytest tests/test_engine_rest_wocl.py tests/test_engine_phase2_7505.py tests/test_engine_7506.py tests/test_engine_7501_ground_is_rest.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add rule-engine-rs live-server/scripts
git commit -m "refactor: converge rest and day-off rule paths" -m "Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 6: Batch C Qualification And Complement Rules

**Files:**
- Modify/Create: `rule-engine-rs/src/rules/rule8004.rs`
- Modify/Create: `rule-engine-rs/src/rules/rule8030.rs`
- Modify/Create: `rule-engine-rs/src/rules/rule8071.rs`
- Modify/Create: `rule-engine-rs/src/rules/rule8072.rs`
- Modify: PyO3 only if PBS support is added for 8071/8072.
- Modify: matching `check-*` binaries.
- Test: rule-specific Rust tests and Live/Scenario feeder tests.

**Interfaces:**
- Produces: shared qualification/complement model.
- Requires explicit decision: `8071` and `8072` either receive PyO3 support or are documented as Live/Scenario-only.

- [ ] **Step 1: Record 8071/8072 product decision**

Before code changes, update the matrix document with one of:

```text
8071/8072 added to PBS PyO3 path
8071/8072 documented Live/Scenario-only because solver does not need them
```

- [ ] **Step 2: Add failing parity tests for 8004 and 8030**

Fixtures must prove pairing base and crew qualification validity for 8004, and per-pairing/per-flight complement construction for 8030.

- [ ] **Step 3: Migrate 8004 and 8030 to shared modules**

Rewire PyO3 and binaries to the shared modules.

- [ ] **Step 4: Migrate or document 8071/8072**

If adding PyO3 support, write failing PyO3 tests first. If marking Live/Scenario-only, update the matrix and add a guard test proving PBS rule gates warn on enabled-but-unwired functions.

- [ ] **Step 5: Run verification**

Run:

```bash
cargo test --manifest-path rule-engine-rs/Cargo.toml rule_8004
cargo test --manifest-path rule-engine-rs/Cargo.toml rule_8030
cargo test --manifest-path rule-engine-rs/Cargo.toml rule_8071
cargo test --manifest-path rule-engine-rs/Cargo.toml rule_8072
cd rule-engine-rs/py && pytest tests/test_engine_8004.py tests/test_engine_8030.py -q
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add rule-engine-rs pbs-engine docs/superpowers/specs/2026-07-25-rule-engine-path-convergence-matrix.md
git commit -m "refactor: converge qualification and complement rule paths" -m "Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 7: Batch D 8002 And Credit Helpers

**Files:**
- Modify: `rule-engine-rs/src/rule8002.rs`
- Create/Modify: `rule-engine-rs/src/rules/rule8002.rs`
- Modify: `rule-engine-rs/src/bin/check_8002_full.rs`
- Modify: `rule-engine-rs/src/bin/check_8002_credit.rs`
- Modify: `rule-engine-rs/src/bin/check_7502.rs`
- Modify: `rule-engine-rs/src/bin/check_7272.rs`
- Modify: `rule-engine-rs/src/bin/ruletool.rs`
- Modify: PyO3 `cum_rules` path.
- Test: 8002 full tests, credit tests, PyO3 8002 tests, Live/Scenario feeder tests.

**Interfaces:**
- Produces: shared cumulative/credit model for BLH, DP, FT, CH, manday metrics, qualification gates, window units, min/max limits, and warning categories.

- [ ] **Step 1: Write failing parity fixtures for 8002**

Fixtures must cover:

```text
BH row with rolling CD window
DP row using duty-period metrics
CH row using pairing duty credit
qualification-gated row
Crew Teams non-wildcard warning behavior
unsupported type warning/skip behavior
```

- [ ] **Step 2: Move 8002 shared contract into `rules::rule8002`**

Keep existing `rule8002.rs` algorithm intact where possible; expose the typed contract through `rules::rule8002` instead of duplicating parsing in adapters.

- [ ] **Step 3: Rewire PyO3 and binaries**

PyO3 `cum_rules`, `check-8002-full`, `check-8002-credit`, and `ruletool` credit helpers must share the same typed model or explicitly documented helper model.

- [ ] **Step 4: Run verification**

Run:

```bash
cargo test --manifest-path rule-engine-rs/Cargo.toml rule_8002
cargo test --manifest-path rule-engine-rs/Cargo.toml ruletool
cd rule-engine-rs/py && pytest tests/test_engine_8002_full.py tests/test_engine_8002_manday_span.py tests/test_engine_8002009_dp.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add rule-engine-rs live-server/scripts
git commit -m "refactor: converge cumulative and credit rule paths" -m "Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 8: Final Cross-Path Verification And Documentation Update

**Files:**
- Modify: `docs/superpowers/specs/2026-07-25-rule-engine-path-convergence-matrix.md`
- Modify/Create: `docs/modules/rule-engine-rs/` convergence notes if a module docs folder exists or is created.

**Interfaces:**
- Produces: final documented parity state for every current rule.

- [ ] **Step 1: Update matrix statuses**

For each rule, update the matrix with final status:

```text
Shared evaluator complete
PyO3 adapter complete / not applicable
Live/Scenario binary adapter complete
Parity fixture passing
Known unsupported fields, if any
```

- [ ] **Step 2: Run full verification**

Run:

```bash
cargo test --manifest-path rule-engine-rs/Cargo.toml
cd rule-engine-rs/py && pytest tests -q
npm --prefix live-server test -- scripts/__tests__/legality-recheck-core.test.mjs --run
pytest pbs-engine/tests/unit/test_rust_checker_rule_1001_params.py -q
```

Expected: all commands PASS.

- [ ] **Step 3: Commit final docs**

```bash
git add docs rule-engine-rs live-server pbs-engine
git commit -m "docs: record rule engine path convergence status" -m "Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```
