# Design: Rule 7305 violation message date range

**Date:** 2026-08-14  
**Status:** Approved for implementation (pending plan)  
**Scope:** Shared Rust rule kernel `rule-engine-rs` (7305 message text); call-site tests that assert the old wording.

## Problem

Scenario 740 / `crew_id=1725` Alert Center shows:

```text
Row 1: The number of consecutive rosters (6) with the attribute (*) or label (*) exceeds the threshold (5).
```

Planners cannot see *which* consecutive window fired. Attribute/label wildcards add noise without helping triage.

## Goal

Replace attribute/label phrasing with a crew-base calendar day range for both Consecutive Type **T** and **D**.

Examples:

```text
Row 1: The number of consecutive rosters (6) [2026-07-01, 2026-07-06] exceeds the threshold (5).
Row 1: The number of consecutive roster days (6) [2026-07-01, 2026-07-06] exceeds the threshold (5).
```

(`Row N:` remains a live-server `withParamRowPrefix` concern; Rust emits the body only.)

## Non-goals

- No change to 7305 matching / continuity / PA / optimizer semantics.
- No change to persisted `start_dt` / `end_dt` / `actual_value` / `limit_value` fields (violation span may still use `rest_end_utc` for `end_utc` as today).
- No live-server-only message rewrite (would diverge PBS / Live / Scenario).

## Message contract

| Type | Template |
|------|----------|
| T (Times) | `The number of consecutive rosters ({actual}) [{first_date}, {last_date}] exceeds the threshold ({limit}).` |
| D (Days) | `The number of consecutive roster days ({actual}) [{first_date}, {last_date}] exceeds the threshold ({limit}).` |

- Date format: `YYYY-MM-DD`.
- **First date:** calendar day of the **first** duty in the violating run, from `start_utc` + that duty’s `local_offset_min` (crew-base offset already on the duty).
- **Last date:** calendar day of the **last** duty in the violating run, from **`duty_end_utc`** (not `rest_end_utc`) + that duty’s `local_offset_min`.
- Drop `with the attribute (…) or label (…)` / `with the specified attribute (…) or label (…)` from both templates.

## Implementation approach (recommended)

Change message formatting inside `rule-engine-rs/src/rules/rule7305.rs` where `Rule7305Violation.message` is built (already has `first` / `last` duties and `local_day`).

Reuse existing `local_day(utc, offset_min)` and format as civil date from the local day ordinal (same UTC-day math the rule already uses for consecutive-day logic).

Update assertions in:

- `rule-engine-rs/tests/rule_7305_tests.rs`
- `rule-engine-rs/tests/rule_7305_binary_tests.rs`
- `live-server/scripts/__tests__/rule-7305.test.mjs` (and any other locked strings)

Optional verification: recheck / query scenario 740 crew 1725 after deploy of the new `check-7305` binary.

## Alternatives considered

1. **Rewrite in `legality-recheck-core.mjs` after `check-7305`** — rejected; PBS connector uses the same Rust message and would stay stale.
2. **Add separate TSV columns for first/last dates and format in JS** — unnecessary surface area; dates are fully known in the kernel.

## Risks

- Duty-local offsets that differ within a run: use each endpoint duty’s own `local_offset_min` (matches “crew base on that activity” as already fed into 7305).
- Stale Alert Center rows until a legality recheck regenerates violations.

## Commit / push

Do **not** commit or push until the user explicitly commands it.
