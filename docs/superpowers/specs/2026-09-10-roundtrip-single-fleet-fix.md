# Roundtrip single-fleet fix

The ADD September 28-30 All fleets UI search proposes mixed 738/7M8 rotations.
The chooser indexes connections by airline and airport only, and chain validation
checks selected-scope membership without requiring one fleet per rotation.

Keep connections and packed base turns grouped by airline, exact fleet and station.
Reject missing or mixed fleet codes in chain validation, including all-fleet and
explicit multi-fleet scopes. Preserve existing timing, rest and coverage behavior.
Filtering invalid rotations only at the end would lose usable same-fleet alternatives;
grouping before search avoids that loss and avoids exploring cross-fleet candidates.

Verification: focused chooser regression cases for mixed base turns, outstation
connections, next-day returns and direct validation; existing roundtrip service/route
tests; real public UI Search for ADD, 2026-09-28 through 2026-09-30,
UTC, All fleets, CA 2 / FO 2, with versioned screenshot and per-rotation fleet checks.
Search validation does not create pairings.

Authorization: Ryan requested the application fix and instructed continuing until
Playwright passes after the proposed exact-fleet chooser fix was stated.
