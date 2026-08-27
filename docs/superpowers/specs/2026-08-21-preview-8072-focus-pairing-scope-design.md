# Preview-draft: scope 8072 segments to focus pairings

Date: 2026-08-21  
Status: Approved (approach 1)

## Problem

Scenario assign preview (e.g. 743 → pairing 135599 → crew 386) takes ~2.5s before the confirm dialog. Profile shows **rule8072 ~850ms** with **0 violations** for that assign; it still builds `qualificationFlightSegments` for the crew’s full temp-roster month.

## Decision

When `ctx.focusPairingIds` is non-empty (preview-draft focus), restrict the 8072 `seg` CTE to those pairing ids only (same pattern as 8030 `pilotAge` Live-mate scoping). Full scenario/live recheck leaves `focusPairingIds` empty → unchanged full scan.

## Scope

- `scenario-legality.mjs` `qualificationFlightSegments`
- `live-legality.mjs` `qualificationFlightSegments` + pass `focusPairingIds` from live preview ctx
- Tests: SQL captures assert focus filter when ids present

## Non-goals

- Parallel rule execution on one pg client
- Skipping entire rules from the preview ruleset
