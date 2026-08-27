# Scenario Keyword Search Design

## Goal

Enhance the Gantt Scenario list search so one keyword can find scenarios by:

- scenario id
- scenario name
- created user
- updated user

Search must be case-insensitive and must continue to work with the existing scenario type and status filters.

## Current Behavior

The Gantt Scenario panel has one search input in `gantt/src/components/scenario/scenario-search-bar.tsx`.
The store sends the input value as `name` through `gantt/src/services/scenario-api.ts`.
`live-server` currently applies that value only to `scenario.name` with a case-sensitive `LIKE`.

Because the server handles pagination, filtering only on the frontend would produce incorrect totals and missing matches outside the current page.

## Proposed Behavior

Keep the existing search box and existing API request shape, but broaden the backend meaning of the existing `name` query parameter to be a general keyword search.

When `name` is present after trimming whitespace, `live-server` will match it against:

- `scenario.id::text`
- `scenario.name`
- `scenario.created_by`
- `scenario.updated_by`

Text fields will use case-insensitive matching. Numeric input such as `541` will match scenario id `541` and any name/user text containing `541`.

The existing `fileType` and `status` filters remain conjunctive filters. For example, searching `yvr` while type is `RO` and status is `DONE` returns only RO/DONE scenarios whose id, name, created user, or updated user matches `yvr`.

## UI Changes

The Scenario search input remains in the same location and keeps the existing debounce behavior.

Update the placeholder from the generic scenario wording to:

`Search ID, name, or user...`

No new controls or layout changes are required.

## API Compatibility

The API continues to accept `GET /api/scenario?name=<keyword>`.

This avoids changing the frontend/backend contract for existing callers. The parameter name is imperfect, but preserving it keeps the change small and backward-compatible.

## Implementation Notes

- Trim the query before storing or sending it where practical.
- Use Drizzle/SQL expressions instead of frontend-only filtering.
- Use parameterized SQL through Drizzle helpers or `sql` bindings; do not concatenate raw user input into SQL.
- Use lower-case comparisons or PostgreSQL `ILIKE` semantics for case-insensitive text search.
- Include the keyword in the scenario list cache key after trimming so old and new searches do not collide.

## Testing

Add or update `live-server` scenario service tests to cover:

- scenario id keyword match
- case-insensitive scenario name match
- case-insensitive `created_by` match
- case-insensitive `updated_by` match
- keyword search combined with type/status filters

Run the relevant TypeScript checks/tests after implementation:

- `cd live-server && npm test -- scenario-service`
- `cd gantt && npx tsc --noEmit`

If the exact test command differs in this repo, use the closest existing scenario service test command.

## Out of Scope

- Adding separate advanced search fields.
- Changing scenario list pagination behavior.
- Renaming the API query parameter from `name` to `keyword`.
- Searching comments, dates, rule set id, workset id, or task id.
