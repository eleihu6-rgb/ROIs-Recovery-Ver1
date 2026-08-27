# Ground Duty Credit Display Design

## Context

The Live Gantt ground task editor currently shows crew, assignment, group, start/end,
duration, and remark. Some ground duties imported from upstream NOC carry persisted
credit minutes. Users need to see that credit when editing an existing ground duty,
without editing it in Gantt.

Ground duties are Live roster rows where `roster_flight.pairing_id IS NULL`.
The credit source is the Live schema `roster_flight` table, not PBS:

- Primary source: `roster_flight.act_credited_minutes`
- Fallback source: `roster_flight.sch_credited_minutes`

The upstream ground import path stores imported ground-duty credit into
`roster_flight.act_credited_minutes`. Manual create-mode credit preview is out of scope.

## Requirements

1. In `Edit Ground Task`, add a read-only `Credit` row after `Group` and before `Start`.
2. Display persisted roster credit only:
   - Use `editItem.actCreditedMinutes` from `roster_flight.act_credited_minutes` first.
   - If absent, use `editItem.schCreditedMinutes` from `roster_flight.sch_credited_minutes`.
   - If both are absent, invalid, or zero, display `-`.
3. Keep `Create Ground Task` unchanged. Do not calculate preview credit from assignment metadata.
4. Do not allow editing credit in the dialog. Saving a ground task must not send credit fields.
5. Keep the dialog compact and consistent with existing read-only rows.

## Design

### Frontend UI

Update `gantt/src/components/roster/ground-task-dialog.tsx`.

Add a helper that formats a persisted credit-minute value into the existing Gantt duration style.
The helper should accept string/number/null values, reject invalid values, and treat non-positive
values as no credit.

In edit mode only, render:

- label: `Credit`
- value: formatted credit, or `-`
- read-only affordance matching existing locked/read-only fields

The row should use the same two-column grid as `Crew ID` and `Group`, with token-based classes
already used in the dialog. No new color system or layout abstraction is needed.

### Data Flow

The existing `/api/roster` response already includes:

- `actCreditedMinutes`
- `schCreditedMinutes`

These fields are selected in `live-server/src/services/roster/roster-service.ts` from:

- `rosterFlight.actCreditedMinutes`
- `rosterFlight.schCreditedMinutes`

The dialog receives the selected roster row as `groundTaskEditItem`; no additional API call is
needed.

### Backend

No backend change is required for this feature. The backend already exposes the needed fields in
the Gantt roster DTO.

### Out Of Scope

- Editing credit.
- Calculating credit from `assignment.fixed_credit_min`, `assignment.credit_pct`, or duration.
- Showing credit in create mode before a row exists.
- Changing upstream import behavior.
- Changing monthly credit/KPI calculations.

## Testing

Add or update Playwright coverage for the Live Gantt ground task dialog:

1. Open an existing imported/saved ground duty with persisted credit.
2. Assert the `Credit` row is visible in edit mode.
3. Assert the displayed value comes from `actCreditedMinutes` when present.
4. Assert create mode does not show a credit preview row.

If a stable fixture with persisted ground-duty credit is unavailable in the existing E2E dataset,
mock or seed through the existing test hook only within the test context, without polluting live
business data.

Run required frontend verification after implementation:

- targeted Playwright test for the ground task dialog
- `npm run check:ui`

Runtime frontend code changes must increment `FRONTEND_VERSION` in `gantt/src/version.ts`.

## Risks

- Some existing ground duties may have no persisted credit. Those should display `-`, not a
  calculated value.
- The current dialog is a custom overlay rather than `AppDialog`. This feature will not refactor
  the popup framework because that would expand scope beyond the requested credit display.
