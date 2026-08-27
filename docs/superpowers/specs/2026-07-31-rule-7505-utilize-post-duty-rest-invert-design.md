# Design: Fix 7505/7507 `Utilize Post Duty Rest` (align with C++ 8023)

## Problem

Rust `count_days_off` / `count_assignment_days` treat `count_post_rest=Y` as “occupy through post-duty rest end”. C++ rule 8023 / 7505 do the opposite (counterintuitive naming, same as 8056).

## C++ source of truth

Pairing fields (`CrewDataContext`):

- `actRestStrUtc` = duty/pairing end (rest **starts**)
- `actEndUtc` = end **including** post-duty rest

Coverage end in `howManyDaysOffInRanges`:

```text
rosterEnd = bCountPostRest ? actRestStrUtc : actEndUtc
```

| Param | Occupancy end | Effect on DO |
|-------|---------------|--------------|
| **Y** | duty end | rest days can count as blank/DO |
| **N** | including rest | rest paints over days → fewer DO |

## Live / PyO3 field mapping (unchanged)

`Activity7505`:

- `end_utc` ← duty end (`end_duty` / `e`) ≡ C++ `actRestStrUtc`
- `rest_start_utc` ← end including rest (`end_rest` / column 6) ≡ C++ `actEndUtc`  
  (field name is misleading; do not rename in this fix)

## Fix

Select occupancy end like C++ / 8056:

```text
roster_end = count_post_rest ? end_utc : rest_start_utc
```

Apply in `count_days_off`, `count_assignment_days`, optimizer PA window check, and matching skip predicates. Extract a small helper to avoid re-inverting.

Update comments + add/adjust unit tests so Y uses duty end.

## Out of scope

- Renaming `rest_start_utc`
- Changing Live CLI column order
- Rule 8056 (already correct)
