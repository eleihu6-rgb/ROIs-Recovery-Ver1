# Rule 7504 Utilize Post Rest Semantics Fix Design

**Goal:** Correct rule 7504 so `Utilize Post Rest` matches the C++ behavior and the user-confirmed semantics: `Y` measures from duty end, `N` measures from end including rest.

## Background

Rule 7504 checks the minimum spacing between consecutive WOCL duties. The Rust port already mirrors the WOCL classification, ordering, scope, and RH/CD paths. The remaining mismatch is the start point used for the spacing gap when `utilize_post_rest` is enabled.

The current Rust implementation selects the wrong boundary for `utilize_post_rest`.

## Scope

- Update `rule-engine-rs/src/rules/rule7504.rs` so:
  - `utilize_post_rest = true` uses `end_duty_utc`
  - `utilize_post_rest = false` uses `end_including_rest_utc`
- Align top-level comments in `rule-engine-rs/src/lib.rs` with the corrected meaning.
- Add regression coverage in `rule-engine-rs/tests/rule_7504_tests.rs` for both `Y` and `N`.

## Non-Goals

- No changes to other rules.
- No database migration or parameter rewrite.
- No changes to live/scenario data loading paths.
- No changes to the binary interface of `check-7504`.

## Validation Strategy

- Run focused Rust tests for rule 7504.
- Run the `check-7504` binary test coverage that exercises structured input.
- If available in the current environment, smoke the Scenario 718 / crew 568 / pairing 15461 legality preview to confirm the false 7504 warning is gone or changed to the correct result.

