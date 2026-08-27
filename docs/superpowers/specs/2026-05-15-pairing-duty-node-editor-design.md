# Pairing Duty Node Editor — Design Spec

**Date:** 2026-05-15  
**Scope:** `live-server` (backend API) + `gantt` (frontend dialog)  
**Reference:** `docs/modules/gantt/pairing-duty-node-editor.html` (interactive prototype)

---

## 1. Goal

Allow schedulers to edit the sign-in/sign-out times (Pickup / Brief / Debrief / Dropoff) for each Duty within a Pairing, directly from the Gantt Pairing Pane via a right-click context menu. The editor must support both the normal single-block Duty and the less-common double-block Duty (two sign-in/out cycles separated by a hotel rest).

---

## 2. Business Rules

### 2.1 Node Topology per Duty

```
[Pickup]──[Brief]──[Flight₁]──...──[FlightN]──[Debrief]──[Dropoff]
```

| Node | Start | End | Editable? |
|---|---|---|---|
| Pickup | adjustable | = Brief Start (always) | Start: yes (independent) |
| Brief | **primary editable** | = First segment `actStart` (locked) | Start: yes (linked) |
| Debrief | = Last segment `actEnd` (locked) | **primary editable** | End: yes (linked) |
| Dropoff | = Debrief End (always) | adjustable | End: yes (independent) |

### 2.2 Auto-Link Rules — Single Block

| Trigger | Effect |
|---|---|
| **Brief Start** changes by Δt | `Pickup End = Brief Start` (always) → `Pickup Start -= Δt` (preserves Pickup duration) |
| **Pickup Start** changes | Only Pickup Start moves; Brief Start and Pickup End unchanged |
| **Debrief End** changes by Δt | `Dropoff Start = Debrief End` (always) → `Dropoff End += Δt` (preserves Dropoff duration) |
| **Dropoff End** changes | Only Dropoff End moves; Debrief End and Dropoff Start unchanged |

### 2.3 Double Sign-in/out (REST break within a Duty)

Triggered when a Duty has a significant transit gap between segments (`restAfterSegIdx` identifies the split point — the last segment of Block 1).

```
[Pick¹][Brief¹][Seg₁..SegK][Deb¹][Drop¹] ──HOTEL REST── [Pick²][Brief²][SegK₊₁..SegN][Deb²][Drop²]
```

- Block 1 `Debrief Start` locked to `segments[restAfterSegIdx].actEnd`
- Block 2 `Brief End` locked to `segments[restAfterSegIdx+1].actStart`
- Block 2 `Debrief Start` locked to `segments[last].actEnd`
- Each block has independent auto-link behavior (same rules as §2.2)
- The REST gap = Block 1 `Dropoff End` → Block 2 `Pickup Start`

**Activating double:** click `⊕` in the Gantt REST gap → Block 1 debrief/dropoff re-anchored to Seg K end; Block 2 defaults generated from Seg K+1 schedule.

**Deactivating double:** `× Remove` button in edit form → confirm → Block 1 debrief re-anchored to Seg N end; `double_*` fields cleared to NULL.

---

## 3. Backend API

### 3.1 New Endpoint

```
PATCH /api/pairing/:id/duty-nodes
```

**Auth:** required (JWT)  
**Request body:**

```typescript
interface DutyNodePatchBody {
  duties: DutyNodeUpdate[]
}

interface DutyNodeUpdate {
  dutySeq: number

  // Block 1 (always present)
  pickupStartUtc: string   // ISO 8601
  briefStartUtc:  string   // ISO 8601
  // briefEnd = first segment actStart — NOT accepted (ignored if sent)
  // debriefStart = last segment actEnd — NOT accepted (ignored if sent)
  debriefEndUtc:  string   // ISO 8601
  dropoffEndUtc:  string   // ISO 8601

  // Block 2 (null = clear double_* fields; omitted = no change to double)
  double: {
    // Index of the last segment in Block 1 (0-based within this duty's segments).
    // Tells the server which segment row receives double_pickup/brief_* and
    // which receives double_debrief/dropoff_*.
    restAfterSegSeq: number  // = seg_seq of Block 1 last segment
    pickupStartUtc:  string
    briefStartUtc:   string
    debriefEndUtc:   string
    dropoffEndUtc:   string
  } | null
}
```

**Response:** `{ code: 200, data: { updated: number }, message: 'ok' }`

**Validation rules (per duty):**
- `briefStartUtc < briefEndUtc` (briefEnd = first seg actStart, looked up server-side)
- `pickupStartUtc <= briefStartUtc`
- `debriefStartUtc <= debriefEndUtc` (debriefStart = last seg actEnd, looked up server-side)
- `debriefEndUtc <= dropoffEndUtc`
- If `double` present: same rules apply to Block 2 values; `double.restAfterSegSeq` must match an existing `seg_seq` within the duty (server validates)

**What the service writes:**  
For each `dutySeq`, updates segments of that duty in the `pairing_segment` table:

| Target segment | Columns written |
|---|---|
| First segment of duty (`min seg_seq`) | `pickup_start_utc`, `pickup_end_utc = brief_start_utc`, `brief_start_utc` |
| Last segment of duty (`max seg_seq`) | `debrief_end_utc`, `dropoff_start_utc = debrief_end_utc`, `dropoff_end_utc` |
| Segment at `restAfterSegSeq` (Block 1 last) — only when `double` present | `double_pickup_start_utc`, `double_pickup_end_utc = double_brief_start_utc`, `double_brief_start_utc` |
| First segment after split (`restAfterSegSeq + 1`) — only when `double` present | `double_brief_end_utc` is left unchanged (locked to flight actStart) |
| Last segment of duty — additionally when `double` present | `double_debrief_end_utc`, `double_dropoff_start_utc = double_debrief_end_utc`, `double_dropoff_end_utc` |

- When `double: null`: clears all `double_*` columns on **all** segments of the duty

**Cache:** Invalidate `pairing:{id}` and `pairing-segments:{id}` keys after successful write.

### 3.2 Data Fetch

The dialog loads segment data via the existing `GET /api/pairing/:id` endpoint (already returns segments with all node timestamps). No new read endpoint needed.

---

## 4. Frontend Architecture

### 4.1 New Files

| Path | Role |
|---|---|
| `gantt/src/components/pairing/duty-node-dialog.tsx` | Dialog component |
| `gantt/src/components/pairing/duty-node-gantt-bar.tsx` | Gantt puck bar sub-component |
| `gantt/src/components/pairing/duty-node-edit-block.tsx` | Single Block edit form sub-component |
| `gantt/src/services/pairing-duty-node-service.ts` | API call (`PATCH /api/pairing/:id/duty-nodes`) |

### 4.2 State — ui-store additions

```typescript
// Additions to useUiStore (src/stores/ui-store.ts)
dutyNodeDialogOpen: boolean
dutyNodeDialogPairingId: number | null

openDutyNodeDialog: (pairingId: number) => void
closeDutyNodeDialog: () => void
```

### 4.3 Component Tree

```
DutyNodeDialog                          (fixed overlay z-[9999])
  ├── DialogHeader                      (pairing label / fleet / base chips)
  ├── DialogBody (scrollable)
  │   └── For each duty:
  │       ├── DutyHeader                (seq badge, route, flt list, time range)
  │       ├── DutyNodeGanttBar          (proportional puck visualization)
  │       │     • single mode: shows ⊕ button at REST transit gap
  │       │     • double mode: shows [Block1][🏨 HOTEL][Block2]
  │       └── DutyNodeEditBlock ×1 or ×2
  │             • Brief Start* (linked), Brief End (locked)
  │             • Pickup Start (independent)
  │             • Pickup summary line
  │             ─── REST separator + × remove (double mode only) ───
  │             • Debrief Start (locked), Debrief End* (linked)
  │             • Dropoff End (independent)
  │             • Dropoff summary line
  └── DialogFooter                      (Cancel / Save Changes)
```

### 4.4 Local State (inside DutyNodeDialog)

```typescript
interface DutyEditState {
  dutySeq:      number
  pickupStart:  Date
  briefStart:   Date
  // briefEnd: readonly, from loaded segment data
  // debriefStart: readonly, from loaded segment data
  debriefEnd:   Date
  dropoffEnd:   Date
  double: {
    pickupStart:  Date
    briefStart:   Date
    debriefEnd:   Date
    dropoffEnd:   Date
  } | null
}
```

State lives in `useState<DutyEditState[]>` inside the dialog. The dialog is load-on-open: fetches segment data via `GET /api/pairing/:id` when `dutyNodeDialogOpen` becomes true.

### 4.5 Auto-link Implementation

Pure functions, called inside `onChange` handlers. No side-effects other than calling `setState`.

```typescript
function applyBriefStartChange(state: DutyEditState, newBriefStart: Date): DutyEditState {
  const pickupDuration = state.briefStart.getTime() - state.pickupStart.getTime()
  return {
    ...state,
    briefStart:  newBriefStart,
    pickupStart: new Date(newBriefStart.getTime() - pickupDuration),
  }
}

function applyDebriefEndChange(state: DutyEditState, newDebriefEnd: Date): DutyEditState {
  const dropoffDuration = state.dropoffEnd.getTime() - state.debriefEnd.getTime()
  return {
    ...state,
    debriefEnd: newDebriefEnd,
    dropoffEnd: new Date(newDebriefEnd.getTime() + dropoffDuration),
  }
}
// Mirror functions for Block 2 (applyBriefStart2Change, applyDebriefEnd2Change)
```

### 4.6 Timezone

All times displayed in the app's current timezone (from `useTimezoneStore`). Inputs accept local time, converted to UTC before sending to backend using the existing `localToUtc()` utility from `ground-task-dialog.tsx`.

### 4.7 Context Menu Integration

In `context-menu.tsx`, add to the `pairing` pane branch:

```typescript
} else if (paneType === 'pairing' && hasTask) {
  items.push(
    { icon: ClipboardEdit, label: 'Edit Duty Nodes', onClick: () => {
        openDutyNodeDialog(task.id)
        closeContextMenu()
    }},
    // existing: Select, Delete Pairing
  )
}
```

`task.id` in the Pairing pane is the `pairingId`.

---

## 5. REST Gap Detection

A Duty qualifies for double sign-in/out if it has ≥ 2 segments and a transit gap between any two consecutive segments ≥ **2 hours** (configurable via `dictionary` table key `DUTY_REST_GAP_MIN_MINUTES`, default `120`).

The gap with the longest duration is used as the primary `restAfterSegIdx`. If multiple gaps qualify, only the largest is offered (edge case: multiple rest breaks within one duty is out of scope for this feature).

---

## 6. Error Handling

| Scenario | Behaviour |
|---|---|
| Network error on load | Inline error banner with Retry button |
| Validation failure (briefStart > briefEnd) | Field-level red border + error message, Save disabled |
| API 400 (server validation) | Toast error with message from `response.message` |
| API 5xx | Toast error: "Failed to save, please try again" |
| Unsaved changes on close | Browser confirm dialog |

---

## 7. Testing

### 7.1 Unit Tests (Vitest — live-server)

- `pairingDutyNodeService.updateDutyNodes()`:
  - Writes correct fields to first/last segments of each duty
  - Validates briefStart < briefEnd (server-derived)
  - Clears `double_*` fields when `double: null`
  - Invalidates cache keys after write
  - Returns 400 on invalid timestamps

### 7.2 Unit Tests (Vitest — gantt)

- Auto-link pure functions:
  - `applyBriefStartChange` preserves Pickup duration
  - `applyDebriefEndChange` preserves Dropoff duration
  - Independent edits (pickupStart, dropoffEnd) do not affect linked fields
  - Block 2 mirrors apply independently

### 7.3 Integration / E2E (Playwright — optional, P2)

- Right-click Pairing → "Edit Duty Nodes" opens dialog
- Changing Brief Start updates Pickup Start in real-time
- Activating double shows Block 2 form
- Save sends correct PATCH payload

---

## 8. Out of Scope

- Editing `briefAirport` / `debriefAirport` fields (display only for now)
- More than one REST break within a single Duty
- Read-only mode for historical/locked pairings (handled by existing lock mechanism)
- Mobile (pbs-app) — Gantt is desktop-only

---

## 9. Open Questions

_(None — all resolved during brainstorming)_
