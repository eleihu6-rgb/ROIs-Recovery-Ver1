# Scenario Versions Tab and Historical Gantt Design

Date: 2026-08-01
Status: Pending approval
Scope: `live-server`, `engine-server`, `gantt`, `sql/migration`

## Goal

Add a `Versions` tab to Scenario details so every completed optimizer run is preserved as a historical version. Each version records who ran it, when it ran, the archived file timestamp/path, and whether it matches the currently loaded scenario result in the database. Users can delete a historical version, open Gantt from that version's archived files, and inspect Algorithm Parameter / legality-rule differences when the archived run differs from the current Scenario configuration.

The existing behavior where each successful run overwrites the current Scenario optimization data in the database remains unchanged.

## Current State

- Scenario master table has `scenario.file_path varchar(500)`, plus `file_size`, `checksum`, and `task_id`.
- `engine-server` archives successful RO/LegacyRO runs with `FileManager.move_to_complete(source, airline, scenario_id)`.
- The archive path is currently `complete/<airline>/<scenario_id>` and repeated runs are disambiguated by appending a timestamp to the scenario directory name.
- `engine-server` then posts result metadata to `live-server POST /api/scenario/result` with `filePath`, `fileSize`, `checksum`, `taskId`, `kpi`, and `resultMeta`.
- `live-server.saveResult` stores the single file pointer, increments `optimized_count`, and loads the latest output into scenario DB tables.
- Current Scenario Gantt can already build from archived `input.gz` + `output.gz` via `buildGanttDataSnapshot`, and current DB-backed Gantt builds from scenario DB tables.
- `DONE -> RUNNING` is not currently allowed by the `VALID_TRANSITIONS` state machine. This behavior is unchanged by this requirement; users must use the existing Remove Optimization Result flow before running the scenario again.

## Data Model

Migration:

```sql
alter table scenario add column if not exists file_paths jsonb not null default '[]'::jsonb;

update scenario
   set file_paths = jsonb_build_array(jsonb_build_object(
     'version', 'v0',
     'taskId', task_id,
     'filePath', file_path,
     'fileSize', file_size,
     'checksum', checksum,
     'executedBy', updated_by,
     'executedAt', updated_at,
     'fileTimestamp', to_char(updated_at, 'YYYYMMDD_HH24MISS'),
     'archivePath', regexp_replace(coalesce(file_path, ''), '/output\.gz$', ''),
     'status', status
   ))
 where file_path is not null
   and coalesce(jsonb_array_length(file_paths), 0) = 0;

alter table scenario drop column if exists file_path;
comment on column scenario.file_paths is 'JSONB array of archived optimizer run versions for this scenario';
```

Drizzle model changes:

- Replace `filePath: varchar('file_path')` with `filePaths: jsonb('file_paths').notNull().default([])`.
- Keep existing `file_size`, `checksum`, and `task_id` as the current-result pointers and compatibility fields.

Version JSON object:

```json
{
  "version": "v0",
  "taskId": "task-uuid",
  "status": "DONE",
  "archivePath": "/opt/rois/engine/complete/F8/713/v0/20260801_185341",
  "filePath": "/opt/rois/engine/complete/F8/713/v0/20260801_185341/output.gz",
  "inputPath": "/opt/rois/engine/complete/F8/713/v0/20260801_185341/input.gz",
  "fileSize": 123456,
  "checksum": "sha256",
  "executedBy": "yuan.z",
  "executedAt": "2026-08-01T18:53:41.000Z",
  "fileTimestamp": "20260801_185341",
  "algorithmSnapshot": {
    "metaPath": "algorithm_meta.json",
    "argsPath": "algorithm_args.txt",
    "floorRescueRulesPath": "FLOOR_RESCUE_RULES.json"
  },
  "ruleSnapshot": {
    "rulesetId": 103,
    "path": "ruleset_parameters.json"
  }
}
```

Version numbers are append-only labels. Deleting `v1` must not renumber later versions. The next version number is `max(existing numeric suffix) + 1`, starting at `v0`.

`Current` in UI is derived from `scenario.task_id === version.taskId` or, as fallback, `scenario.checksum === version.checksum`. No separate `current_version` column is required for the first implementation.

## Engine Archive Layout

New successful archive path:

```text
complete/<airline>/<scenarioId>/<version>/<timestamp>/
  input.gz
  output.gz
  algorithm_args.txt
  algorithm_meta.json
  FLOOR_RESCUE_RULES.json
  ruleset_parameters.json
  ro_input.txt
  output/result.json
```

Implementation notes:

- `live-server` owns version allocation because it owns `scenario.file_paths`. Version allocation is only needed for a new run after the scenario has been returned to DRAFT through Remove Optimization Result.
- `engine-server FileManager.move_to_complete` accepts optional `version` and `timestamp`, then writes into `complete/<airline>/<scenarioId>/<version>/<timestamp>`.
- If the requested archive directory exists, append a short suffix after timestamp to avoid overwriting.
- `cleanup_expired_complete_files()` should be disabled for `complete` retention for now. The code path can return `True` with a log line such as "complete retention cleanup disabled for scenario version history". Do not delete or compress complete entries, because historical Gantt must read `input.gz` and `output.gz` directly.
- `_cleanup_report_scenario_dir()` only affects the separate PBS report material directory and can remain unchanged unless it points to the same directory.

## Parameter Snapshots

Algorithm Parameters:

- Keep existing `algorithm_args.txt`, `algorithm_meta.json`, and `FLOOR_RESCUE_RULES.json` generated by `Task._materialize_algorithm_parameters`.
- Store relative filenames in the version object.
- Diff source of truth for current values is `live-server scenarioParameterService.getMerged`.

Legality rules:

- Add a run-time snapshot file `ruleset_parameters.json` in the engine working directory before archive.
- The snapshot should contain the scenario `rulesetId`, workset metadata when available, rule membership, and each member rule's `param_json`.
- For the current config, live-server compares against current `scenario.ruleset_id -> rule_set -> rule.param_json`.

Diff display:

- `GET /api/scenario/:id/versions/:version/diff` returns normalized differences grouped as:
  - `algorithmParameters`
  - `ruleParameters`
- If both groups are empty, the Versions tab hides the "View Differences" button for that row.
- The first implementation can use a stable JSON comparison with path/value rows. It does not need semantic rule-table rendering yet.

## Live Server API

Add:

- `GET /api/scenario/:id/versions`
  - Returns normalized `file_paths` versions, sorted by version number descending.
  - Adds `isCurrent` and `hasDifferences`.

- `DELETE /api/scenario/:id/versions/:version`
  - Removes the version object from `file_paths`.
  - Deletes the archived directory if it is inside the configured engine complete root or asks engine-server to delete it through an authenticated route.
  - Must refuse deleting the version currently referenced by the Scenario database result. The current result must be removed through the Remove Optimization Result flow so database rows and current pointers are cleared together.

- `GET /api/scenario/:id/versions/:version/gantt-data`
  - Builds Scenario Gantt from that version's archived `input.gz` + `output.gz`.
  - Reuses `buildGanttDataSnapshot` with direct archive paths or a small `fetchVersionInput/File` adapter.
  - Returns read-only capabilities. Historical version Gantt must not acquire edit locks or save patches.

- `GET /api/scenario/:id/versions/:version/diff`
  - Returns parameter differences.

Modify:

- `POST /api/scenario/:id/run`
  - Keep the existing state-machine requirement that only DRAFT scenarios can start optimization.
  - Allocate the next version label before calling engine-server.
  - Pass `{ scenarioId, version, inputSource: 'db' }` to engine-server.
  - Set status to RUNNING and task_id as today.

- `POST /api/scenario/:id/transition`
  - Extend the existing transition request with an optional `deleteVersionFiles` boolean.
  - The option is only meaningful for a transition to `DRAFT`; omit or reject it for other target statuses.
  - Default is `false`.
  - When `deleteVersionFiles=true`, clear the current database result as today and delete all archived version directories/files for the scenario, then persist `file_paths=[]`.
  - When `deleteVersionFiles=false`, clear the current database result as today but retain all `file_paths` and archived files for later inspection.

- `POST /api/scenario/result`
  - On DONE, append a version object to `file_paths`.
  - Update current `file_size`, `checksum`, `task_id`, and DB result load exactly as today.
  - On FAILED, do not append a completed version unless the archive contains a usable `output.gz`. Failed-run logging can be a later enhancement.

Backward compatibility:

- Existing rows with only `file_path` migrate to `file_paths[0]`.
- Engine-server fallback lookup by `scenario_id` should keep finding old `complete/<airline>/<scenarioId>` and timestamp-suffixed legacy directories until all rows are migrated.

## Gantt Frontend

Scenario detail page:

- Add a fifth result tab: `Versions`.
- Use a high-density table style consistent with `ui-ux-pro-max`: strong active tab state, compact rows, clear action buttons, no card-in-card layout.
- Columns:
  - Version
  - Status marker (`Current` for the version matching current DB result)
  - Executed By
  - Executed At
  - File Timestamp
  - File Size
  - Actions
- Actions:
  - `Open Gantt`
  - `View Differences` only when `hasDifferences === true`
  - `Delete` for non-current versions, with confirmation

Remove Optimization Result dialog:

- Keep the existing `Remove Optimization Result` dialog and its current default behavior.
- Add an unchecked checkbox labeled `Delete all version files`.
- The checkbox must be unchecked every time the dialog opens.
- The confirmation request sends `deleteVersionFiles: true|false` to the existing transition endpoint.
- The description must explain the distinction:
  - unchecked: remove the current database result but retain archived versions;
  - checked: remove the current database result and permanently delete every archived file for this Scenario.
- While deletion is running, disable the checkbox, Cancel, and confirmation controls.
- After successful deletion with the option checked, the Versions tab should show no rows and the Scenario returns to DRAFT.

Historical Gantt tab:

- Prefer module keys such as `scenario-gantt:713@v0` rather than overloading `scenario-gantt:713`.
- `ScenarioGanttView` should accept an optional `version` and load from `/versions/:version/gantt-data`.
- Historical Gantt is read-only:
  - no lock acquisition
  - no save/patch-output
  - toolbar should visually label the version, e.g. `#713 Scenario Name · v0`

URL mapping:

- Current: `/altair/scenario/713`
- Historical: `/altair/scenario/713/version/v0`

## Deletion Semantics

- Deleting a non-current version removes that object from `file_paths`.
- The archived directory is deleted only when it resolves under the configured complete root. This prevents arbitrary path deletion from JSON data.
- Deleting the current version from the Versions tab is disabled because the current DB result still points to that run.
- Remove Optimization Result with `deleteVersionFiles=false` clears current DB result and transitions to DRAFT while retaining all version files.
- Remove Optimization Result with `deleteVersionFiles=true` clears current DB result, deletes all version files, and resets `file_paths` to an empty array.
- The delete-all operation must be idempotent: missing archive directories must not prevent the database transition from completing, but the API response/log must report any file deletion warning.

## Source-of-Truth Migration Audit

Old source:

- `scenario.file_path`

New source:

- `scenario.file_paths` JSONB array

Consumers to update:

- `sql/schema/live/02-crew-roster.sql`
- `sql/migration/*`
- `live-server/src/models/scenario/scenario.ts`
- `live-server/src/services/scenario/scenario-service.ts`
- `live-server/src/services/scenario/scenario-result-service.ts`
- `live-server/src/routes/scenario/scenario.ts`
- `live-server/src/services/engine-server-client.ts`
- Existing live-server tests that assert `filePath`
- `engine-server/src/files/file_manager.py`
- `engine-server/src/tasks/task_manager.py`
- `engine-server/src/api/routes.py`
- Existing engine-server file/result tests
- `gantt/src/types/scenario.ts`
- `gantt/src/services/scenario-api.ts`
- `gantt/src/services/scenario-gantt-api.ts`
- `gantt/src/stores/scenario-store.ts`
- `gantt/src/stores/scenario-gantt-store.ts`
- `gantt/src/components/scenario/scenario-kpi-section.tsx`
- `gantt/src/components/shell/scenario-gantt-view.tsx`
- `gantt/src/hooks/use-url-sync.ts`
- Shell/tab store tests for `scenario-gantt:*`

Conflict regression:

- Create a test row where legacy `file_path` migration value conflicts with new `file_paths`; after migration, only `file_paths` is read. Since `file_path` is dropped, any future code using it should fail compile/tests.

## Tests and Verification

Live-server:

- Unit test version allocation from empty, existing `[v0, v2]`, and deleted-gap cases.
- Unit/API test `POST /scenario/:id/run` allows DONE scenario rerun and passes version to engine-server.
- Unit/API test preserves the existing rule that DONE scenario cannot run directly and must first transition to DRAFT.
- Unit/API test transition to DRAFT defaults `deleteVersionFiles=false` and retains `file_paths`.
- Unit/API test transition to DRAFT with `deleteVersionFiles=true` deletes all version paths and persists `file_paths=[]`.
- Unit test `saveResult` appends version metadata and marks current by `taskId`.
- Route test `GET /versions`, `DELETE /versions/:version`, `GET /versions/:version/gantt-data`, `GET /versions/:version/diff`.
- Migration smoke test for `file_path -> file_paths`.

Engine-server:

- `test_file_management.py`: archive path is `complete/<airline>/<scenario>/<version>/<timestamp>`.
- Result metadata includes version, executedBy, executedAt, archivePath, inputPath, fileTimestamp, and snapshot references.
- Complete cleanup no longer deletes or compresses historical complete entries.
- Fallback fetch can locate files by version path.

Gantt:

- API tests for versions endpoints.
- Component tests for Versions tab rendering, Current badge, hidden diff button when no differences, delete disabled for Current.
- Component/E2E coverage for Remove Optimization Result checkbox: default unchecked, unchecked preserves versions, checked clears all versions.
- Store/view tests for `scenario-gantt:<id>@<version>` or equivalent module key.
- URL sync test for `/altair/scenario/:id/version/:version`.
- Playwright real UI flow:
  - Open Scenario details.
  - Versions tab is visible.
  - Current version row displays.
  - Open Gantt from a version.
  - Verify historical Gantt is read-only and version-labeled.

Frontend style gate:

- Run `npm run check:ui` after UI changes.

## Risks and Decisions

- `file_paths` JSON is a compact first step. If versions become heavily queried or audited, a normalized `scenario_version` table would be cleaner. The user explicitly requested `scenario.file_paths` JSON, so this design follows that requirement.
- Current version is derived from `task_id`/checksum rather than stored as a separate column to avoid a second source of truth.
- Historical Gantt must be read-only. Editing a historical version would require a separate branch/copy workflow and is out of scope.
- Parameter diff quality depends on capturing snapshots at run time. Without `ruleset_parameters.json`, future rule changes cannot be compared accurately.
- Disabling complete cleanup increases disk usage. This is intentional for now because preserving every user run is the new product requirement.

## Implementation Order

1. Add migration, model type, version parser helpers, and source-of-truth regression tests.
2. Update live-server Remove Optimization Result flow to accept `deleteVersionFiles`, preserving the existing DONE→DRAFT requirement.
3. Update live-server result flow to allocate and append versions for DRAFT runs.
4. Update engine-server archive layout, metadata, cleanup behavior, delete-all behavior, and tests.
5. Add historical version file fetch / Gantt data API and parameter diff API.
6. Add Gantt types/API/store support and Versions tab UI.
7. Add historical Gantt route/module key support with read-only mode.
8. Run focused tests, UI gate, and Playwright scenario flow.
