# Scenario Result Count Design

## Goal

Show the Scenario list `x results` value as the actual count of optimizer-placed roster-flight rows, not the scenario master optimization run counter.

## Current Behavior

The Gantt scenario card renders `optimizedCount` from the scenario list API. That value currently comes from `scenario.optimized_count`, which is incremented when optimization results are saved and can represent run/save count rather than placed roster rows.

Scenario output rows are persisted in `scenario.roster_flight`. Existing loaders preserve the row source:

- `source = 'CR'` means optimizer-placed roster data.
- `source = 'leadin'` means pre-existing lead-in data.

## Desired Behavior

For the scenario list response only, `optimizedCount` must equal:

```sql
count(*)
from scenario.roster_flight
where scenario_id = scenario.id
  and is_deleted = 0
  and source = 'CR'
```

The frontend label remains `x result(s)` and keeps the existing positive-count highlight.

## Architecture

Keep the API shape stable by continuing to return `optimizedCount`. Override the selected `optimizedCount` value in `scenarioService.list()` with a scalar SQL count against `scenario.roster_flight`. This avoids a frontend rename and keeps the visible list sourced from persisted output rows.

## Non-Goals

- Do not change `scenario.optimized_count` storage semantics.
- Do not change scenario detail endpoints.
- Do not count `leadin` rows.
- Do not add database migrations in this change.

## Testing

Add a focused backend regression guard that verifies the scenario list service selects count data from `scenario.roster_flight`, filters `source = 'CR'`, and filters `is_deleted = 0`. Run the existing Gantt scenario list item tests to confirm the label behavior still works with `optimizedCount`.
