# Scenario Broad Search Design

Date: 2026-06-26

## Problem

The Scenario list search box currently searches only `scenario.name`. A user can see a scenario id in another context, such as `577`, type it into the Scenario search box, and get no result because the frontend sends `name=577` and the backend applies only `scenario.name ILIKE '%577%'`.

The search box should behave like a useful "find scenario" control. Users may know only a partial scenario id, scenario name, updated user code, or updated user display name.

## Chosen Approach

Implement backend broad search with one general query parameter: `search`.

The frontend will send the user's raw search term as `search`, while preserving the existing type and status filters. The backend will apply the broad search across the full scenario table before pagination, so the returned rows and total count stay correct.

## Search Semantics

When `search` is non-empty after trimming, the backend applies a case-insensitive partial match against:

- `scenario.id::text`
- `scenario.name`
- `scenario.updated_by`
- `users.user_name`

The broad search is grouped with `OR`, then combined with existing filters using `AND`:

- `fileType`
- `status`
- pagination

Example:

```text
GET /api/scenario?page=1&pageSize=20&fileType=RO&search=577
```

This should return RO scenarios whose id contains `577`, name contains `577`, updater code contains `577`, or updater display name contains `577`.

## Compatibility

The backend should accept the current `name` query during transition, treating it as a fallback search term when `search` is absent. The frontend will move to `search`.

This avoids breaking older tests, scripts, or open browser sessions that still send `name`.

## Frontend Changes

- Rename Scenario store state from name-specific wording to search-term wording where practical.
- Send `search` through `scenarioApi.list`.
- Update the search input placeholder to communicate the broader scope, for example `Search ID, name, or user...`.
- Keep the existing 300 ms debounce, page reset, and type/status filter behavior.

## Backend Changes

- Extend the route query schema with optional `search`.
- Update `scenarioService.list` to receive `search` and fallback `name`.
- Build one broad search condition and include it in both item and count queries.
- Include the final term in the scenario list cache key.

## Testing

- Add or update live-server service tests proving broad search includes id, name, updated user code, and updated user display name conditions.
- Add or update a Gantt UI test that types a scenario id fragment and expects the row with that id badge to appear.
- Run TypeScript checks for touched frontend/backend modules.
- Because this is a UI behavior change, run the relevant Playwright scenario-list search test through the real UI.

## Versioning

This crosses frontend and backend runtime code, so increment both:

- `BACKEND_VERSION`
- `FRONTEND_VERSION`

## Non-Goals

- Do not load the full scenario list into the browser for local filtering.
- Do not add a separate advanced-search UI.
- Do not change scenario ordering beyond the existing most-recently-updated ordering within matched results.
- Do not add fuzzy ranking or weighted search in this change.
