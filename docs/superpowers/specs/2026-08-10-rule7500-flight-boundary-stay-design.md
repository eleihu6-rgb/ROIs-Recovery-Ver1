# Rule 7500 Flight-Boundary Stay Design

## Summary

Rule 7500 acclimatisation keeps using duty-level ordering and timezone
classification, but the DailyAdjustment "Stay Duration per X Hours" calculation
must measure stay time between flight boundaries:

```text
next duty first valid flight departure - previous duty last valid flight arrival
```

Only the active Rust/PBS path is in scope. Legacy C++ reference files remain
unchanged.

## Behavior

- For each duty, derive two optional flight-boundary values:
  - first valid segment departure UTC
  - last valid segment arrival UTC
- A valid segment is any positive-duration, non-marker `PairingDutySegment`.
  Existing zero-duration `CI` / `CO` markers remain excluded.
- If a duty has no valid segment, fall back to the duty start/end UTC values.
- Rule 7500 sorts and identifies duties by their duty start/end UTC values.
- Rule 7500 stay calculations use the effective flight boundaries:
  - reference at duty start: `effective_first_departure_utc - stay_start`
  - reference at duty end/rest start: `effective_last_arrival_utc - stay_start`
  - timezone-change reset: `stay_start = effective_last_arrival_utc`
- `dep_tz_min` and `arr_tz_min` remain timezone offsets only.

## Compatibility

- Existing PyO3 constructors and helper functions remain compatible when the new
  arrays are omitted.
- Other regulations keep their existing duty-boundary algorithms and fields.
- Downstream rules that consume 7500 reference timezone state may naturally
  produce different results because 7500 itself is corrected.

## Verification

- Rust unit tests cover the new flight-boundary stay calculation, fallback, and
  timezone-change reset.
- PyO3 tests cover constructor wiring and missing-array compatibility.
- PBS pairing detail tests cover duty/segment grouping, ordering, marker
  exclusion, and fallback boundary generation.
