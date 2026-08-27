# Design: Rule 7508 crew-bell-only (no puck paint)

**Date:** 2026-08-16  
**Status:** Approved for implementation  
**Scope:** Gantt Live + Scenario (frontend display only)

## Problem

Rule **7508** findings currently paint roster/pairing puck `!` badges and appear in puck-hover tooltips. Product wants 7508 to surface only on the **crew-row bell** and **Alert Center** (same UX as period-level GDO rules 7505 / 7507).

## Decision

Add `7508` to the existing frontend allowlist `CREW_BELL_ONLY_RULES` in `gantt/src/components/gantt/crew-bell-only-rules.ts`.

Do **not** change engine persistence, rule computation, Alert Center row shape, or backend APIs.

## Behavior

| Surface | 7508 after change |
|---------|-------------------|
| Crew-row gutter bell (`maxViolationSeverity`) | Yes |
| Alert Center / ViolationListDialog | Yes |
| Crew-header / bell hover tooltip | Yes |
| Roster / pairing puck `!` badge | No |
| Puck hover tooltip | No |

Live and Scenario both apply (same set consumed by both sources).

## Implementation

1. Update `CREW_BELL_ONLY_RULES` from `{'7505','7507'}` to `{'7505','7507','7508'}`.
2. Rely on existing call sites:
   - Live `buildLiveViolationMap` skips crew-bell-only when bumping task severity.
   - Scenario violation map / crew severity maps already skip puck bumps for the set while keeping crew severity.
   - `violation-tooltip.tsx` omits crew-bell-only in puck mode (`skipCrewBellOnly`) and keeps them for crew hover.
3. No new abstraction; do not hard-code `7508` outside the shared set.

## Testing

- Extend unit coverage mirroring 7505:
  - Live/Scenario: 7508 alone → crew severity set, puck `violationMap` empty (or no badge on tasks).
  - Co-located puck rule (e.g. 8002) on same pairing still paints when present.
  - Tooltip: puck hover omits 7508; crew-header hover includes 7508.
- Prefer Vitest on existing files (`crew-bell-only` consumers / `violation-tooltip.test.ts` / `violation-window-severity.test.ts`). Playwright only if a touched UI path already has a 7505-style e2e worth extending.

## Non-goals

- Changing 7508 rest-window logic, messages, or parameters.
- Making puck paint configurable per workset / dictionary.
- Removing any persisted `pairing_id` anchor on 7508 rows (7505 already keeps anchors; UI filters display only).

## Risks

- Low: same path as 7505/7507. Risk is forgetting a test that asserts puck paint for 7508; update those assertions to expect bell-only.
