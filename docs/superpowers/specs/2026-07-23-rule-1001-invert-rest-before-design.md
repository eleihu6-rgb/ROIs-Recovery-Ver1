# Rule 1001 — invert Assignment Rest Before mapping (2026-07-23)

> Addendum to [2026-07-08-assignment-overlap-rule-1001-design.md](./2026-07-08-assignment-overlap-rule-1001-design.md).
> See also [2026-07-23-rule-1001-prohibition-window-design.md](./2026-07-23-rule-1001-prohibition-window-design.md).

## Change

| Assignment Rest Before | Before window end |
|------------------------|-------------------|
| **Y** | `duty_end` |
| **N** | `rest_end` |

Previously Y extended through post-duty rest and N stopped at duty end.

## Default seed / DB

Under the **prohibition** model, default FLY/SBY → DO / L|O rows use **Rest Before=Y** so rest-only into DO/leave is Allowed (duty window does not hit) while duty∩duty still raises 1001.

Migration `sql/migration/2026-07-23-rule-1001-invert-rest-before.sql` sets Rest Before `N` → `Y` (idempotent).

## Kernel

`rule_window_intersects_after_duty` selects `end_duty_utc` when `rest_before` is true, else `end_including_rest_utc`.
