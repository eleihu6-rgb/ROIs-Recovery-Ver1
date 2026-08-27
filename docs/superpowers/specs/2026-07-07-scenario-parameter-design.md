# Scenario Parameter Design

Date: 2026-07-07
Status: Draft approved for implementation planning

## Goal

Add scenario-level optimization parameters that planners can review and edit from the Scenario detail panel before running optimization.

The feature uses one table, `scenario_parameter`, with `scenario_id = 0` rows as immutable templates. Template rows define supported `code` values, UI shape, field definitions, display order, and default values. Scenario rows with `scenario_id > 0` store only the scenario-specific actual value for the same `code`.

## Table

Create `scenario_parameter` with the requested columns:

```sql
id bigint generated always as identity primary key,
created_by varchar(30) default 'system' not null,
created_at timestamp default now() not null,
updated_by varchar(30) default 'system' not null,
updated_at timestamp default now() not null,
scenario_id bigint default 0 not null,
code varchar(200) not null,
param_val jsonb default '{}'::jsonb not null,
description varchar(300),
idx int,
type varchar(50)
```

Add `unique (scenario_id, code)` so a scenario cannot store duplicate values for the same supported parameter.

Recommended indexes:

- `(scenario_id, idx, code)` for listing parameters in UI/export order.
- `(code)` only if future admin/template tooling needs fast lookup by code across scenarios.

## JSON Contract

Template rows (`scenario_id = 0`) store schema and defaults:

```json
{
  "schema": {
    "maxIterations": {
      "type": "number",
      "label": "Max Iterations",
      "min": 1
    },
    "enableReserve": {
      "type": "boolean",
      "label": "Enable Reserve"
    }
  },
  "defaultValue": {
    "maxIterations": 100,
    "enableReserve": true
  }
}
```

Scenario rows (`scenario_id > 0`) store only the actual value:

```json
{
  "value": {
    "maxIterations": 120,
    "enableReserve": false
  }
}
```

`type` controls the editor:

- `OBJ`: render multiple structured fields from `schema`.
- `LIST`: render list/table-style data. Initial implementation supports CSV/text-style editing when the template declares a CSV field, storing it under `value.csv` or `value.rows` according to the template definition.

The live-server API is responsible for merging template defaults with scenario values. A scenario that has no saved row for a code still behaves as if it has that code with the template `defaultValue`.

## Validation

Only template codes are supported. A save request for an unknown code must return `400`.

Template rows are not editable through the Scenario detail UI. Normal scenario parameter save endpoints must reject `scenario_id = 0`.

For `OBJ`, live-server should validate the submitted `value` against the template schema enough to prevent shape drift:

- required fields listed in schema must exist unless the template marks them optional.
- scalar field values should match declared type: `string`, `number`, `boolean`, `select`.
- unknown extra keys should be rejected unless the template explicitly allows extra keys.

For `LIST`, initial validation can be conservative:

- accept a string CSV value when the template declares `format: "csv"`;
- accept an array of row objects when the template declares `format: "rows"`;
- reject any other value shape.

## API

Add scenario parameter endpoints under live-server scenario routes.

### `GET /api/scenario/:id/parameters`

Returns template rows merged with scenario values, ordered by template `idx`, then `code`.

Response shape:

```json
{
  "items": [
    {
      "code": "solver_limits",
      "type": "OBJ",
      "description": "Limits used by optimization",
      "idx": 10,
      "schema": {},
      "defaultValue": {},
      "value": {},
      "hasScenarioValue": false
    }
  ],
  "summary": {
    "templateCount": 1,
    "configuredCount": 0
  }
}
```

The GET endpoint must not insert scenario rows. It only overlays current scenario values onto templates.

### `PUT /api/scenario/:id/parameters`

Saves actual values for the scenario:

```json
{
  "items": [
    {
      "code": "solver_limits",
      "value": {
        "maxIterations": 120
      }
    }
  ]
}
```

Behavior:

- validate scenario id exists and is not `0`;
- reject saves when scenario status is `RUNNING`;
- validate each code against `scenario_id = 0` templates;
- upsert rows by `(scenario_id, code)`;
- store only `{ "value": ... }` in scenario rows;
- copy `description`, `idx`, and `type` from template into scenario rows for easier inspection, but treat template as authoritative when reading.

### Duplicate Scenario

When duplicating a scenario, copy source scenario parameter rows to the new scenario. If the source lacks a row for a template code, the duplicate also lacks it and continues to inherit the template default.

## Frontend UX

In `ScenarioBasicInfo`, add an "Optimization Parameters" row above the existing Comment field for RO/TO scenarios.

The row displays a compact summary:

- `Using defaults` when no scenario-specific values exist;
- `N configured / M templates` when one or more scenario values exist.

Clicking the row opens a standard `@rois/ui` `AppDialog` titled `Optimization Parameters`.

Dialog behavior:

- load parameters lazily when opened;
- show a loading state and a clear failure state;
- render items in template order;
- group each item by `code`, `description`, and editor type;
- disable editing when the scenario status is `RUNNING`;
- Save writes all current values with `PUT /api/scenario/:id/parameters`;
- Cancel closes without saving.

Editor behavior:

- `OBJ`: render form controls from schema fields.
- `LIST`: render a CSV/list text area for the first implementation, preserving the exact saved value shape defined by the template.

The UI text must be English by default.

## Optimization Export

Extend `buildRoInputGz()` to include a `scenario_parameter` section.

Export all template-supported codes for the scenario:

- if a scenario row exists, export its `value`;
- otherwise export the template `defaultValue`;
- order by template `idx`, then `code`;
- include `scenario_id` as the running scenario id, not `0`, so downstream consumers can treat the export as the effective parameter set for that scenario.

This keeps `/api/scenario/:id/run` unchanged. The optimizer receives parameters through the existing `/api/scenario/export` ro_input.gz pull flow.

## New Scenario Behavior

Creating a new scenario does not create parameter rows. The Scenario detail UI shows template defaults on demand. Rows are created only after the user saves parameter edits.

## Tests

Backend:

- service/API test for GET merge behavior: scenario with no rows returns template defaults and does not insert rows;
- PUT rejects unknown code;
- PUT stores only `{ value }` and upserts by `(scenario_id, code)`;
- duplicate copies source scenario value rows;
- export includes effective parameter rows with defaults filled in.

Frontend:

- component/store test for API client and summary rendering where feasible;
- Playwright test in `e2e/gantt/` that opens a scenario, opens Optimization Parameters, edits an OBJ field and a LIST field, saves, reopens, and verifies the saved values and summary.

Required verification after implementation:

- focused live-server Vitest tests;
- focused Gantt/React tests if added;
- `npm run check:ui`;
- focused Playwright scenario parameter test.

## Risks And Constraints

- The template schema format must stay simple. Do not build a full JSON Schema engine unless a future requirement needs it.
- Parameter loading must be lazy and separate from scenario detail loading, so it does not affect Gantt/scenario first paint.
- `scenario_id = 0` is a template convention and must be protected in API code.
- The first LIST editor should be intentionally modest: CSV/text or rows array based on template declaration, not a spreadsheet-grade grid.
