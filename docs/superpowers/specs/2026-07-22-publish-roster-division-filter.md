# Publish Roster Division Filter

Date: 2026-07-22

## Context

The Live Gantt `Publish Roster` dialog currently compares `roster_flight` with `roster_publish` through:

- Frontend: `gantt/src/components/roster/roster-publish-dialog.tsx`
- API contract: `gantt/src/services/roster-publish-api.ts`
- Backend route: `live-server/src/routes/roster/roster-publish.ts`
- Backend service: `live-server/src/services/roster/roster-publish-service.ts`

The dialog already loads reference data through `useReferenceStore.load()`, and that store already fetches `GET /api/division` from the live `division` master table into `referenceStore.divisions`.

The live schema has:

- `division.division`, `division.description`
- `crew.division`
- `roster_flight.crew_id -> crew.crew_id`
- `roster_publish.crew_id`, joined back to the same `crew_scope`

## Requirement

Add a multi-select `Division` filter to the `Publish Roster` dialog.

- Options come from the `division` table via existing `GET /api/division`.
- Default selection is `P`.
- Selecting `P` filters to only `crew.division = 'P'` crew and their roster/publish rows.
- Selecting `C` filters to only `crew.division = 'C'` crew and their roster/publish rows.
- Multi-select supports mixed division results, for example `P + C`.
- When a dropdown filter changes, the table should automatically run the query again.

## Proposed Design

### Frontend

Extend `RosterPublishDialog` filters with `divisions: string[]`.

Default:

```ts
divisions: ['P']
```

Add a `Division` `MultiSelectDropdown` in the filter grid using `useReferenceStore((s) => s.divisions)`.
Build options from `division.division` and `description`, for example `P - 飞行员` when a description exists.

Extend `RosterPublishDiffRequest` with:

```ts
divisions?: string[]
```

`buildRequest()` sends the selected divisions. Reset returns to default `P`, while preserving the current roster period.

Dropdown filters should auto-query after user changes:

- `Roster Period`
- `Crew Fleet`
- `Bases`
- `Division`
- `Publish Status`
- `Status`

Text inputs should not auto-query on every keystroke:

- `Crew ID`
- `Pairing ID`
- `Pairing Label`

The auto-query should only fire when the dialog is open and a valid roster period exists. It should not fire while the initial roster periods/reference data are still loading, and it should not run during publish apply. The manual `Search` button remains available for text input filters and explicit refresh.

### Backend Route

Extend `diffRequestSchema` with:

```ts
divisions: z.array(z.string()).optional()
```

No new endpoint is needed.

### Backend Service

Extend `RosterPublishDiffInput` with:

```ts
divisions?: string[]
```

In `diffSql()`, apply division filtering inside `crew_scope`:

```sql
and ($12::text[] is null or c.division = any($12::text[]))
```

Because both `source_rows` and `publish_rows` join `crew_scope`, this filters both live roster rows and existing published rows by authoritative `crew.division`. This matches the requirement and avoids relying on `roster_flight.division`, which can drift from the crew master.

Normalize division values using the existing list-normalization pattern, uppercasing the values before sending them to SQL.

### Apply Behavior

`applyDiff()` re-loads the selected keys by key only. That is acceptable because keys are generated from the currently filtered diff. Stale key protection still applies if the rows no longer match.

No division needs to be sent to `/apply`.

## Impact Analysis

GitNexus CLI impact was run because MCP tools were not exposed in this session.

- `RosterPublishDialog`: LOW risk. Direct caller is `GanttSubToolbar`; transitive callers are `RosterView` and `ModuleView`.
- `buildRequest`: LOW risk. Direct caller is `runSearch`; also used by `applySelected` through `lastRequest`.
- `listDiff`: LOW risk. Direct impact is `rosterPublishRoutes` and `applyDiff`.
- `normalizeList`: LOW risk. Direct impact is `listDiff`; indirect impact is `rosterPublishRoutes` and `applyDiff`.

No HIGH or CRITICAL impact was reported.

## Tests

Update or add:

- `gantt/src/components/roster/__tests__/roster-publish-dialog.test.tsx`
  - Asserts `Division` is rendered from reference data.
  - Asserts default diff request includes `divisions: ['P']`.
  - Asserts reset restores `P`.
  - Asserts dropdown changes trigger a new `diff` request.
  - Asserts typing text filters does not auto-query until `Search`.

- `e2e/tests/gantt/roster-publish-dialog.spec.ts`
  - Mock `/live/api/division`.
  - Assert Division options are visible and default query sends `['P']`.
  - Select `C` or `P+C` and assert request body carries the selected divisions.
  - Assert changing a dropdown filter refreshes the table without pressing `Search`.

- `live-server/src/__tests__/services/roster/roster-publish-service.test.ts`
  - Assert generated params include normalized division filter.
  - Assert SQL contains `c.division = any(...)` in `crew_scope`.

Potential verification commands after implementation:

```bash
cd live-server && npm test -- src/__tests__/services/roster/roster-publish-service.test.ts
cd gantt && npm test -- src/components/roster/__tests__/roster-publish-dialog.test.tsx
cd gantt && npm run check:ui
cd e2e && npx playwright test tests/gantt/roster-publish-dialog.spec.ts --config config/playwright.local.config.ts
```

## Open Points

The requirement names `P` and `C`. The `division` table and `crew.division` schema also allow `A`. The implementation should show every division returned by the division table; the default remains `P`.

## Approval

Implementation should start only after user approval, per the repository brainstorming-first rule.
