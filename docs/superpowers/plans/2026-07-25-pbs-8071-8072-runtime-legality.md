# PBS 8071/8072 Runtime Legality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add rule 8071 and rule 8072 to PBS solver runtime legality checks so they are enforced during optimization rather than remaining Live/Scenario-only.

**Architecture:** Rule 8071 is wired into the existing PyO3 `Engine.check_line` per-crew legality path. Rule 8072 is wired as a complement-aware PyO3 checker that maintains crew-on-flight state and validates affected segments incrementally when assignments are attempted.

**Tech Stack:** Rust 2021 `rule-engine-rs`, PyO3 connector in `rule-engine-rs/py`, Python 3.12 PBS solver in `pbs-engine`, pytest, Cargo tests.

**Implementation Status:** Completed on 2026-07-25. Verification passed for `cargo test --manifest-path rule-engine-rs/Cargo.toml`, `/home/qianggong/.venv/bin/pytest rule-engine-rs/py/tests -q`, targeted PBS pytest for rule gates/builder/checker/assignment gate, and root/submodule `git diff --check`.

## Global Constraints

- Keep PBS in-process PyO3 legality; do not call Live/Scenario binaries from PBS.
- Reuse shared Rust semantic cores: `rule8071` and `rule8072`.
- Use TDD: every behavior change starts with a failing test.
- Preserve existing 1001/7501/7503/7504/7505/7506/8002/8004/8030/8056 behavior.
- 8072 must be checked during assignment construction, not only after solve.
- Missing required 8072 data must fail closed; do not silently mark 8072 as wired.
- Do not revert unrelated dirty worktree changes.

---

## File Structure

- Modify `pbs-engine/ColumnModelSolver_python/rules/rust/rule_gates.py`: add 8071 wired support and 8072 complement classification.
- Modify `pbs-engine/tests/unit/test_rust_rule_gates.py`: gate regression tests.
- Modify `pbs-engine/tests/unit/test_rust_engine_builder_rule_gates.py`: builder passes new gate categories.
- Modify `rule-engine-rs/py/src/lib.rs`: PyO3 input fields and runtime checks for 8071/8072.
- Add/modify `rule-engine-rs/py/tests/test_engine_phase2_8071.py`: 8071 PyO3 tests.
- Add/modify `rule-engine-rs/py/tests/test_engine_phase2_8072.py`: 8072 incremental complement tests.
- Modify `pbs-engine/ColumnModelSolver_python/rules/rust/engine_builder.py`: build 8071/8072 PyO3 payloads from ro_input.
- Add/modify PBS unit tests for builder data extraction.
- Modify `pbs-engine/ColumnModelSolver_python/rules/rust/checker.py`: expose 8072 can-add/commit/rollback API through Rust checker.
- Modify assignment construction call sites found by `rg "check_single|check_all|RustRuleChecker|FAILED_LEGALITY"` in `pbs-engine/ColumnModelSolver_python`.
- Add targeted PBS assignment tests proving 8072 blocks invalid complement assignments.

---

### Task 1: Rule Gate Categories

**Files:**
- Modify: `pbs-engine/ColumnModelSolver_python/rules/rust/rule_gates.py`
- Modify: `pbs-engine/tests/unit/test_rust_rule_gates.py`
- Modify: `pbs-engine/tests/unit/test_rust_engine_builder_rule_gates.py`

**Interfaces:**
- Produces: `RustRuleGates.complement_check_functions: tuple[str, ...]`
- Produces: 8071 in `actual_check_functions`
- Produces: 8072 in `complement_check_functions`

- [ ] **Step 1: Write the failing rule gate test**

In `pbs-engine/tests/unit/test_rust_rule_gates.py`, replace the current 8071/8072 live-only expectation with:

```python
def test_build_rust_rule_gates_wires_8071_and_classifies_8072_complement() -> None:
    sections = {
        "RuleSet": _Section(rows=[{"ruleId": "r8071"}, {"ruleId": "r8072"}]),
        "Rule": _Section(
            rows=[
                {"id": "r8071", "function": "8071", "category": "Rest"},
                {"id": "r8072", "function": "8072", "category": "Rest"},
            ]
        ),
    }

    gates = build_rust_rule_gates(sections)

    assert gates.enabled_functions == ("8071", "8072")
    assert gates.actual_check_functions == ("8071",)
    assert gates.complement_check_functions == ("8072",)
    assert gates.definition_functions == ()
    assert gates.unwired_functions == ()
    assert gates.forced_functions == ()
```

- [ ] **Step 2: Run the failing gate test**

Run:

```bash
PYTHONPATH=pbs-engine /home/qianggong/.venv/bin/pytest pbs-engine/tests/unit/test_rust_rule_gates.py -q -k 807
```

Expected: FAIL because `RustRuleGates` has no `complement_check_functions` and 8071/8072 are still unwired.

- [ ] **Step 3: Implement gate categories**

In `rule_gates.py`:

```python
_PYO3_WIRED_FUNCTIONS = frozenset(
    {
        "1001",
        "7500",
        "7501",
        "7503",
        "7504",
        "7505",
        "7506",
        "8002",
        "8004",
        "8030",
        "8056",
        "8071",
        "8072",
    }
)
_PYO3_COMPLEMENT_CHECKS = frozenset({"8072"})
_PYO3_GATED_CHECKS = _PYO3_WIRED_FUNCTIONS - {"7500"} - _PYO3_COMPLEMENT_CHECKS
```

Extend the dataclass:

```python
@dataclass(frozen=True)
class RustRuleGates:
    enabled_functions: tuple[str, ...]
    actual_check_functions: tuple[str, ...]
    complement_check_functions: tuple[str, ...]
    definition_functions: tuple[str, ...]
    unwired_functions: tuple[str, ...]
    forced_functions: tuple[str, ...]
```

In `build_rust_rule_gates`:

```python
actual_checks = enabled & _PYO3_GATED_CHECKS
complement_checks = enabled & _PYO3_COMPLEMENT_CHECKS
unwired = enabled - _PYO3_WIRED_FUNCTIONS - definitions
gates = RustRuleGates(
    enabled_functions=tuple(sorted(enabled)),
    actual_check_functions=tuple(sorted(actual_checks)),
    complement_check_functions=tuple(sorted(complement_checks)),
    definition_functions=tuple(sorted(definitions)),
    unwired_functions=tuple(sorted(unwired)),
    forced_functions=tuple(sorted(forced)),
)
```

Update the log message to include `complement_check_functions`.

- [ ] **Step 4: Update builder gate test**

In `pbs-engine/tests/unit/test_rust_engine_builder_rule_gates.py`, update the 8071/8072 expectation:

```python
assert built.rule_gates.enabled_functions == ("8071", "8072")
assert built.rule_gates.actual_check_functions == ("8071",)
assert built.rule_gates.complement_check_functions == ("8072",)
assert built.rule_gates.unwired_functions == ()
assert _FakeEngine.last_kwargs["enabled_functions"] == ["8071", "8072"]
```

- [ ] **Step 5: Run gate tests**

Run:

```bash
PYTHONPATH=pbs-engine /home/qianggong/.venv/bin/pytest pbs-engine/tests/unit/test_rust_rule_gates.py pbs-engine/tests/unit/test_rust_engine_builder_rule_gates.py -q
```

Expected: PASS.

---

### Task 2: PyO3 8071 Check-Line Support

**Files:**
- Modify: `rule-engine-rs/py/src/lib.rs`
- Add: `rule-engine-rs/py/tests/test_engine_phase2_8071.py`

**Interfaces:**
- Produces PyO3 constructor args:
  - `roster_property_rule_rows: Vec<HashMap<String, String>>`
  - `roster_property_activity_rows: Vec<HashMap<String, String>>`
- Produces `check_line` output prefix: `8071|`

- [ ] **Step 1: Write failing PyO3 8071 test**

Create `rule-engine-rs/py/tests/test_engine_phase2_8071.py`:

```python
import rois_rule_engine_rs as rre

HOUR = 3600


def test_8071_check_line_rejects_candidate_that_exceeds_roster_property_max():
    eng = rre.Engine(
        pairing_start_utc=[0, 10 * HOUR],
        pairing_end_utc=[2 * HOUR, 12 * HOUR],
        pairing_blk_min=[60, 60],
        crew_fixed_pairings=[[0]],
        pairing_is_fly=[True, True],
        pairing_label=["A", "B"],
        pairing_assignment_group=["FLY", "FLY"],
        pairing_assignment=["FLT", "FLT"],
        crew_base_quals=[[("YYZ", 0, 999999)]],
        crew_rank_quals=[[("CA", 0, 999999)]],
        crew_fleet_quals=[[("737", 0, 999999)]],
        roster_periods=[(0, 30 * 86400 - 1)],
        checked_window=(0, 30 * 86400 - 1),
        roster_property_rule_rows=[
            {
                "Bases": "*",
                "Ranks": "*",
                "Fleets": "*",
                "Crew Teams": "*",
                "Labels": "*",
                "Attributes": "*",
                "Override Duty Attributes": "*",
                "Assignment Groups": "FLY",
                "Qualifiers": "*",
                "Flights": "*",
                "Destinations": "*",
                "Positions": "*",
                "Period": "31",
                "Unit": "CD",
                "Max Times": "1",
                "Min Times": "0",
                "Check Mode": "R",
            }
        ],
        enabled_functions=["8071"],
    )

    out = eng.check_line(0, [1])
    assert out == ["8071|period=31|unit=CD|actual=2|max=1|min=0|mode=R|over=true"]
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
/home/qianggong/.venv/bin/pytest rule-engine-rs/py/tests/test_engine_phase2_8071.py -q
```

Expected: FAIL because PyO3 Engine does not accept 8071 rows yet.

- [ ] **Step 3: Add PyO3 fields and parser**

In `rule-engine-rs/py/src/lib.rs`, import:

```rust
use rois_rule_engine::rules::rule8071::{
    check_roster_properties_row, RosterPropertyActivity, Rule8071,
};
```

Add fields to `Engine`:

```rust
roster_property_rules: Vec<Rule8071>,
```

Add parser helper that maps a `HashMap<String, String>` to the 17 cells expected by `Rule8071::from_cells`.

- [ ] **Step 4: Build activities inside `check_line`**

For the first implementation, build 8071 activities from fixed + candidate pairings using existing pairing arrays:

```rust
RosterPropertyActivity {
    crew_id: crew_id.to_string(),
    pairing_id: pi as i64,
    duty_seq: 0,
    segment_id: pi as i64,
    start_utc: p.start_utc,
    end_utc: p.end_duty_utc,
    bases: vec![p.base.clone()],
    ranks: crew_rank_values,
    fleets: crew_fleet_values,
    teams: self.crew_teams.get(crew_idx).cloned().unwrap_or_default(),
    labels: vec![p.label.clone()],
    attributes: split_pipe(&p.attributes),
    override_duty_attributes: vec!["*".to_string()],
    assignment_group: p.group.clone(),
    qualifier: p.qualifier.clone(),
    flight_number: String::new(),
    destination: p.airport.clone(),
    position: String::new(),
}
```

Call `check_roster_properties_row` for each enabled 8071 row and append:

```rust
format!(
    "8071|period={}|unit={}|actual={}|max={}|min={}|mode={}|over={}",
    rule.period,
    rule.unit.as_str(),
    violation.actual_count,
    violation.max_times,
    violation.min_times,
    violation.mode.as_str(),
    violation.over,
)
```

- [ ] **Step 5: Run PyO3 8071 test**

Run:

```bash
/home/qianggong/.venv/bin/pytest rule-engine-rs/py/tests/test_engine_phase2_8071.py -q
```

Expected: PASS.

---

### Task 3: PyO3 8072 Incremental Complement API

**Files:**
- Modify: `rule-engine-rs/py/src/lib.rs`
- Add: `rule-engine-rs/py/tests/test_engine_phase2_8072.py`

**Interfaces:**
- Produces PyO3 methods:
  - `can_add_pairing_8072(crew_idx: int, pairing_idx: int) -> list[str]`
  - `commit_pairing_8072(crew_idx: int, pairing_idx: int) -> None`
  - `rollback_pairing_8072(crew_idx: int, pairing_idx: int) -> None`
- Produces output prefix: `8072|`

- [ ] **Step 1: Write failing max-limit test**

Create `rule-engine-rs/py/tests/test_engine_phase2_8072.py`:

```python
import rois_rule_engine_rs as rre

HOUR = 3600


def _engine(max_limits="1", min_limits="0"):
    return rre.Engine(
        pairing_start_utc=[0],
        pairing_end_utc=[2 * HOUR],
        pairing_blk_min=[60],
        crew_fixed_pairings=[[], []],
        pairing_is_fly=[True],
        pairing_label=["P1"],
        pairing_assignment_group=["FLY"],
        pairing_assignment=["FLT"],
        crew_rank_quals=[[("CA", 0, 999999)], [("FO", 0, 999999)]],
        crew_fleet_quals=[[("737", 0, 999999)], [("737", 0, 999999)]],
        crew_qualification_sets=[["FC-GREEN"], ["FC-GREEN"]],
        crew_nationality=["CA", "CA"],
        pairing_8072_segments=[
            {
                "segment_id": "9001",
                "pairing_idx": "0",
                "duty_seq": "1",
                "seg_seq": "1",
                "flight_id": "3001",
                "flight_number": "F8001",
                "flight_date": "2026-06-01",
                "start_utc": "0",
                "end_utc": str(2 * HOUR),
                "fleet": "737",
                "dep": "YYZ",
                "arr": "YVR",
                "assignment": "FLT",
                "assignment_group": "FLY",
                "composition": "STD",
                "attributes": "*",
                "destination_country": "CA",
                "planned_by_rank": "CA:1|FO:1",
                "filled_by_rank": "CA:0|FO:0",
            }
        ],
        min_qual_rule_rows=[
            {
                "Flight Fleets": "*",
                "Flight Assignment Groups": "FLY",
                "Crew Teams": "*",
                "Crew Nationality": "*",
                "Destination Countries": "*",
                "Acting Ranks": "*",
                "Flight Compositions": "*",
                "Required Qualifications": "FC-GREEN",
                "Attributes": "*",
                "Dep": "*",
                "Arr": "*",
                "Min Limits": min_limits,
                "Max Limits": max_limits,
            }
        ],
        enabled_functions=["8072"],
    )


def test_8072_rejects_second_qualified_crew_when_max_is_one():
    eng = _engine(max_limits="1")
    assert eng.can_add_pairing_8072(0, 0) == []
    eng.commit_pairing_8072(0, 0)

    out = eng.can_add_pairing_8072(1, 0)
    assert out == ["8072|segment=9001|qualified=2|planned=2|filled=2|min=0|max=1|over=true"]
```

- [ ] **Step 2: Run failing test**

Run:

```bash
/home/qianggong/.venv/bin/pytest rule-engine-rs/py/tests/test_engine_phase2_8072.py -q
```

Expected: FAIL because the new constructor args and methods do not exist.

- [ ] **Step 3: Add Rust fields**

In `Engine`, add:

```rust
min_qual_rules: Vec<Rule8072>,
segments_8072: Vec<Rule8072Segment>,
pairing_to_8072_segments: Vec<Vec<usize>>,
crew_qual_sets: Vec<Vec<String>>,
crew_nationality: Vec<String>,
crew_on_segment_8072: Vec<Vec<usize>>,
```

Import:

```rust
use rois_rule_engine::rules::rule8072::{
    check_min_qual_by_fleet_rank, Rule8072, Rule8072Crew, Rule8072Segment,
};
```

- [ ] **Step 4: Implement methods**

Add PyO3 methods:

```rust
fn can_add_pairing_8072(&self, crew_idx: usize, pairing_idx: usize) -> PyResult<Vec<String>>
fn commit_pairing_8072(&mut self, crew_idx: usize, pairing_idx: usize) -> PyResult<()>
fn rollback_pairing_8072(&mut self, crew_idx: usize, pairing_idx: usize) -> PyResult<()>
```

`can_add_pairing_8072` clones only affected segments, appends the proposed crew, calls `check_min_qual_by_fleet_rank(..., Application::Optimizer)`, and formats:

```rust
format!(
    "8072|segment={}|qualified={}|planned={}|filled={}|min={}|max={}|over={}",
    v.segment_id,
    v.qualified_count,
    v.planned_count,
    v.filled_count,
    v.min_limits,
    v.max_limits,
    v.over_max,
)
```

- [ ] **Step 5: Add min-limit feasibility tests**

Append tests:

```python
def test_8072_allows_under_min_when_open_slot_can_still_satisfy():
    eng = _engine(max_limits="9", min_limits="2")
    assert eng.can_add_pairing_8072(0, 0) == []


def test_8072_rejects_under_min_when_no_open_slot_can_satisfy():
    eng = _engine(max_limits="9", min_limits="2")
    eng.commit_pairing_8072(0, 0)
    out = eng.can_add_pairing_8072(0, 0)
    assert out
```

If same-crew duplicate assignment is invalid earlier in PBS, replace the second test fixture with `planned_by_rank="CA:1"` and one non-qualified crew candidate so no open qualified slot remains.

- [ ] **Step 6: Run PyO3 8072 tests**

Run:

```bash
/home/qianggong/.venv/bin/pytest rule-engine-rs/py/tests/test_engine_phase2_8072.py -q
```

Expected: PASS.

---

### Task 4: PBS Builder Payload For 8071/8072

**Files:**
- Modify: `pbs-engine/ColumnModelSolver_python/rules/rust/engine_builder.py`
- Add/modify: `pbs-engine/tests/unit/test_rust_engine_builder_8071_8072.py`

**Interfaces:**
- Produces engine kwargs:
  - `roster_property_rule_rows`
  - `min_qual_rule_rows`
  - `pairing_8072_segments`
  - `crew_qualification_sets`
  - `crew_nationality`

- [ ] **Step 1: Write failing builder test**

Create `pbs-engine/tests/unit/test_rust_engine_builder_8071_8072.py` with a fake Engine capturing kwargs. Assert:

```python
assert "roster_property_rule_rows" in _FakeEngine.last_kwargs
assert "min_qual_rule_rows" in _FakeEngine.last_kwargs
assert "pairing_8072_segments" in _FakeEngine.last_kwargs
assert "crew_qualification_sets" in _FakeEngine.last_kwargs
assert "crew_nationality" in _FakeEngine.last_kwargs
```

Use minimal sections containing `Rule`, `RuleSet`, `RuleParameter`, `CrewQualification`, `Crew`, `PairingDutySegment`, and pairing composition rows.

- [ ] **Step 2: Run failing builder test**

Run:

```bash
PYTHONPATH=pbs-engine /home/qianggong/.venv/bin/pytest pbs-engine/tests/unit/test_rust_engine_builder_8071_8072.py -q
```

Expected: FAIL because kwargs are missing.

- [ ] **Step 3: Implement extraction helpers**

In `engine_builder.py`, add helpers:

```python
def _extract_8071_rule_rows(engine_params: dict[str, Any]) -> list[dict[str, str]]:
    return list(engine_params.get("roster_property_rule_rows", []))


def _extract_8072_rule_rows(engine_params: dict[str, Any]) -> list[dict[str, str]]:
    return list(engine_params.get("min_qual_rule_rows", []))


def _extract_crew_qualification_sets(sections: dict[str, Section], active_crew_ids: list[str]) -> list[list[str]]:
    by_crew: dict[str, set[str]] = defaultdict(set)
    for row in _rows(sections, "CrewQualification"):
        crew_id = row.get("crewId", "").strip()
        qualification = row.get("qualification", "").strip()
        if crew_id and qualification:
            by_crew[crew_id].add(qualification)
    return [sorted(by_crew.get(crew_id, set())) for crew_id in active_crew_ids]
```

Build `pairing_8072_segments` from `PairingDutySegment` and composition rows using existing pairing dense index maps.

- [ ] **Step 4: Pass kwargs to PyO3 Engine**

Add:

```python
roster_property_rule_rows=engine_params.get("roster_property_rule_rows", []),
min_qual_rule_rows=engine_params.get("min_qual_rule_rows", []),
pairing_8072_segments=pairing_8072_segments,
crew_qualification_sets=crew_qualification_sets,
crew_nationality=crew_nationality,
```

- [ ] **Step 5: Run builder test**

Run:

```bash
PYTHONPATH=pbs-engine /home/qianggong/.venv/bin/pytest pbs-engine/tests/unit/test_rust_engine_builder_8071_8072.py -q
```

Expected: PASS.

---

### Task 5: PBS Runtime 8072 Assignment Gate

**Files:**
- Modify: `pbs-engine/ColumnModelSolver_python/rules/rust/checker.py`
- Modify assignment call sites found by `rg "check_single|check_all|FAILED_LEGALITY|RustRuleChecker" pbs-engine/ColumnModelSolver_python`
- Add/modify targeted PBS tests near the chosen assignment module.

**Interfaces:**
- Produces Python methods:
  - `RustRuleChecker.can_add_complement(crew_id: str, pairing_id: str) -> list[str]`
  - `RustRuleChecker.commit_complement(crew_id: str, pairing_id: str) -> None`
  - `RustRuleChecker.rollback_complement(crew_id: str, pairing_id: str) -> None`

- [ ] **Step 1: Write failing checker test**

Add a test that constructs a fake PyO3 engine with `can_add_pairing_8072`, maps crew/pairing IDs to indices, and asserts:

```python
violations = checker.can_add_complement("C2", "P1")
assert violations == ["8072|segment=9001|qualified=2|planned=2|filled=2|min=0|max=1|over=true"]
```

- [ ] **Step 2: Implement checker methods**

In `checker.py`:

```python
def can_add_complement(self, crew_id: str, pairing_id: str) -> list[str]:
    if not self._rule_gates or "8072" not in self._rule_gates.complement_check_functions:
        return []
    crew_idx = self._maps.crew_to_idx[str(crew_id)]
    pairing_idx = self._maps.pairing_to_idx[str(pairing_id)]
    return list(self._engine.can_add_pairing_8072(crew_idx, pairing_idx))
```

Add matching commit/rollback methods.

- [ ] **Step 3: Wire assignment attempt call sites**

At each assignment acceptance point, call:

```python
complement_violations = rust_checker.can_add_complement(str(crew.id), str(pairing.id))
if complement_violations:
    return legality failure with reason "FAILED_8072_COMPLEMENT"
```

After the assignment is committed:

```python
rust_checker.commit_complement(str(crew.id), str(pairing.id))
```

If the surrounding code can undo an assignment, call rollback during undo.

- [ ] **Step 4: Add targeted assignment test**

Add a PBS unit test where:

- pairing P1 has one flight segment with `Max Limits=1`.
- first qualified crew is accepted.
- second qualified crew is rejected with 8072 complement failure.

- [ ] **Step 5: Run targeted PBS tests**

Run the new test plus nearby existing tests:

```bash
PYTHONPATH=pbs-engine /home/qianggong/.venv/bin/pytest pbs-engine/tests/unit/test_rust_checker_8072_complement.py pbs-engine/tests/unit/test_rust_assignment_8072_complement.py -q
```

Expected: PASS.

---

### Task 6: Full Verification And Documentation Update

**Files:**
- Modify: `docs/superpowers/specs/2026-07-25-rule-engine-path-convergence-matrix.md`
- Modify: `docs/modules/rule-engine/path-convergence-notes.md`

- [ ] **Step 1: Update matrix**

Change 8071 and 8072 rows:

```markdown
| 8071 Roster Properties | Wired through PyO3 `check_line` | `rule8071` uses `check-8071` | Shared contract exported through `rules::rule8071`; PyO3 and binary adapters import through shared namespace | None known after PBS runtime wiring | Batch C |
| 8072 Min/Max Qualified Crew | Wired through PBS complement-aware PyO3 checker using crew-on-flight state | `rule8072` uses `check-8072` | Shared contract exported through `rules::rule8072`; PyO3 complement checker and binary adapter import through shared namespace | Cross-crew rule: must remain complement-aware, not ordinary per-crew `check_line` | Batch C |
```

- [ ] **Step 2: Run full verification**

Run:

```bash
cargo test --manifest-path rule-engine-rs/Cargo.toml
/home/qianggong/.venv/bin/pytest rule-engine-rs/py/tests -q
PYTHONPATH=pbs-engine /home/qianggong/.venv/bin/pytest pbs-engine/tests/unit/test_rust_rule_gates.py pbs-engine/tests/unit/test_rust_engine_builder_rule_gates.py -q
git diff --check
```

Expected: all PASS.

- [ ] **Step 3: Report verification**

Final response must list exact commands and PASS/FAIL. If any full-suite command cannot run because of stale generated release binaries or unavailable local build artifacts, report the blocker and the targeted passing commands.

## Self-Review

- Spec coverage: Tasks cover gate classification, PyO3 8071, PyO3 8072 incremental complement API, PBS builder payload, runtime assignment gate, docs, and verification.
- Placeholder scan: The Task 5 pytest placeholder was replaced with concrete checker and assignment test paths; no TBD/TODO placeholders remain.
- Type consistency: `complement_check_functions`, `can_add_pairing_8072`, `commit_pairing_8072`, and `rollback_pairing_8072` are consistently named across tasks.
