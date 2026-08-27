# Ground Task Create & Edit — Design Spec

**Date:** 2026-05-06  
**Scope:** Gantt (Frontend) + Live Server (Backend)  
**Status:** Approved

## Overview

Add the ability to create and edit ground tasks (地面任务) directly in the Gantt interface. Ground tasks are `roster_flight` rows with `pairing_id = NULL`. They represent non-flight duties (standby, training, leave, simulator, admin, etc.) assigned to one or more crew members.

## Requirements

| Field | Source |
|---|---|
| `crew_id` | Multi-select in create mode; locked in edit mode |
| `assignment` | Dropdown from `assignment` table (non-FLT/DHD assignment_group) |
| `assignment_group` | Auto-filled from `assignment.default_assignment_group` (read-only) |
| `sch_str_dt_utc` | Separate date + time inputs (UTC) |
| `sch_end_dt_utc` | Separate date + time inputs (UTC) |
| `comments` | Optional remark text |
| `base` | Auto-resolved from `crew_base` by start date (not shown in form) |
| `pairing_id` | Always `NULL` for ground tasks |
| `act_rest_min` | New field — copied from `assignment.rest_time` at create time |

> **Note:** Assignment Group codes use short format: FLT/DHD/GND/ADM/LVE/SBY/TRN (not FLIGHT/DEADHEAD/GROUND)

## Database Migration

Add one nullable integer column to `roster_flight`:

```sql
ALTER TABLE roster_flight ADD COLUMN act_rest_min integer;
```

**Semantics:**
- Ground tasks: populated from `assignment.rest_time` at insert time (may be NULL if assignment has no rest)
- Flight tasks: always NULL — flight task REST comes from `pairing_segment.duty_act_rest_min` (joined at query time)

This field drives Gantt rendering of the REST interval after a ground task bar.

## Backend

### New endpoint: `POST /api/roster/create-ground-task`

**Request body (Zod-validated):**

```typescript
{
  crewIds: string[]      // min 1
  assignment: string     // assignment code, e.g. "APT"
  startDtUtc: string     // ISO 8601 UTC
  endDtUtc: string       // ISO 8601 UTC
  comments?: string
  username?: string
}
```

**Service logic — single DB transaction:**

1. Look up `assignment` row by code → extract `default_assignment_group`, `rest_time`
2. For each `crewId`, look up effective base from `crew_base` where the start date falls within the base's validity range; if no matching record exists, **abort the entire transaction** and return a 400 error listing the specific crew IDs with missing base data (e.g. `"Crew F8003 has no valid crew_base record for 2026-05-08 — please fix base data before creating tasks"`)
3. Batch insert all N rows in one statement:
   ```typescript
   await tx.insert(rosterFlight).values(rows)  // single INSERT ... VALUES (…),(…)
   ```
   Each row: `pairing_id = NULL`, `act_rest_min = assignment.rest_time`, `source = 'MANUAL'`
4. On any error → transaction rolls back, no rows written, error returned to frontend

**Atomicity guarantee:** All-or-nothing. If crew N fails validation or DB constraint, crews 1…N-1 are also not created.

**Performance:** Single `INSERT` statement regardless of crew count — O(1) DB round trips.

### UpdateRosterInput extension

Add three optional fields to the existing update path (`PUT /api/roster/:id`):

```typescript
assignment?: string
assignmentGroup?: string
actRestMin?: number | null
```

### Response

Returns the array of created `roster_flight` rows (same shape as existing `getView` result, including the new `actRestMin` field).

### Cache invalidation

Same pattern as existing create/update: `invalidatePattern(redis, 'roster:view:*')`.

## Frontend

### UI Store additions (`ui-store.ts`)

```typescript
// Ground task dialog
groundTaskDialogOpen: boolean
groundTaskMode: 'create' | 'edit'
groundTaskEditItem: RosterItem | null
groundTaskPrefill: {
  crewId?: string
  startDate?: string   // 'YYYY-MM-DD'
  startTime?: string   // 'HH:mm'
} | null

openGroundTaskCreate(prefill?: { crewId?: string; startDate?: string; startTime?: string }): void
openGroundTaskEdit(item: RosterItem): void
closeGroundTaskDialog(): void
```

### New component: `GroundTaskDialog` (`gantt/src/components/roster/ground-task-dialog.tsx`)

**Create mode:**

| Field | Control | Notes |
|---|---|---|
| Crew IDs | Tag-input multi-select | Filters from `crew-store`; pre-filled from `prefill.crewId` if provided |
| Assignment | `<Select>` loaded from `/api/assignment` | Shows `code — description`; filters to ground-type assignments (excludes FLT/DHD) |
| Assignment Group | Read-only display | Auto-filled on assignment selection from `assignment.default_assignment_group` |
| Start Date | `<input type="date">` | Pre-filled from `prefill.startDate` |
| Start Time | `<input type="time">` | Pre-filled from `prefill.startTime`; UTC |
| End Date | `<input type="date">` | Defaults to same as start date |
| End Time | `<input type="time">` | Defaults to same as start time (user fills in) |
| Remark | `<textarea>` | Optional |

Live duration display below end-time row. Warning if end ≤ start.

Footer shows: "Will create N roster entries" (N = selected crew count).

**Edit mode:**

- Crew ID field is read-only (locked with 🔒 indicator)
- All other fields editable
- "Danger Zone" section at bottom with Delete button (confirmation required)
- Footer: last updated timestamp + Save Changes button

**Submission flow (create):**

1. Validate: at least 1 crew, assignment selected, end > start
2. Call `rosterStore.addGroundTask(paneId, { crewIds, assignment, assignmentGroup, startDtUtc, endDtUtc, comments })`
3. Store calls `POST /api/roster/create-ground-task` (single call for all N crew)
4. On success: add N mock items to draft state (one per crew), close dialog
5. On error: show validation banner inside dialog with the server error message (including which crew IDs have missing base data), do not close

**Submission flow (edit):**

Calls `rosterStore.updateTask(paneId, item.id, { assignment, assignmentGroup, schStrDtUtc, schEndDtUtc, comments, actRestMin })`

### Roster Store addition

```typescript
addGroundTask(
  paneId: PaneId,
  data: {
    crewIds: string[]
    assignment: string
    assignmentGroup: string
    startDtUtc: string
    endDtUtc: string
    comments?: string
  }
): Promise<RosterItem[] | null>
```

In draft mode: emits N `op type: 'add'` operations (one per crew) sharing a common `batchId` so that a single Undo removes all N.

In commit path: calls `rosterApi.createGroundTask(data)` → single API call → N rows back.

### Trigger paths

**Toolbar button:**
- Location: `GanttSubToolbar`, right side (near existing PaneToggles)
- Opens `openGroundTaskCreate()` with no pre-fill (or pre-fills single crew if exactly one crew row is selected)

**Roster Pane right-click:**
- Existing context menu on empty row area gains a new item: "Create Ground Task"
- Handler calls `openGroundTaskCreate({ crewId: row.crewId, startDate, startTime })`
- Time conversion: `pixelToTime(mouseX, viewState)` → format as `YYYY-MM-DD` / `HH:mm` (already available in `gantt-utils`)

**Edit trigger:**
- Existing context menu on a ground task (pairingId === null) gains: "Edit Ground Task"
- Double-click on a ground task bar also opens edit dialog

### RosterItem type update

Add `actRestMin` to the `RosterItem` interface:

```typescript
actRestMin?: number | null
```

### Gantt Rendering — REST interval

In `roster-renderer.ts`, after drawing a ground task bar:

```
if (item.actRestMin && item.actRestMin > 0) {
  draw REST block immediately to the right of the task bar
  width = actRestMin minutes × pixelsPerMinute
  style: same as existing flight dutyActRestMin REST block (semi-transparent, REST label)
}
```

Flight tasks continue to use `dutyActRestMin` from `pairing_segment` (no change).

## Data Flow Summary

```
Right-click / Toolbar
  → openGroundTaskCreate(prefill?)
  → GroundTaskDialog (form)
  → rosterStore.addGroundTask()
    → Draft mode: addOp × N + mock items
    → Commit: POST /api/roster/create-ground-task (single TX)
  → N roster_flight rows (pairing_id=NULL, act_rest_min from assignment)
  → Gantt re-renders with REST block if act_rest_min > 0
```

## Out of Scope

- `actingRank` is stored as empty string `''` (consistent with `assignFlight` behavior); not exposed in the form
- No rule-checking for ground tasks at create time (ground tasks do not belong to FLIGHT_GROUPS)
- No drag-to-resize for the REST block in this iteration
