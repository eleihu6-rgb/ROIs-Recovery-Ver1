# Schedule Details — Pairing Aggregation

**Date:** 2026-08-10
**Status:** Design (approved)
**Scope:** `gantt` frontend + small `live-server` / scenario data plumbing

## Problem

The Schedule Details dialog renders **one row per roster segment**. A pairing with several duties/segments (e.g. `106 YVR-YUL · V4156`, `107 YUL-YVR · V4156`, `OBDO …`) shows as multiple rows, which is noisy and hides the pairing as a unit.

## Goal

For **Pairing-type** rows, collapse all items of the same pairing into **one row per pairing** (both Live and Scenario Schedule Details):

| Column | Value |
|---|---|
| Type | `Pairing` |
| Start | earliest `schStrDtUtc` across the pairing's items |
| End | latest `schEndDtUtc` across the pairing's items |
| Credit | Σ `dutyActCreditedMinutes` over **distinct duties** (`dutySeq`) |
| Label | `pairingLabel` |
| Pairing | `{pairingId}` when `interfaceId` is null, else `{pairingId} · {interfaceId}` |

Non-pairing items (DO, ground tasks, etc.) keep their current individual-row rendering. Daily Task Calendar is **not** affected (it builds its own model).

## Data plumbing

`interface_id` lives on the `pairing` table but is not currently exposed to the frontend. Thread it through both sources:

### Live — `live-server/src/services/roster/roster-service.ts`
- In `getView`'s select, add `pairingInterfaceId: pairingTable.interfaceId` (the `pairingTable` LEFT JOIN already exists for `pairingLabel`).
- Map it into the returned DTO as `pairingInterfaceId`.

### Scenario — scenario gantt-data
- Add `interface_id` to the scenario pairing select in the scenario gantt-data service.
- Add `interfaceId?: string | null` to `ScenarioGanttPairing` (`gantt/src/types/scenario-gantt.ts`).
- Set `pairingInterfaceId` on the built roster items in `gantt/src/components/scenario-gantt/build-scenario-roster-items.ts`.

### Frontend type
- Add `pairingInterfaceId?: string | null` to `RosterItem` (`gantt/src/types/roster.ts`).

## Aggregation — `scheduleRowsForCrew` (`gantt/src/utils/schedule-details.ts`)

Modify `scheduleRowsForCrew` to group items with `pairingId != null` by `pairingId` and emit one row per pairing; non-pairing items pass through unchanged.

For a pairing group (items already filtered to the crew + RP, and deduped upstream by `dedupeRosterItems`):

- **id** — min item id in the group. Used for the React key, `data-task-id`, and row selection: clicking calls the existing `selectRosterTaskFromDialog(items, id, scenarioId)`, which already expands to pairing-mates, so the whole pairing selects.
- **start / end** — min `schStrDtUtc` / max `schEndDtUtc`.
- **credit** — sum `dutyActCreditedMinutes` once per distinct `dutySeq` (a duty's credit repeats on every segment row), applying the current fallback chain (`dutyActCreditedMinutes ?? actCreditedMinutes ?? schCreditedMinutes`) per duty before summing.
- **label** — `pairingLabel`.
- **pairing** — `${pairingId}` if `pairingInterfaceId` is null/empty, else `${pairingId} · ${pairingInterfaceId}`.
- **source** — from the first item of the group.

All rows (pairing + non-pairing) sort ascending by start time, then id, as today.

## Error handling

- Pairing with no `interfaceId` → Pairing column shows just the id.
- Pairing whose items lack duty credit → those duties contribute 0 to the sum.
- No behavior change for non-pairing rows or for the Daily Task Calendar.

## Testing

### Unit (`gantt/src/utils/__tests__/schedule-details.test.ts`)
- A pairing with multiple duties/segments renders as **one** row; Start/End are the pairing bounds; Credit is the sum of distinct duty credits (a 2-segment duty counts once).
- Label uses `pairingLabel`; Pairing column is `{id} · {interfaceId}` and `{id}` when `interfaceId` is null.
- Mixed input (DO rows + a pairing) sorts chronologically; DO rows stay individual.

### Playwright (`e2e/tests/gantt/schedule-details-dialog.spec.ts`)
- Open Schedule Details for a crew that flies a pairing; assert the pairing appears as a single row whose `Pairing` cell is `{id} · {interfaceId}` (or `{id}` when null) and whose Credit equals the summed duties — and that no duplicate/extra pairing rows appear.

## Out of scope

- Daily Task Calendar aggregation.
- Changing the roster pane / pairing pane rendering.
- Backend API shape changes beyond adding `pairingInterfaceId`.
