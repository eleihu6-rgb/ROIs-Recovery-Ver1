# Rule 7504/7505 Shared Crew Teams Helper Design

## Summary

Rule 7504 and Rule 7505 structured PyO3 adapter rows must use the same `Crew Teams` scope semantics. The parser keeps legacy `Teams` compatibility where rule input headers still use the old name. A shared helper will decide whether a rule row applies to the current crew based only on crew-team scope.

## Behavior

- Empty `Crew Teams` applies to all crews.
- `Crew Teams` containing `*` applies to all crews.
- Explicit team values match case-insensitively against `crew_teams[crew_idx]`.
- Explicit team values without `crew_teams` context raise `ValueError` with the calling rule code in the message.
- The helper only handles crew-team scope; base, rank, fleet, attributes, and WOCL/day-off calculations remain in their existing rule-specific functions.

## Scope

- Add a small private helper in `rule-engine-rs/py/src/lib.rs`.
- Update 7504 `wocl_scope_matches` to use the helper.
- Keep 7505 `days_off_scope_matches` behavior equivalent by using the same helper.
- Add focused 7504 PyO3 regression tests for matching, non-matching, wildcard/empty scope, and missing context.

## Verification

- Run the 7504/WOCL PyO3 test file.
- Run the existing 7505 PyO3 test file to verify no regression.
- Rebuild/install the PyO3 extension before Python tests.
- Run Rust 7504/7505 focused tests and `cargo fmt --check`.
