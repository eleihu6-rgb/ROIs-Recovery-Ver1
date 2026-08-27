# Reserve Duty DP Fallback Design

## Goal

When a Reserve pairing duty has no `PairingDuty.actualDutyMinutes`, candidate DP must still be computed from the duty time span before applying `Assignment.dpPct`.

## Scope

- Module: `pbs-engine`
- Primary file: `ColumnModelSolver_python/rules/rust/pairing_details.py`
- Test file: `ColumnModelSolver_python/rules/rust/test_pairing_details.py`
- No change to BH, Rust daily DP split semantics, Live manday logic, or rule 8002 parameters.

## Data Flow

The PBS Python wrapper builds `pairing_duty_dp_min` and `pairing_duty_dp_pct`, then passes them to `rule-engine-rs`. Rust computes `round(duty_dp_min * dpPct)` and allocates the weighted DP by crew-base local day.

For Reserve duties like PRAM, `actualDutyMinutes` may be blank even though `actStrDtUtc` and `actEndDtUtc` are populated. The Python wrapper must derive raw duty DP minutes before Rust weighting.

## Fallback Order

For each `PairingDuty` row:

1. Use `actualDutyMinutes` when present.
2. Else use `actDpMin` when present.
3. Else derive minutes from `actStrDtUtc` / `actEndDtUtc`.
4. Else derive minutes from `actStartDtUtc` / `actEndDtUtc`.
5. Else leave DP as `0`.

Segment scheduled time fallback is not added in this implementation because `PairingDuty` already has duty-level start/end for the observed Reserve case; adding segment aggregation would broaden the change.

## Verification

- Add a regression test where PRAM has blank `actualDutyMinutes`, blank `actDpMin`, populated duty start/end, and `dpPct=1.00`; expected `duty_dp_min=720`.
- Run focused `pbs-engine` test.
- Run `ro_check.py` and verify Reserve `167932` no longer has empty daily DP in engine output.
