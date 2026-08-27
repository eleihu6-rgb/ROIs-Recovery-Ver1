# Rule 7504 Full Parameter Forwarding

Date: 2026-07-24
Status: approved design, pending written-spec review

## Goal

When PBS optimization runs through `pbs-engine` and the Rust legality engine, rule
`7504/001` must receive and enforce its complete 15-column parameter row instead
of reducing the rule to a single `Min Period` value.

The implementation must support the current F8 rule data, including the existing
`7504/001` row:

| Column | Value |
|---|---|
| Prev Assignment Groups | `*` |
| Next Assignment Groups | `*` |
| Prev/Next Assignments | `FLY` |
| Prev/Next Attributes | `WOCL` |
| Apply Prelabelled Attributes | `N` |
| Utilize Post Rest | `Y` |
| Bases | `*` |
| Ranks | `*` |
| Fleets | `*` |
| Crew Teams | `*` |
| Level | `D` |
| Min Period | `55` |
| Unit | `RH` |
| WOCL Window | sourced from rule 7503 |
| Max Consecutive WOCL | sourced from rule 7503 |

The last two values are derived inputs required by the current 7504 algorithm.
They remain part of the structured Rust-side rule configuration even though
their database source is rule 7503.

## Current Problem

The PBS Rust path currently extracts only `Min Period` from rule 7504 and sends
it as `wocl_spacing_hours`. Other behavior is hardcoded in Rust:

- previous and next assignments are assumed to be `FLY`;
- previous and next attributes are assumed to be `WOCL`;
- prelabelled-attribute and post-rest switches are not configurable;
- base, rank, fleet, team, assignment-group, level, and unit filters are not
  applied from the 7504 row;
- the Rust `Unit=CD` implementation exists but is not wired to PBS optimization.

This means a future or changed 7504 parameter row can be silently ignored by
PBS optimization even when it is correctly stored in the ruleset.

## Chosen Approach

### Option A: Structured full-row forwarding, recommended

Parse every 7504 parameter row in `pbs-engine`, serialize the rows as a
structured PyO3 argument, and let Rust match each row against the candidate
duty context before applying its RH or CD spacing rule.

Benefits:

- preserves the source rule structure and avoids lossy positional arguments;
- supports multiple 7504 rows and row-specific filters;
- keeps parameter ownership in the ruleset data rather than hardcoding F8
  behavior in the solver;
- allows Rust to share the same row model for RH and CD.

Cost:

- requires a Python parser/boundary change, a PyO3 contract change, and Rust
  matching logic;
- requires explicit handling for context fields that are not currently
  available to the solver.

### Option B: Add all columns as independent scalar arguments

Add one PyO3 argument per column and pass a single active row.

This is rejected because it cannot represent multiple rule rows without
growing the API again, makes argument ordering fragile, and obscures the
relationship between values belonging to one database row.

### Option C: Continue hardcoding semantics and only forward unused metadata

Forward the 15 columns for observability but leave the existing Rust checks
unchanged.

This is rejected because it would make the parameter pass-through cosmetic and
would not satisfy dynamic enforcement.

## Data Flow

The runtime flow will be:

1. `pbs-engine` loads the ruleset parameter rows for 7504 and the 7503-derived
   WOCL values.
2. `rule_params.py` parses each 7504 row into a typed, normalized mapping.
3. `engine_builder.py` includes the list under a new structured PyO3 field,
   `wocl_spacing_rules`.
4. The PyO3 boundary validates and converts each mapping into a Rust rule-row
   value.
5. The Rust 7504 implementation evaluates rows in order:
   - select rows whose filters match the current crew/duty context;
   - apply the matching row's assignment, attribute, switch, level, min-period,
     and unit semantics;
   - report a violation when the selected RH or CD threshold is not met.
6. If `wocl_spacing_rules` is absent or empty, Rust uses the existing
   `wocl_spacing_hours` behavior as a compatibility fallback.

The fallback is transitional compatibility only. New PBS-generated requests
must send the structured list.

## Parameter Contract

Each structured 7504 row will contain normalized values for:

- previous and next assignment groups;
- previous and next assignments;
- previous and next attributes;
- `apply_prelabelled_attributes`;
- `utilize_post_rest`;
- bases;
- ranks;
- fleets;
- teams;
- level (`D` or `P`);
- minimum period;
- unit (`RH` or `CD`);
- WOCL window start/end;
- maximum consecutive WOCL.

Wildcard values such as `*` will be represented by the existing normalized
wildcard convention used by the ruleset parser. Multi-value fields will be
represented as collections, not comma-delimited strings at the Rust matching
layer.

Unknown or unsupported units must not be silently interpreted as RH. The row is
ignored with an explicit validation error at the Python/PyO3 boundary, or the
request is rejected according to the existing rule-parameter error contract.

## Matching Semantics

### Scope filters

The following fields are row filters. A wildcard matches any value; a
non-wildcard value must match the candidate context:

- base;
- rank;
- fleet;
- team;
- previous assignment group;
- next assignment group;
- previous assignment;
- next assignment;
- previous attribute;
- next attribute.

If a row specifies a non-wildcard team but the candidate context does not
contain a crew-team value, the request must fail explicitly rather than
silently treating the missing value as a wildcard.

### Attribute switches

`Apply Prelabelled Attributes` controls whether prelabelled attributes are
eligible for the row's attribute matching. `Utilize Post Rest` controls whether
the post-rest boundary is used when computing the next-duty gap and context.
The two switches are independent and must be preserved exactly from the source
row.

### Level

Level `D` applies the duty-level check. Level `P` applies the pairing-level
variant supported by the existing Rust rule context. Any other level is
invalid and must be rejected during parameter conversion.

### Unit RH

RH retains the current hour-based threshold:

```text
violate when gap_end < gap_start + min_period * 3600 seconds
```

The existing RH behavior must remain unchanged for the current `7504/001`
configuration.

### Unit CD

CD uses the existing Rust calendar-day kernel:

```text
violate when
gap_end < local_day_start(gap_start, crew_base_offset)
          + 1 day
          + min_period * 1 day
```

The crew-base offset is the same offset source used for WOCL classification.
The known difference from the legacy C++ airport-offset implementation remains
documented and is outside this change.

## Error Handling

- Missing structured rows use the legacy scalar fallback.
- Malformed row shape, invalid enum values, invalid numeric values, or
  unsupported units fail at the Python/PyO3 boundary with an actionable error.
- Missing required context for a non-wildcard row filter is an explicit error;
  it must never broaden the rule to a wildcard match.
- A valid row that matches no candidate context produces no 7504 violation.
- Multiple matching rows are evaluated according to the existing rule ordering
  and violation aggregation behavior. The implementation must not silently
  discard later rows.

## Compatibility and Non-Goals

### Compatibility

- Preserve the existing `wocl_spacing_hours` PyO3 field as a fallback for older
  callers.
- Preserve current RH behavior for `7504/001`.
- Preserve existing rule message and violation aggregation contracts unless a
  row-specific unit requires the already-defined RH/CD message distinction.

### Non-goals

- No database schema change.
- No change to rule 7503 storage or semantics.
- No rewrite of unrelated legality rules.
- No change to the legacy `ro-engine` or `po-engine` paths.
- No speculative configuration flag, cache, retry mechanism, or new service.
- No attempt to remove the compatibility scalar in this change.

## Implementation Areas

### `pbs-engine`

- Extend `ColumnModelSolver_python/rules/rust/rule_params.py` to parse all 7504
  columns and attach the 7503-derived WOCL values.
- Extend `ColumnModelSolver_python/rules/rust/engine_builder.py` to pass the
  structured list through the existing Rust request construction.
- Add focused parser and request-boundary tests covering the exact `7504/001`
  row and multiple rows.

### `rule-engine-rs`

- Add a Rust representation for one normalized 7504 row.
- Extend the PyO3 input conversion in `py/src/lib.rs`.
- Update the 7504 call path to prefer structured rows and retain scalar
  fallback.
- Replace hardcoded 7504 filters/switches with row matching.
- Wire RH and CD selection to the existing RH and CD kernels.
- Add behavioral tests for filters, switches, levels, RH, CD, wildcard handling,
  missing-team context, and scalar fallback.

### Documentation and test cases

- Add or update the PBS manual test case documentation under
  `docs/test-cases/pbs/` for verifying that a changed 7504 parameter affects a
  PBS optimization run.
- Do not include credentials, connection strings, or runtime secrets.

## Verification Strategy

The implementation is complete only when all of the following are demonstrated:

1. A parser test proves all 15 source columns are present in the structured
   request for `7504/001`.
2. A Python boundary test proves the structured field is included in the
   request sent to the Rust connector.
3. Rust tests prove:
   - current `7504/001` RH behavior remains equivalent;
   - a changed `Min Period` changes the result;
   - assignment, attribute, base, rank, fleet, team, and assignment-group
     filters are enforced;
   - prelabelled and post-rest switches are enforced;
   - level D/P selection is enforced;
   - RH and CD select their correct kernels;
   - malformed rows and missing required team context fail explicitly;
   - the legacy scalar fallback remains functional.
4. `pbs-engine` focused tests pass.
5. `rule-engine-rs` focused Rust tests and build pass.
6. GitNexus impact analysis is run before editing changed symbols, and
   `detect_changes()` is run before any implementation commit.
7. The final response lists exact commands and PASS/FAIL results, including any
   required manual PBS test that could not be executed locally.

## Acceptance Criteria

- Every PBS Rust optimization request generated from a 7504 ruleset includes
  the structured full parameter rows.
- Rust no longer relies on hardcoded 7504 filter values when structured rows
  are present.
- `7504/001` with `FLY`, `WOCL`, `N`, `Y`, `D`, `55`, and `RH` behaves as it did
  before this change.
- A valid `Unit=CD` row reaches and uses the existing CD kernel during PBS
  optimization.
- No missing contextual value is silently converted into a wildcard match.
- Existing callers that provide only `wocl_spacing_hours` continue to work.
- Focused automated tests and required manual verification are documented with
  exact results.
