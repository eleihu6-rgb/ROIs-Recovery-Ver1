# Rule 8002 Full Parameter Forwarding Design

Date: 2026-07-26
Status: pending written-spec review

## Goal

Rule 8002 must follow the same parameter-forwarding discipline as rules 7501,
7504, and 7505 across PBS solver, Live legality, and Scenario legality.

For the currently supported Rust 8002 types (`BH`, `DP`, `FT`, `CH`), every
8002 parameter column that affects supported behavior must reach the Rust rule
path with the crew and roster-period context needed to make the parameter
effective.

## Confirmed Scope

In scope:

- `Bases`
- `Ranks`
- `Fleets`
- `Crew Teams`
- `Period`
- `Unit`, including `RP`
- `Prorated` / `CHECK_LAST_DAY`, read and forwarded or preserved as metadata,
  but not used in calculation
- `Max Limits`
- `Min Limits`
- `Type`, limited to `BH`, `DP`, `FT`, `CH`
- `INT OPERATION BLH`
- `AUG OPERATION BLH`
- `DUTY ALOT TIME`
- `HAS SBY OR FLY(Y/N)`
- `REDUCTION PER DUTY` and existing DP reduction aliases

Out of scope:

- Implementing unsupported C++ 8002 types such as `WP`, `TOTAL WP`, `PFT`,
  `FDP`, `DP-NON-RB-PNC`, `PH`, `DP-SBY-PNC`,
  `DP-WITHOUT-SBY-PNC`, or `COSMIC`.
- Changing 8002 metric generation in manday upstream jobs.
- Changing the 8002 violation aggregation policy in Live/Scenario.

Unsupported `Type` rows continue to warn/drop explicitly.

## Current Problems

### Crew Teams

Live/Scenario reads the 8002 row's `Crew Teams` value into the `U` line, but it
does not send crew-team membership to `check-8002-full`. The code currently logs
that a non-wildcard `Crew Teams` row can never fire.

PBS extracts `Crew Teams` into `cum_rules` and also passes `crew_teams` into the
PyO3 Engine, but `check_8002_full()` currently constructs `team_q` as an empty
vector. A non-wildcard team row therefore does not match any crew.

### RP Unit

The Rust 8002 kernel already supports `Unit=RP` through roster-period windows.
PBS passes roster periods from the `RosterPeriod` ro_input section into PyO3.

Live/Scenario do not currently send roster periods to `check-8002-full`, and
the code logs that `RP` rows yield no windows.

### Prorated / CHECK_LAST_DAY

The Rust rule8002 source documents this field as inert in the C++ checker:
proration happens upstream in manday generation. PBS reads the field and warns
when it is not `Y`, but PyO3 does not expose it. Live/Scenario do not include it
in the binary input.

The target behavior is read/preserve only. No 8002 calculation branch changes
based on this field.

### Limit Integer Parsing

Live/Scenario currently parse plain numeric `Max Limits` / `Min Limits` as
hours multiplied by 60. PBS/Rust parse plain integers as minutes. F8 rows use
`HH:MM`, so this is not expected to affect current data, but it is a parity risk.

The target behavior is to keep existing parser behavior in this change and add
test coverage using `HH:MM` values. A future cleanup can normalize plain integer
semantics if product data starts using them.

## Chosen Approach

### Approach A: Reuse the existing 8002 structured contract and fill missing context

Recommended.

Keep the existing `check-8002-full` input shape:

- `C`: checked window and week-start config
- `U`: one 8002 rule row
- `Q`: crew qualification entries
- `M`: daily metrics
- `P`: roster-period windows

Use `Q` with dimension `T` for crew teams, because the binary and Rust
`QualEntry` model already support `B/R/F/T` qualification arrays. Optionally
accept `T crew team` as a CLI alias for consistency with 7501/7504/7505, but
the production Live/Scenario path can use `Q T` without changing the core
contract.

Benefits:

- Smallest real change; Rust `check_max_cumulative_row()` already has team and
  RP hooks.
- PBS and Live/Scenario stay on the same Rust semantics.
- No new algorithm is introduced.

Cost:

- Live/Scenario need a new `source.rosterPeriods()` accessor.
- PyO3 8002 must convert `self.crew_teams` into open-ended team `QualEntry`
  values.

### Approach B: Create a new 8002 `T` line contract and replace `Q T`

This is rejected for the first pass. It duplicates existing `Q` semantics and
increases the number of contracts to maintain. A `T` alias is acceptable as a
compatibility nicety, but not required for production correctness.

### Approach C: Continue warning on Crew Teams and RP

Rejected. It does not satisfy the requirement that 8002 follow the full
parameter-forwarding model used by 7501/7504/7505.

## Target Data Flow

### Live/Scenario

`rule8002()` in `live-server/scripts/legality-recheck-core.mjs` will:

1. Read every supported 8002 parameter row.
2. Build `U` lines with all existing fields, including `Crew Teams`.
3. If any row has non-wildcard `Bases`, `Ranks`, or `Fleets`, require
   `source.crewQualEntries()` and emit matching `Q B/R/F` rows.
4. If any row has non-wildcard `Crew Teams`, require `source.crewTeams()` and
   emit open-ended `Q T` rows for each crew/team membership.
5. If any row uses `Unit=RP`, require `source.rosterPeriods()` and emit `P`
   rows to `check-8002-full`.
6. Continue emitting `M` daily metrics and the existing `C` checked-window line.

When required source data is missing, row handling follows the existing
Live/Scenario pattern:

- Missing qualification data for a gated row logs and skips that row.
- Missing crew-team data for a gated row logs and skips that row.
- Missing roster-period data for an `RP` row logs and skips that row.

The implementation must not broaden a gated row to wildcard because context is
missing.

### Live Source Accessors

Add `rosterPeriods()` to the Live source object. It reads `roster_period` rows
that overlap the checked recheck range, plus enough surrounding rows to cover
`Period > 1` RP windows.

Return shape:

```text
[{ start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }]
```

The `P` line uses day ordinals derived from those date strings:

```text
P <TAB> rp_start_ord <TAB> rp_end_ord
```

This matches the existing `check-8002-full` contract.

### Scenario Source Accessors

Add `rosterPeriods()` to both scenario legality source paths. Use the same
live-schema `roster_period` source for period definitions, because scenario
rosters are checked against the airline's roster-period calendar.

Scenario data rows remain scenario-scoped only for roster activity and manday
metrics. Roster period definitions are shared reference data.

### PBS Solver

PBS already passes `roster_periods` to PyO3 from the `RosterPeriod` ro_input
section. Keep that path.

Update PyO3 `check_8002_full()` so:

- `base_q`, `rank_q`, and `fleet_q` remain effective-dated qualification rows.
- `team_q` is built from `self.crew_teams[crew_idx]` as open-ended `QualEntry`
  rows spanning all checked windows.
- The existing warning that says no crew-team data exists is removed or only
  emitted when a non-wildcard team row exists and `crew_teams` is absent.

This makes PBS `cum_rules` `Crew Teams` filters effective without changing the
Python `cum_rules` tuple shape.

### Prorated / CHECK_LAST_DAY

The field must be read from 8002 row headers in both PBS and Live/Scenario.
It is not used by the Rust calculator.

Implementation options:

- PBS: keep the existing read and warning behavior, but clarify tests that it
  is intentionally read-only.
- Live/Scenario: read the column into local row metadata for test visibility;
  do not add a calculation input unless a future Rust API needs it.

The acceptance condition is explicit: changing `Prorated` alone must not change
8002 output.

## Rust Contract

`CumRule8002` already contains:

- `bases`
- `ranks`
- `fleets`
- `teams`
- `period`
- `unit`
- `max_min`
- `min_min`
- `rtype`
- `int_oper_band`
- `aug_oper_band`
- `duty_aloft_band`
- `has_sby_or_fly`
- `reduction_min_per_duty`

No new calculation field is required for the approved scope.

`check-8002-full` already accepts:

- `Q crew B|R|F|T value eff_day exp_day`
- `P rp_start_day rp_end_day`

The production implementation should use those existing hooks. If a `T`
line alias is added, it must be converted to the same internal `QualEntry`
dimension as `Q ... T ...`.

## Testing

### Rust CLI

Add or update `check-8002-full` tests to prove:

- A non-wildcard team rule fires for a crew with matching `Q T`.
- The same rule does not fire for a crew without matching `Q T`.
- `Unit=RP` emits a violation when a `P` roster-period row defines the window.
- `Unit=RP` emits no windows when no `P` row is present.

### PyO3 / PBS

Add or update tests to prove:

- `rule_params.py` keeps `Crew Teams` in 8002 `cum_rules`.
- `Engine` 8002 team filtering uses `crew_teams` for matching crew and skips
  nonmatching crew.
- `Unit=RP` continues to use `roster_periods`.
- `Prorated` is read but does not affect output.

### Live-Server

Add or update tests to prove:

- `rule8002()` emits `Q T` rows when `Crew Teams` is non-wildcard.
- Missing `source.crewTeams()` skips non-wildcard team rows before invoking the
  binary.
- `rule8002()` emits `P` rows when any row has `Unit=RP`.
- Missing `source.rosterPeriods()` skips `RP` rows before invoking the binary.
- Existing wildcard 8002 rows still run without requiring crew teams or roster
  periods.

## Acceptance Criteria

- PBS solver, Live legality, and Scenario legality all enforce 8002
  `Crew Teams` for supported `BH/DP/FT/CH` rows.
- Live/Scenario `Unit=RP` rows use roster-period windows like PBS solver.
- `Prorated` / `CHECK_LAST_DAY` is read intentionally but remains calculation
  inert.
- Unsupported 8002 C++ types still warn/drop explicitly.
- Focused Rust, PyO3/PBS, and live-server tests pass.

## Non-Goals

- Do not implement unsupported 8002 C++ types.
- Do not change manday generation.
- Do not change persisted violation schema.
- Do not change the existing Live/Scenario “worst window per crew x row”
  aggregation behavior.
