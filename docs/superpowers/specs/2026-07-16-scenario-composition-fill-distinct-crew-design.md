# Scenario Pairing Composition Fill Distinct Crew Design

## Problem

Scenario 672 can show pairing 10544 as `CA(1:2) FO(1:2)` in the Pairing pane even though the source data has one CA crew and one FO crew assigned.

The issue occurs on the Scenario Gantt seed path for DRAFT/FAILED RO scenarios with no loaded optimizer roster. That path overlays live pre-occupied roster rows, then recomputes pairing composition `fill`. Live `roster_flight` is one row per crew per segment, so a two-segment pairing produces two rows for the same crew. Counting those rows as assignments inflates `fill`.

## Evidence

For the user-provided database:

- `f8_sit_live.scenario id=672` is `DRAFT` and has no loaded scenario roster rows.
- `f8_sit_live.pairing_composition scenario_id=0 pairing_id=10544` stores `CA plan=1 fill=1` and `FO plan=1 fill=1`.
- `f8_sit_live.roster_flight scenario_id=0 pairing_id=10544` has crew `197` as CA and crew `1811` as FO, with two segment rows per crew.
- Counting rows gives `2`; counting distinct crew per rank gives `1`.

## Design

Treat composition `fill` as a count of distinct crew occupying a pairing composition slot, never as a count of roster segment rows.

The robust implementation should:

- Preserve slot rank on assignment records where the source can provide it, using `roster_acting_rank` for pairing-linked roster rows.
- Keep existing optimizer snapshot behavior compatible by falling back to crew master rank when assignment slot rank is absent.
- Recompute fill by deduping `(pairingId, rank, crewId)` before counting.
- Avoid changing UI formatting. The Pairing pane should continue to render `RANK(plan)` when `fill === plan`, and `RANK(plan:fill)` only when the slot is under- or over-filled.

## Scope

In scope:

- `live-server` Scenario Gantt seed/live-backed composition recompute logic.
- Focused regression coverage for multi-segment live lead-in rows so one crew assigned to a two-segment pairing counts once.

Out of scope:

- Data migrations.
- Frontend display changes.
- Changing persisted `pairing_composition.fill` in the database.
- Reworking full Scenario Gantt source selection.

## Test Plan

Add or update focused Vitest coverage around `mapLeadinRows` / `recomputeCompositionFill`:

- Given two live roster rows for the same `crewId + pairingId + rosterActingRank`, assignment fill recomputation counts that crew once.
- Given two crew in different ranks on a two-segment pairing, recomputed composition remains `CA fill=1`, `FO fill=1`.
- Existing behavior without an assignment slot rank continues to use crew master rank fallback.

No Playwright change is required for this specific fix because the bug is in backend data shaping and the existing UI rendering already displays the supplied `fill` value correctly.

## Risk

Low-to-medium. The touched logic feeds Scenario Gantt pairing coverage and display. The risk is undercounting legitimate duplicate assignments if the same crew appears twice for the same pairing and rank. That should not count twice for composition fill because a crew cannot occupy two identical rank slots on one pairing; distinct crew is the correct unit.
