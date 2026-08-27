# Scenario List Item Layout Design

## Goal

Make each scenario row easier to scan and slightly denser so more scenarios are visible in the Scenario page list without removing useful metadata.

## Scope

This is a Gantt frontend-only change in `gantt/src/components/scenario/scenario-list-item.tsx`. It does not change APIs, stores, scenario data types, backend behavior, or database schema.

## Current State

The scenario list item renders three rows:

- Row 1: `#id`, scenario name, type badge, and a small status dot.
- Row 2: UI date range from `formatUiDateRange` plus optimization count.
- Row 3: source, `updatedBy`, and relative `updatedAt`.

The list already receives all required fields through `ScenarioItem`: `id`, `name`, `fileType`, `status`, `strDtLoc`, `endDtLoc`, `optimizedCount`, `leadinLive`, `updatedBy`, and `updatedAt`.

## Approved Design

Row 1 becomes:

```text
RO  524  RO-DUP-SRC-1781803508099  [status icon]
```

- Move the `PO/RO/TO` type badge before the scenario ID.
- Render the type badge with the neutral badge color and the scenario ID badge with the type-specific color.
- Keep the scenario ID without a `#` prefix.
- Replace the small status dot with a meaningful lucide icon and tooltip.
- The status icon must also have an accessible text label so tests and assistive technologies can identify the status without relying on color.

Row 2 becomes:

```text
1-31 May 2026 · Kevin Zhang · 0 optimized rosters · 6 days ago
20 May-10 Jun 2026 · Kevin Zhang · 3 optimized rosters · 6 days ago
```

- Use compact date range formatting:
  - Same month and year: `1-31 May 2026`.
  - Same year but different months: `20 May-10 Jun 2026`.
  - Different years: include both years, e.g. `28 Dec 2025-3 Jan 2026`.
  - Same day: `1 May 2026`.
- Move the modifier display name into row 2 before the optimized roster count.
- Move the relative update time into row 2 after the optimized roster count.
- Render strict relative time without `about`, and shorten minute labels to `min` / `mins`.
- Label the count as compact result text: `0 results`, `1 result`, `3 results`.
- Highlight the result count when it is greater than 0; keep `0 results` muted like the surrounding metadata.

There is no third row.

## User Display Name

The Scenario list API should enrich `scenario.updated_by` with a human display name:

- Join `scenario.updated_by` to `users.user_code`.
- Return `updatedByName` in list/detail-compatible DTOs when a matching user row exists.
- The frontend displays `updatedByName ?? updatedBy ?? "—"` so system/service accounts still render a stable fallback.
- Do not fetch user names with per-row frontend calls.

## Status Icon Mapping

- `DRAFT`: `Pencil`, tooltip `Draft`
- `RUNNING`: `LoaderCircle`, tooltip `Running`
- `DONE`: `CheckCircle2`, tooltip `Done`
- `FAILED`: `AlertCircle`, tooltip `Failed`
- `PUBLISHED`: `UploadCloud`, tooltip `Published`

The running icon may use pulse or spin animation, but the tooltip and accessible label are the primary status indicator.

## Testing

Add a focused component test for `ScenarioListItem` that verifies:

- Type badge appears before the ID badge in the first row.
- Status is exposed as an icon label and no status dot is rendered.
- Date range uses compact scenario format.
- The third row/source text is not rendered.
- User display name and relative update time are rendered on row 2.
- Optimized roster copy uses singular/plural correctly.
- Optimized roster count has highlight styling when count is greater than zero.

Add a backend service test that verifies the scenario list result carries `updatedByName` from the joined `users.user_name` value.

Run:

```bash
cd gantt && npm test -- src/components/scenario/__tests__/scenario-list-item.test.tsx
cd live-server && npm test -- src/__tests__/services/scenario/scenario-service.test.ts
cd gantt && npx tsc --noEmit
cd live-server && npm run build
```

## Out Of Scope

- Scenario filtering, sorting, and paging.
- Backend scenario list API.
- Scenario detail panel.
- Global project date formatter changes.
- New dependencies.
