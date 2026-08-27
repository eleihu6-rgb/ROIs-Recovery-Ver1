# Design: Rule 1001 / 2015 grace — Before also accepts DHD

**Status:** Approved / Implemented  
**Date:** 2026-08-25  
**Related:** [`2026-08-19-rule-1001-2015-fly-do-grace-design.md`](2026-08-19-rule-1001-2015-fly-do-grace-design.md)

## Problem

Rule **1001** FLY→After grace (via rule **2015** DO Start) only treats Before as fly when:

```text
assignment_group == "FLY" OR assignment == "FLY"
```

Deadhead duties often use `assignment` / `assignment_group` **DHD** and miss that gate, so a DHD release strictly before DO Start still gets a 1001 overlap against a 2015-filtered After (e.g. DO).

## Solution

Extend the hardcoded Before gate in `fly_do_2015_grace_applies` so **DHD is symmetric with FLY**:

```text
before_ok =
  assignment_group ∈ {FLY, DHD}
  OR assignment ∈ {FLY, DHD}
```

After filter, DO Start clock, empty-filter disable, and Rest Before semantics are unchanged.

### Kernel (single source)

File: `rule-engine-rs/src/lib.rs` — `fly_do_2015_grace_applies`:

```rust
let before_ok = before.assignment_group == "FLY"
    || before.assignment == "FLY"
    || before.assignment_group == "DHD"
    || before.assignment == "DHD";
```

Rename local `before_is_fly` → `before_ok` (or keep the name and expand the predicate — either is fine if comments/docs say FLY|DHD).

### Docs / Help

- Update the **Before** bullet in the 2026-08-19 fly-do grace design.
- Help 1001 (`_rule-doc.tsx`): change “FLY → After pairs also respect Definition rule 2015…” to **FLY / DHD → After**.

### Tests

Rust `rule_1001_tests` (mirror existing FLY→DO cases):

| Case | Before | Expect |
|------|--------|--------|
| release 00:59 local, DO Start 01:00 | `assignment=DHD` (group not FLY) | no 1001 |
| same clock | `assignment_group=DHD` | no 1001 |
| release at/after DO Start | `assignment=DHD` | still 1001 |
| SBY→DO | unchanged | still 1001 (no grace) |

Existing FLY→DO grace tests remain green.

## Non-goals

- No 2015 / 1001 parameter or seed changes.
- No Before parameterization (still hardcoded FLY|DHD).
- No change to 7505/7507 occupy painting.
- No other Before codes (SBY, RES, etc.).

## Verification

```bash
cargo test -p rule-engine-rs --test rule_1001_tests
```

(or the package’s equivalent test target for `rule_1001_tests`)
