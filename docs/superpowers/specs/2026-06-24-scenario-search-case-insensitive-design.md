# Scenario Search Case-Insensitive Design

## Goal

Scenario keyword search must match scenario names regardless of letter case. Searching `yvr` should match scenario names containing `YVR`, `yvr`, or mixed-case variants.

## Scope

This is a backend filter behavior change for the existing Scenario list API. The frontend search box and query shape stay unchanged.

## Current Behavior

The Gantt search box writes `searchName` into the Scenario store. `fetchList()` sends it as the `name` query parameter to `GET /api/scenario`. The live-server `scenarioService.list()` builds the name predicate with PostgreSQL `LIKE`, which is case-sensitive.

## Design

- Change only the scenario name keyword predicate from `like(scenario.name, ...)` to `ilike(scenario.name, ...)`.
- Keep `fileType` and `status` exact-match filters unchanged.
- Keep the cache key unchanged because it already includes the raw search term.
- Do not lowercase names in the frontend; the database should own matching semantics.

## Testing

Add a focused guard test in the existing scenario service test file so future changes do not reintroduce case-sensitive `LIKE` for scenario name search.

Run:

```bash
cd live-server && npm test -- src/__tests__/services/scenario/scenario-service.test.ts -t "scenarioService.*case-insensitive"
cd live-server && npm test -- src/__tests__/services/scenario/scenario-service.test.ts -t "scenarioService.*list"
cd gantt && npx tsc --noEmit
```
