---
name: 146-recovery-case-1-overlap-standby
description: Prepare, seed and regression-test the Case 1 (Rule 1001 assignment-overlap) Standby Crew callout so it offers at least 7 executable, fleet-matched CA reserves with a real guarantee-hours cost spread. Use when reproducing or extending the ADD pairing 152056 overlap recovery through the real Live UI.
---

# Case 1 — Rule 1001 assignment-overlap: Standby Crew callout

Use this skill to reproduce or extend the **Case 1** crew-recovery incident: an
ILL absence overlaps a flying duty, tripping **Rule 1001** (assignment overlap),
and the controller opens Recovery to call out a standby (reserve) crew. Ryan's
two standing requirements for every standby callout apply here:

1. the callout must offer **at least 7 selectable (executable)** crew, and
2. those reserves must show a **real cost difference** — some priced over
   guarantee hours (GH), some at $0 — so the controller has a genuine cost choice.

This is a fixture + regression workflow, not permission to mutate unrelated
roster data. Keep all writes inside the whitelist below.

## The incident

- Source crew: **J4002** (Getnet Kifle), ET captain, base **ADD**, fleet **7M8**.
- Source pairing: **152056** (ADD, 7M8, 2026-09-24 03:10Z → 09-26, six legs).
- The ILL absence for J4002 (2026-09-23T21:00 → 09-24T20:59) overlaps the flying
  duty → **Rule 1001** overlap. Submitting SL must not de-assign the duty; the
  retained duty is the recovery source (see [[145-crew-recovery-case-study]]).
- The CA vacancy is recovered by calling out a reserve whose **ASBY** standby task
  overlaps the pairing start.

## How the standby callout sources candidates

`gantt/src/services/recovery-candidates.ts` iterates **only the loaded Live
`input.items`**, keeps SBY items whose task overlaps `source.start`, then
rank-gates: a reserve below the vacancy's required rank is non-executable. So a
**CA vacancy** shows only CA reserves as executable; FO reserves are rank-gated
out. The reserves must be in the loaded crew/date range or the callout stays empty.

## Standby pool fixture

Seed: `scratchpad/seed-case1-standby-pool.sql`. Whitelist (safe to identify /
roll back on shared `f8_sit_live`):

```
created_by = 'S1_SBY_FIXTURE'  AND  crew_id IN ('J4051','J4052','J4053','J4054','J4055','J4056')
```

Each reserve gets `crew` / `crew_rank` (CA) / `crew_base` (ADD) / `crew_fleet`
(7M8) rows plus an **ASBY** `roster_flight` 2026-09-24 02:00Z → 10:00Z that
overlaps the 03:10Z pairing start (mirrors the pre-existing J4011..J4013). Crew
inserts are NOT-EXISTS guarded; manday rows replace-in-full (idempotent).

Executable pool = 6 seeded (J4051..J4056) + 2 pre-existing (J4012 76.6h, J4013
87.1h). J4011 also overlaps but **flies 152056 itself**, so it is filtered from
its own callout. Validated in the Live UI: **Options 9 / Executable 9 / Filtered 0**.

## GH cost model (this case)

Pricing lives in `live-server/src/services/recovery/standby-gh-cost.ts`:
`cost = Pay(afterCredit) − Pay(beforeCredit)`, where
`afterCredit = beforeCredit + (pairing_credit − baseline_standby_credit)`.
For pairing 152056, `pairing_credit = 15.25h` and the ASBY baseline credit = 4h,
so **every callout adds `afterCredit = beforeCredit + 11.25h`**. `beforeCredit`
is each reserve's saved **calendar-month** credit = `SUM(crew_manday_fd_daily.credit)/60`.
GH policy (rev 17): guarantee floor **85h/month**, USD100/h, ×1.2 ≤90h then ×1.5.

Graded monthly credit → graded cost:

| Reserve | before credit | callout cost |
|---|---|---|
| J4051 | 40h | $0 |
| J4052 | 60h | $0 |
| J4053 | 74h | ~$30 |
| J4054 | 80h | ~$787 |
| J4055 | 90h | ~$2287 |
| J4056 | 82h | ~$1087 |

A reserve well under the 85h floor adds nothing (still under the floor after
+11.25h); one already near/over it costs incremental GH pay.

## CRITICAL — roster and manday must MATCH (Rule 8002)

The rule engine reads the daily BLK baseline for its rolling-window rules
**straight from `crew_manday_fd_daily.blh`** (`rule-engine-rs` "Per-crew daily
BLK baseline"), NOT from `roster_flight`. Seeding a crammed block trips **Rule
8002 (≤40h block / any rolling 7 days)** and the reserve becomes non-executable —
the exact "dummy manday without a real roster" anti-pattern Ryan warned against.

So the monthly credit is laid down like a **legal roster**: equal daily block on
duty days, with weekly rest days AND the callout neighbourhood kept clear. Case 1
uses `generate_series(1,30)` WHERE `dom NOT IN (23,24,25,26,27)` (callout
neighbourhood — leaves room for the flown pairing block 09-24..09-26) AND
`(dom % 7) NOT IN (0,6)` (weekly rest) → **18 duty days**; `per_day = credit/18`;
`blh = ft = dp = fdp = ROUND(per_day)`. Worst 7-day baseline window stays ~22-25h,
well under 40h even with the added pairing block.

## Regression spec + validation

- Spec: `e2e/tests/gantt/recovery-case-001-standby.spec.ts`
- Config: `e2e/config/case1.config.ts`
- Run (from `e2e/`): `GANTT_BASE_URL=https://cr.rois.one npx playwright test --config=config/case1.config.ts --reporter=list`
- Screenshot: `docs/assets/screenshots/crew-recovery/case1-standby-ca-pool-Ver1.png` (inspect per §PW-Snapshot).

The spec loads Live (division P + the crew IDs), waits for the reserves in the
crew/roster hooks, opens Recovery via `__ganttTest.openLiveRosterContextMenu(J4002, 152056)`,
asserts the dialog shows **1001** (allow up to 180s — option generation is slow),
filters to the standby group's Executable tab, then asserts: every seeded reserve
checkbox visible, executable count ≥7, no "Unpriced", >1 distinct cost, ≥1 $0 and
≥1 over-GH cost.

## Rollback

Delete the whitelisted rows only:
`DELETE FROM crew_manday_fd_daily / roster_flight / crew_fleet / crew_base / crew_rank / crew
WHERE created_by='S1_SBY_FIXTURE' AND crew_id IN ('J4051'..'J4056')`.
Do not touch J4002, J4011..J4013 or pairing 152056 — those are pre-existing.
Related: [[145-crew-recovery-case-study]], [[147-recovery-case-2-delay-standby]], [[148-recovery-case-3-fleet-standby]].
