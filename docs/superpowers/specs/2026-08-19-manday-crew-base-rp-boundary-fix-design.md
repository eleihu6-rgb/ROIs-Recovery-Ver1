# Design: Manday Crew-Base Effective Dates and RP Window Boundaries

## Goal

Ensure Live RPCredit/RPDO and related manday metrics use the CrewBase effective at each
roster activity timestamp, and that a recompute window expressed as local calendar dates
does not lose activities near UTC midnight.

## Design

- Load the complete `crew_base` history with airport `zone_id` for the affected crews.
- Resolve a base timezone at each duty/flight timestamp, preferring an effective prime base,
  then the most recent effective base; fall back to the latest known base and finally UTC.
- Query a one-day UTC guard band around the requested date window, then filter credit/ground
  activity by the resolved CrewBase local start date.
- Include BLH/DP legs that overlap the requested local-date window, so cross-midnight tails
  contribute to the correct local daily rows.
- Keep the existing daily-to-`roster_period` aggregation unchanged; `crew_base_dt` remains
  the source date joined to `roster_period.rp_start/rp_end`.

## Verification

Add unit coverage for effective base selection, UTC-midnight local-date inclusion, and
cross-midnight BLH inclusion. Run the focused manday/zoned-time test set.
