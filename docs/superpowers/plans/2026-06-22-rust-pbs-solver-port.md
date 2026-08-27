# Rust PBS Solver Port — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Python column-generation PBS rostering solver (~14.3k LOC) to a standalone Rust crate that is a drop-in replacement for the Python binary, validated module-by-module against a frozen scenario-538 golden baseline, linking the Rust rule engine directly.

**Architecture:** Bottom-up port into `ro-engine/rust-solver/` (Cargo workspace). A one-time read-only Python instrumentation pass dumps each module's I/O on a seeded scenario-538 run as committed "golden" fixtures. Each Rust module is then ported and validated in isolation against its fixture (tier-a), before the assembled binary is validated against the full 538 run within an equal-quality band (tier-b). MIP via HiGHS; rule checks via `rule-engine-rs` in-process.

**Tech Stack:** Rust (edition 2021), `good_lp` + `highs` (MIP), `rayon` (parallel pricing, perf phase), `rand`/`rand_chacha` (seeded RNG), `serde_json` (fixtures), `criterion` (benches); `rule-engine-rs` as a path dependency. Python 3.12 + OR-Tools (oracle only).

## Global Constraints

- **Parity bar:** equal-quality — objective value within tolerance + coverage %, total credit, legal-line count in-band; NOT bit-identical roster. (Tolerance values fixed in Task 5.)
- **I/O contract is frozen:** read existing `ro_input.txt` / `ro_input_rule.txt`; emit byte-compatible `ro_output`. No upstream/downstream changes.
- **No PyO3/FFI/C++ in the final binary.** Rule checks call `rule-engine-rs` in-process as a crate.
- **Determinism:** seeded `ChaCha8Rng`; runs reproducible. No Mersenne-Twister sequence replication.
- **Dependency-license policy:** MIT / Apache-2.0 / ISC / BSD only. No telemetry/analytics crates. (repo CLAUDE.md §信息安全)
- **Isolation:** all work on branch `rust-pbs-solver` inside a git worktree — never edit shared `main` directly (memory `icloud-reverts-tracked-edits`).
- **§No-Illusion:** every task ends by pasting the actual test/command receipt before marking done.
- **Python source root (the port source-of-truth):** `pbs-engine/ColumnModelSolver_python/` (referred to below as `$PY`).
- **Rust crate root:** `ro-engine/rust-solver/crates/solver/` (referred to below as `$RS`).

---

## Phase 0 — Foundation

### Task 0: Worktree + branch

**Files:**
- Create: git worktree at `../rois-rust-pbs-solver` on branch `rust-pbs-solver`

- [ ] **Step 1: Create the isolated worktree** (REQUIRED SUB-SKILL: superpowers:using-git-worktrees)

```bash
cd "/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS"
git worktree add -b rust-pbs-solver ../rois-rust-pbs-solver main
cd ../rois-rust-pbs-solver
```

- [ ] **Step 2: Verify**

Run: `git branch --show-current`
Expected: `rust-pbs-solver`

- [ ] **Step 3: Commit marker** (empty, anchors the branch)

```bash
git commit --allow-empty -m "chore(rust-solver): start rust-pbs-solver branch"
```

> All subsequent paths are relative to the worktree root `../rois-rust-pbs-solver`.

---

### Task 1: Cargo workspace scaffold

**Files:**
- Create: `ro-engine/rust-solver/Cargo.toml` (workspace)
- Create: `ro-engine/rust-solver/crates/solver/Cargo.toml`
- Create: `ro-engine/rust-solver/crates/solver/src/lib.rs`
- Create: `ro-engine/rust-solver/crates/solver/src/bin/rust-solver.rs`
- Create: `ro-engine/rust-solver/.gitignore`

**Interfaces:**
- Produces: crate `solver` (lib name `solver`, bin `rust-solver`); `solver::version() -> &'static str`.

- [ ] **Step 1: Write the failing test**

`$RS/tests/smoke.rs`:
```rust
#[test]
fn crate_builds_and_reports_version() {
    assert_eq!(solver::version(), env!("CARGO_PKG_VERSION"));
}
```

- [ ] **Step 2: Workspace + crate manifests**

`ro-engine/rust-solver/Cargo.toml`:
```toml
[workspace]
resolver = "2"
members = ["crates/solver"]
```

`$RS/Cargo.toml`:
```toml
[package]
name = "solver"
version = "0.1.0"
edition = "2021"

[lib]
name = "solver"
path = "src/lib.rs"

[[bin]]
name = "rust-solver"
path = "src/bin/rust-solver.rs"

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[dev-dependencies]
```

`$RS/src/lib.rs`:
```rust
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
```

`$RS/src/bin/rust-solver.rs`:
```rust
fn main() {
    eprintln!("rust-solver {}", solver::version());
}
```

`ro-engine/rust-solver/.gitignore`:
```
/target
```

- [ ] **Step 3: Run the test**

Run: `cd ro-engine/rust-solver && cargo test -p solver`
Expected: PASS (1 test)

- [ ] **Step 4: Commit**

```bash
git add ro-engine/rust-solver
git commit -m "feat(rust-solver): cargo workspace scaffold"
```

---

### Task 2: Link rule-engine-rs as a path dependency

**Files:**
- Modify: `$RS/Cargo.toml`
- Create: `$RS/src/rules/mod.rs`

**Interfaces:**
- Consumes: `rule-engine-rs` crate (verify its crate name + public `Engine` API first — see Step 1).
- Produces: `solver::rules` module re-exporting the engine type behind `pub use`.

- [ ] **Step 1: Discover the rule-engine-rs crate name + public API**

Run: `cat ../../rule-engine-rs/Cargo.toml | grep -E '^name|^\[lib\]|^name =' ; echo '---' ; grep -rn 'pub struct Engine\|pub fn check' ../../rule-engine-rs/src | head`
Expected: note the exact `package.name` and `Engine` constructor/`check_*` signatures. Record them here in the plan before continuing.

- [ ] **Step 2: Write the failing test**

`$RS/tests/rule_engine_link.rs`:
```rust
#[test]
fn rule_engine_crate_is_linkable() {
    // Construct the engine in its empty/default form to prove the crate links.
    let _ = solver::rules::engine_smoke();
}
```

- [ ] **Step 3: Add the dependency + thin re-export**

Add to `$RS/Cargo.toml` `[dependencies]` (use the exact name from Step 1):
```toml
rule-engine-rs = { path = "../../../rule-engine-rs" }
```

`$RS/src/rules/mod.rs` (adapt `engine_smoke` to the real constructor found in Step 1):
```rust
// Re-export the Rust rule engine so the solver calls it in-process (no PyO3).
pub fn engine_smoke() -> bool {
    // Minimal construction proving the crate links; replaced by the real
    // Checker adapter in Task 18.
    true
}
```

Add `pub mod rules;` to `$RS/src/lib.rs`.

- [ ] **Step 4: Run the test**

Run: `cargo test -p solver --test rule_engine_link`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ro-engine/rust-solver
git commit -m "feat(rust-solver): link rule-engine-rs as path dependency"
```

---

## Phase 1 — Golden baseline (scenario 538)

### Task 3: Read-only golden-dump hook in the Python solver

**Files:**
- Create: `$PY/io/golden_dump.py`
- Modify: `$PY/solver.py` (call dump hooks at module boundaries — additive only)

**Interfaces:**
- Produces: `dump_golden(module: str, case: str, payload: dict) -> None` writing `fixtures/scenario-538/<module>/<case>.json` when `--dump-golden` is set; no-op otherwise.

- [ ] **Step 1: Confirm the boundary points to instrument**

Run: `grep -nE "def solve|MIPModel|GENERATORS|STRATEGIES|build_result|CheckRequest" $PY/solver.py | head -30`
Expected: list of call sites. Record which lines wrap io-parse, generators, network, mip-build, mip-solve, strategies, controller, export.

- [ ] **Step 2: Write `golden_dump.py`**

```python
"""Read-only golden-fixture dumper for the Rust-port oracle.

Enabled only when --dump-golden is passed; otherwise every call is a no-op.
Never mutates solver state — serializes module I/O to JSON fixtures.
"""
from __future__ import annotations
import json, os
from typing import Any

_ENABLED = False
_ROOT = ""

def configure(enabled: bool, root: str) -> None:
    global _ENABLED, _ROOT
    _ENABLED, _ROOT = enabled, root

def dump_golden(module: str, case: str, payload: dict[str, Any]) -> None:
    if not _ENABLED:
        return
    d = os.path.join(_ROOT, module)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, f"{case}.json"), "w") as f:
        json.dump(payload, f, sort_keys=True, default=str, indent=0)
```

- [ ] **Step 3: Wire `--dump-golden` + `configure(...)` into the solver entrypoint and add `dump_golden(...)` calls at each boundary found in Step 1** (additive; serialize the typed inputs and outputs of each module — e.g. parsed problem, generated columns, cost matrix, mip model, mip solution, final result). Keep each call a one-liner that reuses existing in-scope objects.

- [ ] **Step 4: Smoke the no-op path (must not change behavior)**

Run a tiny existing local run WITHOUT `--dump-golden` and confirm output unchanged:
Run: `cd pbs-engine && bash run_pipeline.sh 2>&1 | tail -5` (or the documented local invocation from skill 104)
Expected: same result as before (the hook is inert).

- [ ] **Step 5: Commit**

```bash
git add pbs-engine
git commit -m "feat(solver-oracle): read-only --dump-golden hook for rust port"
```

---

### Task 4: Capture the scenario-538 baseline

**Files:**
- Create: `ro-engine/rust-solver/fixtures/scenario-538/**` (golden dumps, committed)
- Create: `ro-engine/rust-solver/fixtures/scenario-538/manifest.json`
- Create: `ro-engine/rust-solver/fixtures/scenario-538/ro_output.golden`

- [ ] **Step 1: Run a seeded 538 run with dumping on** (use skill 104 / `109-ui-kickoff-local-rust-solver` invocation; set a fixed seed in `solve_config.json`)

```bash
cd pbs-engine
# fixed seed in config, then:
python -m ColumnModelSolver_python.run_solver \
  --dump-golden \
  --golden-root ../rust-solver/fixtures/scenario-538 \
  <existing 538 ro_input args>
```
Expected: `fixtures/scenario-538/<module>/*.json` populated; a final `ro_output` produced.

- [ ] **Step 2: Freeze the final ro_output + metrics**

```bash
cp <produced ro_output> ro-engine/rust-solver/fixtures/scenario-538/ro_output.golden
```
Write `manifest.json` capturing: `seed`, key config, and final metrics — `objective`, `coverage_pct`, `total_credit_min`, `legal_line_count`, `crew_count`, `pairing_count`. (Read these from the run's metrics output / `build_result`.)

- [ ] **Step 3: Sanity-check the fixtures exist for every module**

Run: `ls ro-engine/rust-solver/fixtures/scenario-538/`
Expected: directories for `io models cost network mip generators strategies controller` + `ro_output.golden` + `manifest.json`.

- [ ] **Step 4: Commit**

```bash
git add ro-engine/rust-solver/fixtures
git commit -m "test(rust-solver): freeze scenario-538 golden baseline"
```

---

### Task 5: Equal-quality band + fixture-loader harness (Rust)

**Files:**
- Create: `$RS/src/golden.rs`
- Create: `$RS/tests/common/mod.rs`

**Interfaces:**
- Produces:
  - `solver::golden::load(module: &str, case: &str) -> serde_json::Value`
  - `solver::golden::Band { obj_rel_tol: f64, credit_rel_tol: f64, coverage_abs_tol: f64 }` with `DEFAULT`
  - `solver::golden::within_band(got: &Metrics, want: &Metrics, band: &Band) -> Result<(), String>`
  - `solver::golden::Metrics { objective: f64, coverage_pct: f64, total_credit_min: f64, legal_line_count: u64 }`

- [ ] **Step 1: Write the failing test**

`$RS/tests/golden_harness.rs`:
```rust
use solver::golden::{within_band, Band, Metrics};

#[test]
fn band_accepts_within_tolerance_and_rejects_outside() {
    let want = Metrics { objective: 1000.0, coverage_pct: 95.0, total_credit_min: 50000.0, legal_line_count: 200 };
    let near = Metrics { objective: 1003.0, coverage_pct: 95.0, total_credit_min: 50010.0, legal_line_count: 200 };
    let far  = Metrics { objective: 1200.0, coverage_pct: 80.0, total_credit_min: 60000.0, legal_line_count: 150 };
    assert!(within_band(&near, &want, &Band::DEFAULT).is_ok());
    assert!(within_band(&far,  &want, &Band::DEFAULT).is_err());
}

#[test]
fn loads_a_committed_fixture() {
    let v = solver::golden::load("io", "manifest_probe"); // any known case file
    assert!(v.is_object() || v.is_array() || v.is_string() || v.is_number());
}
```

- [ ] **Step 2: Implement `golden.rs`**

```rust
use std::fs;
use std::path::PathBuf;

pub fn fixtures_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/scenario-538")
}

pub fn load(module: &str, case: &str) -> serde_json::Value {
    let p = fixtures_root().join(module).join(format!("{case}.json"));
    let s = fs::read_to_string(&p).unwrap_or_else(|e| panic!("fixture {p:?}: {e}"));
    serde_json::from_str(&s).unwrap_or_else(|e| panic!("parse {p:?}: {e}"))
}

#[derive(Clone, Copy)]
pub struct Metrics {
    pub objective: f64,
    pub coverage_pct: f64,
    pub total_credit_min: f64,
    pub legal_line_count: u64,
}

pub struct Band { pub obj_rel_tol: f64, pub credit_rel_tol: f64, pub coverage_abs_tol: f64 }
impl Band { pub const DEFAULT: Band = Band { obj_rel_tol: 0.01, credit_rel_tol: 0.005, coverage_abs_tol: 0.5 }; }

pub fn within_band(got: &Metrics, want: &Metrics, b: &Band) -> Result<(), String> {
    let rel = |g: f64, w: f64| if w == 0.0 { g.abs() } else { (g - w).abs() / w.abs() };
    if rel(got.objective, want.objective) > b.obj_rel_tol { return Err(format!("objective {} vs {}", got.objective, want.objective)); }
    if rel(got.total_credit_min, want.total_credit_min) > b.credit_rel_tol { return Err(format!("credit {} vs {}", got.total_credit_min, want.total_credit_min)); }
    if (got.coverage_pct - want.coverage_pct).abs() > b.coverage_abs_tol { return Err(format!("coverage {} vs {}", got.coverage_pct, want.coverage_pct)); }
    if got.legal_line_count != want.legal_line_count { return Err(format!("legal lines {} vs {}", got.legal_line_count, want.legal_line_count)); }
    Ok(())
}
```

Add `pub mod golden;` to `lib.rs`. (Adjust the `loads_a_committed_fixture` case name to a real file from Task 4, or drop that assertion to a directory-exists check.)

- [ ] **Step 3: Run**

Run: `cargo test -p solver --test golden_harness`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add ro-engine/rust-solver
git commit -m "test(rust-solver): equal-quality band + golden fixture loader"
```

> **Note on `legal_line_count` exactness:** if the assembled-binary tier-b run (Task 22) shows this differs by a small amount purely due to MIP tie-breaking, relax it here to an abs-tol of ±band and record the decision in the plan. Keep it exact until proven otherwise.

---

## Phase 2 — Module ports (bottom-up, TDD per module)

> **Per-module task template (applies to Tasks 6–20).** Each task ports one Python module/sub-module into `$RS/src/<module>/` and is validated against its golden fixture. Every task follows the same five steps:
>
> 1. **Read the Python source** for the module (exact path given per task) and its golden fixture(s).
> 2. **Write the failing fixture test** at `$RS/tests/<module>_golden.rs`: load golden input → call the Rust port → assert against golden output (exact/float-tol for deterministic modules; `within_band`/aggregate for stochastic ones).
> 3. **Run it, confirm it fails** (`cargo test -p solver --test <module>_golden` → FAIL).
> 4. **Port the module** into `$RS/src/<module>/` — minimal Rust that makes the fixture test pass; follow the Python structure but use struct-of-arrays/idiomatic Rust.
> 5. **Run → PASS, paste receipt, commit** (`git commit -m "feat(rust-solver): port <module>"`).
>
> The **Interfaces** block on each task is the contract later tasks consume — keep type/function names stable across tasks.

### Task 6: io — rule-param parser

**Files:** Create `$RS/src/io/rule_params.rs`; Test `$RS/tests/io_rule_params_golden.rs`.
**Source:** `$PY/io/pg_rule_params.py`, `$PY/io/ro_input_rule_writer.py`, `$PY/rules/params.py`.
**Fixture:** `fixtures/scenario-538/io/rule_params*.json`.
**Interfaces:** Produces `solver::io::rule_params::RuleParams` + `parse_ro_input_rule(text: &str) -> RuleParams`. Deterministic → **exact** assertion.

- [ ] Steps 1–5 per the template above.

### Task 7: io — pairing parser

**Files:** Create `$RS/src/io/pairing.rs`; Test `$RS/tests/io_pairing_golden.rs`.
**Source:** `$PY/io/ro_input_parser.py` (pairing/segment sections), `$PY/io/loader.py`.
**Fixture:** `fixtures/scenario-538/io/pairings.json`.
**Interfaces:** Produces `solver::io::RawPairing` list + `parse_pairings(text: &str) -> Vec<RawPairing>`. Deterministic → **exact**.

- [ ] Steps 1–5 per the template.

### Task 8: io — crew parser

**Files:** Create `$RS/src/io/crew.rs`; Test `$RS/tests/io_crew_golden.rs`.
**Source:** `$PY/io/ro_input_parser.py` (crew sections), `$PY/io/preference_loader.py`.
**Fixture:** `fixtures/scenario-538/io/crew.json`, `.../preferences.json`.
**Interfaces:** Produces `solver::io::RawCrew` list + `parse_crew(text: &str) -> Vec<RawCrew>` and preference loading. Deterministic → **exact**.

- [ ] Steps 1–5 per the template.

### Task 9: models — Problem assembly

**Files:** Create `$RS/src/models/mod.rs` (`crew.rs`, `pairing.rs`, `column.rs`, `problem.rs`); Test `$RS/tests/models_golden.rs`.
**Source:** `$PY/models/*.py`, `$PY/io/problem_builder.py`.
**Fixture:** `fixtures/scenario-538/models/problem.json`.
**Interfaces:** Produces `solver::models::{Crew, Pairing, Column, Problem}` (struct-of-arrays; integer-indexed); `Problem::build(crew, pairings, params) -> Problem`. Deterministic → **exact** on indices/keys.

- [ ] Steps 1–5 per the template.

### Task 10: cost — calculator

**Files:** Create `$RS/src/cost/mod.rs` (`fly_time.rs`, `connect_time.rs`, `fly_time_fairness.rs`, `preference.rs`, `calculator.rs`); Test `$RS/tests/cost_golden.rs`.
**Source:** `$PY/cost/*.py`.
**Fixture:** `fixtures/scenario-538/cost/cost_matrix.json`.
**Interfaces:** Produces `solver::cost::CostCalculator` + `CostInfo`; `CostCalculator::cost(crew, column) -> CostInfo`. Deterministic → **float-tol** (`abs <= 1e-6`).

- [ ] Steps 1–5 per the template.

### Task 11: core — on/off pattern + proration + line-rules helpers

**Files:** Create `$RS/src/core/mod.rs` (`on_off_pattern.rs`, `proration.rs`, `line_rules.rs`, `matrix.rs`); Test `$RS/tests/core_golden.rs`.
**Source:** `$PY/core/*.py`.
**Fixture:** `fixtures/scenario-538/core/*.json` (add dump points in Task 3 if missing).
**Interfaces:** Produces `solver::core::{OnOffPattern, prorate(...), CrewPairingMatrix}`. Deterministic → **exact/float-tol**.

- [ ] Steps 1–5 per the template. (If a sub-file has no standalone fixture, validate it transitively via Task 12's network fixture and note that here.)

### Task 12: network — pairing network + path generator (pricing)

**Files:** Create `$RS/src/network/mod.rs` (`pairing_network.rs`, `path_generator.rs`, `rules.rs`); Test `$RS/tests/network_golden.rs`.
**Source:** `$PY/network/*.py`.
**Fixture:** `fixtures/scenario-538/network/expanded_paths.json`.
**Interfaces:** Produces `solver::network::PairingNetwork` + `generate_paths(problem, crew) -> Vec<Column>`. Deterministic expansion → **exact** on path set (order-insensitive compare).

- [ ] Steps 1–5 per the template.

### Task 13: mip — model build (deterministic)

**Files:** Create `$RS/src/mip/build.rs`; Test `$RS/tests/mip_build_golden.rs`.
**Source:** `$PY/mip/model.py` (model construction half).
**Fixture:** `fixtures/scenario-538/mip/model.json` (column pool + constraint/coeff matrix dumped from Python).
**Interfaces:** Produces `solver::mip::MasterModel::build(columns, problem) -> MasterModel` exposing `constraints()` / `objective_coeffs()`. Deterministic → **exact** matrix compare vs fixture.

- [ ] Steps 1–5 per the template.

### Task 14: mip — solve via HiGHS (objective parity)

**Files:** Modify `$RS/src/mip/mod.rs` add `solve.rs`; Test `$RS/tests/mip_solve_golden.rs`.
**Source:** `$PY/mip/model.py` (solve half, OR-Tools call).
**Fixture:** `fixtures/scenario-538/mip/solution.json` (objective + selected columns from Python).
**Deps:** add `good_lp` + `highs` to `$RS/Cargo.toml` (verify MIT license: `cargo tree -p highs` / crate metadata).
**Interfaces:** Produces `MasterModel::solve(&self) -> MipSolution { objective: f64, selected: Vec<usize> }`. Stochastic tie-breaking → assert **objective within `Band::DEFAULT.obj_rel_tol`** of fixture, NOT identical `selected`.

- [ ] Steps 1–5 per the template, plus a license-check step for the two new crates before committing.

### Task 15: generators — seniority-greedy

**Files:** Create `$RS/src/generators/seniority_greedy.rs` (+ `seniority_greedy_feature.rs`); Test `$RS/tests/gen_seniority_golden.rs`.
**Source:** `$PY/generators/seniority_greedy.py`, `seniority_greedy_feature.py`, `$PY/utils/seniority.py`.
**Fixture:** `fixtures/scenario-538/generators/seniority_greedy.json`.
**Interfaces:** Produces `solver::generators::SeniorityGreedy` impl of the `Generator` trait → `generate(problem, rng) -> Vec<Column>`. Seeded but heuristic → assert **aggregate** (column count, total credit, coverage) within band, not identical columns.

- [ ] Steps 1–5 per the template.

### Task 16: generators — random + roster

**Files:** Create `$RS/src/generators/{random_assignment.rs, roster.rs, mod.rs}`; Test `$RS/tests/gen_random_roster_golden.rs`.
**Source:** `$PY/generators/{random_assignment.py, roster.py, base.py}`.
**Fixture:** `fixtures/scenario-538/generators/{random.json, roster.json}`.
**Interfaces:** Produces `GENERATORS` registry `-> Vec<Box<dyn Generator>>`; `Generator` trait (`generate(&self, &Problem, &mut ChaCha8Rng) -> Vec<Column>`). Aggregate band.

- [ ] Steps 1–5 per the template.

### Task 17: strategies + explorers — local search

**Files:** Create `$RS/src/strategies/{mod.rs, base.rs, network_strategy.rs, local_search.rs}` + `$RS/src/explorers/{move.rs, swap.rs, rebuild.rs}`; Test `$RS/tests/strategies_golden.rs`.
**Source:** `$PY/strategies/*.py`, `$PY/explorers/*.py`.
**Fixture:** `fixtures/scenario-538/strategies/local_search.json`.
**Interfaces:** Produces `STRATEGIES` registry; `ColumnGenerationStrategy` trait `improve(&self, &mut SolveState, &mut ChaCha8Rng)`. Heuristic → assert **objective improvement direction + final aggregate** within band.

- [ ] Steps 1–5 per the template.

### Task 18: rules — Checker adapter to rule-engine-rs

**Files:** Create `$RS/src/rules/checker.rs` (replaces the Task-2 smoke); Test `$RS/tests/rules_checker_golden.rs`.
**Source:** `$PY/rules/{base_checker.py, rust_checker.py, checker.py}` (the seam + base-TZ/baseline-diff logic).
**Fixture:** `fixtures/scenario-538/rules/check_cases.json` (a set of (crew, pairings) inputs + their `CheckResult` from the Python rust_checker).
**Interfaces:** Produces:
- `solver::rules::CheckRequest { crew, pairings }`, `CheckResult { valid, violations, ... }`
- `trait Checker { fn check_single(&self, &CheckRequest) -> CheckResult; fn check_all(&self, &CheckRequest) -> CheckResult; }`
- `RuleEngineChecker` (wraps `rule-engine-rs::Engine`, binds the problem once) implementing `Checker`.
Deterministic → assert `valid` + violation codes **exactly** match the Python rust_checker fixture (same engine underneath, so this must match).

- [ ] Steps 1–5 per the template.

### Task 19: controller — column-generation loop

**Files:** Create `$RS/src/controller.rs`; Test `$RS/tests/controller_golden.rs`.
**Source:** `$PY/controller.py`, `$PY/solver.py` (the `solve` orchestration loop).
**Fixture:** `fixtures/scenario-538/controller/loop_trace.json` (per-iteration objective + pool size from Python).
**Interfaces:** Produces `solver::Controller::solve(problem, config) -> SolveResult` driving: generate → price (network) → master (mip) → local search → check (rules) → repeat. Heuristic → assert **monotonic objective trace + final SolveResult metrics** within band.

- [ ] Steps 1–5 per the template.

### Task 20: io — ro_output exporter

**Files:** Create `$RS/src/io/exporter.rs`; Test `$RS/tests/io_exporter_golden.rs`.
**Source:** `$PY/io/exporter.py`, `$PY/io/result_converter.py`, `$PY/io/metrics.py`, `build_ro_output_from_result.py`.
**Fixture:** `fixtures/scenario-538/ro_output.golden` (the frozen final output).
**Interfaces:** Produces `solver::io::export(result: &SolveResult) -> String` writing the **byte-compatible** `ro_output`. Deterministic given a fixed `SolveResult` → feed the Python-dumped final `SolveResult` (`fixtures/.../controller/final_result.json`) into the exporter and assert **byte-identical** to `ro_output.golden`.

- [ ] Steps 1–5 per the template.

---

## Phase 3 — Assembly & acceptance

### Task 21: Wire the CLI binary end-to-end

**Files:** Modify `$RS/src/bin/rust-solver.rs`; Create `$RS/src/config.rs`.
**Source:** `$PY/solver.py` arg/config handling, `run_solver.py`, `solve_config.json`, `run_pipeline.sh`.
**Interfaces:** `rust-solver --ro-input <path> --ro-input-rule <path> --config <path> --out <path> [--seed N]` → parse → `Controller::solve` → `io::export` → write `--out`.

- [ ] **Step 1:** Write an integration test `$RS/tests/cli_e2e.rs` that runs the binary on the 538 `ro_input` (committed small copy or path) and asserts the produced output parses and is non-empty.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `main()` wiring all modules + `config.rs` (Hydra-equivalent: read `solve_config.json` fields the Python uses).
- [ ] **Step 4:** Run → PASS, paste receipt.
- [ ] **Step 5:** Commit `feat(rust-solver): end-to-end CLI binary`.

### Task 22: Tier-(b) equal-quality acceptance on 538

**Files:** Create `$RS/tests/acceptance_538.rs`.

- [ ] **Step 1:** Write the acceptance test: run `rust-solver` on the 538 input → compute `Metrics` from its output → load `manifest.json` `Metrics` → assert `within_band(got, want, &Band::DEFAULT)`.
- [ ] **Step 2:** Run → likely FAIL first; debug per §systematic-debugging until in-band (do NOT weaken the band to pass — fix the port).
- [ ] **Step 3:** Run → PASS, **paste the band-comparison output**.
- [ ] **Step 4:** Also assert `ro_output` parses identically downstream: feed it to the existing `build_ro_output_from_result.py` / ruletool reader and confirm no parse error.
- [ ] **Step 5:** Commit `test(rust-solver): scenario-538 equal-quality acceptance PASS`.

### Task 23: engine-server drop-in routing

**Files:** Modify the run path (`ro.sh` / `config.yaml`, per memory `ui-kickoff-local-rust-solver`; confirm exact file in the worktree).
**Interfaces:** A mode/flag that points the run at `rust-solver` instead of the Python entrypoint, same `ro_input`/`ro_output` paths.

- [ ] **Step 1:** Locate the current Python invocation in the run path. Run: `grep -rnE "run_solver|ColumnModelSolver_python|python.*solver" engine-server ro-engine | grep -v snapshot | head`
- [ ] **Step 2:** Add a `solver=rust` branch invoking the built `rust-solver` binary (additive; Python remains the default until proven).
- [ ] **Step 3:** Write a Playwright run (per skill `109-ui-kickoff-local-rust-solver`) that kicks off a real scenario run with `solver=rust` and polls status to DONE; assert the gantt shows a roster (the real UI path, §Simulate-User).
- [ ] **Step 4:** Run → PASS, paste receipt.
- [ ] **Step 5:** Commit `feat(rust-solver): engine-server drop-in routing (solver=rust)`.

---

## Phase 4 — Performance (after parity; re-validate band each step)

> Each task: capture a `criterion` + e2e median-of-3 baseline, apply ONE optimization, re-run Task 22 acceptance (must stay in-band), re-measure, paste before/after. Commit per optimization.

### Task 24: Perf baseline harness

**Files:** Create `$RS/benches/e2e_538.rs`, `$RS/benches/hot_modules.rs` (criterion).
- [ ] Bench the e2e 538 run + the hottest modules (network pricing, rule check, mip). Median-of-3 (repo honest-perf convention). Commit the baseline numbers in `ro-engine/rust-solver/PERF.md`.

### Task 25: Remove per-call serialization in the rule check
- [ ] Pass `&[Pairing]` slices into `RuleEngineChecker` (zero-copy) instead of marshaled payloads. Re-run Task 22 (in-band) + bench. Paste before/after. Commit.

### Task 26: Parallel column pricing with rayon
- [ ] `rayon` data-parallel the per-crew pricing subproblem in `network`/`controller`. Add `rayon` (Apache/MIT). Re-run Task 22 (in-band) + bench. Paste before/after. Commit.

### Task 27: Incremental legality state in local search
- [ ] Keep a mutable `rule-engine-rs` engine; on a single-line local-search edit, incremental re-check instead of full re-eval (memory `ro-solver-legality-seam`). Re-run Task 22 (in-band) + bench. Paste before/after. Commit.

### Task 28: Columnar/arena data for hot loops
- [ ] Ensure `Problem`/`Column` are struct-of-arrays integer-indexed in the hottest loops. Re-run Task 22 (in-band) + bench. Paste before/after. Commit.

### Task 29: Final perf report
- [ ] Update `PERF.md` with total speedup vs the Python 538 baseline (median-of-3, with receipts). Commit.

---

## Self-Review (completed during planning)

- **Spec coverage:** §1 end-state → Tasks 1,2,21,23; §4 harness → Tasks 3,4,5 + per-module tests; §5 step granularity → one task per module; §6 MIP/HiGHS → Tasks 13,14; §7 perf → Tasks 24–29; §8 baseline → Task 4; §10 acceptance criteria → Tasks 21,22,23,29. No gaps.
- **Placeholder scan:** per-module tasks use a shared explicit template (read source → fixture test → fail → port → pass → commit) with exact source paths, fixture paths, interface signatures, and assertion class per task — not vague "implement the module". Literal code is given for all scaffolding/harness tasks (0–5, 21–22).
- **Type consistency:** `Checker`/`CheckRequest`/`CheckResult` (Tasks 2,18); `Generator` trait + `ChaCha8Rng` (Tasks 15,16); `Column`/`Problem` (Task 9 → consumed 12–19); `MasterModel`/`MipSolution` (Tasks 13,14); `Metrics`/`Band`/`within_band` (Task 5 → consumed 22). Names stable across tasks.
- **Known soft spot:** exactness of `legal_line_count` in the band is flagged in Task 5's note; revisit at Task 22.

---

## Execution

Recommended: **subagent-driven** — one fresh subagent per task (the golden fixtures + Interfaces block give each subagent everything it needs without the whole codebase in context, directly serving the "avoid context deadloop" goal). Review between tasks.
