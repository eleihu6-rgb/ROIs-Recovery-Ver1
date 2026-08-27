# Design: Rule 1001 FLY→DO respects Rule 2015 DO Start

**Status:** Approved for implementation  
**Date:** 2026-08-19  
**Related:** [`2026-08-16-rule-2015-do-start-time-design.md`](2026-08-16-rule-2015-do-start-time-design.md), [`2026-08-19-rule-2015-assignment-filters-design.md`](2026-08-19-rule-2015-assignment-filters-design.md)

## Problem

Rule **1001** (Assignment Overlap) treats a FLY duty ending shortly after local midnight as overlapping a same-day **DO** when Rest Before=Y uses duty end or Rest Before=N uses rest end. F8 product semantics (aligned with **7505** rule **2015** DO Start) allow FLY→DO when **Duty Release** is strictly before the configured DO Start time — the pair is legal even if rest extends into the DO calendar day.

## Solution

Extend the shared Rust kernel `check_assignment_overlap` to apply the same **2015 DO Start grace** as `apply_do_start_occupy_end` (already used by 7505/7507). No new 1001 parameter rows.

### Scope

| Surface | Wiring |
|---------|--------|
| Live / Scenario | `legality-recheck-core` `rule1001` → `check-1001` `--do-start-min` + A-row `offset_min` |
| PBS / PyO3 | `Engine.do_start_min` + `crew_offset_min` on overlap rosters |
| Recheck deps | Editing **2015** → recompute **7505**, **7507**, and **1001** |

### Pair filter (only this case)

- **Before:** `assignment_group` or `assignment` in `{FLY, DHD}` (hardcoded; DHD added 2026-08-25 — see [`2026-08-25-rule-1001-2015-dhd-before-grace-design.md`](2026-08-25-rule-1001-2015-dhd-before-grace-design.md)).
- **After:** must match rule **2015** **Assignments** (`assignment` code) and/or **Assignment Groups** (`assignment_group`). Both filter columns empty or only `*` → 1001 grace off. Replaces hardcoded DO.
- **Not in scope:** SBY→DO, FLY→L\|O, FLY→FLY, RES→DO, etc.

### Completion time & clock

- Compare **Duty Release** (`end_duty_utc`) — same as 7505 occupy end and 1001 Rest Before=Y window anchor.
- **Home-base local** via `offset_min` on each roster row (Live: `crewOffsets()`; PBS: `crew_offset_min`).

### Grace predicate

When `do_start_min > 0` (parsed from rule **2015**):

```
apply_do_start_occupy_end(before.end_duty_utc, before.offset_min, do_start_min) != before.end_duty_utc
```

→ the **entire FLY–DO pair is not a 1001 violation**, even when Rest Before=N and rest overlaps the DO duty.

Strict inequality: local TOD `00:59` with DO Start `01:00` is legal; `01:00` is still overlap.

When **2015** is missing or unparsable (`do_start_min = 0`), 1001 behavior is **byte-identical** to today.

## Kernel change (single source)

File: `rule-engine-rs/src/lib.rs`

1. `apply_do_start_occupy_end` → `pub` (shared with 7505 paint path, unchanged logic).
2. `AssignmentOverlapRoster.offset_min: i64` (default 0 in tests; Live/PBS must supply real base offset).
3. `check_assignment_overlap(..., do_start_min: i64)` — after time-overlap detection, before blacklist: FLY→DO grace → `continue`.

## Non-goals

- No 1001 param-table or seed changes.
- No grace for non-FLY Before or non-DO After.
- No change to overlap window math for non-grace pairs.

## Verification

- Rust: FLY release local 00:59 vs DO @ 00:00 → no 1001; 01:00 → 1001; `do_start_min=0` unchanged; SBY→DO still 1001; FLY→L\|O no grace.
- Live: `rule1001` passes `--do-start-min`; A rows include `offset_min`.
- PyO3: `check_line` with `do_start_min=60` mirrors Rust cases.
- `RULE_RECHECK_DEPS['2015']` includes `'1001'`.
