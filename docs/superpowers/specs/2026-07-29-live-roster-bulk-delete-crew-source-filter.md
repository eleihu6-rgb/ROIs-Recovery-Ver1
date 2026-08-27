# Gantt Roster Bulk Delete Crew/Source Filter

## Context

Live Gantt already has a roster bulk-delete dialog opened from the roster pane toolbar. It lists candidate `roster_flight` rows for an RP, grouped by pairing/non-pairing and assignment, then lets the planner review rows before soft-deleting selected rows.

Current filters:

- RP date range
- crew `division`
- crew effective `base`
- selected assignment groups

Requested additions:

- Live: filter by CrewId and `roster_flight.source`
- Scenario: add a CrewId query field and a Refresh button matching Live's interaction pattern
- Fix Live RP date-range filtering: querying RP07 must not include tasks displayed as `06/30` / `2026-06-30`.
- Add four review-list columns from roster data: `roster_acting_rank`, `flt_num`, `dep_arp`, `arv_arp`.
- Widen the dialog and make the table more compact, sortable, and closer to the `/data` tab's base grid style.

The `brainstorming` skill required by `AGENTS.md` is not available in this Codex session's skill list, so this document is the explicit design/spec checkpoint before implementation.

## Scope

In scope:

- Live Gantt `RosterBulkDeleteDialog`
- Scenario Gantt `ScenarioBulkDeleteDialog`
- `gantt/src/services/roster-api.ts` bulk-delete candidate query params
- `live-server` `GET /api/roster/bulk-delete/candidates`
- `rosterService.listBulkDeleteCandidates`
- candidate DTO shape for Live and Scenario review rows
- focused backend tests and Live Gantt Playwright coverage

Out of scope:

- Scenario source filtering
- ordinary selected-task delete / right-click delete
- schema changes
- changing the final `POST /api/roster/bulk-delete` contract, except it continues deleting only rows explicitly returned/selected by the filtered review list

## Design

### Live Frontend

Add two controls to the Live roster bulk-delete dialog filter bar:

- `CrewId`: chip text field, using the same comma/space splitting pattern as the shared Filter dialog.
- `Source`: multi-select with Live-valid source values `IMP`, `MA`, `CR`.

The dialog sends these filters on both candidate loads:

- initial/group-only load
- selected-group row-detail load

Changing filters clears selected groups/rows via the existing `loadGroups` behavior, so stale selections from an older filter cannot be deleted.

Expand the Live review table columns to:

- select
- CrewId
- StartDt
- Rank (`roster_flight.roster_acting_rank`)
- Flight (`flt_num`)
- Dep (`dep_arp`)
- Arr (`arv_arp`)
- AssignmentGroup
- Assignment
- PairingLabel
- Source

Style the table after `/data` tab `DataGrid`:

- compact `text-xs` table
- sticky top header with `bg-muted`
- alternating row backgrounds
- tight `px-2/py-1` style cells
- sortable headers with `ChevronsUpDown` / `ArrowUp` / `ArrowDown`
- blanks display as `-` or remain visually compact

Sorting is client-side over the currently loaded review rows. It does not refetch and does not change delete identity.

### Scenario Frontend

Add two controls to the Scenario roster bulk-delete dialog filter bar:

- `CrewId`: chip text field, using the same comma/space splitting pattern as Live/shared filter inputs.
- `Refresh`: button aligned with the Live dialog's Refresh behavior.

Scenario bulk delete is client-side over loaded `ScenarioGanttData`, so CrewId filtering is applied in the dialog's derived `rows` memo before groups are built. This keeps group counts, group visibility, row details, and selected delete rows consistent.

The Scenario Refresh button should re-apply the current local filter state, clear selected groups/rows, reset table scroll to the top, and rebuild the derived view from the latest `data` prop. It does not fetch a backend candidate endpoint.

Scenario keeps its existing source grouping and deleteability semantics:

- `CR` / `MA` rows are deletable.
- `PA` / `IMP` rows remain read-only.
- No Scenario source filter is added in this change.

Expand the Scenario review table with the same display columns where data is available:

- Rank: for paired rows use assignment/source-derived rank where available; for ground rows use `ScenarioGanttGroundItem.actingRank` if present.
- Flight / Dep / Arr: for paired rows derive from the first matching `pairingSegment`; ground rows may show blanks.

Apply the same compact sortable table behavior as Live. Sorting is local over visible Scenario rows.

### Live Backend

Extend `RosterBulkDeleteListQuery` with:

- `crewIds?: string[]`
- `sources?: string[]`

Route parsing accepts comma-separated query strings and normalizes empty strings to `[]`.

`listBulkDeleteCandidates` adds parameterized SQL predicates:

- `upper(rf.crew_id) = any($n::text[])`
- `upper(coalesce(rf.source, '')) = any($n::text[])`

The predicates apply to both the group aggregate and row-detail queries so counts and rows stay consistent.

Source values are normalized to uppercase and limited to the Live domain `IMP | MA | CR` at the route boundary. Unknown source values produce `400`, not a silent empty result.

Fix date-range filtering by comparing the crew/base-local task date, not only the raw UTC timestamp. The query already joins effective crew base and airport timezone to compute displayed `start_dt`; the same expression should define the exact RP window:

- keep a broad UTC prefilter for performance, padded around the RP window.
- add exact local-date predicate:
  - `local_start_date >= $startDate::date`
  - `local_start_date < ($endDate::date + interval '1 day')`

This prevents RP07 from showing a `2026-06-30` local task whose UTC timestamp falls on `2026-07-01`.

Add the extra row-detail fields from `roster_flight` / joined data:

- `rosterActingRank` from `rf.roster_acting_rank`
- `fltNum` from `rf` if present, otherwise matching `pairing_segment.flt_num` when available
- `depArp` from `rf.dep_arp` if present, otherwise matching `pairing_segment.dep_arp`
- `arvArp` from `rf.arv_arp` if present, otherwise matching `pairing_segment.arv_arp`

Because live `roster_flight` model does not expose a `flt_num` column, use the existing pairing-segment fallback for paired rows and `rf.assignment` / label only if no segment flight number exists.

### Tests

Backend:

- focused test that `crewIds` and `sources` are forwarded into the candidate SQL parameters and affect both group and row calls.
- route/schema test for invalid source rejection if the route test harness exists nearby; otherwise service-level coverage plus manual HTTP smoke.
- regression test that an RP07 query excludes a row whose displayed local `startDt` is `2026-06-30`.
- regression test that row-detail candidates include rank/flight/departure/arrival fields.

Frontend/E2E:

- Playwright opens Live Gantt roster bulk-delete dialog.
- sets CrewId and Source.
- verifies the candidate request includes `crewIds` and `sources`.
- verifies visible review rows, when present, all match the chosen CrewId/source.
- verifies Live review table can sort by CrewId/StartDt/Rank/Flight/Dep/Arr/Source.
- Playwright opens Scenario Gantt roster bulk-delete dialog in an editable/locked scenario.
- sets CrewId.
- clicks Refresh.
- verifies visible review rows, when present, all match the chosen CrewId and group counts reflect the narrowed data.
- verifies Scenario review table has the new compact sortable columns.

Verification commands expected after implementation:

- focused live-server test command
- focused Gantt Playwright command
- `npm run check:ui` because this touches Gantt UI controls

## Risks

- The current bulk-delete candidate query is raw SQL. Changes must remain parameterized and should not string-concatenate user input.
- The local-date RP fix touches a hot-ish bulk review query. Keep a padded UTC prefilter so PostgreSQL can still narrow the `roster_flight.sch_str_dt_utc` window before applying timezone conversion.
- Bulk-delete can affect many rows. Filtering must happen before row selection and must never delete rows that were not in the review list.
- `roster_flight.source` Live domain is currently `IMP`, `MA`, `CR`; Scenario can display `PA` too, but Scenario source filtering is out of scope.
