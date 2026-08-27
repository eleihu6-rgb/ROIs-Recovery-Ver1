# Rule 7503/7506 Full Parameter Forwarding

Date: 2026-07-26
Status: approved and implemented

## Goal

Forward every 7503 and 7506 parameter row from PBS `ro_input` into the
Rust/PyO3 rule-engine connector used by the PBS solver.

## Contract

The PBS adapter forwards structured rows in native PyO3 kwargs:

```python
wocl_rules = [
    ((bases, ranks, fleets, crew_teams), (wocl_start_min, wocl_end_min, max_consecutive))
]
one_checkin_rules = [
    ((bases, ranks, fleets, crew_teams), assignments)
]
```

Structured rows take precedence whenever present. Existing scalar fields
(`wocl_window`, `max_consecutive_wocl`, `one_checkin_groups`) remain only as an
internal fallback when the structured lists are empty.

`Crew Teams` is the only supported header name for new 7503 PBS input; there is
no legacy `Teams` compatibility for 7503. Non-wildcard scope must match
effective-dated Bases/Ranks/Fleets and case-insensitive Crew Teams using the
same qualification/team matching semantics already used by structured 7504.
Missing required crew-team context fails closed with a PyO3 value error.

7503 forwards WOCL start, WOCL end, and max consecutive WOCLs. 7506 forwards
Assignments, including multiple assignment values, against pairing assignment
codes for structured rows while preserving the existing scalar group-based
fallback. Each parameter row is evaluated independently.

## Source Handling

PBS builder already forwards crew base/rank/fleet qualifications and Crew
Teams into PyO3. Wildcard rows remain valid without matching qualification/team
records; non-wildcard scopes never broaden to wildcard.

## Verification

Focused PBS adapter tests cover parsing and forwarding. Focused PyO3 tests
cover structured precedence, qualification/team matching, missing crew-team
context, and structured 7506 assignment-code semantics. No Live, standalone
checker, schema, or violation persistence changes are in scope.
