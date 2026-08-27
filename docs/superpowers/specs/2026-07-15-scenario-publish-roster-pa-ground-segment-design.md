# Scenario Publish Roster PA/Ground/Segment Design

## Goal

Fix Scenario `Publish Roster` so it reflects the real roster publishing contract:

- PA duties are already live pre-assignments. Show them as `Pre-assign`, do not select or publish them.
- CR/MA duties show `Pending` until present in Live, then `Published`.
- Ground duties are included in the publish list and can be published when source is CR/MA.
- Publishing copies scenario `roster_flight` rows to Live at row/segment granularity, not one summary row per pairing.
- Scenarios that do not reference Live pairings are analysis-only and must not show Publish Roster.

## Data Contract

`GET /api/scenario/:id/roster` returns publish rows sorted by `crewId desc, start desc`:

- Flying rows are grouped by `(crew_id, pairing_id, source)`.
- Ground rows are one publish row per `scenario.roster_flight.id`.
- Each publish row includes `kind`, `source`, `status`, `publishable`, and `rosterIds`.

Status rules:

- `source = PA` -> `PRE_ASSIGN`, not publishable.
- `source in CR/MA` + live match exists -> `PUBLISHED`, not publishable.
- `source in CR/MA` + no live match -> `PENDING`, publishable.

## Publish Write

`POST /api/scenario/:id/publish` accepts selected scenario `rosterIds`.

For supported scenarios (`pairing_scenario_id = 0`), copy matching rows from `scenario.roster_flight` to
Live `roster_flight`. Copy all business columns that exist on the Live table, except:

- `id`: Live identity generates it.
- `scenario_id`: not copied to Live.
- `created_at`, `updated_at`, `created_by`, `updated_by`: stamped by publish action.
- `request_source = 'SCENARIO'`
- `request_id = scenarioId`

No `pairing_segment` rows are copied. Live pairings/segments already exist for `pairing_scenario_id = 0`.

## Unsupported Cases

If `pairing_scenario_id != 0`, do not show/allow Publish Roster. Those scenarios are resource-analysis only
until a dedicated Live materialization flow is designed.

## Verification

- Live-server unit tests for PA status, ground rows, row-copy publishing, unsupported pairing partitions.
- Gantt component test for Pre-assign/Pending/Published display and publish selection.
