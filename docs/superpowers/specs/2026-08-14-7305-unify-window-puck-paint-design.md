# Design: Unify 7305 puck paint to full consecutive window

**Date:** 2026-08-14  
**Status:** approved (user chose recommended approach)  
**Depends on:** `2026-08-14-7305-crew-puck-window-paint-design.md`

## Problem

Same 7305 “6 consecutive days” finding paints differently:

- `pairing_id` null (run starts on ground) → crew + window → N pucks in span  
- `pairing_id` set (run starts on a pairing) → pairing anchor only → 1 puck  

Example scenario 740: crew 13645 → 6 pucks; crew 13626 → 1 puck.

## Decision

For rule **7305** only: always paint **all of that crew’s roster tasks that overlap the violation paint window** (`window_*` / `start`/`end`), whether the row is keyed as `crew` or `pairing`. Crew bell / Alert Center unchanged.

## Implementation sketch

1. Add `crewTasksOverlappingWindow` in `violation-puck-window.ts` (any assignment group; 7501 keeps FLY-only helper).
2. Live + Scenario violation maps: when `ruleCode === '7305'` and crew + window resolve, bump those tasks (in addition to / instead of relying on anchor-only pairing paint).
3. Puck tooltip: same expansion for 7305 (mirror 7501’s non-anchor hover pattern).
4. Vitest: 13626-shaped pairing-anchored 7305 lights in-window tasks beyond the anchor; out-of-window stays dark; 13645 crew-path still lights the span.

## Non-goals

- Do not change Rust pairing_id persistence  
- Do not put 7305 in `CREW_BELL_ONLY_RULES`  
- Do not change other rules’ pairing-anchor behavior  
