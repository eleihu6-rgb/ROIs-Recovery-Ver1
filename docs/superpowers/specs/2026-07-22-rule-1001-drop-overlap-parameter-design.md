# Rule 1001 — drop Overlap parameter (2026-07-22)

> Addendum to [2026-07-08-assignment-overlap-rule-1001-design.md](./2026-07-08-assignment-overlap-rule-1001-design.md).
> Status: Implemented with this change set.

## Change

Remove the **Overlap** column from Function `1001` / instance `001` end-to-end:

- `rule.param_json` header no longer includes `Overlap`; default rows lose the trailing cell.
- Live/Scenario `rule1001`, `check-1001` R-lines, Rust `AssignmentOverlapRule`, PyO3 `overlap_rules`, and PBS `rust_checker` no longer carry an Overlap / `bool` flag.
- There is **no** `overlap: true` shim.

## Semantics after removal

Each remaining parameter row is a **prohibition** defined by Before/After filters plus **Assignment Rest Before**:

1. Detect chronological time overlap (Before duty+rest vs After duty).
2. Empty rules → **1001**.
3. No filter-matching row → **1001**.
4. Filter match + Rest-Before window ∩ After duty → **1001**.
5. Filter match + no Rest-Before window hit → **Allow**.

Historical `Overlap=N` rows are dropped by migration so they do not become rule rows.

### Assignment Rest Before (2026-07-23)

| Value | Before window end |
|-------|-------------------|
| **Y** | `duty_end` |
| **N** | `rest_end` |

Rows are a **blacklist**: filter match + window ∩ After duty → 1001; filter match without window hit → Allow; empty / unmatched filters → fail-closed. Default seed uses **Y**. See `2026-07-23-rule-1001-prohibition-window-design.md`.

## Header (7 columns)

```text
Assignment Group Before
Assignment Before
Assignment Rest Before
Assignment Type Before
Assignment Group After
Assignment After
Assignment Type After
```
