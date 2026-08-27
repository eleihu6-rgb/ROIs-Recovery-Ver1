# Fix rule 7506 — include Assignments beyond FLY (SIM)

## Problem

Workset 103 enables **7506001** with `Assignments = FLY|SIM`. On scenario 679 / crew 379 (YVR 2026-07-14) there is a SIM ground check-in and a FLY pairing check-in the same local day, but **no 7506 violation** is stored.

Root cause in Live/Scenario legality:

1. `checkins()` only loads `assignment_group='FLY' AND pairing_id IS NOT NULL`.
2. `rule7506` hardcodes the TSV duty column as `FLY`.

SIM never reaches `check-7506`, so `FLY|SIM` is effectively FLY-only.

## Design

1. **`checkins()`** returns:
   - one row per FLY crew×pairing (`duty = assignment_group`, usually `FLY`);
   - one row per non-pairing ground roster (`duty = assignment`, e.g. `SIM`), `pairing_id = 0`.
2. **`rule7506`** filters rows to those whose `duty` is in the instance `Assignments` pipe-list (case-insensitive), and emits TSV with that `duty` (not hardcoded `FLY`).
3. Shared Live / Scenario / scenario-source implementations stay aligned (§Gantt-Unify).
4. Unit test: mock `checkins` with SIM+FLY same UTC day + `FLY|SIM` → one 7506; `FLY`-only param → none.

Out of scope: PyO3 solver `check_7506` ground-duty wiring (separate path); re-run scenario 679 legality in this change set (ops).
