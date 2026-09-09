# Rule 8004 RANK / FLEET competency extension design

## 1. Scope and current state

This change extends the existing Rule 8004 Basic Competency implementation. BASE
checking remains unchanged. The new implementation adds the `TYPE=RANK` and
`TYPE=FLEET` rows already present in the 8004 parameter table. The historical
C++ checker is used only as a behavioral reference; no C++ source is modified or
rewritten. Rust is the rule implementation and Node is the data adapter/runtime.

The active parameter shape is:

```text
Base | Rank | Fleet | Type | Enable Check | Grace Period | Unit | Assignments
```

The rule is evaluated only when the corresponding row has `Enable Check=Y`.
Rows with `Enable Check=N`, missing rows, or unknown `Type` values are skipped
with a diagnostic log and do not produce violations.

The first delivery covers the Live legality path and the Scenario legality path,
because both use the same rule core with different database adapters. PBS is not
part of this change.

## 2. Normative behavior

### 2.1 Crew scope filters

For each enabled parameter row, `Base`, `Rank`, and `Fleet` define the crew scope.
Each value is a `|`-separated list; `*`, empty, or omitted means all values.

The scope is evaluated against the crew qualification history at the relevant
roster/flight time, rather than against only the current summary fields. A crew
is in scope when all non-wildcard dimensions in the row match at least one
effective qualification record. This preserves the existing 8004 pre-filter
behavior while making historical validity explicit.

The pairing/base value used by BASE checking remains the pairing's base. It is
not replaced by `roster_flight.crew_base` or a current crew summary value.

### 2.2 Assignment filter

Only roster flights whose `assignment` matches the row's `Assignments` are
checked. Matching is case-insensitive and uses exact tokens split on `|`.
`*`, empty, or omitted means every assignment.

Ground rows (`pairing_id IS NULL` / `flt_id IS NULL`) are not checked by RANK or
FLEET. Existing BASE behavior and its ground-duty handling remain unchanged.

### 2.3 RANK check

For every matching roster flight:

1. Read the execution rank from `roster_flight.flight_acting_rank`; if it is
   blank, fall back to `roster_acting_rank`.
2. Ignore a row when the resulting rank is blank or is not a crew-operating
   rank according to the existing rank metadata (`is_crew_rank` and
   `is_must_crew_rank`).
3. Find a `crew_rank` qualification for the crew whose rank equals the roster
   rank (case-insensitive), whose effective time is on/before the roster flight
   start, and whose expiry plus grace is after the roster flight end.
4. Match the requested rank against the effective `crew_rank` record, including
   the existing historical acting/down-rank compatibility where the current
   Rust context already provides that mapping. If no compatible qualification
   covers the full checked interval, emit one violation for that roster flight.

The interval uses the flight execution interval when available, otherwise the
planned interval. This prevents a late actual update from being hidden by the
planned timestamp while still allowing incomplete operational data to be checked.

### 2.4 FLEET check

For every matching roster flight segment:

1. Read the aircraft/fleet code from `roster_flight.fleet_seg`; if absent, use
   the corresponding `pairing_segment.fleet_seg` value.
2. Skip deadhead, train-ferry, bus-ferry, and non-operating assignments using the
   assignment and segment metadata. Historical 8004 exclusions for deadhead and
   ferry segments remain reference behavior; the Rust implementation should
   apply them only when the corresponding metadata is present. The configured
   `Assignments` filter remains the primary business selector.
3. Find a `crew_fleet` qualification with the same `fleet_specific` code,
   effective on/before the flight departure and expiring after the flight
   departure, after applying grace.
4. If no qualification is valid, emit one violation for that roster flight.

The business requirement intentionally checks the qualification at flight
departure. It does not require the qualification to remain valid through
landing. This is the authoritative behavior for this extension.

### 2.5 Time selection and grace

The normalized time helper is:

```text
actual timestamp when present and valid; otherwise scheduled timestamp
```

For RANK, both normalized start and end are used. For FLEET, normalized
departure is used.

`Grace Period` is parsed as a non-negative integer. `Unit=CD` applies calendar
days, matching the existing 8004 parser (`grace_days * 24h`). The current 8004
contract has no other supported unit; an unsupported unit is logged and treated
as zero grace for backward compatibility, with a focused test protecting this
decision. Expiry is open-ended when `exp_dt` is null. Boundary semantics remain
strict at expiry (`expiry + grace > checked_time`) and inclusive at effective
time (`eff_dt <= checked_time`).

## 3. Input contract between Node and Rust

The existing BASE-only `R/Q/A` TSV is replaced by a versioned, tagged input that
can carry all three qualification dimensions without changing the public HTTP
API. The initial implementation may use the following records:

```text
R  crew_id  pairing_id  duty_seq  seg_seq  assignment  base  rank  fleet
   act_start  act_end  sch_start  sch_end  is_deadhead  is_ferry
Q  crew_id  BASE   value  eff_date  exp_date
Q  crew_id  RANK   value  eff_date  exp_date
Q  crew_id  FLEET  value  eff_date  exp_date
```

All fields are tab-separated; dates/timestamps use UTC ISO values. The Rust
binary must remain backward compatible with existing BASE-only fixtures until
the Node adapter is switched over. A malformed row is skipped and counted in the
existing diagnostic summary; it must not abort the whole legality pass.

The Rust library should expose dimension-neutral qualification primitives and a
single 8004 check entry point. The standalone `check-8004` binary remains a
thin parser/formatter around that library.

## 4. Node data loading and persistence

### 4.1 Shared rule core

`live-server/scripts/legality-recheck-core.mjs` will:

- iterate every enabled 8004 instance row instead of reading only row 0;
- parse scope, assignment, enable, grace, and unit per row;
- request normalized roster-flight rows and all three qualification sets from
  the adapter;
- invoke Rust once per rule instance (or one combined invocation when the
  parser supports row identifiers);
- map each violation back to `crew_id`, `pairing_id`, `duty_seq`, `seg_seq`, and
  the rule instance.

`live-legality.mjs` and `scenario-legality.mjs` will implement the same adapter
contract. Queries must explicitly restrict to non-deleted rows and preserve the
existing Live/Scenario date-window filters.

### 4.2 SQL shape

The roster-flight query will join `roster_flight` to `pairing_segment` only for
missing segment fleet/metadata; it will not assume a direct pairing-to-flight
foreign key. Qualification queries will read:

- `crew_base` for BASE;
- `crew_rank` plus rank metadata for RANK;
- `crew_fleet` for FLEET.

Qualification date columns use the UTC variants when populated, falling back to
the legacy columns exactly as the current BASE adapter does.

### 4.3 Violation shape and message

Keep the existing `rule_violation` persistence and severity conventions. Emit
one violation per offending roster flight (not one aggregate per pairing), with
the flight/duty span as its time range and the matching rule instance/scope key.

Messages:

```text
Crew {crewId} has no valid rank ({rank}) for the roster flight.
Crew {crewId} has no valid fleet ({fleet}) for the roster flight.
```

The exact existing prefix/parameter-row formatting helper remains in use. The
operation payload should include `Type` (rank or fleet code), `label`, and
`strType`, matching BASE so Gantt can render the same alert shape.

## 5. Rust implementation structure

1. Add typed records for a roster flight and dimension-specific qualifications.
2. Add reusable predicates:
   - `qualification_is_active(eff, exp, grace, start/end)`;
   - exact/wildcard token matching;
   - rank compatibility using the existing application/scenario context.
3. Add `check_rank_competency` and `check_fleet_competency` beside the existing
   BASE functions, then call them from the 8004 aggregate entry point.
4. Keep optimizer PA-ignore behavior and the existing BASE exemption unchanged;
   the new RANK/FLEET checks do not reuse BASE-specific logic.
5. Keep the CLI output machine-readable and deterministic, sorted by crew,
   pairing, duty, segment, then dimension.

## 6. Testing plan

### Rust unit tests

- wildcard/empty assignment matching;
- scope filtering by base/rank/fleet, including historical effective windows;
- RANK qualification valid, expired, not-yet-effective, grace-covered, and
  open-ended cases;
- FLEET qualification valid at departure, invalid at departure, and a case where
  it expires after departure but before landing (must remain valid per this
  requirement);
- actual timestamp preferred over scheduled, scheduled fallback;
- deadhead/ferry exclusion;
- malformed/legacy BASE-only TSV compatibility;
- deterministic multi-violation ordering.

### Node tests

- Live and Scenario adapters emit identical normalized fields;
- each enabled parameter row is evaluated independently;
- disabled RANK/FLEET rows produce no output;
- scope and assignment filters are passed to Rust correctly;
- persistence maps a flight-level violation to the correct pairing/duty/segment;
- regression case for a crew with no 7M8 qualification assigned a 7M8 roster
  flight, while a valid crew/fleet and wildcard row remain clean.

### Verification commands

Run the focused Rust 8004 tests and the legality-recheck Node tests first, then
the full rule-engine Rust test suite and live-server type/test checks. No service
restart or database write is part of the design phase.

## 7. Rollout and compatibility

- Existing BASE-only configurations continue to behave exactly as today.
- The seeded 8004 rows remain BASE=Y, RANK=N, FLEET=N until an operator enables
  the new dimensions.
- No schema migration is required; all required qualification fields already
  exist.
- The implementation must not load all crews' full rosters. It should retain
  the current date-windowed, adapter-scoped query behavior to protect legality
  recheck latency.

## 8. Decisions requiring confirmation before implementation

The design assumes the following product decisions:

1. RANK qualification must cover the full normalized flight interval, while
   FLEET qualification is evaluated at normalized departure only.
2. RANK uses `flight_acting_rank` with `roster_acting_rank` fallback and keeps
   existing acting/down-rank compatibility.
3. An unsupported 8004 `Unit` is logged and treated as zero grace, preserving
   backward compatibility with the current parser.
4. Violations are flight-level records, allowing the Alert Center to identify
   the exact offending roster flight.
5. `roster_flight.fleet_seg` / `pairing_segment.fleet_seg` is the business fleet
   code to compare with `crew_fleet.fleet_specific`, because `fleet_seg` is the
   segment's operating fleet code and `fleet_specific` is the crew-fleet
   qualification code. This follows the historical 8004 data model. `ac_type`
   is retained in the query for traceability but is not used for the first
   implementation.

After approval, implementation will proceed in Rust library/CLI → Live/Scenario
adapters and core → focused tests → build/type verification.
