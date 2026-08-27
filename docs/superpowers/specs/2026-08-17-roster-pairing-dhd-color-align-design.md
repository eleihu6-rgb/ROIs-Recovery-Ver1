# Design: Align Roster DHD puck color with Pairing pane

**Date:** 2026-08-17  
**Status:** Approved for implementation  
**Scope:** Live + Scenario Gantt Canvas (Roster and Pairing segment-mode pucks)

## Problem

On Scenario (and Live), a multi-segment pairing whose third leg is deadhead (e.g. T4159 / `seg_assignment = 'DHD'`) paints **purple** in the Pairing pane but a **different** color in the Roster pane for the same segment.

Root cause: the two panes use different signals.

| Pane | Deadhead signal today | Result on SIT-shaped data |
|---|---|---|
| Pairing | `seg.segAssignment ∈ {DH, DHD}` | Purple (`FLIGHT_COLOR_DH_*`) |
| Roster | `item.assignmentGroup === 'DHD'` only | Often misses DHD |

Evidence on SIT Live:

- `pairing_segment.seg_assignment` for deadheads is almost always **`DHD`** (not `DH`).
- `roster_flight` for those legs commonly stores `assignment_group = 'FLY'` with `assignment` either `DHD` or even `FLY`.
- Scenario roster items are built in `build-scenario-roster-items.ts` with  
  `seg.segAssignment === 'DH' ? 'DHD' : pairing.assignmentGroup` — so **`DHD` segments keep `FLY`**, and the Roster renderer never takes the purple branch.

Pairing pane is the visual source of truth for duty-type color (same decision as the 2026-08-14 FLY/Reserve unify).

## Decision

**Roster segment-mode DHD detection must use the same segment assignment signal as Pairing.**

### Shared classifier

Extend `gantt/src/utils/puck-duty-color.ts` (already owns FLY/Reserve fill resolution):

```ts
/** True when a pairing_segment.seg_assignment (or equivalent) is deadhead. */
isDeadheadSegAssignment(code: string | null | undefined): boolean
// normalize trim+upper; true iff code is 'DH' or 'DHD'
```

Both renderers call this helper (no duplicated `=== 'DH' \|\| === 'DHD'` literals outside tests).

`resolveSegmentDutyFill({ …, isDeadhead })` stays as-is; callers pass `isDeadhead: isDeadheadSegAssignment(...)`.

### Colors

Unchanged: existing `FLIGHT_COLOR_DH_TOP` / `FLIGHT_COLOR_DH_BOTTOM` (`#2d1b69` → `#4c1d95`) and DH text/stroke styling already shared in spirit between panes. This change only fixes **when** that palette is selected.

### Pairing pane

`pairing-renderer.ts`: replace inline `seg.segAssignment === 'DH' \|\| … === 'DHD'` with `isDeadheadSegAssignment(seg.segAssignment)`. Behavior unchanged.

### Roster pane

`roster-renderer.ts` segment-mode path:

- Prefer `item.segAssignment` when present:  
  `isDeadhead = isDeadheadSegAssignment(item.segAssignment)`.
- Fallback (defensive, for older payloads / ground-less rows):  
  `assignmentGroup === 'DHD'` **or** `isDeadheadSegAssignment(item.assignment)`.
- Pass `isDeadhead` into `resolveSegmentDutyFill` (today Roster hard-codes `isDeadhead: false` on the non-DHD branch — fix that so DHD never falls through to FLY blue).

### Data plumbing — Scenario

In `build-scenario-roster-items.ts`:

1. Set `assignmentGroup` with the shared deadhead rule:  
   `isDeadheadSegAssignment(seg.segAssignment) ? 'DHD' : (pairing.assignmentGroup \|\| 'FLT')`.
2. Copy `segAssignment: seg.segAssignment` onto each flying `RosterItem` so the renderer uses the same field as Pairing.

Also fix `live-server` Scenario patch insert that only maps `'DH'`:

```sql
CASE WHEN upper(btrim(ps.seg_assignment)) IN ('DH', 'DHD') THEN 'DHD'
     ELSE COALESCE(p.assignment_group, 'FLT') END
```

(Keep existing table/partition placeholders; only widen the deadhead predicate.)

### Data plumbing — Live

`roster-service` already left-joins `pairing_segment` on `(pairing_id, duty_seq, seg_seq)` to attach brief/pickup/rest. Extend that join projection to include `pairingSegment.segAssignment` and map it onto the roster DTO / `RosterItem.segAssignment`.

Optimistic Live assign placeholders (`pane-container` / `app-layout`) that build roster rows from pairing segments must set `segAssignment` (and `assignmentGroup: 'DHD'` when deadhead) the same way, so draft preview matches committed paint.

No bulk rewrite of historical `roster_flight.assignment_group` / `assignment` values.

### Type

Add optional `segAssignment?: string | null` on `RosterItem` (gantt types). Absent ⇒ use fallback classifier above.

## Out of scope

- Recoloring Flight pane DH (already uses `fltType === 'DH'`).
- Changing `FLIGHT_COLOR_DH_*` hex values.
- Dictionary / `assignment.color_hex` for DHD.
- Backfilling Live `roster_flight` rows.
- Non-segment (duty-bar / ground-only) paint paths beyond what already uses assignment-store colors.
- Treating carrier codes in Scenario S3 offline segments (`AC`, `PD`, …) as deadhead unless they are already normalized to `DH`/`DHD` at import — this ticket only aligns on the `DH`/`DHD` contract Pairing already uses.

## Testing

### Unit (Vitest)

- `isDeadheadSegAssignment`: true for `DH`, `DHD`, mixed case / trim; false for `FLY`, `FLT`, `RES`, empty.
- `buildScenarioRosterItems`: segment with `segAssignment: 'DHD'` yields item with `assignmentGroup: 'DHD'` and `segAssignment: 'DHD'`; `DH` likewise; `FLY` keeps pairing group.
- `resolveSegmentDutyFill` with `isDeadhead: true` still returns `{ kind: 'dhd' }`.
- live-server: scenario patch SQL / mapper accepts `DHD` (string or focused service test already covering that CASE).

### Renderer / hook (preferred over full Playwright pixel)

- Extend gantt test-hook `segmentDutyFill` (or equivalent) so a Roster item with `segAssignment: 'DHD'` resolves the same deadhead fill kind as a Pairing segment with the same code.
- If an existing Playwright color probe exists from the FLY/Reserve unify, add one DHD assertion; otherwise Vitest + hook is enough for this paint-only fix.

### Manual

Scenario 743 (or equivalent): open the pairing with a mid-duty DHD segment; confirm Roster and Pairing third-segment fills match under the same zoom.

## Risks

- Live roster query already joins `pairing_segment`; adding one column is low cost and does not change pagination/first-paint batching.
- Fallback on `assignment` / `assignmentGroup` avoids blank paint if `segAssignment` is missing on ground tasks or legacy clients.
- Widening Scenario patch mapping can change stored `assignment_group` for newly patched rows only (desired).
