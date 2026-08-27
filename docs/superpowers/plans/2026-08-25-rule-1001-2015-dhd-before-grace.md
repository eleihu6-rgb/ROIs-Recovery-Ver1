# Rule 1001 / 2015 DHD Before Grace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Treat Before `assignment` / `assignment_group` **DHD** the same as **FLY** for rule 1001’s rule-2015 DO Start grace.

**Architecture:** Single hardcoded predicate in Rust `fly_do_2015_grace_applies`; After still filtered by 2015 Assignments / Groups; no param/seed changes.

**Tech Stack:** Rust (`rule-engine-rs`), existing `rule_1001_tests`, gantt Help `_rule-doc.tsx`.

**Spec:** [`docs/superpowers/specs/2026-08-25-rule-1001-2015-dhd-before-grace-design.md`](../specs/2026-08-25-rule-1001-2015-dhd-before-grace-design.md)

## Global Constraints

- Before remains hardcoded `{FLY, DHD}` — do not parameterize.
- Do not change 7505/7507 or 2015 seed rows.
- No auto-commit unless the user asks.

## File map

| File | Role |
|------|------|
| `rule-engine-rs/src/lib.rs` | Expand Before gate in `fly_do_2015_grace_applies` |
| `rule-engine-rs/tests/rule_1001_tests.rs` | DHD grace regression tests |
| `gantt/src/components/help/topics/legality/_rule-doc.tsx` | Help copy: FLY / DHD → After |

---

### Task 1: Failing DHD grace tests

**Files:**
- Modify: `rule-engine-rs/tests/rule_1001_tests.rs`
- Test: same file

- [ ] **Step 1: Add tests** (mirror FLY→DO clock cases)

Add after existing `fly_do_2015_grace_*` tests:

1. `dhd_do_2015_grace_assignment_dhd_0059_allows` — Before group `GRD`, assignment `DHD`, release 00:59 YEG → empty violations with `do_grace(60)`.
2. `dhd_do_2015_grace_group_dhd_0059_allows` — Before group `DHD`, assignment something else (e.g. `DH`) or `DHD`, release 00:59 → empty.
3. `dhd_do_2015_grace_0100_still_overlap` — Before `DHD`/`DHD`, release 01:00 → one violation.

Reuse `roster_with_offset`, `fly_do_rule`, `do_grace`, `YEG`, `t(...)` helpers already in the file.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd rule-engine-rs && cargo test --test rule_1001_tests dhd_do_2015_grace -- --nocapture
```

Expected: the two “allows” cases fail (still report overlap).

---

### Task 2: Kernel predicate

**Files:**
- Modify: `rule-engine-rs/src/lib.rs` (~3714)

- [ ] **Step 1: Expand Before check**

```rust
let before_ok = before.assignment_group == "FLY"
    || before.assignment == "FLY"
    || before.assignment_group == "DHD"
    || before.assignment == "DHD";
if !before_ok {
    return false;
}
```

Update the function doc comment to say FLY|DHD → filtered After.

- [ ] **Step 2: Run tests — expect PASS**

```bash
cd rule-engine-rs && cargo test --test rule_1001_tests
```

Expected: all pass, including new DHD cases and existing FLY grace / SBY no-grace.

---

### Task 3: Help copy

**Files:**
- Modify: `gantt/src/components/help/topics/legality/_rule-doc.tsx` (1001 overview paragraph)

- [ ] **Step 1:** Change “FLY → After pairs also respect Definition rule 2015…” to “FLY / DHD → After pairs…”.

- [ ] **Step 2:** Mark spec status Approved / Implemented in the 2026-08-25 design doc.

---

### Task 4: Delivery note

- [ ] Paste `cargo test --test rule_1001_tests` PASS summary.
- [ ] Do not commit unless the user asks.
