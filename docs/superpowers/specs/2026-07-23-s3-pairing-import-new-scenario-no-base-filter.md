# S3 Pairing Import: New Scenario Without Base Filter

Date: 2026-07-23

## Goal

Adjust the S3 Pairing import flow so that **`New Pairing Scenario` does not require Base selection**.

The import must:

- import the PRG file **fully** into the new PO scenario
- not use Base as an import filter
- keep the existing PO target path unchanged
- leave Pairing filtering to the RO scenario UI after import

## User-facing change

In `S3 Pairing Import`:

- when `New Pairing Scenario` is selected, hide/remove the Base control
- date range and Division remain required
- import button stays disabled until required fields are complete

## Behavioral rules

- `Existing PO Scenario` mode is unchanged
- `New Pairing Scenario` mode must not ask for Base
- the backend must not reject new imports for missing Base
- the backend must not narrow imported pairings by Base in new-scenario mode
- the created scenario should still be a PO scenario and remain searchable in the scenario list

## Implementation scope

- `gantt/src/components/scenario/s3-pairing-import-dialog.tsx`
- `gantt/src/components/scenario/scenario-list-panel.tsx`
- `gantt/src/services/scenario-api.ts`
- `live-server/src/routes/scenario/scenario.ts`
- `live-server/src/services/scenario/s3-pairing-import-service.ts`
- touched-area tests for the dialog, API payload, route parsing, and import service

## Acceptance

1. Selecting `New Pairing Scenario` no longer shows Base.
2. Importing a PRG file into a new scenario succeeds without any Base selection.
3. The imported pairing set is not filtered by Base.
4. Existing PO scenario imports still work.
5. Regression tests cover the new no-Base path.
