# Rule 7504 Utilize Post Rest Semantics Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 7504 spacing rule so `Utilize Post Rest` uses the correct duty boundary and add regression tests that lock the behavior.

**Architecture:** Keep the fix inside the existing rule-7504 structured checker. The rule already owns the gap boundary selection, so the change is a local semantic swap with no interface churn. Tests stay in the existing 7504 migration-fidelity file so the behavior is covered at the same level as the production checker and binary entrypoint.

**Tech Stack:** Rust, cargo test, existing rule-engine-rs binary test harness.

## Global Constraints

- Preserve existing architecture, module boundaries, naming, data flow, and test strategy.
- Implement the smallest real solution.
- Touch only what the task requires.
- No speculative abstractions or config switches.
- Validate with the smallest relevant test set first.

---

### Task 1: Fix the 7504 gap boundary selection

**Files:**
- Modify: `rule-engine-rs/src/rules/rule7504.rs`
- Modify: `rule-engine-rs/src/lib.rs`

**Interfaces:**
- Consumes: `Rule7504Row.utilize_post_rest`, `Rule7504Duty.end_duty_utc`, `Rule7504Duty.end_including_rest_utc`
- Produces: corrected spacing-gap start selection for structured 7504 checks and aligned rule comments

- [ ] **Step 1: Update the failing semantic branch**

```rust
let current_end = if row.utilize_post_rest {
    current.end_duty_utc
} else {
    current.end_including_rest_utc
};
```

- [ ] **Step 2: Align the rule commentary**

Update the 7504 header comment in `rule-engine-rs/src/lib.rs` so the `Utilize Post Rest` sentence matches the corrected meaning and no longer describes the reversed boundary.

- [ ] **Step 3: Run the focused 7504 tests**

Run: `cargo test -p rois_rule_engine rule_7504 -- --nocapture`
Expected: PASS

### Task 2: Add regression coverage for both Utilized Post Rest modes

**Files:**
- Modify: `rule-engine-rs/tests/rule_7504_tests.rs`

**Interfaces:**
- Consumes: `check_rule7504_structured`, `structured_row`, `structured_duty`
- Produces: one regression test proving `Utilize Post Rest=Y` measures from duty end and one proving `N` measures from end including rest

- [ ] **Step 1: Extend the existing post-rest test to assert the corrected `Y` behavior**

```rust
#[test]
fn structured_7504_uses_post_rest_when_requested() {
    let mut row = structured_row("RH", 55);
    row.utilize_post_rest = true;
    let crew = Rule7504CrewContext::default();
    let duties = [
        structured_duty(
            101,
            "2026-05-24T06:00",
            "2026-05-24T11:00",
            "2026-05-26T00:00",
            "WOCL",
        ),
        structured_duty(
            202,
            "2026-05-26T18:00",
            "2026-05-27T11:00",
            "2026-05-27T11:00",
            "WOCL",
        ),
    ];
    let violations = check_rule7504_structured("c", &row, &crew, &duties, None, rois_rule_engine::Application::Editor);
    assert!(violations.is_empty());
}
```

- [ ] **Step 2: Add a companion regression for `Utilize Post Rest=N`**

```rust
#[test]
fn structured_7504_uses_end_including_rest_when_not_requested() {
    let mut row = structured_row("RH", 55);
    row.utilize_post_rest = false;
    let crew = Rule7504CrewContext::default();
    let duties = [
        structured_duty(
            101,
            "2026-05-24T06:00",
            "2026-05-24T11:00",
            "2026-05-26T00:00",
            "WOCL",
        ),
        structured_duty(
            202,
            "2026-05-26T18:00",
            "2026-05-27T11:00",
            "2026-05-27T11:00",
            "WOCL",
        ),
    ];
    let violations = check_rule7504_structured("c", &row, &crew, &duties, None, rois_rule_engine::Application::Editor);
    assert_eq!(violations.len(), 1);
    assert_eq!(violations[0].actual_minutes, 18 * 60);
}
```

- [ ] **Step 3: Run the focused test file**

Run: `cargo test -p rois_rule_engine rule_7504_tests -- --nocapture`
Expected: PASS

### Task 3: Smoke the live Scenario 718 case

**Files:**
- No code changes expected

**Interfaces:**
- Consumes: current live/scenario legality preview path
- Produces: verification that the corrected rule no longer mislabels the crew 568 / pairing 15461 case as a bad 7504 post-rest gap

- [ ] **Step 1: Recheck the preview for the known failing case**

Run the existing legality-preview smoke for scenario 718, crew 568, pairing 15461.

- [ ] **Step 2: Record the result**

Confirm whether the 7504 warning disappears or changes to the expected output, without altering any live/scenario loaders.
