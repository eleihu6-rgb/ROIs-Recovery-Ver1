# Rule 1001 — parameter rows as prohibitions (2026-07-23)

> Addendum to [2026-07-08-assignment-overlap-rule-1001-design.md](./2026-07-08-assignment-overlap-rule-1001-design.md)
> and [2026-07-23-rule-1001-invert-rest-before-design.md](./2026-07-23-rule-1001-invert-rest-before-design.md).

## Decision

Parameter rows are a **blacklist** gated by Rest Before window, with **fail-closed** when the row list is empty or no row’s filters match.

| Condition | Result |
|-----------|--------|
| `overlap_rules` empty | **1001** (every detected time overlap) |
| No row matches Before/After filters | **1001** |
| ≥1 filter-matching row, and **any** of those has Rest-Before window ∩ After duty | **1001** |
| ≥1 filter-matching row, and **none** of those windows intersect After duty | **Allow** |

Rest Before mapping (unchanged from earlier today):

| Rest Before | Before window end |
|-------------|-------------------|
| **Y** | `duty_end` |
| **N** | `rest_end` |

## Product consequence for default FLY/SBY → DO / L\|O

To **allow** rest-only overlaps into DO/leave while still alarming on duty∩duty:

- Default rows use **Rest Before=Y** (duty window only).
- Rest-only into DO: filters match, duty window does not intersect → **Allow**.
- Duty into DO: filters match, duty window intersects → **1001**.

Default seed / DB cells are **Y** (not N).

## Kernel

```text
detect actual overlap (Before duty+rest vs After duty)
if rules empty → violate
else if no filter-matching row → violate
else if any matching row’s Rest-Before window intersects After duty → violate
else → allow
```
