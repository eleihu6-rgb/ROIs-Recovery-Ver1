# Rule 7504 Full Parameter Forwarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Pass all 15 rule 7504 parameter columns from `pbs-engine` into the Rust PyO3 engine and dynamically enforce matching RH/CD rows during PBS optimization.

**Architecture:** Keep `wocl_spacing_hours` as a compatibility fallback, but add a typed structured `wocl_spacing_rules` payload. The Python builder supplies the rule rows plus the minimum pairing/crew context required for matching; the PyO3 layer validates and stores them; the Rust 7504 checker selects matching rows and invokes the existing RH or CD kernel.

**Tech Stack:** Python 3.12, PyO3, Rust, Cargo tests, pytest.

## Global Constraints

- No database schema change.
- `pbs-engine` and `rule-engine-rs` are the active implementation modules.
- Preserve existing RH behavior for the current `7504/001` configuration.
- Keep scalar `wocl_spacing_hours` as the compatibility fallback.
- Missing non-wildcard team context must fail explicitly.
- Use `apply_patch` for source edits.
- Run focused tests before broader builds.

---

### Task 1: Add the normalized Python 7504 row contract

**Files:**
- Modify: `pbs-engine/ColumnModelSolver_python/rules/rust/rule_params.py`
- Test: `pbs-engine/tests/unit/test_rust_checker_rule_1001_params.py`

**Interfaces:**
- Produces `params["wocl_spacing_rules"]` as a list of 15-column rows plus
  `wocl_window` and `max_consecutive_wocl`.
- Keeps `params["wocl_spacing_hours"]` populated from the first valid RH/CD row
  for old callers.

- [ ] **Step 1: Add a failing parser test**

Construct a `7503` row and a `7504` `tableHeader`/`tableRow1` fixture using the
exact 15 source columns. Assert the parsed row contains:

```python
assert params["wocl_spacing_rules"] == [{
    "prev_assignment_groups": ["*"],
    "next_assignment_groups": ["*"],
    "prev_assignments": ["FLY"],
    "next_assignments": ["FLY"],
    "prev_attributes": ["WOCL"],
    "next_attributes": ["WOCL"],
    "apply_prelabelled_attributes": False,
    "utilize_post_rest": True,
    "bases": ["*"],
    "ranks": ["*"],
    "fleets": ["*"],
    "teams": ["*"],
    "level": "D",
    "min_period": 55,
    "unit": "RH",
    "wocl_window": (120, 359),
    "max_consecutive_wocl": 2,
}]
```

- [ ] **Step 2: Run the parser test and verify it fails**

Run:

```bash
cd pbs-engine
pytest -q tests/unit/test_rust_checker_rule_1001_params.py -k 7504
```

Expected: FAIL because `wocl_spacing_rules` is not yet emitted.

- [ ] **Step 3: Implement header-aware 7504 parsing**

Use `_col`, `_filter_at`, `_split_filter`, and existing value normalization.
Accept the current header aliases, validate `Level` as `D`/`P`, validate
`Unit` as `RH`/`CD`, parse numeric `Min Period`, and attach the already parsed
7503 values. Skip malformed rows through the existing unsupported-rule policy
path. Set the scalar fallback from the first valid row.

- [ ] **Step 4: Run the focused parser test**

Run the command above. Expected: PASS.

- [ ] **Step 5: Commit the parser slice when repository write permissions allow**

```bash
git add pbs-engine/ColumnModelSolver_python/rules/rust/rule_params.py \
  pbs-engine/tests/unit/test_rust_checker_rule_1001_params.py
git commit -m "feat: parse full rule 7504 rows"
```

### Task 2: Forward structured rows and matching context from `pbs-engine`

**Files:**
- Modify: `pbs-engine/ColumnModelSolver_python/rules/rust/engine_builder.py`
- Test: `pbs-engine/tests/unit/test_rust_checker_rule_1001_params.py`

**Interfaces:**
- Adds `wocl_spacing_rules=engine_params.get("wocl_spacing_rules", [])` to
  `rois_rule_engine_rs.Engine`.
- Adds only the existing pairing/crew arrays needed by 7504 matching; no new
  database or service boundary.

- [ ] **Step 1: Add a failing builder capture test**

Extend the fake `Engine` capture fixture to include a `7503`/`7504` ruleset and
assert:

```python
assert captured["wocl_spacing_rules"][0]["min_period"] == 55
assert captured["wocl_spacing_rules"][0]["unit"] == "RH"
```

- [ ] **Step 2: Run the builder test and verify it fails**

Run:

```bash
cd pbs-engine
pytest -q tests/unit/test_rust_checker_rule_1001_params.py -k "7504 or build_engine"
```

Expected: FAIL because the keyword is not passed.

- [ ] **Step 3: Pass structured rows and context arrays**

Forward the structured rule list. Preserve the existing pairing group/type/base
arrays and add assignment values and any existing parsed attribute/team source
arrays only where the input snapshot already provides them. If team context is
not available for a non-wildcard row, preserve an explicit missing marker so
Rust can reject it rather than treating it as wildcard.

- [ ] **Step 4: Run Python focused tests**

Run:

```bash
cd pbs-engine
pytest -q tests/unit/test_rust_checker_rule_1001_params.py tests/unit/test_rust_startup.py
```

Expected: PASS.

### Task 3: Add Rust/PyO3 7504 row conversion and validation

**Files:**
- Modify: `rule-engine-rs/py/src/lib.rs`
- Test: `rule-engine-rs/py/tests/test_engine_rest_wocl.py`

**Interfaces:**
- Add a PyO3-compatible row tuple contract:

```text
(
  prev_assignment_groups, next_assignment_groups,
  prev_assignments, next_assignments,
  prev_attributes, next_attributes,
  apply_prelabelled_attributes, utilize_post_rest,
  bases, ranks, fleets, teams,
  level, min_period, unit,
  wocl_start_min, wocl_end_min, max_consecutive_wocl
)
```

- Store validated rows in `Engine`.

- [ ] **Step 1: Add a failing PyO3 wiring test**

Create a test engine with one structured row and assert a close pair fires with
the row's `min_period`. Add a second test with `unit="CD"` and assert the
calendar-day threshold is used.

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```bash
cd rule-engine-rs
pytest -q py/tests/test_engine_rest_wocl.py -k "structured or cd"
```

Expected: FAIL because `Engine` does not accept `wocl_spacing_rules`.

- [ ] **Step 3: Implement row conversion**

Define a Rust `WoclSpacingRule` struct, convert tuple values with explicit
length and enum validation, and return `PyValueError` for malformed rows,
invalid level/unit, or negative minimum periods. Preserve the empty-list
fallback.

- [ ] **Step 4: Wire the field into `Engine` and `n_rules`**

Prefer structured rows when non-empty. Count 7504 as enabled when the structured
rows have usable WOCL values, otherwise use the scalar fallback condition.

- [ ] **Step 5: Run the PyO3 test**

Run the command above. Expected: PASS.

### Task 4: Implement dynamic Rust 7504 row matching

**Files:**
- Modify: `rule-engine-rs/py/src/lib.rs`
- Modify: `rule-engine-rs/src/lib.rs`
- Test: `rule-engine-rs/tests/rule_7504_tests.rs`
- Test: `rule-engine-rs/py/tests/test_engine_rest_wocl.py`

**Interfaces:**
- Add row matching for scope fields and assignment/attribute switches.
- Use `check_min_space_wocl_app` for RH and
  `check_min_space_wocl_cd_app` for CD.
- Keep the old `check_min_space_wocl` scalar path unchanged.

- [ ] **Step 1: Add failing behavioral tests**

Cover:

```rust
// changed min period changes result
// nonmatching assignment/group/base/rank/fleet/team does not fire
// wildcard fields fire
// D and P rows select their supported context
// CD uses calendar-day threshold
// non-wildcard missing team returns an explicit constructor/check error
```

In the PyO3 tests, assert the current `7504/001` row still emits
`limit_min=3300` for `55 RH`.

- [ ] **Step 2: Run Rust tests and verify the new tests fail**

Run:

```bash
cd rule-engine-rs
cargo test --test rule_7504_tests
pytest -q py/tests/test_engine_rest_wocl.py
```

Expected: existing tests pass where unaffected and new structured-row tests
fail until matching is implemented.

- [ ] **Step 3: Add matching context to the internal pairing/crew model**

Use the already available `PairingRec` group/base/type and add assignment and
attribute values only where the input arrays can provide them. Use the existing
qualification arrays for effective rank/fleet matching at the candidate date.
Represent unavailable team data explicitly.

- [ ] **Step 4: Implement row selection**

For each ordered WOCL duty pair:

1. evaluate previous/next assignment-group and assignment filters;
2. evaluate previous/next WOCL attribute filters, honoring
   `apply_prelabelled_attributes`;
3. evaluate base/rank/fleet/team scope filters;
4. choose each matching row's `level`, `min_period`, and `unit`;
5. honor `utilize_post_rest` by choosing duty end or rest end for `gap_start`;
6. apply optimizer pre-assignment tolerance consistently with the existing
   kernel.

If a non-wildcard team filter is present and no crew team exists, return an
explicit error before checking the line.

- [ ] **Step 5: Run focused Rust verification**

Run:

```bash
cd rule-engine-rs
cargo test --test rule_7504_tests
cargo test --test rule_optimizer_pa_tests
pytest -q py/tests/test_engine_rest_wocl.py
```

Expected: PASS.

### Task 5: Update manual test documentation and run cross-module verification

**Files:**
- Create or modify: `docs/test-cases/pbs/rule-7504-full-parameter-forwarding.md`

- [ ] **Step 1: Document the manual acceptance case**

Document how to change `7504/001` `Min Period` or `Unit`, run PBS optimization,
and verify the Rust request/log/result changes. Do not include credentials.

- [ ] **Step 2: Run Python and Rust focused suites**

```bash
cd pbs-engine
pytest -q tests/unit/test_rust_checker_rule_1001_params.py tests/unit/test_rust_startup.py
cd ../rule-engine-rs
cargo test
pytest -q py/tests/test_engine_rest_wocl.py
```

- [ ] **Step 3: Run source checks**

```bash
git diff --check
cargo fmt --check
```

- [ ] **Step 4: Review the final diff**

Confirm only the spec, implementation plan, PBS parser/builder, Rust connector,
Rust kernel tests, and PBS manual test documentation changed. Record any
unavailable full PBS run as a test gap.
