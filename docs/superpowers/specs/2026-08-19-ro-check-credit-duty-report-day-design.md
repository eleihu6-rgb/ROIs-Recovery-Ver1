# ro_check / Engine 8002 CH: whole-duty credit on report day

**Date:** 2026-08-19  
**Status:** Approved (user confirmed 2026-08-19)  
**Context:** `ro_check.py` SVG day-header **CR** currently follows manday-day split (same composition as BH/DP). Credit must not.

## Problem

BH and DP in `ro_check` / Engine 8002 are **calendar-day SPAN** (manday baseline replaces fixed recompute; candidates add on top). Credit (CH / SVG **CR**) was wired the same way:

- Baseline = `CrewMandayFd.credit` (already split by manday local date)
- Hover add-on used `engine.daily_blk` / `daily_dp` (SPAN-split) then `max(240, blk, dp/2)` **per calendar day**
- Candidate 8002 CH used `PairingDuty.creditedMinutes`

That splits one duty’s credit across midnight and disagrees with the intended credit rule.

## Decision

**BH and DP do not change.** Manday composition, SPAN split, `daily_blk` / `daily_dp`, 8002 BH/DP accumulation, and SVG BLK/DP tooltips stay bit-identical to today.

**CH / CR only:**

- Grain = one **PairingDuty** (not pairing, not manday day).
- Value = `max(240, actFlightMinutes, actualDutyMinutes / 2)` minutes. Do **not** use `creditedMinutes`. Do **not** use `CrewMandayFd.credit`.
- Attribution = the entire value on the **crew-base local calendar date of duty report time** (`PairingDuty.actStrDtUtc` + crew-base offset at that instant). A duty that crosses midnight does not split credit.
- Ground, non-rest: same formula (blk usually 0 → typically 240) on the crew-base local date of ground start (report equivalent). Rest / DO / leave = 0.
- SVG `_credit_by_day_for_hover` uses this attribution, not manday credit.

8002 `check_8002_full` still loads manday `DayMetrics` for BH/DP/FT/etc. After that load, **zero `credit` from manday** and overlay CH from the formula for **fixed ∪ candidate** duties plus ground. Do not add `cand_map.credit` on top of manday credit (that would double-count). Candidate BH/DP add-on stays as today.

Report time and crew-base offset reuse the existing duty-start arrays (`pairing_duty_start_utc`, `pairing_duty_crew_offset_min`) — same local-day axis 8002 DP already uses. Do not invent a second TZ path.

## Frozen (must not change)

| Surface | Rule |
|---------|------|
| 8002 BH / DP / FT | Manday baseline + candidate SPAN / duty-start DP as today |
| `engine.daily_blk` / `daily_dp` | Unchanged |
| SVG BLK / DP tooltips | Still `_blk_by_day_for_hover` / `_dp_by_day_for_hover` |
| `CrewMandayFd.blh` / `dp` extras | Unchanged |
| Live `check-8002` bin / `ruletool` manday tables | Out of scope (may still store split credit until a follow-up) |

## Shared Engine blast

`ro_check` and the PBS solver share `RustRuleChecker` → Engine. Changing CH overlay **will change solver 8002 CH** as well as `ro_check`. That is intended for approach 1. BH/DP in the solver must still match today.

## Tests

- Cross-midnight FLY duty: BLK may appear on two days; **CR all on report’s crew-base date**; sum(CR) = `max(240, duty_blk, duty_dp/2)`.
- Manday `credit` split across those two days is **ignored** for CR/CH.
- Ground SIM/CRE (non-rest): 240 (or formula) on crew-base start date, not airport-local start if those differ.
- Rest/DO ground: 0 credit.
- Regression: existing 8002 BH/DP cases and `daily_blk`/`daily_dp` tests unchanged.

## Out of scope

- Recalculating Live/Scenario `crew_manday_*` tables
- Changing the Live `check-8002` binary to this formula
- Pairing-level (not duty-level) credit
- Inclusive window / 8056 / 7505 work
