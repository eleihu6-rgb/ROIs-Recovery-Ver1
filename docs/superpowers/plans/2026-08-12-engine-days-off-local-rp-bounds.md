# Engine days-off local RP bounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PyO3 `Engine.check_days_off_structured` (7505/7507) open the RP window at crew-base local midnights so Min DO shortfalls fire under non-zero `crew_offset_min`.

**Architecture:** Add a tiny public helper in the core crate that converts `(rp_start_ord, rp_end_ord, offset_min)` → `(rp_start_utc, rp_end_utc)`. Call it from `check_days_off_structured` in `py/src/lib.rs`. Kernel `count_days_off` / Live TSV paths stay unchanged.

**Tech Stack:** Rust (`rule-engine-rs`), PyO3 Engine, `cargo test`, `maturin develop`, `ro_check.py`

## Global Constraints

- Touch only RP ordinal→UTC conversion for structured days-off; do not retarget `count_days_off` day_map keys.
- Shared by structured 7505 and 7507 via `check_days_off_structured`.
- Violation message `rp_days` remains `(rp_end_ord - rp_start_ord) + 1`.
- No auto-commit unless the user explicitly asks.

---

## File map

| File | Role |
|------|------|
| `rule-engine-rs/src/lib.rs` | Add `rp_ordinal_bounds_to_local_utc` next to `local_day_start_utc` |
| `rule-engine-rs/tests/rule_7507_tests.rs` | Regression: ordinal+offset conversion + Min DO shortfall |
| `rule-engine-rs/py/src/lib.rs` | `check_days_off_structured` uses the helper |
| `docs/superpowers/specs/2026-08-12-engine-days-off-local-rp-bounds-design.md` | Already approved |

---

### Task 1: Failing regression + helper + Engine wire-up

**Files:**
- Modify: `rule-engine-rs/src/lib.rs` (export helper near `local_day_start_utc`)
- Modify: `rule-engine-rs/tests/rule_7507_tests.rs`
- Modify: `rule-engine-rs/py/src/lib.rs` (`check_days_off_structured` RP bounds)

**Interfaces:**
- Produces: `pub fn rp_ordinal_bounds_to_local_utc(rp_start_ord: i64, rp_end_ord: i64, offset_min: i64) -> (i64, i64)`
- Consumes: existing `check_min_days_off`, `Activity7505`, `DaysOffRow`, `SECONDS_PER_DAY` (or literal `86_400`)

- [ ] **Step 1: Write the failing test** in `rule_7507_tests.rs`

```rust
#[test]
fn ordinal_rp_shifted_by_crew_offset_detects_min_do_shortfall() {
    // Engine historically used UTC midnight from ordinals; with YYZ offset the
    // day_map keys miss local paints → all blank → DO inflated → silent allow.
    // Local-midnight conversion must restore detection.
    const YYZ: i64 = -240;
    let sep1_ord = (t("2026-09-01 00:00:00") / 86_400);
    let sep30_ord = (t("2026-09-30 00:00:00") / 86_400);
    let (rp0_utc_midnight, rp1_utc_midnight) = (
        sep1_ord * 86_400,
        (sep30_ord + 1) * 86_400,
    );
    let (rp0, rp1) = rois_rule_engine::rp_ordinal_bounds_to_local_utc(sep1_ord, sep30_ord, YYZ);

    // 21 CRAM days Sep 1..21 local mornings; blanks Sep 22–30 → 9 DO < min 10.
    let mut acts = Vec::new();
    for day in 1..=21u32 {
        acts.push(day_act_sep(day));
    }
    let mut row = base_row();
    row.min_do = 10;
    row.fly_days_lower = 0;
    row.fly_days_upper = 0;
    row.fly_assignments = vec!["FLY".into()];
    row.reserve_days_lower = 0;
    row.reserve_days_upper = 31;
    row.reserve_assignments = vec!["CRAM".into()];

    assert!(
        check_min_days_off("13645", &acts, rp0_utc_midnight, rp1_utc_midnight, YYZ, &[row.clone()])
            .is_empty(),
        "UTC-midnight RP + offset must miss paints (hazard Engine had)"
    );
    let v = check_min_days_off("13645", &acts, rp0, rp1, YYZ, &[row]);
    assert_eq!(v.len(), 1, "local-midnight RP must fire Min DO, got {:?}", v);
    assert_eq!(v[0].days_off, 9);
    assert_eq!(v[0].min_do, 10);
}

fn day_act_sep(day: u32) -> Activity7505 {
    let s = format!("2026-09-{:02} 12:00:00", day); // 08:00 YYZ
    let e = format!("2026-09-{:02} 20:00:00", day);
    act("CRAM", &s, &e, &e)
}
```

Adapt helpers (`act`, `base_row`, `t`) already in the file; import `rp_ordinal_bounds_to_local_utc` once added. If `rp_ordinal_bounds_to_local_utc` is missing, the test fails to compile (RED).

- [ ] **Step 2: Run test to verify RED**

```bash
cd rule-engine-rs && cargo test --test rule_7507_tests ordinal_rp_shifted_by_crew_offset_detects_min_do_shortfall -- --nocapture
```

Expected: compile error (`rp_ordinal_bounds_to_local_utc` not found) **or** if stub returns UTC midnight, assertion on `v.len()==1` fails.

- [ ] **Step 3: Implement helper in `src/lib.rs`**

```rust
/// Convert inclusive RP calendar ordinals to a half-open UTC window whose
/// endpoints are crew-base **local** midnights (C++ / 7505 unit-test contract).
/// `offset_min` = base UTC offset in minutes (east of UTC).
pub fn rp_ordinal_bounds_to_local_utc(
    rp_start_ord: i64,
    rp_end_ord: i64,
    offset_min: i64,
) -> (i64, i64) {
    const SECONDS_PER_DAY: i64 = 86_400;
    let rp_start_utc = rp_start_ord * SECONDS_PER_DAY - offset_min * 60;
    let rp_end_utc = (rp_end_ord + 1) * SECONDS_PER_DAY - offset_min * 60;
    (rp_start_utc, rp_end_utc)
}
```

Export from the crate root `lib.rs` `pub use` / keep it in the same module already exporting `local_day_start_utc`.

- [ ] **Step 4: Wire PyO3 Engine**

In `py/src/lib.rs` `check_days_off_structured`, replace:

```rust
let rp_start_utc = rp_start_ord * SECONDS_PER_DAY;
let rp_end_utc = (rp_end_ord + 1) * SECONDS_PER_DAY;
```

with:

```rust
let offset = self.crew_offset(crew_idx);
let (rp_start_utc, rp_end_utc) =
    rp_ordinal_bounds_to_local_utc(rp_start_ord, rp_end_ord, offset);
```

Import `rp_ordinal_bounds_to_local_utc` alongside existing `check_min_days_off_app` imports from `rois_rule_engine`.

- [ ] **Step 5: Run tests GREEN**

```bash
cd rule-engine-rs && cargo test --test rule_7507_tests -- --nocapture
cd rule-engine-rs && cargo test --test rule_7505_tests -- --nocapture
```

Expected: all PASS.

- [ ] **Step 6: Rebuild PyO3 + smoke ro_check**

```bash
cd rule-engine-rs/py && maturin develop --release
cd ../ro-tests && python3 ro_check.py 2>&1 | tee /tmp/ro_check_7507.log | tail -80
```

Expected: for crew `13645`, at least one of the later CRAM assigns fails with a `7507|` violation (not all 21 “successfully assigned”).

- [ ] **Step 7: Commit only if user asks**

Do not `git commit` unless explicitly requested. List changed files for the user.

---

## Spec coverage

| Spec requirement | Task |
|------------------|------|
| Local midnight conversion in `check_days_off_structured` | Task 1 Step 4 |
| Shared 7505/7507 | same function |
| Kernel unchanged | no edits to `count_days_off` |
| Regression test | Task 1 Steps 1–5 |
| ro_check smoke | Task 1 Step 6 |

## Placeholder scan

None.
