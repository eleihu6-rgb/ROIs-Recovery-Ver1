# S3 Pairing Import Design

Date: 2026-07-04

## Goal

Add an `S3 Pairing` action to the Scenarios list screen. The action opens an `S3 Pairing Import` dialog that imports a CrewPlan `*.PRG` pairing file into Scenario pairing tables:

- `scenario.pairing`
- `scenario.pairing_segment`
- `scenario.pairing_composition`

Every imported row must use the selected or newly created PO scenario id as `scenario_id`.

## User Flow

1. User opens the `Scenarios` screen.
2. User clicks the `S3 Pairing` download-icon button in the Scenarios list toolbar. The button sits to the left of the existing `Import PBS material` button.
3. Dialog title is `S3 Pairing Import`.
4. User selects a `*.PRG` file.
5. User selects one target mode:
   - `Existing PO Scenario`: choose an existing PO scenario from a dropdown.
   - `New Pairing Scenario`: create a new PO scenario during import.
6. If `Existing PO Scenario` is selected, user can choose whether to clear that PO scenario's existing pairing data before import.
7. If `New Pairing Scenario` is selected, user fills:
   - scenario date range
   - Base dropdown
   - Division dropdown
8. Footer actions:
   - `Cancel`
   - `Import PO`
9. On import success, show a summary and open or refresh the target PO scenario tab.

## UI Design

The button belongs in `gantt/src/components/scenario/scenario-list-panel.tsx`, in the Scenarios list toolbar. It sits immediately to the left of the existing `Import PBS material` upload button.

The button uses the lucide `Download` icon, has accessible label `S3 Pairing`, and tooltip text `S3 Pairing`.

The dialog should be a new focused component under `gantt/src/components/scenario/`, for example `s3-pairing-import-dialog.tsx`.

Controls:

- File input accepts `.PRG,.prg`.
- Target mode uses a segmented/radio control.
- Existing PO dropdown lists only `fileType=PO` scenarios.
- Clear-before-import is a checkbox shown only for existing target mode.
- New scenario fields are shown only for new target mode.
- Base and Division dropdowns must load from existing backend/base metadata or dictionary APIs. They must not hardcode airline-specific values.
- `Import PO` is disabled until required fields are complete.
- During import, the dialog is not dismissible and the button shows a loading state.

## Approaches Considered

### Approach A: Frontend Parses PRG, Backend Inserts JSON

The browser reads the PRG file and sends parsed records to the backend.

Trade-offs:

- Fast to prototype.
- Harder to audit and test against database mapping.
- Duplicates fixed-width parsing logic in a UI layer.
- Riskier for sensitive scheduling data because more raw data is handled in the browser.

### Approach B: Backend Synchronous Multipart Import

The frontend posts the PRG file and options as `multipart/form-data`; live-server parses and imports inside a database transaction.

Trade-offs:

- Keeps parsing, validation, and persistence together.
- Matches existing multipart patterns in live-server.
- Simple user feedback for files like the provided 805 KB sample.
- Request can take longer for much larger files, so the service should enforce a file size limit and return clear validation errors.

This is the recommended first implementation.

### Approach C: Backend Async Import Job

The frontend uploads the file, backend enqueues an import job, and UI polls import status.

Trade-offs:

- Best for very large files and long-running imports.
- More infrastructure and UI state.
- Not needed for the current provided PRG size and workflow.

This can be added later if import latency becomes a problem.

## API Design

Add Scenario import endpoints under live-server:

### `GET /api/scenario/import-targets/po`

Returns selectable PO scenarios:

```json
{
  "items": [
    {
      "id": 123,
      "name": "Feb PO",
      "strDtLoc": "2026-02-01T00:00:00.000Z",
      "endDtLoc": "2026-02-28T00:00:00.000Z"
    }
  ]
}
```

This endpoint may reuse the existing scenario list service with `fileType=PO`.

### `POST /api/scenario/s3-pairing-import`

Multipart fields:

- `file`: required PRG file.
- `targetMode`: `existing` or `new`.
- `targetScenarioId`: required for `existing`.
- `clearBeforeImport`: boolean; only meaningful for `existing`.
- `newScenarioName`: optional for `new`; default `S3 Pairing <filename>`.
- `newStrDtLoc`: required for `new`.
- `newEndDtLoc`: required for `new`.
- `newBase`: required for `new`.
- `newDivision`: required for `new`.

Response:

```json
{
  "scenarioId": 456,
  "createdScenario": true,
  "importedPairings": 120,
  "importedSegments": 300,
  "importedCompositions": 240,
  "warnings": []
}
```

## Backend Design

Add a Scenario-specific import service, for example:

- `live-server/src/services/scenario/s3-pairing-prg-parser.ts`
- `live-server/src/services/scenario/s3-pairing-import-service.ts`

Do not reuse `processPairingImportJob` directly because that worker targets live `f8.*` tables and its Drizzle models do not carry scenario partition semantics. This import writes explicitly to the `scenario` schema and must include `scenario_id`.

For a new target scenario:

- Create a `scenario` row with `file_type='PO'`.
- Use the user-provided date range, Base, and Division.
- Store Base and Division in `filter_params` so the scenario remains searchable/configurable without adding schema fields.
- Use existing `scenarioService.create` so workset creation, audit fields, status, and cache invalidation follow current rules.

For an existing target scenario:

- Validate that the scenario exists and `file_type='PO'`.
- If `clearBeforeImport=true`, delete in dependency order:
  1. `scenario.pairing_composition where scenario_id=$target`
  2. `scenario.pairing_segment where scenario_id=$target`
  3. `scenario.pairing where scenario_id=$target`
- If roster rows reference the target pairing ids, refuse the cleanup with a clear error instead of deleting roster data implicitly.

Import transaction:

- Parse the PRG file into in-memory normalized records.
- Validate required fields before any insert.
- Insert pairings, then segments, then compositions.
- Keep a mapping from PRG logical key `(pairingNumber, pairingDate)` to inserted `pairing.id`.
- Use `source='IMPORT'`, `created_by/updated_by` from the authenticated user, and `interface_id='S3:<pairingNumber>:<pairingDate>'`.
- Roll back the entire import if any pairing group fails structural validation.

## PRG Parsing

The parser reads fixed-width CrewPlan PRG lines. `docs/modules/connector-server/Planout.doc` identifies at least these record types:

- Record type `1`: Pairing master record.
- Record type `2`: Pairing online segment record.
- Record type `3`: Duty break record.
- Record type `4`: Pairing offline segment record.
- Record type `5`: Non-flying activity record.

Initial implementation scope:

- Support record types `1`, `2`, and `3`, which are present in `2026_FEB_PILOT_PAIRINGS_A_CT.PRG`.
- Reject files containing unsupported record types `4` or `5` with a validation message unless they can be safely ignored by explicit parser rules.
- Parse positions from `Planout.doc` into named constants, not scattered substring offsets.
- Convert `YYYYMMDD + minutes since midnight` into UTC timestamps consistently.
- Treat `Positions` values like `CA01FO01` as pairing composition slots.
- Derive `duty_seq` from record type `3` duty period number and match type `2` segment sequence into the right duty window.
- Set defaults only where the Scenario schema requires them and the PRG format lacks the field:
  - `filiale='F8'`
  - `assignment_group='FLY'`
  - `assignment='FLY'`
  - `source='IMPORT'`
  - `airline='F8'`
  - `seg_assignment='FLY'`
  - `duty_acc_state='D'`

The parser must have unit tests using the provided `2026_FEB_PILOT_PAIRINGS_A_CT.PRG` sample. Tests should assert the first pairing `T4101` creates:

- one pairing header per type `1` occurrence
- two segment rows for the first occurrence
- one duty break row mapped to the duty fields
- `CA=1` and `FO=1` pairing composition slots

## Data Refresh And Cache

After import:

- Invalidate scenario list/detail cache for the target scenario.
- Refresh the Scenario list so a newly created PO scenario appears immediately.
- If the target scenario tab is already open, frontend should refresh its Gantt data.
- Opening the target PO scenario should show imported pairings in the pairing pane. Since PO scenario capabilities already default to `pairing + flight`, no new pane capability is required.

## Validation And Errors

Frontend validation:

- File must exist and extension must be `.PRG`.
- Existing mode requires a PO scenario.
- New mode requires date range, Base, and Division.

Backend validation:

- Reject non-multipart requests.
- Reject missing or empty file.
- Reject files over the configured limit.
- Reject target scenario ids that are not PO scenarios.
- Reject unsupported PRG record types.
- Reject malformed dates/times.
- Reject orphan segment/duty rows that do not match a pairing master record.
- Return a compact summary of validation errors without logging full PRG contents.

## Security

- Do not log raw PRG file contents.
- Do not store the uploaded file on disk in the first implementation.
- Use authenticated user identity for audit fields.
- Keep API base URL usage through existing frontend API client.
- Do not introduce new dependencies unless their license and maintenance status are reviewed.

## Testing

Backend:

- Unit tests for PRG fixed-width parser.
- Unit tests for new scenario creation payload.
- Route tests for multipart validation and PO-only target validation.
- Service tests for clear-before-import delete order and transaction rollback.

Frontend:

- Component tests for dialog validation states.
- Service test for multipart request construction.
- Scenario list panel test that the download-icon `S3 Pairing` button is placed before `Import PBS material` and opens the import dialog.

Manual verification:

- Import the provided PRG into a newly created PO scenario.
- Import into an existing empty PO scenario.
- Import into an existing PO scenario with `clearBeforeImport=true`.
- Confirm imported rows in `scenario.pairing`, `scenario.pairing_segment`, and `scenario.pairing_composition` all use the target scenario id.
- Open the target Scenario Gantt and verify pairing rows render.

## Out Of Scope

- Async import job dashboard.
- Storing uploaded PRG files.
- Importing roster assignments.
- Modifying `sql/schema/` DDL.
- Supporting all CrewPlan record types beyond those required by the provided PRG sample.
