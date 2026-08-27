# Fix check-7506 structured path — sort D rows before consecutive same-day check

## Problem

Scenario 679 / crew 379 has SIM + FLY on the same YVR local day (2026-07-14) under `Assignments = FLY|SIM`, but legality stores **no** 7506 violation.

Root cause (confirmed against SIT feeder + local `check-7506`):

1. `check_single_daily_checkin` only compares **consecutive** checked duties (C++ `SingleDailyCheckinForCARSRule` behavior). It requires chronological order.
2. Legacy flat TSV path in `check_7506.rs` sorts by `(start_utc, rest_start_utc)` before evaluate.
3. Structured R/D/Q/T path (`run_structured`) **does not sort**. Feeder emits FLY block then ground block → same-day FLY and SIM are separated by other FLY duties → consecutive pairs never share a local day → empty output.

Repro order: `FLY(conflict) → FLY(other) → SIM` → empty; same rows sorted by start → fires.

## Goal

Structured `check-7506` must produce the same 7506 results regardless of D-row input order (given identical duties), matching the legacy TSV path and C++ assumption that rosters are chronological.

## Approaches

| # | Approach | Pros | Cons |
|---|----------|------|------|
| **A** | Sort in `run_structured` only (mirror legacy path) | Minimal; clear symmetry with flat TSV | Library callers that skip the bin can still forget to sort |
| **B (recommended)** | Sort inside `check_single_daily_checkin` / `_app` (or sort a local copy before the consecutive walk) | Single choke point; all callers safe | Slight API semantic change: order of input no longer required (doc update) |
| **C** | Sort in Node feeder before spawn | Fixes legality without Rust rebuild on every host | Other structured consumers still broken; dual responsibility |

**Recommendation: B**, with a belt-and-suspenders sort in `run_structured` only if we want bin-local clarity — prefer **B alone** (§Minimal-First): one sort at the rule entry so PyO3 / tests / bin stay aligned.

## Design

1. In `check_single_daily_checkin_app`, before the consecutive walk, work from a chronologically sorted view of `rosters` (and the parallel `pre_assigned` slice if present — keep index alignment by sorting indices, or clone+zip then sort).
2. Update the doc comment: chronological input is no longer required; the function sorts.
3. Regression test (structured binary): D rows in feeder-like order  
   `FLY(same-day) → FLY(other-day) → SIM(same-day)` with `R … FLY|SIM` → exactly one violation.  
   Control: sorted or interleaved order still one violation.
4. Out of scope: redeploy SIT / re-run scenario 679 (ops after binary land); Node feeder order change.

## Success criteria

- Structured input that previously emptied for crew-379-shaped order now emits one 7506.
- Existing `rule_7506_tests` still pass.
- No change to violation message / span semantics beyond catching pairs that were missed due to order.

## Test plan

```bash
cd rule-engine-rs && cargo test --test rule_7506_tests
```
