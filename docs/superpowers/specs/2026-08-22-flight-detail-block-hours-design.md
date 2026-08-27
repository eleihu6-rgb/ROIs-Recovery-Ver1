# Flight Detail Block Hours derivation

**Date:** 2026-08-22  
**Module:** gantt — Flight Detail dialog  
**Status:** Approved

## Goal

Show **Block Hours** from flight times, not `flight.blkMin`.

## Rules (first match)

1. If `actDepDtUtc` and `actArvDtUtc` both present → minutes = `ATA − ATD`
2. Else → minutes = `STA − STD` (`schArvDtUtc − schDepDtUtc`)
3. If the chosen pair is missing or `arv ≤ dep` → display `—` (no `BH` unit)

Format remains `formatHM` (`H:MM`) with unit `BH` when a positive/zero valid duration exists. Invalid/null → `—`.

## Non-goals

- Do not change **Flight Time** (still actual-only / `FT (actual)`).
- Do not change STATUS / composition / crew assignment.
- Do not persist or write back `blkMin`.

## Implementation

- Pure helper `deriveFlightBlockMinutes` next to flight detail helpers.
- Vitest for actual pair, scheduled fallback, missing ATA → scheduled, invalid order → null.
- Wire `LoadedDetailBody` Block Hours row to the helper.

## Live + Scenario

Shared dialog path; Scenario with STD/STA and null actuals shows scheduled block (e.g. 09:40→14:50 → `5:10`).
