# Scenario Manual Assign: Flight Acting Rank for Composition

## Status

Approved (user 2026-08-23). Bug fix for Scenario Flight Detail composition after Save.

## Problem

After PBS + manual roster edit + Save on Scenario 746, Flight 822 (2026-08-19) listed IFD crew `1256`, but Flight Composition showed **IFD 0/1**. Acting Rank in the table was blank.

Root cause: `applyScenarioRosterPatches` INSERT for `op: 'add'` hardcodes `flight_acting_rank = ''` while correctly writing `roster_acting_rank` from the patch. Flight Detail resolves acting rank with `flightActingRank ?? rosterActingRank`; empty string does not fall through, so composition actual skips the crew.

## Goal

1. Manual scenario assign persists the same acting rank into both `flight_acting_rank` and `roster_acting_rank`.
2. Flight Detail (and merge) treats blank `flightActingRank` as missing and falls back to `rosterActingRank` so existing dirty rows still show **1/1** without re-Save.
3. No change to Live assign APIs in this fix unless the same empty-string INSERT pattern is adjacent and trivial; Scenario path is in scope.

## Design

### Save path (`scenario-patch-service`)

On fresh INSERT for `add`, set:

```sql
COALESCE($6::varchar, ''), $6::varchar
```

for `(flight_acting_rank, roster_acting_rank)` instead of `'', $6`.

On undelete / reassign when `$6` / rosterActingRank is provided, also set `flight_acting_rank = COALESCE($n, flight_acting_rank)` so revived rows are corrected.

### Display path (`build-scenario-flight-crew`)

Resolve acting rank as:

```ts
flightActingRank || rosterActingRank || rank || crewRank
```

(empty string treated as missing). Same when counting composition actual after Live merge.

### Out of scope

- Backfill SQL for all historical scenario rows (UI fallback covers display; new Saves write correct values).
- Changing Live `getCrewList` / bulk compositions SQL (separate if Live MA has the same INSERT bug).

## Verification

- Vitest: scenario-patch INSERT SQL binds / contains flight_acting_rank from patch.
- Vitest: `buildScenarioFlightCrew` with `flightActingRank: ''` + `rosterActingRank: 'IFD'` → Acting Rank IFD and composition IFD actual 1.
