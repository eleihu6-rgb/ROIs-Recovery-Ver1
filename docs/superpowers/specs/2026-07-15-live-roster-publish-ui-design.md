# Live Roster Publish UI Design

Date: 2026-07-15
Author: Codex
Status: Approved and implemented
Scope: Live Gantt roster publish workflow that compares `roster_flight` with `roster_publish`, shows differences, and publishes selected rows into `roster_publish`.

## Context

The planner needs a Live interface to publish current real-time roster data from `roster_flight` into `roster_publish`.

Important data-model facts verified before design:

- `roster_flight` is the live operational roster table. One flying pairing assigned to one crew expands into multiple rows, one row per segment.
- Ground tasks are `roster_flight.pairing_id IS NULL`; their identity is the `roster_flight.id`.
- `roster_publish` already exists and is intended as the crew-facing published roster table.
- `roster_publish` already has `roster_id`, nullable `pairing_id` / `flt_id`, publish display fields, and unique indexes on non-null `(flt_id, crew_id)` and non-null `roster_id`.
- Existing `live-server/src/services/roster/roster-publish-service.ts` only supports basic single-row CRUD and cannot compute/publish the requested diff.
- The referenced screenshot is now present at `docs/assets/screenshots/old-javafx-system/roster-publish-pbs.png` after updating from `origin/main`.
- The old JavaFX screen is `Roster Publish` with the `Dynamic Change Publish` tab active. Its filters include Start/End Date, Crew Fleet, Flight Number, Publish Status, Crew ID, Pairing ID, Task Type, Modified By, `Modified By Me & System`, and `Modified By PBS`.
- The old JavaFX result table includes `Check Type` and `TS Flag`, which this new implementation will intentionally remove per the current requirement.

## Product Shape

Add a Live-only business workspace opened from the Live interface. Recommended entry point:

- Add a `Publish Roster` action in the Live top toolbar operational action cluster, using a `Send`/`UploadCloud` lucide icon.
- The workspace uses `@rois/ui` `AppDialog`, matching `Import PBS Material` and `Scenario Publish Roster`, but wider and table-oriented.
- UI language is English.

Why dialog/workspace instead of a new page:

- The publish workflow is an operational action on the currently available Live roster.
- It should not consume Gantt pane height or create a permanent pane band.
- A wide modal keeps the planner in Live context, supports review + publish, and avoids a separate route/navigation state for a transactional task.

The dialog has:

- Roster Period selector, populated the same way as `Import PBS Material`, using the existing `/api/scenario/import-pbs-material/roster-periods` endpoint unless we later move it to a neutral base route.
- RP Start and RP End read-only date fields from the selected period.
- Crew Fleet multi-select, populated from `/api/fleet`, used to filter crew by the crew's effective `crew_fleet` during the selected RP.
- Bases multi-select, populated from `/api/base`, used to filter crew by the crew's effective `crew_base` during the selected RP.
- Crew ID search.
- Pairing ID search.
- Pairing Label search next to Pairing ID.
- Flight Number search is removed.
- Task Type and Modified filters are removed.
- Other old-system filters can remain only if they map to confirmed current fields and do not conflict with the removed fields.

The result table should include selectable rows and compact columns:

- Date
- Crew ID
- Crew Name
- Crew Fleet
- Base
- Pairing ID
- Pairing Label
- Assignment Group
- Assignment
- Acting Rank
- Start UTC
- End UTC
- Publish Status
- Status

Do not include `CheckType` or `TsFlag`.

## Detailed UI Layout

Target visual density: similar to the old JavaFX screenshot, but using current ROIS tokens, small controls, and current app chrome.

Dialog:

- Width: large desktop modal, roughly `min(1280px, calc(100vw - 48px))`.
- Height: bounded by viewport, roughly `calc(100vh - 72px)`.
- Body: zero or low padding around the table; filters use a compact top band.
- Header title: `Publish Roster`.
- Description: short operational text only if needed, not an instructional paragraph.
- Footer: left side shows selected count and visible row count; right side has `Close` and `Publish Selected`.

Filter band:

- Two-row CSS grid, matching the old screen's left-to-right scanning pattern.
- Row 1: Roster Period, Start Date, End Date, Crew Fleet, Bases, Publish Status.
- Row 2: Crew ID, Pairing ID, Pairing Label, Status, Search, Reset.
- `Search` is the primary action in the filter band.
- `Reset` clears search fields and status filters but keeps the selected current RP.
- Date fields are read-only. The selected RP is the actual query driver.
- Multi-select fields use compact trigger text such as `All fleets`, `A321, B777`, or `3 selected`.

Status controls:

- `Publish Status` is retained from the old system as a dropdown:
  - `All`
  - `Unpublished`
  - `Published`
- `Status` is the computed diff status dropdown:
  - `All changes`
  - `Add`
  - `Update`
  - `Delete`
  - `No change`
- Default `Status` should be `All changes`, meaning Add + Update + Delete, because the planner's main job is to publish differences.
- Default `Publish Status` should be `Unpublished`, matching the old screen and keeping the first result set focused.

Table:

- Sticky header.
- Checkbox column at far left with select-all-visible.
- Zebra striping or subtle row separators.
- Use monospace/tabular styling for IDs and dates.
- Keep `Status` as the far-right column, matching the old screenshot.
- The table should not auto-select `No change` rows by default.
- Default selected rows: all visible actionable change rows (`Add`, `Update`, `Delete`) after Search completes.
- Footer selected count mirrors the old screen's `Selected: 11`, but in current UI style.

Status visual treatment:

- `Add`: blue text/badge.
- `Update`: amber text/badge.
- `Delete`: red/destructive text/badge.
- `No change`: muted text/badge.
- `Published`: muted/secondary publish-status value.
- `Unpublished`: normal text.

Row details:

- A flying UI row is a grouped crew + pairing row. It should show a segment count like `4 seg` if space allows.
- A ground UI row is a single roster task row. Pairing ID is empty; Pairing Label can show the roster label when useful.
- For `Update` rows, a lightweight inline diff tooltip or expandable detail is useful but can be Phase 2. Phase 1 can expose a `Changed Fields` compact column or tooltip sourced from the backend.

Confirmation:

- Clicking `Publish Selected` opens a confirmation state inside the same `AppDialog` footer or a second `AppDialog` if the UI library pattern prefers it.
- Confirmation text should include exact counts by action, for example `Publish 23 selected changes: 12 Add, 8 Update, 3 Delete`.
- The confirm button label should be `Publish`.
- After success, show a toast and refresh the diff list for the same filters.
- If the backend reports stale keys, show a concise warning and refresh the list.

## Diff Semantics

The backend computes `Status` by comparing `roster_flight` and `roster_publish` for the selected RP and optional filters.

### Flying Rows

Flying means `pairing_id IS NOT NULL`.

Identity for status grouping:

- `crew_id + pairing_id`

Status rules:

- `Add`: a `crew_id + pairing_id` group exists in `roster_flight` but not in `roster_publish`.
- `Delete`: a `crew_id + pairing_id` group exists in `roster_publish` but not in `roster_flight`.
- `Update`: the group exists on both sides, but any comparison field differs.
- `No Change`: the group exists on both sides and all comparison fields match.

For flying `Update`, compare:

- Segment row count for the same pairing and crew.
- `acting_rank`: map to `roster_flight.flight_acting_rank`.
- `assignment`.
- `pick_up_start_utc`: compare `roster_publish.pick_up_start_utc` with `pairing_segment.pickup_start_utc`.
- `brief_start_utc`: compare `roster_publish.brief_start_utc` with `pairing_segment.brief_start_utc`.

Implementation note: because the UI row is grouped by pairing, the service should still publish/delete/update all segment rows in the group. If any segment differs, the UI shows the pairing group as `Update`.

Flying time-window source:

- `roster_flight` joins `pairing_segment` by `(pairing_id, duty_seq, seg_seq)`.
- `pairing_segment` is the authoritative source for pickup/brief/debrief/dropoff windows when publishing flying rows.
- The naming differs between tables: `pairing_segment.pickup_start_utc` maps to `roster_publish.pick_up_start_utc`.

### Ground Rows

Ground means `pairing_id IS NULL`.

Identity:

- `crew_id + roster_id`, where `roster_id` in `roster_publish` equals `roster_flight.id`.

Status rules:

- `Add`: source `roster_flight` row exists but matching published row does not.
- `Delete`: published row exists but matching source `roster_flight` row does not.
- `Update`: both exist but any comparison field differs.
- `No Change`: both exist and all comparison fields match.

For ground `Update`, compare:

- `sch_str_dt_utc`
- `sch_end_dt_utc`
- `assignment_group`
- `assignment`
- `dep_arp`
- `arv_arp`

## Publish Behavior

Publishing selected rows should run in one database transaction.

For each selected group:

- `Add`: insert current `roster_flight` rows into `roster_publish`.
- `Update`: replace published rows for that identity with current `roster_flight` values, or upsert by the stable identity where safe.
- `Delete`: remove the obsolete `roster_publish` rows.

Recommended write strategy:

- Flying groups: delete existing published rows for selected `crew_id + pairing_id`, then insert current non-deleted `roster_flight` rows for the same identity. This avoids partial segment drift and keeps grouped updates simple.
- Ground rows: upsert by `roster_id` for Add/Update; delete by `roster_publish.roster_id` for Delete.
- Set audit fields with the authenticated user.
- Invalidate `roster-publish:*` caches after commit.

Do not write back to `roster_flight` from this workflow.

## API Design

Add focused endpoints under the existing roster publish route:

- `POST /api/roster/publish/diff`
- `POST /api/roster/publish/apply`

Request for diff:

```ts
interface RosterPublishDiffRequest {
  rosterPeriodId: number
  crewFleets?: string[]
  bases?: string[]
  crewId?: string
  pairingId?: number
  pairingLabel?: string
  publishStatus?: 'ALL' | 'PUBLISHED' | 'UNPUBLISHED'
  statuses?: Array<'ADD' | 'UPDATE' | 'DELETE' | 'NO_CHANGE'>
  page?: number
  pageSize?: number
}
```

Response:

```ts
interface RosterPublishDiffRow {
  key: string
  kind: 'FLYING' | 'GROUND'
  status: 'ADD' | 'UPDATE' | 'DELETE' | 'NO_CHANGE'
  crewId: string
  crewFleet: string | null
  base: string | null
  pairingId: number | null
  pairingLabel: string | null
  rosterIds: number[]
  publishIds: number[]
  assignmentGroup: string | null
  assignment: string | null
  actingRank: string | null
  schStrDtUtc: string | null
  schEndDtUtc: string | null
  segmentCount: number
  changedFields: string[]
}
```

The response should be enveloped in the existing API shape:

```ts
interface RosterPublishDiffResponse {
  items: RosterPublishDiffRow[]
  total: number
  page: number
  pageSize: number
  summary: {
    add: number
    update: number
    delete: number
    noChange: number
    actionable: number
  }
}
```

Request for apply:

```ts
interface RosterPublishApplyRequest {
  rosterPeriodId: number
  keys: string[]
}
```

The apply endpoint should recompute the diff in the same transaction or immediately before writes, then only apply rows whose keys are still present and actionable. This prevents stale UI selection from publishing the wrong current state.

Apply response:

```ts
interface RosterPublishApplyResponse {
  applied: number
  inserted: number
  updated: number
  deleted: number
  skipped: number
  staleKeys: string[]
}
```

## Field Mapping

Insert/update from `roster_flight` to `roster_publish` should use an explicit mapping. The table below is the Phase 1 minimum for rows created by this workflow.

| `roster_publish` | Source |
| --- | --- |
| `roster_id` | `roster_flight.id` |
| `crew_id` | `roster_flight.crew_id` |
| `pairing_id` | `roster_flight.pairing_id` |
| `flt_id` | `roster_flight.flt_id` for flying rows; `null` for ground rows |
| `flt_dt` | `roster_flight.flt_dt`, fallback to date part of `sch_str_dt_utc` if required |
| `division` | `roster_flight.division` |
| `assignment_group` | `roster_flight.assignment_group` |
| `assignment` | `roster_flight.assignment` |
| `label` | `roster_flight.label`; for flying display can fall back to `pairing.pairing_label` |
| `acting_rank` | `roster_flight.flight_acting_rank` |
| `roster_rank` | `roster_flight.roster_acting_rank` |
| `active_rank` | `roster_flight.active_rank` |
| `position` | `roster_flight.position` |
| `duty_id` | `coalesce(roster_flight.duty_seq, 0)` |
| `seq_order` | `coalesce(roster_flight.seq_order, 0)` |
| `sch_str_dt_utc` | `roster_flight.sch_str_dt_utc` |
| `sch_end_dt_utc` | `roster_flight.sch_end_dt_utc` |
| `dep_arp` | `roster_flight.dep_arp`, with pairing segment fallback only if current data requires it |
| `arv_arp` | `roster_flight.arv_arp`, with pairing segment fallback only if current data requires it |
| `pick_up_start_utc` | `pairing_segment.pickup_start_utc` for flying rows; `null` for ground rows unless a later ground source is defined |
| `pick_up_end_utc` | `pairing_segment.pickup_end_utc` for flying rows; `null` for ground rows unless a later ground source is defined |
| `brief_start_utc` | `pairing_segment.brief_start_utc` for flying rows; `null` for ground rows unless a later ground source is defined |
| `brief_end_utc` | `pairing_segment.brief_end_utc` for flying rows; `null` for ground rows unless a later ground source is defined |
| `debrief_start_utc` | `pairing_segment.debrief_start_utc` for flying rows; `null` for ground rows unless a later ground source is defined |
| `debrief_end_utc` | `pairing_segment.debrief_end_utc` for flying rows; `null` for ground rows unless a later ground source is defined |
| `drop_off_start_utc` | `pairing_segment.dropoff_start_utc` for flying rows; `null` for ground rows unless a later ground source is defined |
| `drop_off_end_utc` | `pairing_segment.dropoff_end_utc` for flying rows; `null` for ground rows unless a later ground source is defined |
| `is_publish` | `1` for rows written by publish |
| `created_by` / `updated_by` | Authenticated planner user |

Join rule for flying rows:

- Join `roster_flight rf` to `pairing_segment ps` on `ps.pairing_id = rf.pairing_id AND ps.duty_seq = rf.duty_seq AND ps.seg_seq = rf.seg_seq`.
- Use `ps.is_deleted = 0` where applicable.
- For grouped flying status, compare the per-segment ordered values after joining `pairing_segment`; any mismatch marks the crew + pairing group as `Update`.

## Crew Fleet / Base Filtering

Use history-aware crew filters based on the selected RP:

- Fleet filter uses `crew_fleet` rows effective during the selected RP, populated from the master `fleet` table for dropdown options.
- Base filter uses `crew_base` rows effective during the selected RP, populated from the master `base` table for dropdown options.
- The comparison should filter crew, not pairings.

If a crew has multiple effective fleets during the RP, include the crew when any effective fleet matches; display the effective values joined with ` | `.

Effective-date rule:

- Treat the selected RP as a closed date interval for filtering.
- A crew history row is effective for the RP when its effective date is on/before `rp_end` and it has not been superseded before `rp_start`.
- If the existing crew-service has a canonical effective-history helper/query, reuse that instead of duplicating effective-date logic.

## Performance and Data Volume

This workflow must not affect Gantt first paint.

- Do not fetch publish diff on Live page load.
- Load the dialog shell first, then load reference options/RP options only when opened.
- Run the diff only after the planner clicks `Search`.
- The diff endpoint is paginated. Default `pageSize` should be 100 or 200, not all rows.
- Backend summary counts can be computed in the same query family, but should not require loading all row details into Node memory.
- The diff should be filtered by selected RP at the SQL level before joins/aggregation.
- Crew fleet/base filters must narrow crew in SQL before comparing roster groups where practical.
- Avoid Redis caching for diff result details in Phase 1 because the data is operational and can change; cache only reference lists through existing services.
- After apply, invalidate `roster-publish:*`; do not invalidate Gantt roster caches because `roster_flight` is unchanged.

Index considerations:

- Existing `roster_flight (crew_id, sch_str_dt_utc)` and `roster_publish (crew_id, sch_str_dt_utc)` indexes support crew/time filtering.
- Existing `idx_roster_pub_crew_pair` supports published flying identity lookup.
- If EXPLAIN shows a slow full scan on remote data, consider a focused partial index only after verifying the live query plan.

## Frontend Implementation Plan

Likely files:

- `gantt/src/components/live/roster-publish-dialog.tsx` or a nearby Live-specific component location.
- `gantt/src/services/roster-publish-api.ts`.
- `gantt/src/components/layout/app-layout.tsx` or the relevant Live toolbar wrapper to open the dialog.
- Reuse `useReferenceStore` for base/fleet options.
- Reuse `fetchImportPbsRosterPeriods` initially for RP options.

Because this is Live-only publishing to `roster_publish`, it should not be forced into the shared Live/Scenario Gantt pane layer. The shared pane layer is for common Gantt rendering and interactions; this workflow is a Live operational side effect.

Frontend state model:

- `open`: controlled by the Live toolbar action.
- `filters`: local dialog state.
- `rows`: current page of diff rows.
- `summary`: Add/Update/Delete/No Change counts from server.
- `selectedKeys`: set of selected actionable row keys.
- `loading`: diff search in progress.
- `publishing`: apply in progress.
- `lastSearch`: stable copy of filters used for the current rows, so pagination and apply do not accidentally use partially edited filters.

User flow:

1. Planner opens `Publish Roster`.
2. Dialog loads current RP plus base/fleet options.
3. Planner adjusts filters and clicks `Search`.
4. Backend returns paged diff rows plus summary.
5. UI auto-selects actionable visible rows only.
6. Planner can filter/status-toggle/select rows.
7. Planner clicks `Publish Selected`.
8. Confirmation shows counts by status.
9. Backend applies selected keys and returns applied/skipped/stale counts.
10. UI shows toast and refreshes current search.

## Backend Implementation Plan

Likely files:

- Extend `live-server/src/services/roster/roster-publish-service.ts`.
- Extend `live-server/src/routes/roster/roster-publish.ts`.
- Add focused tests under `live-server/src/__tests__/unit/` or service tests mirroring existing route test style.

Backend should prefer explicit SQL for the diff CTE because this is a cross-table grouping/comparison problem and Drizzle would be cumbersome for full outer joins and aggregate comparison.

Backend service functions:

- `listDiff(fastify, input, username)`
- `applyDiff(fastify, input, username)`
- `buildRosterPublishDiffSql(input)`
- `buildRosterPublishApplySql(input)`
- Small pure helpers for status normalization and row key construction.

Key format:

- Flying: `F|${crewId}|${pairingId}`
- Ground: `G|${crewId}|${rosterId}`

Use opaque keys from the backend in the frontend; the UI should not reconstruct keys from display fields.

Security:

- Use authenticated user from `request.authUser`, not a client-provided `username`.
- Validate request with Zod.
- Do not log crew names or full roster payloads on error.

## Tests

Required backend tests:

- Flying Add/Delete/Update/No Change diff.
- Flying Update caused by segment count mismatch.
- Flying Update caused by `acting_rank`, `assignment`, `pick_up_start_utc`, or `brief_start_utc`.
- Ground Add/Delete/Update/No Change diff.
- Crew fleet/base filters use history rows and filter crew, not pairing.
- Apply endpoint inserts, replaces, or deletes in one transaction and invalidates publish cache.
- Apply endpoint rejects empty keys and ignores `No change` keys.
- Apply endpoint handles stale keys by skipping them and returning `staleKeys`.

Required frontend tests:

- Component test for the dialog: RP selector fills dates, fleet/base options render, removed fields are absent, Pairing Label field is next to Pairing ID.
- Component test for status chips/summary and default selection of Add/Update/Delete rows.
- Playwright Gantt test that opens Live, opens Publish Roster, searches a period, sees status rows, selects rows, and triggers Publish against a controlled/mocked test route if full DB writes are unsafe.

Required verification after implementation:

- `npm --prefix live-server test -- <focused tests>`
- `npm --prefix gantt run test -- <focused tests>` if component tests are added in that package.
- `npm run check:ui`
- `cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt <new publish spec> --reporter=list`

## Risks / Open Questions

- The old JavaFX screenshot is available and should be used for layout density and column ordering reference, while still applying the current field removals/additions in this spec.
- GitNexus tools required by root instructions are not exposed in this Codex session. Implementation will need either those tools enabled or explicit acceptance that impact analysis is approximated with code search and focused tests.
- The exact location for the Live toolbar button needs confirmation. Recommended: Live operational toolbar, not shared pane toolbar, because this is a whole-roster publish workflow.
- Applying `Delete` physically deletes `roster_publish` rows. This matches the table's current lack of `is_deleted`; if business wants historical published rows retained, we need a separate audit strategy before implementation.

## Approval Gate

Per `AGENTS.md` Brainstorming First, implementation should begin only after the user explicitly approves this design or requests specific changes.
