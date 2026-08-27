# PBS Rule 7504 Full Parameter Forwarding

## Purpose

Verify that PBS optimization forwards the complete rule `7504` parameter row to
the in-process Rust rule engine and that changing a row value changes the
optimization legality result.

## Preconditions

- Use an F8 PBS scenario whose Rust rule checker is enabled.
- Confirm the scenario ruleset contains `7503` WOCL window data and a `7504`
  row.
- The local Rust connector must be built from the current `rule-engine-rs/py`
  source.

## Procedure

1. Record the current `7504/001` values, including:
   - assignment groups;
   - assignments;
   - attributes;
   - prelabelled-attribute switch;
   - post-rest switch;
   - bases, ranks, fleets, and teams;
   - level;
   - min period;
   - unit.
2. Run PBS optimization with the unchanged row.
3. Confirm the Rust checker starts without a 7504 parameter warning and that
   the run completes.
4. Change only `Min Period`, for example from `55` RH to `80` RH.
5. Run the same optimization input again.
6. Compare the resulting 7504 legality output. A gap that was legal at 55 RH
   and shorter than 80 RH must become a 7504 violation.
7. Repeat with `Unit=CD` and a calendar-day boundary case. Confirm the result
   uses the CD threshold rather than converting the value to elapsed hours.
8. For a non-wildcard `Teams` row, confirm that missing crew-team context
   returns an explicit Rust checker error; it must not be treated as a
   wildcard.

## Expected Results

- The generated PyO3 request contains `wocl_spacing_rules` and all 15 source
  columns.
- The current `7504/001` row continues to enforce 55 RH.
- Changing `Min Period` changes the result without changing Rust source code.
- `Unit=CD` uses calendar-day spacing.
- Non-wildcard team filters fail explicitly when source context is unavailable.

## Evidence

Record:

- scenario identifier;
- rule row values before and after the change;
- optimization run identifier;
- 7504 violation output or legality summary;
- exact connector build and test commands.

Do not record credentials, database URLs, access tokens, or personal crew data.
