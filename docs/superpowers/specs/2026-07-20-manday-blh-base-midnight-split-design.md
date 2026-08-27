# Manday BLH Split at Crew-Base Midnight

> Design spec — 2026-07-20  
> Status: approved for planning (design dialogue)  
> Scope: when a flying leg crosses midnight in the crew’s base timezone, split
> daily `crew_manday_*.blh` across local calendar days; keep credit on the first day.

## 1. Problem

The unified manday driver (`live-server/src/services/manday/manday-tool.ts`)
attributes an entire duty’s `Σ flight.blk_min` to the **local date of duty start**
via `realBlh` keyed by `toLocalDate(startUtc, zone)`.

That is wrong for block hours when a leg crosses crew-base midnight. Example
(SIT scenario 677, crew 96, base YVR / `America/Vancouver`, pairing 14976):

| Leg | YVR wall (act = sch) | blk_min |
|-----|----------------------|---------|
| 1 | 2026-07-31 17:00 → 22:30 | 330 |
| 2 | 2026-07-31 23:30 → 2026-08-01 05:20 | 350 |

Current result: all **11:20** BLH on 2026-07-31.  
Correct BLH: **06:00** on 07-31, **05:20** on 08-01.  
Credit must remain **11:20** on 07-31 only.

## 2. Goal

| Field | Cross-midnight rule |
|-------|---------------------|
| **credit** | Unchanged — entire duty credit on the **duty start** local date |
| **blh** | Split **per flight leg** at crew-base local midnight 00:00 |

Applies to **Live and Scenario** (shared `manday-tool` path). Scenario partition-aware
flight joins (`flight_scenario_id = 0` → live.flight) remain as already shipped.

## 3. Non-goals

- Changing credit / DO / leave / ground-task attribution
- Changing Rust `ruletool` credit arithmetic
- Backfilling every historical scenario automatically (ops re-run
  `manday-recompute.ts <id>` after deploy, same as partition BLH fix)
- Using `roster_flight.act_str/end` (often null in scenario); wall times come from
  **`flight`**

## 4. Wall-clock source and split algorithm

Per flying `roster_flight` leg with `flt_id` joined to `flight` (partition-aware):

```
dep = COALESCE(act_dep_dt_utc, sch_dep_dt_utc)
arv = COALESCE(act_arv_dt_utc, sch_arv_dt_utc)
hasAct = (act_dep_dt_utc IS NOT NULL AND act_arv_dt_utc IS NOT NULL)
```

Timezone: existing resolver `crew_base.base → airport.zone_id` (fallback `UTC`).

### 4.1 When `hasAct`

For each local calendar day `D` from local(dep) through local(arv):

```
blh(D) += minutes of intersection(
  [dep, arv],
  [local midnight D, local midnight D+1)
)
```

Absolute wall-clock minutes. Daily sum for that leg equals act duration and
**may differ from `blk_min`**.

### 4.2 When not `hasAct` (sch only, or incomplete act)

Let `wall = sch_arv − sch_dep` in minutes (if `wall ≤ 0`, put all `blk_min` on
local(dep) date and stop).

For each local day `D` with sch overlap `o_D`:

```
blh(D) += round(blk_min * o_D / wall)
```

Adjust the **last** day that receives a share so `Σ blh(D) = blk_min` (remainder).

### 4.3 Aggregation

- Sum all leg contributions into `Map<"crewId\\tlocalDate", minutes>`.
- Credit path unchanged: one Rust `FLY` row per duty on start local date.
- Days that receive only split BLH (no credit) must still get a daily upsert with
  `credit = 0` (or equivalent zero-then-upsert so BLH is not dropped).

## 5. Implementation sketch

| Piece | Change |
|-------|--------|
| `loadActivity` | Load **leg-level** flying rows: `crew_id`, `blk_min`, dep/arv (act+sch), duty start for credit grouping unchanged |
| New helper | `splitBlhByBaseMidnight({ depUtc, arvUtc, blkMin, hasAct, zoneId }) → Array<{ localDate, minutes }>` |
| `realBlh` build | Accumulate split results instead of `+ blkMin` on start date only |
| Daily upsert | Ensure BLH-only local dates are written |
| Tests | Pure unit tests for the splitter + manday-tool mock covering cross-midnight |

Out of scope for code change: Gantt display (reads `crew_manday_*` after recompute).

## 6. Acceptance / verification

1. Unit: same-day leg → all minutes on one date.  
2. Unit: act cross-midnight (14976-shaped) → 360 / 320 (06:00 / 05:20).  
3. Unit: no act, sch wall ≠ blk → proportional + remainder.  
4. Unit: credit still only on start date (recompute mock / existing fly credit test).  
5. Manual: recompute SIT scenario **677**, crew **96**, window 2026-07-27..08-23:
   - 07-31 blh = **06:00**, credit = **11:20**
   - 08-01 blh = **05:20** (row may be created), that duty’s credit not on 08-01
   - Window Σ blh matches sum of per-leg split rules

## 7. Risks

- **DST**: use timezone-aware midnight boundaries (`Intl` / equivalent), not fixed UTC offsets.
- **Act ≠ blk**: monthly BLH may diverge from `Σ blk_min` when act wall is used — intentional per product rule.
- **Window filters**: `startDt`/`endDt` on `roster_flight.sch_str` may omit a leg whose split BLH lands on a day inside the window but sch_str is outside; existing window semantics unchanged; document if ops scoped recompute must pad.
