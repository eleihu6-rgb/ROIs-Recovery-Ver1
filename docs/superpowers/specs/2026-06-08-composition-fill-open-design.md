# Composition Fill/Open & Roster Acting Rank Design

**Date:** 2026-06-08
**Status:** Approved
**Scope:** `pairing_composition`, `flight_composition`, `roster_flight` schema + backend fill update logic

---

## Background

`pairing_composition` and `flight_composition` currently only store `plan_value` (how many of each rank are needed). There is no persisted `fill` (how many have been allocated) — `fill` is hardcoded to `0` in the pairing service query response. `roster_flight` has a single `acting_rank` field that conflates two distinct concepts: the rank slot in the pairing composition vs. the actual rank on a specific flight leg.

---

## Key Relationships

```
flight_composition.fill = Σ pairing_composition.plan
  (all active pairing_compositions for pairings that include this flt_id + acting_rank)

pairing_composition.fill = COUNT(DISTINCT crew_id)
  FROM roster_flight
  WHERE pairing_id = X AND roster_acting_rank = Y AND is_deleted = 0
```

`open` is a derived value in both tables: `open = plan - fill`.

---

## Section 1 — Database Schema Changes

### `flight_composition`

| Change | Detail |
|--------|--------|
| Rename `plan_value` → `plan` | `integer` |
| Add `fill integer not null default 0` | Sum of pairing_composition.plan for all active pairings covering this flight+rank |
| Add `open` generated column | `GENERATED ALWAYS AS (plan - fill) STORED` — auto-maintained by PostgreSQL |

### `pairing_composition`

| Change | Detail |
|--------|--------|
| Rename `plan_value` → `plan` | `integer` |
| Add `fill integer not null default 0` | Count of distinct crew assigned to this pairing+rank |
| Add `open` generated column | `GENERATED ALWAYS AS (plan - fill) STORED` — auto-maintained by PostgreSQL |

### `roster_flight`

| Change | Detail |
|--------|--------|
| Rename `acting_rank` → `flight_acting_rank` | Actual rank on this specific flight leg; may differ from the pairing slot |
| Add `roster_acting_rank varchar(10)` | The pairing_composition rank slot this crew member fills (e.g. CA/FO/PU/FA); same for all segments of one pairing assignment |

### Migration

- New SQL migration file in `sql/migration/` (do **not** modify existing `sql/schema/` files)
- Existing `roster_flight.acting_rank` data: rename in place; `roster_acting_rank` left NULL for historical rows (no backfill required)

---

## Section 2 — Fill Update Triggers

### `pairing_composition.fill` — triggered on `roster_flight` save/delete

Recalculate per `(pairing_id, acting_rank)` after any insert, soft-delete, or crew reassignment on `roster_flight`:

```sql
UPDATE pairing_composition
SET fill = (
  SELECT COUNT(DISTINCT crew_id)
  FROM roster_flight
  WHERE pairing_id = <pairing_id>
    AND roster_acting_rank = <rank>
    AND is_deleted = 0
), updated_at = now(), updated_by = <username>
WHERE pairing_id = <pairing_id>
  AND acting_rank = <rank>
  AND is_deleted = 0
```

Triggered by: `assignPairing`, `removeByPairingAndCrew`, `remove` (soft-delete), `move` (crew reassignment).

### `flight_composition.fill` — triggered on pairing creation/modification

Recalculate per `(flt_id, acting_rank)` after any `pairing_composition.plan` change:

```sql
UPDATE flight_composition
SET fill = (
  SELECT COALESCE(SUM(pc.plan), 0)
  FROM pairing_composition pc
  JOIN pairing_segment ps ON ps.pairing_id = pc.pairing_id
  WHERE ps.flt_id = <flt_id>
    AND pc.acting_rank = <rank>
    AND pc.is_deleted = 0
), updated_at = now(), updated_by = <username>
WHERE flt_id = <flt_id>
  AND acting_rank = <rank>
```

Triggered by: `createFromFlights`, `createComposition`, `updateComposition`, `remove` (pairing soft-delete).

### Cap Validation (`rank.is_must_crew_rank = true`)

The `rank` table (`sql/schema/01-base_pg.sql`) has `is_must_crew_rank smallint` (0/1).

Before setting/incrementing `pairing_composition.plan` for a given `acting_rank`, look up `rank.is_must_crew_rank` for that rank code. If `1`, verify:

```
flight_composition.fill + delta ≤ flight_composition.plan
```

Return HTTP 409 if the cap would be exceeded. When `is_must_crew_rank = 0`, no cap enforced — pairing compositions for that rank can be created without limit.

---

## Section 3 — API / Business Logic Changes

### `assignPairing`

- Add `rosterActingRank: string` parameter to:
  - `assignPairingSchema` (draft.ts)
  - `POST /api/roster/assign-pairing` body schema (roster.ts)
  - `rosterService.assignPairing()` function signature
- All `roster_flight` rows created for the pairing get `roster_acting_rank = rosterActingRank`
- After insert, recalculate `pairing_composition.fill` for `(pairingId, rosterActingRank)` within the same transaction

### `removeByPairingAndCrew` / `remove`

- After soft-delete, recalculate `pairing_composition.fill` for affected `(pairing_id, roster_acting_rank)`

### `createFromFlights` / `createComposition` / `updateComposition`

- After writing `pairing_composition`, recalculate `flight_composition.fill` for all `flt_id`s in the pairing

### Gantt default composition on pairing creation

- Query `flight_composition WHERE open > 0` for the flights in the new pairing to determine default ranks
- `is_must_crew_rank = false` ranks: no limit, always included regardless of `open`

---

## Section 4 — Frontend Changes

### Drizzle ORM models

- `pairingComposition` model: `planValue` → `plan`, add `fill` (read-write), add `open` (read-only generated)
- `flightComposition` model: same renames/additions
- `rosterFlight` model: `actingRank` → `flightActingRank`, add `rosterActingRank`

### Gantt types / stores / API layer

- `gantt/src/types/composition.ts`: `planValue` → `plan`
- `gantt/src/stores/composition-store.ts`: update field references
- `gantt/src/config/data-entity-registry.ts`: update `dbField: 'plan_value'` entry
- `gantt/src/stores/roster-store.ts`: `actingRank` → `flightActingRank` (all usages); add `rosterActingRank` where pairing is assigned
- All `fill: 0` hardcoded values in `pairing-service.ts` removed — `fill` now read from DB

---

## Out of Scope

- Backfilling `roster_acting_rank` for existing roster_flight rows
- `flight_composition.fill` triggered by roster changes (roster only updates `pairing_composition.fill`)
- Any changes to `sql/schema/` build scripts
