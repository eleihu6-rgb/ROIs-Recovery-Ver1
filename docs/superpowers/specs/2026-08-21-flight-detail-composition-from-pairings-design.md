# Flight Detail Composition from Pairings (P + C Aggregate)

**Date:** 2026-08-21  
**Status:** Approved — implementing  
**Scope:** Live `GET /api/flight/:id/crew` composition plan (Scenario Flight Detail merges this Live response)

## Problem

Flight Detail **Flight Composition** cards (CA / FO / FA / IFD) often show `plan = 0` for cabin ranks (and sometimes pilot ranks) because:

1. `flight_composition` is frequently empty for a given `flt_id`.
2. One physical flight is covered by **multiple pairings** across divisions (`P` and `C`), each with its own `pairing_composition`.
3. The UI currently seeds cards from all acting ranks, then only fills plan from `flight_composition`, so FA/IFD stay `0/0` even when C pairings have real plans (e.g. FA=3, IFD=1 on pairing `135598` for flt `77370`).

## Decision (approved direction: A)

For a given `flight.id`:

1. Prefer **`flight_composition`** plan when present for a rank.
2. Otherwise (or as the primary source when `flight_composition` is empty for that rank), compute plan by **aggregating `pairing_composition.plan`** over pairings that **operate** this flight:
   - Join `pairing_segment` where `flt_id = :flightId`, segment not deleted, `seg_assignment` not `DHD`/`DH`.
   - Join `pairing` not deleted.
   - Take **distinct `pairing_id`** (do not double-count if multiple matching segments).
   - Sum `pairing_composition.plan` **grouped by `acting_rank`**.
3. Apply for **both** divisions:
   - **P** pairings → CA / FO (and any other P acting ranks in the rank table).
   - **C** pairings → FA / IFD (and any other C acting ranks).
4. **Actual** continues to come from assigned operating crew on this flight (existing coalesce `rf.flt_id` / `ps.flt_id` + non-DHD logic). Do not use `pairing_composition.fill` for the Flight Detail actual counter.

## Merge rule for plan

Per acting rank:

```
plan(rank) = flight_composition.plan(rank)   if that row exists and is used
           else sum(pairing_composition.plan) over distinct operating pairings on this flt_id
```

Recommended concrete rule (minimal ambiguity):

- Load `flight_composition` for `flt_id`.
- Load aggregated pairing plans for operating pairings on `flt_id`.
- For each acting rank in the display map:  
  `plan = flight_comp[rank] ?? pairing_agg[rank] ?? 0`  
  (flight row wins when present, including explicit `0`).

## Scenario path

Scenario Flight Detail already merges Live `GET /api/flight/:id/crew` into scenario assignees. Fixing Live composition plan is enough for FA/IFD (and P) cards in Scenario when Live has the underlying pairings. No separate Scenario-only composition aggregator in this change.

## Non-goals

- Changing Flight pane bulk `getCompositions` coloring (can follow in a later PR if needed).
- Creating a second “C flight id”.
- Showing only division-filtered rank cards (still show all acting-rank slots; empty stay `0/0` when neither source has plan).

## Tests

1. **Vitest (Live `getCrewList`)**: flight with empty `flight_composition`, two C pairings on same `flt_id` with FA plans → composition FA plan = sum; IFD similarly; P ranks from P pairings aggregated.
2. **Vitest**: `flight_composition` FA plan present → wins over pairing aggregate.
3. **Vitest**: DHD-only segment pairing excluded from aggregate.
4. Optional Playwright smoke: Scenario/Live Flight Detail for known flt shows FA/IFD plan &gt; 0 when C pairing comps exist.

## Verification example (SIT)

`flt_id = 77370` (F8 605):

| Source pairing | Division | Rank plans |
|----------------|----------|------------|
| 135598 | C | FA=3, IFD=1 |
| 135599 | P | FO=1 |
| 135559 | P | CA=1 |

Expected Flight Composition after change: **CA 1 / …, FO 1 / …, FA 3 / …, IFD 1 / …** (actuals from roster assignees).
