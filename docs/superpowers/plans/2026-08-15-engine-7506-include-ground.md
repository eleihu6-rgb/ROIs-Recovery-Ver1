# Engine 7506 Include Ground Check-ins — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PyO3 `Engine::check_7506` includes `crew_ground` (duty = assignment code) so SIM + FLY on the same local day fires 7506, matching Live `check-7506` feeder semantics.

**Architecture:** Surgical append of ground duties onto the existing pairing→`CheckinRoster` list inside `check_7506` only. Kernel (`check_single_daily_checkin`) and Live feeder unchanged. Editor kernel + Python baseline-diff PA-ignore unchanged.

**Tech Stack:** Rust PyO3 (`rule-engine-rs/py`), pytest (`py/tests/test_engine_7506.py`), maturin, `ro_check.py` harness.

**Spec:** `docs/superpowers/specs/2026-08-15-engine-7506-include-ground-design.md`

## Global Constraints

- Scope = PyO3 `Engine::check_7506` only (not pure-Rust `src/engine.rs`).
- Ground `duty` = uppercase `assignment`; empty → uppercase `group`; skip if both empty.
- `end_offset_min` = crew base `crew_offset_min[crew_idx]` (same as pairing path / Live feeder).
- Keep `check_single_daily_checkin` (Editor); do not switch to Optimizer `_app`.
- §Minimal-First / §Surgical: no shared roster-builder abstraction.
- Do not `git commit` unless the user explicitly asks.

## File map

| File | Role |
|------|------|
| `rule-engine-rs/py/src/lib.rs` | `check_7506` — append ground |
| `rule-engine-rs/py/tests/test_engine_7506.py` | Regression: SIM ground + FLY candidate |
| `docs/superpowers/specs/2026-08-15-engine-7506-include-ground-design.md` | Mark Status Approved |

---

### Task 1: Failing pytest — SIM ground + FLY candidate fires 7506

**Files:**
- Modify: `rule-engine-rs/py/tests/test_engine_7506.py`
- Test: same file

**Interfaces:**
- Consumes: `rre.Engine(..., crew_ground_start/end/assignment/group, one_checkin_groups|one_checkin_rules)`
- Produces: `test_7506_sim_ground_and_fly_candidate_same_local_day_fires` (and fly-only control)

- [ ] **Step 1: Add failing tests**

Append to `rule-engine-rs/py/tests/test_engine_7506.py`:

```python
def test_7506_sim_ground_and_fly_candidate_same_local_day_fires():
    """Anchor: PA SIM + new FLY same local day under Assignments=FLY|SIM.

    Mirrors Live check-7506 feeder (ground duty = assignment code) and
    ro_check crew 1010 / pairing 18871 shape (SIM morning, FLY evening).
    """
    # SIM 08:00–14:00; FLY candidate 18:00–22:00; offset 0 → same UTC calendar day.
    eng = rre.Engine(
        pairing_start_utc=[18 * H],
        pairing_end_utc=[22 * H],
        pairing_blk_min=[60],
        crew_fixed_pairings=[[]],
        pairing_is_fly=[True],
        pairing_assignment_group=["FLY"],
        pairing_assignment=["FLY"],
        crew_offset_min=[0],
        one_checkin_groups=["FLY", "SIM"],
        one_checkin_rules=_structured_7506(assignments=("FLY", "SIM")),
        crew_ground_start=[[8 * H]],
        crew_ground_end=[[14 * H]],
        crew_ground_assignment=[["SIM"]],
        crew_ground_group=[["GRD"]],
    )
    out = [o for o in eng.check_line(0, [0]) if o.startswith("7506")]
    assert len(out) == 1, f"expected 7506 from SIM+FLY, got {out}"
    assert "groups=FLY|SIM" in out[0] or "FLY|SIM" in out[0]


def test_7506_fly_only_without_ground_does_not_fire():
    """Control: same FLY candidate, no ground → no 7506."""
    eng = rre.Engine(
        pairing_start_utc=[18 * H],
        pairing_end_utc=[22 * H],
        pairing_blk_min=[60],
        crew_fixed_pairings=[[]],
        pairing_is_fly=[True],
        pairing_assignment_group=["FLY"],
        pairing_assignment=["FLY"],
        crew_offset_min=[0],
        one_checkin_groups=["FLY", "SIM"],
        one_checkin_rules=_structured_7506(assignments=("FLY", "SIM")),
        crew_ground_start=[[]],
        crew_ground_end=[[]],
        crew_ground_assignment=[[]],
        crew_ground_group=[[]],
    )
    assert [o for o in eng.check_line(0, [0]) if o.startswith("7506")] == []
```

- [ ] **Step 2: Run tests — expect FAIL on the SIM+FLY case**

```bash
cd rule-engine-rs/py && python3 -m pytest tests/test_engine_7506.py::test_7506_sim_ground_and_fly_candidate_same_local_day_fires tests/test_engine_7506.py::test_7506_fly_only_without_ground_does_not_fire -v
```

Expected: SIM+FLY test **FAIL** (`assert len(out) == 1` with `out == []`); fly-only **PASS**.

- [ ] **Step 3: Implement ground append in `check_7506`**

In `rule-engine-rs/py/src/lib.rs`, inside `fn check_7506`, after building `rosters` from pairing `idxs` and **before** `scope_day_ord` / rule evaluation, append ground:

```rust
if let Some(grounds) = self.crew_ground.get(crew_idx) {
    for g in grounds {
        let duty = if !g.assignment.is_empty() {
            g.assignment.to_uppercase()
        } else if !g.group.is_empty() {
            g.group.to_uppercase()
        } else {
            continue;
        };
        rosters.push(CheckinRoster {
            duty,
            start_utc: g.start_utc,
            rest_start_utc: g.end_utc,
            end_offset_min: offset,
        });
    }
}
```

Change `rosters` from a single `collect()` binding to `let mut rosters: Vec<CheckinRoster> = idxs.iter().map(...).collect();` then the append loop above.

Do **not** change the subsequent `check_single_daily_checkin` / `one_checkin_rules` / scope logic.

- [ ] **Step 4: Rebuild PyO3 wheel and re-run 7506 tests**

```bash
cd rule-engine-rs/py && maturin develop --release && python3 -m pytest tests/test_engine_7506.py -v
```

Expected: all tests in the file **PASS**, including the two new ones.

- [ ] **Step 5: Verify `ro_check` anchor case**

```bash
cd rule-engine-rs/ro-tests && python3 ro_check.py 2>&1 | tee /tmp/ro_check_7506.txt | tail -40
```

Expected: crew 1010 ← 18871 no longer “Full line OK” without 7506; output / SVG must show a **7506** violation (or optimizer new-vs-PA wording that includes 7506). If `assignments.txt` is still `crew: 1010` / `pairing: 18871`, that is the anchor.

- [ ] **Step 6: Mark spec Approved**

Set `Status: Approved` in `docs/superpowers/specs/2026-08-15-engine-7506-include-ground-design.md`.

- [ ] **Step 7: Commit only if user asks**

Suggested message (when requested):

```
fix(rule-engine): include ground duties in Engine 7506 check-ins

SIM (and other Assignments codes) on crew_ground were invisible to
PyO3 check_7506, so SIM+FLY same local day stayed silent in ro_check/RO.
```

---

## Spec coverage checklist

| Spec requirement | Task step |
|------------------|-----------|
| Append `crew_ground` with duty=assignment | Task 1 Step 3 |
| Crew base offset | Task 1 Step 3 (`offset`) |
| Keep Editor kernel | Task 1 Step 3 (no `_app`) |
| Py regression SIM+FLY | Task 1 Steps 1–4 |
| `ro_check` 1010/18871 | Task 1 Step 5 |
| No pure-Rust `engine.rs` | Global Constraints |
| No commit unless asked | Task 1 Step 7 |
