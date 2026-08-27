# Design: Rule 2015 Assignments / Assignment Groups filters (1001 only)

**Status:** Approved for implementation  
**Date:** 2026-08-19  
**Related:** [`2026-08-16-rule-2015-do-start-time-design.md`](2026-08-16-rule-2015-do-start-time-design.md), [`2026-08-19-rule-1001-2015-fly-do-grace-design.md`](2026-08-19-rule-1001-2015-fly-do-grace-design.md)

## Problem

Rule **1001** FLY→DO grace reads rule **2015** DO Start Time but hardcodes After as `assignment_group == "DO" || assignment == "DO"`. Live ground DO is stored as **GRD/DO**. Product needs configurable filters on 2015 instead of hardcoded DO.

## Solution

Extend rule **2015** param table with two optional multi-select columns. **Only 1001** consumes them; **7505/7507** continue to use DO Start Time minutes only (unchanged).

### Param table (single row)

| DO Start Time | Assignments | Assignment Groups |
|---|---|---|
| `01:00` | `DO` | `DO` |

- Multi-value: `|` separator (e.g. `DO|GDO`).
- `*` tokens are **ignored** (not added to the match list).

### Filter semantics (1001 grace only)

- **Before** unchanged: `assignment_group == "FLY"` or `assignment == "FLY"`.
- **After** hits when `after.assignment_group` ∈ **Assignment Groups** **or** `after.assignment` ∈ **Assignments** (OR across columns; empty column does not contribute).
- Grace time predicate unchanged: Duty Release local TOD strictly before DO Start → skip 1001 for that pair.

### Empty / wildcard → no 1001 grace

When **both** parsed lists are empty (column blank **or** only `*` tokens):

- 1001 treats DO Start as **`00:00`** (grace off), even if DO Start Time is configured.
- Applies when: both columns empty, both `*`, or any mix that leaves both lists empty after parse.

### F8 seed / migration

Update `rule.param_json` for `2015001`:

```json
{"tables": [{"header": ["DO Start Time", "Assignments", "Assignment Groups"], "rows": [["01:00", "DO", "DO"]]}]}
```

Legacy row `["01:00"]` only → both filter lists empty → **1001 grace off** until migration runs.

## Surfaces

| Surface | Change |
|---------|--------|
| Rust kernel | `DoStartGrace1001 { do_start_min, assignments, groups }`; replace hardcoded DO in `fly_do_2015_grace_applies` |
| `check-1001` | `--do-start-assignments`, `--do-start-groups` (pipe-separated) |
| Live / Scenario | `doStartGrace1001(ctx)` in `legality-recheck-core.mjs` |
| PyO3 / PBS | `set_next_engine_extras(do_start_assignments=..., do_start_groups=...)` |
| 7505 / 7507 | **No change** to filter columns |

## Non-goals

- No change to 1001 param rows.
- No UI work beyond existing rule table editor (new headers in param_json).
- No grace for non-FLY Before.

## Verification

- FLY→GRD/DO, filters `DO|DO`, release 00:59 local → no 1001.
- Both filter columns empty or `*` → 1001 with `do_start_min=0` args (grace off).
- FLY→VAC with filters populated → still 1001.
- Release 04:40 local vs DO Start 01:00 → still 1001.
- 7505 bin args unchanged (only `--do-start-min`).
