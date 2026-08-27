# Rule 7509 Avoid Co-pairing Design

## Status

Approved design. Implementation and focused verification completed on August 23, 2026.

## Goal

Add legality rule 7509, `Avoid Co-pairing`, to the active F8 ruleset and enforce it consistently in:

- PBS Rust solver candidate-pairing checks.
- Live Gantt legality recheck.
- Scenario Gantt legality recheck.
- Draft legality preview where the existing focus-pairing scope is used.

The implementation must inspect every crew member on the affected physical flight and must distinguish
pre-assigned-only violations from violations created or extended by a newly assigned PBS pairing.

## Confirmed Business Semantics

### Parameters

Rule instance `7509/001` uses one parameter table with exactly these columns:

```text
Crew A | Crew B | Eff Date | Exp Date
```

Each row is an independent forbidden crew pair. Crew A and Crew B are symmetric: `A-B` and `B-A`
represent the same pair.

Crew IDs are compared as trimmed strings. Invalid rows are skipped with a diagnostic rather than
being treated as a wildcard. A self-pair (`Crew A == Crew B`) is ignored because it cannot represent
co-pairing between two crew members.

### Inclusive dates and pairing span

`Eff Date` and `Exp Date` are calendar dates and include both endpoints:

- Effective start: `Eff Date 00:00:00`.
- Effective end: `Exp Date 23:59:59`.
- Invalid or reversed ranges (`Exp Date < Eff Date`) are skipped with a diagnostic.

For each crew pairing, the applicable span is:

- The first duty report time.
- Through the last duty release time.

The pairing is in scope when the two closed intervals overlap:

```text
pairing_start <= effective_end
AND pairing_end >= effective_start
```

Therefore, a pairing touching either boundary date is in scope.

### Flight-level violation

For each in-scope pairing belonging to a crew appearing in any parameter row:

1. Select its FLY roster-flight rows.
2. Resolve the physical flight ID (`flt_id`, with the existing fallback identity rules where needed).
3. Load every roster-flight crew on each affected physical flight.
4. If a parameter row's Crew A and Crew B are both present on the same physical flight, emit a
   violation for each affected member, attributed to that member's pairing and flight.

Repeated roster rows for the same `(flight_id, crew_id)` are deduplicated before evaluating the pair.
The same physical flight may be represented by multiple pairings and must be merged at flight grain,
as in rules 8030 and 8072.

## Architecture

### Shared Rust legality kernel

Add a dedicated `rule7509` Rust module. It will not overload rule 8030's age-specific data types.
The kernel will accept normalized parameter rows and normalized flight roster members containing:

```text
flight_id
crew_id
pairing_id
pairing_start_utc
pairing_end_utc
source_is_pa
```

The kernel returns structured violations containing at least:

```text
crew_id
paired_crew_id
pairing_id
flight_id
```

The same kernel is exposed through:

- A dependency-free `check-7509` binary for Live/Scenario.
- The PyO3 `Engine` for PBS.

This keeps date-boundary, flight deduplication, pair matching, and PA filtering identical across
execution paths.

### PBS Rust Engine

The PyO3 Engine will add:

- Parsed 7509 parameter rows.
- A mutable flight-to-roster complement retaining crew index, pairing index, and PA state.
- `can_add_pairing_7509()`.
- `commit_pairing_7509()`.
- `rollback_pairing_7509()`.

The existing active-rule gate will classify `7509` as a complement check alongside `8030` and `8072`.
The general `check_line()` path will also call 7509 as a final line-level guard.

For speed, `can_add_pairing_7509()` evaluates only flights on the candidate pairing. Existing fixed
and already-committed roster members on those flights remain in the complement index.

The candidate crew is checked immediately against a fast set of crew IDs appearing in any configured
parameter row. Non-participating candidate crew return no 7509 findings without scanning the flight
complement.

### PBS PA-ONLY handling

PBS fixed roster members are PA. The candidate and solver-created committed members are non-PA.
For each candidate violation, the kernel evaluates the two contributing members:

- If both are PA, suppress the violation in `Application::Optimizer`.
- If either member is non-PA, emit the violation.

Live/Scenario use `Application::Editor` semantics and always emit the violation.

The PBS `CrewOnFlight` sidecar must retain enough information to identify the member's pairing and
source. A flight/crew-only seed is insufficient because both the effective-date pairing span and the
PA-ONLY decision depend on the pairing/member context.

## Live and Scenario Recheck

### Shared core

Register `rule7509` in `legality-recheck-core.mjs` and in the shared `RULES` list. The core will:

1. Resolve active 7509 instances from the current ruleset.
2. Normalize and validate each parameter row.
3. Ask the source adapter for normalized FLY roster-flight members and pairing report/release spans.
4. Feed all rows to `check-7509`.
5. Convert kernel output to `rule_violation` rows.

Each emitted violation will include:

- `rule_code = '7509'`.
- The active rule instance.
- A stable scope key containing the parameter row identity and normalized crew pair.
- The triggering crew and pairing.
- The physical flight ID.
- The flight/pairing time window in `start_dt` and `end_dt`.
- A message naming Crew A, Crew B, and the affected flight.

Severity is taken from `rule.severity` by the existing ruleset severity overlay. The implementation
will not hardcode UI severity.

### Source adapters

Add an `avoidCoPairing()` source contract and implement it in:

- Live source.
- Scenario source.
- Seed/preview source.

The query shape will first identify FLY pairings whose report/release span overlaps the selected RP,
then identify their physical flights, and finally load all roster-flight members for those flights.
Scenario source follows the existing 8030 pattern: scenario roster data is authoritative where
available, and live mates are added when the same physical flight requires them for a complete
complement.

Full Live/Scenario rechecks cover all pairings relevant to the selected RP. Draft preview may retain
the existing `focusPairingIds` optimization: start from focused pairings, then expand to all crew on
their affected physical flights.

`ONLY_CODES=7509` must be supported for scoped parameter rechecks without recomputing unrelated rules.

## Database Provisioning

### Rule definition

Add `7509/001` with:

- `rule_id = 7509001`.
- Description `Avoid Co-pairing`.
- `param_json` table header `Crew A`, `Crew B`, `Eff Date`, `Exp Date`.
- Existing F8 regular-rule catalog conventions for class, category, source, and severity.

### Seed and migration

- Update the canonical fresh-install rule seed so the rule definition and ruleset memberships are
  available to the F8 rule catalogs.
- Add an idempotent migration for deployed databases that maps `7509001` into active workset 103.
- Do not change roster, pairing, flight, or rule-violation table schemas.

## Testing and Verification

### Rust

Add pure-kernel tests for:

- Inclusive Eff Date and Exp Date boundaries.
- No overlap and reversed/invalid parameter ranges.
- Same physical flight across different pairings.
- All roster members being inspected.
- Duplicate `(flight, crew)` rows being deduplicated.
- Multiple independent parameter rows.
- PA-only suppression in optimizer mode.
- PA plus newly assigned member still violating.

Add Engine/PyO3 tests for:

- Parameter loading and rule gating.
- Candidate-only incremental checks.
- Fixed/committed complement state.
- Commit and rollback.
- Pairing/source sidecar preservation.

### Live/Scenario

Add legality-core tests using fake source adapters and a stub binary runner for:

- 7509 parameter parsing.
- Violation attribution and stable scope keys.
- `ONLY_CODES=7509`.
- Full complement loading behavior.

Add source SQL shape tests for Live, Scenario, and Seed adapters, including report/release bounds,
physical-flight joins, and Scenario live-mate fallback.

### UI regression

Add a Playwright test that drives the real Gantt legality workflow and asserts that a persisted 7509
violation appears in Alert Center and identifies the affected crew/flight. No new UI component or
layout is required; existing dynamic rule catalog and alert rendering are reused.

### Required command receipts

The final delivery must report exact PASS/FAIL results for the focused Rust tests, PyO3 tests,
Live/Scenario legality tests, remote PostgreSQL migration/read-only checks, and Playwright test.
If a required environment-backed test cannot run, the final report must state the blocker and
remaining risk rather than claiming completion.

## Out of Scope

- No new database columns or schema redesign.
- No new Gantt UI component or layout.
- No changes to the business meaning of 8030 or 8072.
- No speculative caching or retry layer.
- No automatic git commit or push.
