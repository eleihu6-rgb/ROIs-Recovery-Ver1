# Design: Align EK/ET pairing FLT/PAX codes with F8 FLY/DHD

**Date:** 2026-09-07  
**Status:** Approved for implementation  
**Schema:** `dev_live` only (`dev_scenario` has no EK/ET pairing rows)  
**Related:** Flight Detail Crew Assignment empty for EK201 / K1002

## Problem

Recovery-imported EK/ET pairings use legacy codes (`FLT`, `PAX`). F8 live roster uses `FLY` / `DHD`.

`GET /api/flight/:id/crew` (`flightService.getCrewList`) filters `roster_flight.assignment_group = 'FLY'` and then drops `seg_assignment` in `{DHD, DH}`. Consequence on current data:

| Example | Data today | Flight Detail Crew Assignment |
|---|---|---|
| EK201 `#145625` / K1002 / pairing `#150398` | group `FLT`, assignment `PAX` | empty (group filter) |
| ET168 `#153985` / T2001 / pairing `#150406` | group `FLT`, assignment `FLT` | empty (group filter) |

Inventory in `dev_live` (2026-09-07, `is_deleted = 0`):

| Surface | Count | Codes |
|---|---|---|
| `pairing` EK | 12 | `assignment_group=FLT`, `assignment=FLT` |
| `pairing` ET | 189 | same |
| `pairing_segment` EK | 24 | `seg_assignment=PAX` |
| `pairing_segment` ET | 405 | `seg_assignment=FLT` |
| `roster_flight` | 4 | group `FLT`, assignment `PAX` (K1001 `#150390`, K1002 `#150398`) |
| `roster_flight` | 2 | group `FLT`, assignment `FLT` (T2001 `#150406`) |

All 201 `pairing` rows with `assignment_group = 'FLT'` are EK or ET. No other airline uses `FLT` on pairing.

New pairings created in this recovery live-server still default to `FLT` (`pairing-service`, `pairing-build-service`, `roster-service`).

## Decision

One-shot data remap on EK/ET live pairings **plus** change create-path defaults so new rings do not reintroduce `FLT`.

F8 operational mapping (skill 131):

- Flying pairing bucket: `assignment_group = FLY`, `assignment = FLY`
- Deadhead / positioning: `assignment = DHD` (and `pairing_segment.seg_assignment = DHD`), still under group `FLY`

### Data remap (`dev_live`)

Identify target pairings as `pairing.assignment_group = 'FLT'` (equivalent to EK/ET in this schema).

| Table | Column | From | To |
|---|---|---|---|
| `pairing` | `assignment_group` | `FLT` | `FLY` |
| `pairing` | `assignment` | `FLT` | `FLY` |
| `pairing_segment` | `seg_assignment` | `FLT` | `FLY` |
| `pairing_segment` | `seg_assignment` | `PAX` | `DHD` |
| `roster_flight` | `assignment_group` | `FLT` | `FLY` |
| `roster_flight` | `assignment` | `FLT` | `FLY` |
| `roster_flight` | `assignment` | `PAX` | `DHD` |

Rules:

- Update only rows belonging to those pairings (join on `pairing_id` for segment/roster).
- Do not touch `RES` / `GRD` pairings, F8 `FLY` rows, or `dev_scenario`.
- Do not change master `assignment` / `assignment_group` dictionary rows (`FLT` and `PAX` stay in the catalog; they are unused by these fact rows after remap).
- Single transaction. Stamp `updated_by` / `updated_at` with a provenance tag (e.g. `flt_to_fly_2026-09-07`) so the batch is auditable.
- After commit, invalidate Redis `flight:crew:*` (and pairing crew-detail keys if present) so Flight Detail does not serve a 10-minute empty cache.

### Create-path defaults

Replace hardcoded `'FLT'` **defaults for new flight pairings / flying roster rows** with `'FLY'` in:

- `live-server/src/services/pairing/pairing-service.ts` (`assignmentGroup` / `assignment` / `segAssignment` fallback)
- `live-server/src/services/pairing/pairing-build-service.ts` (same)
- `live-server/src/services/roster/roster-service.ts` (`assignmentGroup` fallback / insert `'FLT'`)

Out of scope for this change: scenario result loader fallbacks, pairing-search `IN ('FLT','FLY')` compatibility (keep both so historical/other schemas still match), master dictionary, PAX catalog rows.

### Expected user-visible result after remap

`getCrewList` already implements F8 rules. After remap it will do the right thing without query changes:

- **T2001 on ET168** (operating `FLY`): Crew Assignment lists T2001.
- **K1002 on EK201** (operating `FLY` after 2026-09-08 reversal): Crew Assignment lists K1002.

### Follow-up 2026-09-08

EK imported `PAX` on these 12 rings is **operating**, not positioning. After the first remap put all 24 EK segments (and 4 roster rows) on `DHD`, they were changed back to `FLY` (`sql/migration/2026-09-08-ek-pairing-dhd-to-fly.sql`). F8 `DHD` roster rows were not touched (2994 → 2990 = the 4 EK rows only). ET stays `FLY`.

## Verification

1. SQL post-checks in the same session:
   - `pairing` with `assignment_group = 'FLT'` = 0
   - EK/ET `pairing_segment.seg_assignment` only `FLY` or `DHD`
   - `roster_flight` with `assignment_group = 'FLT'` or `assignment IN ('FLT','PAX')` = 0 (scoped to flying pairing rows)
2. Unit: existing `roster-service` / pairing-build tests that assert default `'FLT'` updated to `'FLY'`.
3. User-visible:
   - Flight Detail EK201 `#145625`: shows K1002.
   - Flight Detail of T2001’s ET168 leg: shows T2001.
   - Pairing Info `#150398`: still shows K1002.

Playwright: extend or add a Live flight-detail assertion that an operating FLY assignee appears and a DHD assignee does not, using these known ids if the recovery dataset is the e2e target; otherwise unit-level `getCrewList` coverage for `FLY`+`DHD` vs empty.

## Out of scope

- Remapping F8 `FLY` rows (already aligned).
- `dev_scenario`.
- Changing `getCrewList` to treat `FLT` as `FLY` as a compatibility layer (data + writers are the source of truth).
- Turning PAX dictionary / help text into DHD globally.

## Residual risk

- Shared `dev_live` write: coordinate if others are demoing these EK/ET rings.
- Redis TTL 10 minutes if invalidation is skipped.
- Any downstream that keyed off literal `PAX` / `FLT` on these 201 pairings (pairing-search already accepts `FLT` and `FLY`; DHD is already excluded from operating-leg counts).
