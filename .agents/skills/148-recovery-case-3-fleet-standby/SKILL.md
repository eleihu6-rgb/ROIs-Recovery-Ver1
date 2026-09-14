---
name: 148-recovery-case-3-fleet-standby
description: Prepare, seed and regression-test the Case 3 (Rule 8004 roster-qualification / fleet-mismatch) Standby Crew callout so it offers at least 7 executable, fleet-matched CA reserves with a real guarantee-hours cost spread. Use when reproducing or extending the ADD 7M8 pairing 152227 fleet-qualification recovery through the real Live UI.
---

# Case 3 — Rule 8004 roster-qualification / fleet-mismatch: Standby Crew callout

Use this skill to reproduce or extend the **Case 3** crew-recovery incident: a
crew is assigned a pairing they are not qualified for (fleet/qualification
mismatch), tripping **Rule 8004**, and the controller opens Recovery to call out a
qualified standby reserve. Ryan's two standing requirements apply:

1. the callout must offer **at least 7 selectable (executable)** crew, and
2. those reserves must show a **real cost difference** — some priced over
   guarantee hours (GH), some at $0.

This is a fixture + regression workflow. Keep all writes inside the whitelist.
This was the **first** case built (Ryan: "start from case 3 first"), and it
established the seeding pattern the other two reuse.

## The incident

- Source pairing: **152227** (ADD, 7M8, ET452/ET453, 2026-09-18 19:15Z start /
  09-18/19). A crew whose fleet does not match trips **Rule 8004**.
- Use **L3002 (CA)** or **L3006/L3007 (FO)** as the 8004 source. (L3001 was
  transferred to J4003 by an earlier clear/options flow, so it no longer holds
  152227 — do not reuse it.)
- The vacancy is recovered by calling out a reserve whose **ASBY** standby task
  overlaps the pairing start.

## Fleet hard-filter (Case 3 specific)

Unlike Cases 1/2, Rule 8004 recovery applies a **fleet hard-filter**: only
reserves matching the pairing fleet (7M8) are eligible — see [[fleet-hard-filter-8004]].
Candidates are still sourced from **loaded Live `input.items`** SBY tasks
overlapping `source.start`, then rank-gated. A CA vacancy shows the CA reserves
executable; an FO vacancy shows both the FO reserve (same rank) and the CA
reserve (rank-adjustment upgrade).

## Standby pool fixture

Seed: `scratchpad/seed-case3-standby-pool.sql` (grows the original two-reserve
`seed-case3-standby.sql`). Whitelist:

```
created_by = 'S3_SBY_FIXTURE'  AND  crew_id IN ('J4041','J4042','J4043','J4044','J4045','J4046','J4047','J4048','J4049')
```

Each reserve gets `crew` / `crew_rank` / `crew_base` (ADD) / `crew_fleet` (7M8)
rows plus an **ASBY** `roster_flight` 2026-09-18 19:00Z → 2026-09-19 05:00Z that
overlaps the 19:15Z pairing start. **J4041 + J4043..J4049 are CA** (8 CA
reserves); **J4042 stays FO** as the FO-vacancy demo. Note: `roster_flight.
flight_acting_rank` is NOT NULL with no default — set it (CA/FO); existing SBY
rows store empty string.

Validated in the Live UI (CA vacancy): **Executable 8 / Filtered 0**, each row
labeled "GH 85h · credit before X → after Y".

## GH cost model (this case)

Pricing (`live-server/src/services/recovery/standby-gh-cost.ts`):
`cost = Pay(afterCredit) − Pay(beforeCredit)`,
`afterCredit = beforeCredit + (pairing_credit − 4h ASBY baseline)`.
For pairing 152227 the callout **adds ~3.583h** (afterCredit = beforeCredit +
3.583h). GH floor 85h/month (rev 17). The standby GH cost model reads each
reserve's `SUM(credit)/60`, so graded monthly credit → graded cost:

| Reserve credit | callout cost |
|---|---|
| 40h | $0 |
| 78h | $0 |
| 83h | ~$190 |
| 84h | ~$310 |
| 85h | ~$430 |
| 88h | ~$477 |
| 92h | ~$537 |
| 95h | ~$537 |

## CRITICAL — roster and manday must MATCH (Rule 8002)

Same constraint that this case first surfaced: the daily BLK baseline is read
from `crew_manday_fd_daily.blh`, so a crammed block trips **Rule 8002 (≤40h block
/ any rolling 7 days)** and the reserve becomes non-executable. The seeded credit
is a **legal roster**: spread `blh` (= credit) across duty days with weekly rest
days, skipping the callout window **09-17/18/19** so the added 3.583h pairing on
09-18 has room. Current pattern = **19 duty days** (skip 09-17/18/19 and
`dom % 7 IN (0,6)`); worst 7-day block ~25h, under the 40h cap.

## Regression spec + validation

- Spec: `e2e/tests/gantt/recovery-case-003-standby.spec.ts`
- Config: `e2e/config/case3.config.ts`
- Run (from `e2e/`): `GANTT_BASE_URL=https://cr.rois.one npx playwright test --config=config/case3.config.ts --reporter=list`
- Screenshot: `docs/assets/screenshots/crew-recovery/` (inspect per §PW-Snapshot).

The spec opens Recovery on an 8004 source (L3002 CA), asserts the dialog shows
**8004**, filters to the standby group's Executable tab, then asserts the seeded
reserve checkboxes visible, executable count ≥7, no "Unpriced", >1 distinct cost,
≥1 $0 and ≥1 over-GH cost.

## Rollback

Delete the whitelisted rows only:
`... WHERE created_by='S3_SBY_FIXTURE' AND crew_id IN ('J4041'..'J4049')`.
Do not touch pairing 152227 or the L3xxx source crews — those are pre-existing.
Related: [[145-crew-recovery-case-study]], [[146-recovery-case-1-overlap-standby]], [[147-recovery-case-2-delay-standby]], [[fleet-hard-filter-8004]], [[case3-standby-reserve-fixture]].
