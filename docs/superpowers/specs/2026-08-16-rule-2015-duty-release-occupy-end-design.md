# Design: 2015 / 7505 / 7507 occupy end = Duty Release

**Status:** Approved for implementation  
**Date:** 2026-08-16  
**Supplements:** `docs/superpowers/specs/2026-08-16-rule-2015-do-start-time-design.md`

## Problem

Rule 2015 compares occupy-end local TOD to `DO Start Time`. Live/Scenario `assignmentsAll()` (the only feed for 7505/7507) currently sets activity end from `roster_flight.sch_end_dt_utc` — **per-segment flight arrival**, not **duty release** (debrief / duty end).

Example (scenario 740, crew 2347, pairing 93184, YYZ offset −240):

| Instant | UTC | Local TOD |
|---------|-----|-----------|
| Last flight arrival | 04:25Z | **00:25** |
| Duty release (`duty_*_end` / debrief end) | 04:40Z | **00:40** |

With `2015 = 00:30`, arrival `< 00:30` incorrectly applies grace (Sep 1 blank → no 7507). Release `00:40` is **not** `< 00:30`, so Sep 1 must stay occupied and Min DO can still fail.

## Decision

- Occupy end for 7505/7507 paint (and therefore 2015) = **Duty Release**.
- Live and Scenario both use **actual first, else scheduled**:  
  `duty_act_end_dt_utc → duty_sch_end_dt_utc → debrief_end_utc → roster sch_end`  
  (same coalesce order as existing `dutyEndUtcExpr`).
- Scenario continues to prefer scenario `pairing_segment`, then live `pairing_segment`, then roster flight end.

## Isolation (hard constraint)

**Only change `assignmentsAll()` SQL** in:

1. `live-server/scripts/live-legality.mjs`
2. `live-server/scripts/scenario-legality.mjs`
3. `live-server/scripts/scenario-legality-source.mjs`

Production callers of `assignmentsAll()` are **only** `rule7505` and `rule7507` in `legality-recheck-core.mjs`.

**Must not change:**

- `dutyEndUtcExpr` / `dutyStartUtcExpr` shared helpers’ public meaning (may *reuse* them inside `assignmentsAll`)
- `flyDuties()`, `rosterDuties()`, `checkins()`, 1001 overlap SQL, 7508, 7305, 7501/7503/7504 loaders
- Rust `apply_do_start_occupy_end` formula
- PBS / PyO3 `pairing_duty_end_utc` wiring (out of this patch unless a later parity task)

### Accepted 7505/7507-only side effect

Even with `do_start_min = 0`, occupy calendars lengthen slightly when release is after arrival (e.g. +15 min debrief). That is intentional Min-DO correctness, not bleed into other rules.

## Implementation shape

For rows with `pairing_id`:

- Join `pairing_segment` (Live: live table; Scenario: scenario then live fallback, matching `flyDuties` / `rosterDuties` patterns).
- `e` = epoch of `dutyEndUtcExpr(...)` (or equivalent coalesce) for that duty / pairing span used by the row.
- `end_rest_secs` = same duty-release end + rest minutes (prefer existing rest helper / `act_rest_min` coalesce consistent with today’s `assignmentsAll`, but **rest must start from duty release**, not flight arrival).

For ground / non-pairing rows: keep `sch_str_dt_utc` / `sch_end_dt_utc` (+ `act_rest_min`) as today.

Prefer minimal SQL change: keep one activity row per current `roster_flight` grain if possible; do **not** switch to pairing-aggregated grain in this patch (avoids extra 7505/7507 regression surface).

## Verification

1. Unit / SQL string tests: `assignmentsAll` SQL for Live + Scenario includes `duty_act_end_dt_utc` / `duty_sch_end_dt_utc` (and scenario live fallback where applicable); ground path unchanged.
2. Engine smoke on 2347 + 138720 with ruleset 2015:
   - `DO Start = 00:30` → occupy end local **00:40** → no grace → `days_off = 10` vs Min DO 11 → **7507 fires**.
   - `DO Start = 01:00` → `00:40 < 01:00` → grace → no that 7507 (or days_off ≥ 11).
3. Grep / review: no edits to `flyDuties` / `rosterDuties` / other rule loaders in the same change set.

## Non-goals

- Changing 2015 UI / seed default beyond existing HH:MM rule.
- Changing Count Layover / Utilize Post Duty Rest parameter semantics (only the clock used as duty end for paint).
- Deploying SIT; local verification against SIT DB is enough for this patch.
