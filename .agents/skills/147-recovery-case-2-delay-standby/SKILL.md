---
name: 147-recovery-case-2-delay-standby
description: Prepare, seed and regression-test the Case 2 (Rule 3007 published-delay-FDP) Standby Crew callout so it offers at least 7 executable, fleet-matched CA reserves with a real guarantee-hours cost spread. Use when reproducing or extending the ADD B787 pairing 152675 delay recovery through the real Live UI.
---

# Case 2 — Rule 3007 published-delay-FDP: Standby Crew callout

Use this skill to reproduce or extend the **Case 2** crew-recovery incident: a
published departure delay pushes the FDP beyond limits, tripping **Rule 3007**
(published-delay-FDP), and the controller opens Recovery. Standby Crew callout is
the "Recommended next" method after the source pilot rejects an FDP-discretion
proposal. Ryan's two standing requirements for every standby callout apply:

1. the callout must offer **at least 7 selectable (executable)** crew, and
2. those reserves must show a **real cost difference** — some priced over
   guarantee hours (GH), some at $0.

This is a fixture + regression workflow. Keep all writes inside the whitelist.

## The incident

- Source crew: **T2001**, ET captain, base **ADD**, fleet **B787**.
- Source pairing: **152675** (ADD, B787, ET2681..ET2684, 2026-09-29 04:00Z →
  09-30 18:00Z). A published delay pushes the FDP over → **Rule 3007**.
- T2001 has a rejected FDP proposal, so the Standby callout is "Recommended next"
  (see `recovery-case-002-fdp-discretion.spec.ts`: `recovery-fdp-show-standby` /
  `recovery-plan-detail-standby` / `recovery-standby-recommended`).
- The CA vacancy is recovered by calling out a reserve whose **ASBY** standby task
  overlaps the pairing start.

## How the standby callout sources candidates

Same as the other cases: `recovery-candidates.ts` iterates **only loaded Live
`input.items`**, keeps SBY items overlapping `source.start`, then rank-gates. A CA
vacancy shows only CA reserves executable; the twelve overlapping FO reserves
(T2023..T2034) are rank-gated out. Reserves must be in the loaded scope.

## Standby pool fixture

Seed: `scratchpad/seed-case2-standby-pool.sql`. Whitelist (safe to identify /
roll back on shared `f8_sit_live`):

```
created_by = 'S2_SBY_FIXTURE'  AND  crew_id IN ('T2041','T2042','T2043','T2044')
```

Each reserve gets `crew` / `crew_rank` (CA) / `crew_base` (ADD) / `crew_fleet`
(B787) rows plus an **ASBY** `roster_flight` 2026-09-29 00:00Z → 08:00Z that
overlaps the 04:00Z pairing start (mirrors the pre-existing T2002..T2007).

Executable pool = 4 seeded (T2041..T2044) + 4 pre-existing (T2002..T2005).
Validated in the Live UI: **Options 8 / Executable 8 / Filtered 2**.

> **The Filtered 2 are the point.** Pre-existing T2006 (83.5h) and T2007 (91h)
> carry a **crammed** manday that trips Rule 8002 once the pairing block is added,
> so they are correctly filtered — the exact "roster and manday must match"
> failure mode. They are left untouched (§Minimal-First); the spec asserts only
> the four seeded reserves, which use a legal spread and stay executable.

## GH cost model (this case)

Pricing (`live-server/src/services/recovery/standby-gh-cost.ts`):
`cost = Pay(afterCredit) − Pay(beforeCredit)`,
`afterCredit = beforeCredit + (pairing_credit − 4h ASBY baseline)`.
For pairing 152675, `pairing_credit = 18.00h`, so **every callout adds
`afterCredit = beforeCredit + 14h`**. GH floor 85h/month (rev 17).

Graded monthly credit → graded cost (seeded reserves):

| Reserve | before credit | callout cost |
|---|---|---|
| T2041 | 45h | $0 |
| T2043 | 65h | $0 |
| T2044 | 86h | ~$2100 |
| T2042 | 88h | ~$2400 |

Full validated ladder in the UI (seeded + pre-existing executable): T2002 $0,
T2041 $0, T2043 $0, T2003 $240, T2004 $675, T2005 $1,350, … up to the over-GH picks.

## CRITICAL — roster and manday must MATCH (Rule 8002)

Identical constraint to Case 1: the daily BLK baseline is read from
`crew_manday_fd_daily.blh`, so a crammed block trips **Rule 8002 (≤40h block /
any rolling 7 days)**. The seeded credit is a **legal roster**: Case 2 uses
`generate_series(1,30)` WHERE `dom NOT IN (28,29,30)` (callout neighbourhood —
leaves room for the flown pairing block 09-29/30) AND `(dom % 7) NOT IN (0,6)`
(weekly rest) → **20 duty days**; `per_day = credit/20`; `blh = ft = dp = fdp =
ROUND(per_day)`. The pre-existing crammed T2006/T2007 (source `S2_ADD_AUTO_GH`)
are the live demonstration of what NOT to do.

## Regression spec + validation

- Spec: `e2e/tests/gantt/recovery-case-002-standby.spec.ts` (asserts on the four
  seeded reserves `SEEDED_RESERVES = ['T2041','T2042','T2043','T2044']`).
- Config: `e2e/config/case2.config.ts`
- Run (from `e2e/`): `GANTT_BASE_URL=https://cr.rois.one npx playwright test --config=config/case2.config.ts --reporter=list`
- Screenshot: `docs/assets/screenshots/crew-recovery/case2-standby-ca-pool-Ver1.png`.

The spec opens Recovery via `__ganttTest.openLiveRosterContextMenu(T2001, 152675)`,
asserts the dialog shows **3007** (allow up to 180s), filters to the standby
group's Executable tab, then asserts each seeded reserve checkbox visible,
executable count ≥7, no "Unpriced", >1 distinct cost, ≥1 $0 and ≥1 over-GH cost.
There is also a separate FDP-discretion spec, `recovery-case-002-fdp-discretion.spec.ts`,
covering the "Recommended next → Standby" routing.

## Rollback

Delete the whitelisted rows only:
`... WHERE created_by='S2_SBY_FIXTURE' AND crew_id IN ('T2041'..'T2044')`.
Do not touch T2001, T2002..T2007 or pairing 152675 — those are pre-existing.
Related: [[145-crew-recovery-case-study]], [[146-recovery-case-1-overlap-standby]], [[148-recovery-case-3-fleet-standby]].
