# S3 Pairing Import: Cabin Rank, Duty Rest, and Layover

## Status

Draft. Implementation starts only after user approval.

## Problem

S3 `.PRG` Pairing imports currently have four related defects:

1. The position parser assumes every slot is two-character rank plus two-character plan. Cabin ranks such as `IFD` and short forms such as `D1` are therefore parsed incorrectly or rejected.
2. The parser identifies every imported Pairing as Pilot (`division = 'P'`), so Cabin Pairings can be imported into a Pilot PO scenario.
3. Type 3 duty records contain layover/rest information, but the business `scenario.pairing_segment` rows do not receive the corresponding `duty_sch_rest_min`, `duty_act_rest_min`, or layover-night data.
4. Pickup/dropoff times are currently derived from the entire Pairing start/end for every duty. For a multi-duty Pairing this makes the first duty span the whole Pairing and prevents the Gantt from drawing the actual inter-duty layover. The visible grey bar is then mistaken for Layover; the green Layover band is absent or has the wrong time span.

## Goals

- Import Pilot and Cabin S3 Pairings without rank parsing errors.
- Detect the file's crew division from its rank slots before writing scenario data.
- Reject an existing PO target whose division does not match the file, with an actionable message.
- For a new scenario, derive the scenario division from the file rank data rather than trusting a manually selected division.
- Persist duty rest/layover values and use duty-local boundaries for Gantt geometry.
- Render the actual inter-duty gap as the existing green Layover band and render post-Pairing rest with the existing grey REST styling.
- Preserve existing staging records, clear-before-import behavior, import counts, and cache invalidation.

## Non-goals

- No schema migration. The existing scenario mirror already has the required duty rest, layover, and node-time columns.
- No change to the established Gantt color palette. Green is already the Layover color; grey is already the REST color.
- No change to the S3 staging record format.
- No change to the optimizer or Live roster behavior.

## Proposed behavior

### 1. Rank slot parsing and file profile

The parser will expose a small file profile derived from the master record position field:

```ts
type S3PairingDivision = 'P' | 'C'

interface S3PairingFileProfile {
  division: S3PairingDivision
  ranks: string[]
}
```

Parsing will support the two known PRG layouts:

- Pilot slots: two-character rank followed by a two-character plan, e.g. `CA01FO01`.
- Cabin slots: rank text followed by its one-character plan, including three-character ranks such as `IFD1`, and the existing short form `D1`.

The implementation must not treat `D1` as a two-character rank. It will retain `D` as the rank and `1` as the plan. Cabin rank parsing will be driven by the file profile/layout, not by blindly slicing every slot into two-character chunks.

Division classification:

- A file containing Pilot rank slots (`CA`, `FO`, or the project's normalized Pilot rank set) is `P`.
- A file containing Cabin rank slots is `C`.
- Mixed Pilot/Cabin files are rejected as ambiguous with a clear error; the importer must not silently assign them to one division.
- Empty/invalid position slots remain ignored, but a file with no usable rank slot is rejected before any scenario is created.

The parser will continue to preserve the source rank text, normalized only where the existing project rank normalization requires it. No rank is truncated in the persisted composition.

### 2. Existing PO target validation

The backend remains authoritative and validates after parsing but before opening the import transaction:

- Parse the file profile first.
- Load the selected scenario and require `file_type = 'PO'`.
- Normalize the scenario/workset division to its first meaningful `P`/`C` code.
- Require the target division to equal the file division.
- On mismatch, fail without clearing or inserting data. The message must tell the user to select a Cabin PO scenario for Cabin files, or a Pilot PO scenario for Pilot files.

Example Cabin mismatch message:

`This file contains Cabin ranks. Select a Cabin PO scenario before importing.`

### 3. New scenario behavior

For `targetMode = 'new'`:

- The parsed file division is used when creating the PO scenario.
- The selected base and date range remain the new-scenario inputs.
- The `newDivision` field is no longer the source of truth. It may remain in the request for backward compatibility, but the service must override it with the detected file division.
- The created scenario's workset/filter division and imported Pairing division must be identical.

The dialog should make this explicit by labeling the division as detected from the file or by removing the manual division selector once the UI can obtain a profile preview. The first implementation may rely on the backend result/error path, but it must not allow a manually selected division to create a scenario inconsistent with the file.

### 4. Duty-local node times

For each duty, `pickup/brief/debrief/dropoff` times must be based on that duty's type 3 window and its first/last segment:

- `pickup_start_utc` / `brief_start_utc`: duty start.
- `pickup_end_utc` / `brief_end_utc`: duty start and first segment departure respectively.
- `debrief_start_utc`: last segment arrival.
- `debrief_end_utc` / `dropoff_start_utc` / `dropoff_end_utc`: duty end.

The same duty-local values are copied to each segment row in that duty, matching the existing wide-table convention.

This removes the current use of the overall Pairing start/end for every duty. The first duty must end at its own type 3 duty end, and the next duty must begin at its own type 3 duty start. The Gantt layover interval is then:

`previous duty dropoff_end_utc → next duty pickup_start_utc`.

### 5. Rest and layover persistence

The parsed input will carry:

- Type 3 scheduled layover/rest minutes.
- Type 3 actual/rest minutes derived from the duty window where the source does not provide a separate actual value.
- Type 3 layover-night indicator/count where available.
- Master record `rest required after pairing` minutes for the final post-Pairing rest.

When building business segment rows:

- For non-final duties, `duty_sch_rest_min` and `duty_act_rest_min` represent the gap to the next duty. Prefer the source type 3 scheduled layover value; otherwise derive it from the next duty start minus the current duty end.
- For the final duty, use the master record's required-after-Pairing rest for the final REST bar. This must be represented without changing the meaning of the inter-duty layover fields for earlier duties.
- `duty_layover_nits` must be populated from the type 3 record when the target schema column is available in the scenario mirror.

The renderer/source contract will be adjusted only as needed so the final post-Pairing rest uses the Pairing-level value rather than accidentally reusing an inter-duty value. The existing fallback behavior for legacy data with null values remains.

### 6. Gantt display

The shared Pairing renderer remains the single rendering path for Live and Scenario where applicable:

- Inter-duty gaps with valid positive start/end times render with `SEGMENT_LAYOVER_BG` (green).
- Final post-Pairing rest renders with `SEGMENT_REST_BG` (grey).
- Time geometry uses the persisted UTC timestamps and the existing timezone display conversion for labels.
- No color-token redesign is required.

## Data flow

```text
PRG text
  -> parse records + composition layout/profile
  -> validate file division against target PO scenario
  -> derive new scenario division when targetMode=new
  -> parse/normalize duty windows
  -> build duty-local node times + rest/layover fields
  -> insert scenario pairing/composition/flight/pairing_segment
  -> shared Gantt renderer draws green layover and grey final REST
```

## Tests

### Parser unit tests

- `CA01FO01` remains Pilot with two compositions.
- A Cabin fixture containing `IFD1` parses `IFD` with plan `1`.
- A Cabin fixture containing `D1` parses `D` with plan `1`.
- File profile returns `P` for Pilot ranks and `C` for Cabin ranks.
- Mixed/empty rank layouts fail with a useful error.
- Type 3 scheduled layover/rest and master final-rest fields are retained.

### Import service tests

- Existing Pilot PO accepts Pilot file.
- Existing Pilot PO rejects Cabin file before clear/transaction writes.
- Existing Cabin PO accepts Cabin file.
- New scenario created from a Cabin file is created with division `C` even if the request carries `P`.
- Multi-duty rows use each duty's own pickup/dropoff boundaries.
- Segment rows persist inter-duty rest/layover and final post-Pairing rest values.
- Existing staging inserts and clear dependency order remain intact.

### UI/E2E tests

- S3 Pairing dialog still opens and imports a valid Pilot fixture.
- A Cabin import into a Pilot PO target shows the actionable target-selection error and leaves the target unchanged.
- A new Cabin import creates/selects a Cabin PO scenario.
- A multi-duty imported Pairing shows a green Layover band at the gap between duty 1 and duty 2 and a grey REST band after the Pairing, with geometry matching the imported UTC times.

The UI tests must drive the actual dialog and scenario flow. Any fixture or route interception must assert the visible user behavior, not only the API response.

## Risks and decisions to confirm

1. The PRG position field is fixed-width but Cabin ranks have variable text length. The implementation needs the concrete Cabin fixture/layout used by the source system to make the rank-plan tokenizer unambiguous. This spec assumes Pilot uses `2+2` and Cabin uses `rank text + 1` plan as described above.
2. The current schema has duty rest fields but no explicit Pairing-level post-rest field. The implementation should add the smallest non-schema representation needed for the renderer, preferably an in-memory/DTO Pairing-level value populated from the master record, rather than overloading an inter-duty column.
3. The existing UI has a manual Division selector for new scenarios. The backend override is required for correctness; the UI wording/control can be simplified in the same change if the concrete file profile is available before submit.

## Impact and tooling note

The requested changes touch the S3 PRG parser/import service, scenario route request handling, S3 import dialog/API types, shared Pairing renderer/source DTOs, and focused unit/E2E tests. GitNexus is indexed but stale as of 2026-07-17; its symbol-level impact results are not trustworthy until re-indexed. Before implementation, re-run the GitNexus analysis and perform upstream impact checks for the parser, import service, duty-row builder, and shared Pairing renderer. Do not proceed past a HIGH/CRITICAL result without revisiting this design.
