# SIT Flying Credit Backfill + Manday MCred Repair

> Date: 2026-07-15  
> Status: approved (user confirmed recommended order)  
> Scope: Live roster flying credit source integrity + manday recompute correctness

## Problem

On SIT (`f8_sit_live`), after manday refresh:

- **MBH / BLH is correct** — computed from `flight.blk_min` via `roster_flight.flt_id`.
- **MCred is wrong (near-zero for flying crews)** — computed from `roster_flight.act_credited_minutes`.

Diagnosis:

- Flying `roster_flight.act_credited_minutes` is **100% NULL** for 2026-01..08.
- `pairing_segment.duty_act_credited_minutes` is populated (~95%+ non-null / >0).
- Root cause of recurrence: `roster-inbound-worker` INSERT into flying `roster_flight` **does not write** credit columns.
- Residual monthly credit after refresh is almost entirely ground duties.

## Goals

1. Repair SIT data now (backfill + manday refresh).
2. Fix roster flying import so new imports write credit.
3. Harden `manday-tool` so FLY credit falls back to pairing duty credit when RF credit is null.

## Non-goals

- Changing the credit model (still duty-level `MAX` of credited minutes).
- Reworking ground credit (already written by ground inbound).
- Scenario-schema backfill (Live SIT only unless later requested).

## Design

### A. One-time SIT backfill (data)

For flying rows only (`pairing_id IS NOT NULL`):

```
roster_flight.act_credited_minutes := pairing_segment.duty_act_credited_minutes
roster_flight.sch_credited_minutes := COALESCE(duty_sch_credited_minutes, duty_act_credited_minutes)
```

Join key: `(pairing_id, duty_seq, seg_seq)`.

Only update rows where `act_credited_minutes IS NULL` (idempotent, preserves any future non-null values).

`updated_by = 'BACKFILL_FLY_CREDIT'`.

Then run unified manday recompute over the roster window (or recent months covering live gantt).

### B. Import path fix (`roster-inbound-worker`)

When loading `pairing_segment` for expansion, also select:

- `duty_act_credited_minutes`
- `duty_sch_credited_minutes`

On INSERT into `roster_flight`, write:

- `act_credited_minutes = duty_act_credited_minutes`
- `sch_credited_minutes = COALESCE(duty_sch_credited_minutes, duty_act_credited_minutes)`

Same value on every segment of a duty is intentional: manday aggregates with `MAX` per `(crew, pairing, duty_seq)`.

### C. Manday-tool fallback

In `loadActivity` flying query:

```
credit = MAX(COALESCE(rf.act_credited_minutes, duty.duty_credit, 0))
```

where `duty` is a subquery / join of:

```
SELECT pairing_id, duty_seq, MAX(duty_act_credited_minutes) AS duty_credit
FROM pairing_segment
WHERE is_deleted = 0
GROUP BY pairing_id, duty_seq
```

Uses the same logical schema as roster (`f8` / scenario). Prefer RF column when present; pairing is fallback only.

BLH path unchanged (`SUM(flight.blk_min)`).

### D. Verification

| Check | Pass criteria |
|-------|----------------|
| Backfill | Flying RF rows with null act credit → 0 (or near-zero residual where pairing also null) |
| Sample crew 776 (2026-07) | MCred ≈ fly duty credit + ground (~7680+240), not 0 while MBH ~8015 |
| FD monthly | `credit0_blh_gt0` drops sharply vs pre-fix (~582 in July) |
| Unit test | roster-inbound INSERT SQL includes credit columns |
| Unit / driver test | manday loadActivity / recompute uses pairing fallback when RF credit null |

## Risks

- Duty credit on every segment row can look “duplicated” in raw SUM of RF credit; consumers must keep duty-MAX semantics (existing manday rule).
- Full-window manday refresh can take minutes on SIT; run with date bounds if needed.
- Deploy of import/manday code to SIT is separate from data repair; data repair stands alone.
- `updated_by` columns are `varchar(30)` — refresh job tags must stay short.
- Full-mode recompute does not zero the *other* division table; cabin crews may still have stale FD monthly rows with import-era BLH. API routes by `crew.division`, so UI MCred/MBH stay correct.

## Execution log (SIT 2026-07-15)

1. **Backfill**: `89705` flying RF rows filled from `pairing_segment` (`updated_by=BACKFILL_FLY_CREDIT`); residual null ≈ `140` (pairing duty credit also missing).
2. **Manday recompute** Apr–Aug via dist `recompute` (`updated_by=SIT_CREDIT_BACKFILL`):

| month | crews | notes |
|-------|------:|-------|
| 2026-04 | 764 | daily 18849 |
| 2026-05 | 805 | daily 20247 |
| 2026-06 | 797 | daily 19725 |
| 2026-07 | 799 | daily 20828 |
| 2026-08 | 469 | daily 4927 |

3. **Parity samples (API table routing)**:
   - cabin `776` → CC monthly credit `7920` (= 7680 fly duty + 240 ground), blh `7855`
   - pilot `12937` → FD monthly credit `5282` (= fly duty MAX sum), blh `7668`
   - July pilots: `credit0_blh = 0`; July cabin: `credit0_blh = 0`

4. **Code deploy**: patched SIT `dist/services/manday/manday-tool.js` + `dist/workers/roster-inbound-worker.js`; `service.sh restart live-server` → health `200`.
