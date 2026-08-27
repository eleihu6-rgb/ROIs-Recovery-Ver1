# Design: 7505/7507 local-midnight exclusive occupy end

**Date:** 2026-08-14  
**Status:** Approved (chat) — implement  
**Scope:** `rule-engine-rs` `count_days_off` paint / pairing span fill

## Problem

Full-day ground duties like VAC encoded as crew-base `[D 00:00, D+1 00:00)` incorrectly paint local day `D+1` in 7505/7507 DO counting when the crew offset is non-zero (e.g. YYZ). Example: scenario 740 / crew 2807 VAC `2026-09-04 04:00Z→2026-09-05 04:00Z` occupies Sep 5 so Sep 5 is not blank DO.

## Root cause

`count_days_off` backs off one second only when `roster_end % 86400 == 0` (UTC midnight). Americas local midnights are not UTC-aligned, so the exclusive-end adjustment never fires.

`count_assignment_days` (leave / 7507 fly-reserve filters) already uses:

```text
(roster_end + offset_min * 60) % 86400 == 0 → roster_end -= 1
```

## Fix

Use the same **local** midnight check in `count_days_off` for:

1. Per-activity paint
2. Pairing span fill (same buggy UTC check)

7505 and 7507 share `check_min_days_off_app` → `count_days_off`; one fix covers both.

## Tests

Unit: YYZ-style `offset_min = -240`, VAC only on local day D as `[D 00:00, D+1 00:00)` UTC, `count_blank=Y`, DO codes exclude VAC → day D+1 counts as blank DO (occupied days = only D if VAC is DO-group, or D occupied non-DO + D+1 blank).

Concrete assertion via public `check_min_days_off` / exposed count if needed.

## Non-goals

- Data rewrite of VAC end times
- Changing `count_assignment_days` (already correct)
- 7508 slack (separate rule)

## Commit

Wait for explicit user commit/push command.
