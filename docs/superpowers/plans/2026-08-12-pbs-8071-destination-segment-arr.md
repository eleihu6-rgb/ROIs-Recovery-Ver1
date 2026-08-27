# PBS 8071 Destination = Segment Arrival Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PBS PyO3 `check_8071` match Destinations against segment arrival airports (`seg.arr`), so DOMO Dest=`…|KIN|…` blocks pairings like 15968.

**Architecture:** Reuse existing `pairing_to_8072_segments` / `segments_8072` already built for 8072. When a pairing has segments, emit one `RosterPropertyActivity` per segment with `destination = arr`. Remove empty-airport → `"*"` rewrite. No change to `rule8071.rs` matching helpers.

**Tech Stack:** Rust/PyO3 (`rule-engine-rs/py`), pytest, maturin wheel for SIT flair-pbs-env.

**Spec:** `docs/superpowers/specs/2026-08-12-pbs-8071-destination-segment-arr-design.md`

## Global Constraints

- Do not pipe-join airports into `pairing_airport` (8056 consumes it).
- Empty activity dest must not become `"*"`.
- Mode R still counts unique pairing_id after segment expansion.
- No auto-commit unless the user explicitly asks.
- SIT solver env: `/root/miniforge3/envs/flair-pbs-env`; keep `PYTHONNOUSERSITE=1` in `ro_rust.sh`.

## File map

| File | Role |
|------|------|
| `rule-engine-rs/py/src/lib.rs` | Change `check_8071` activity construction |
| `rule-engine-rs/py/tests/test_engine_phase2_8071.py` | Add Dest=`KIN` / miss / Dest=`*` cases |
| SIT wheel under flair-pbs-env | Deploy rebuilt `rois_rule_engine_rs` |
| Scenario 718 re-run | Prove 923 no longer gets 15968 |

---

### Task 1: Failing PyO3 tests for segment dest

**Files:**
- Modify: `rule-engine-rs/py/tests/test_engine_phase2_8071.py`

**Interfaces:**
- Consumes: `rois_rule_engine_rs.Engine` with `pairing_8072_segments`, `roster_property_rule_rows`, `enabled_functions=["8071"]`
- Produces: failing tests that require segment-arr dest matching

- [ ] **Step 1: Append tests**

```python
def test_8071_matches_destination_from_segment_arr_not_empty_pairing_airport():
    eng = rre.Engine(
        pairing_start_utc=[0],
        pairing_end_utc=[4 * HOUR],
        pairing_blk_min=[60],
        crew_fixed_pairings=[[]],
        pairing_is_fly=[True],
        pairing_label=["C4131"],
        pairing_assignment_group=["FLY"],
        pairing_airport=[""],  # empty pairing airport must NOT wildcard Dest
        crew_teams=[["DOMO"]],
        roster_periods=[(0, 30 * 86400 - 1)],
        checked_window=(0, 30 * 86400 - 1),
        pairing_8072_segments=[
            {
                "pairing_idx": "0",
                "segment_id": "1",
                "duty_seq": "3",
                "seg_seq": "1",
                "flight_id": "15931",
                "flight_number": "2650",
                "flight_date": "1970-01-01",
                "start_utc": "0",
                "end_utc": str(4 * HOUR),
                "fleet": "7M8",
                "dep": "YYZ",
                "arr": "KIN",
                "assignment": "FLY",
                "assignment_group": "FLY",
                "composition": "*",
                "attributes": "*",
                "destination_country": "",
                "planned_by_rank": "",
                "filled_by_rank": "",
            }
        ],
        roster_property_rule_rows=[
            {
                "Bases": "*",
                "Ranks": "*",
                "Fleets": "*",
                "Crew Teams": "DOMO",
                "Labels": "*",
                "Attributes": "*",
                "Override Duty Attributes": "*",
                "Assignment Groups": "FLY",
                "Qualifiers": "*",
                "Flights": "*",
                "Destinations": "ATW|CUN|FLL|GDL|GOH|KIN|MEX",
                "Positions": "*",
                "Period": "1",
                "Unit": "RP",
                "Max Times": "0",
                "Min Times": "0",
                "Check Mode": "*",
            }
        ],
        enabled_functions=["8071"],
    )
    out = eng.check_line(0, [0])
    assert out == ["8071|period=1|unit=RP|actual=1|max=0|min=0|mode=R|over=true"]


def test_8071_does_not_match_when_segment_arr_outside_dest_list():
    # same fixture as above but Destinations = "MEX" only → no violation
    ...


def test_8071_dest_wildcard_still_matches_empty_segment_arr():
    # Destinations="*", arr="" → still matches via Dest wildcard
    ...
```

- [ ] **Step 2: Run tests against current installed wheel (expect FAIL)**

```bash
PYTHONNOUSERSITE=1 /home/qianggong/.venv/bin/pytest \
  rule-engine-rs/py/tests/test_engine_phase2_8071.py -q
```

Expected: new KIN test FAIL (empty/`*` path or no match).

---

### Task 2: Implement segment-arr activities in `check_8071`

**Files:**
- Modify: `rule-engine-rs/py/src/lib.rs` (`fn check_8071`)

**Interfaces:**
- Consumes: `self.pairing_to_8072_segments`, `self.segments_8072`, `self.pairings`, `self.crew_teams`
- Produces: activities with per-segment `destination = arr`

- [ ] **Step 1: Replace pairing-only activity loop**

For each `pi` in fixed∪candidate:

- If `pairing_to_8072_segments.get(pi)` non-empty: push one activity per segment idx with `destination = seg.arr`, `flight_number = seg.flight_number`, `duty_seq = seg.duty_seq`, `segment_id = seg.segment_id`, times from segment.
- Else: one pairing-level activity with `destination = pairing.airport.clone()` (**no** empty→`*`).

Keep crew quals / teams / labels / attributes / group / qualifier / position from pairing+crew as today.

- [ ] **Step 2: Rebuild local py extension and re-run tests**

```bash
cd rule-engine-rs/py
# use project venv that already has maturin / rois_rule_engine_rs
maturin develop --manifest-path Cargo.toml
PYTHONNOUSERSITE=1 pytest rule-engine-rs/py/tests/test_engine_phase2_8071.py -q
```

Expected: all PASS.

- [ ] **Step 3: Run broader py engine tests**

```bash
PYTHONNOUSERSITE=1 pytest rule-engine-rs/py/tests/test_engine_phase2_8071.py \
  rule-engine-rs/py/tests/test_engine_phase2_8072.py -q
```

---

### Task 3: Deploy wheel to SIT and re-run 718

**Files:**
- SIT: install into `/root/miniforge3/envs/flair-pbs-env`
- Optionally remove/ignore `~yuan.z/.local/.../rois_rule_engine_rs` (PYTHONNOUSERSITE already set)

- [ ] **Step 1: Build manylinux/linux wheel on SIT or scp local linux wheel**

Preferred: build on Portal with solver python:

```bash
# on Portal as yuan.z/sudo as needed
cd /tmp/rois-rule-engine-rs-py   # rsync rule-engine-rs tree
PYTHONNOUSERSITE=1 /root/miniforge3/envs/flair-pbs-env/bin/maturin build --release
PYTHONNOUSERSITE=1 /root/miniforge3/envs/flair-pbs-env/bin/pip install --force-reinstall dist/*.whl
```

Verify:

```bash
PYTHONNOUSERSITE=1 /root/miniforge3/envs/flair-pbs-env/bin/python -c \
  'import rois_rule_engine_rs as m; print(m.__file__)'
# must be under flair-pbs-env, not ~/.local
```

- [ ] **Step 2: Smoke KIN case on SIT with same fixture as Task 1**

- [ ] **Step 3: DRAFT→POST /run scenario 718; wait DONE**

- [ ] **Step 4: Assert `assignment_original["923"]` does not contain `15968`**

Report task id + report dir + assignment list.

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Segment-arr activities | Task 2 |
| No empty→`*` | Task 2 |
| KIN hit / MEX miss / Dest=`*` | Task 1 |
| SIT wheel + 718 | Task 3 |
| Mode R unique pairing | covered by KIN Max=0 actual=1 assertion |
