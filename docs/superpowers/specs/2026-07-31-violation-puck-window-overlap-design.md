# Design: Hide puck “!” when anchor pairing is outside violation window

**Status:** Approved (user: 按方案1修改)  
**Case:** crew 923 — 7501 message window Sep 19–26, `pairing_id=16693` is Aug 27–28 FLY (nearest-FLY fallback).

## Problem

7501 (and similar) may persist an anchor `pairing_id` that does not overlap the violation `[start_dt, end_dt]` when no FLY falls inside the window. The Live/Scenario puck map paints `!` on every task of that pairing → wrong month.

## Approach (scheme 1 — display only)

When building **puck** severity / puck-hover tooltip:

- If the violation has a usable time window (`windowStartDt`/`windowEndDt`, else `startDt`/`endDt`), require that at least one roster task of the anchor pairing **overlaps** that window.
- If none overlap → do **not** bump puck severity / do not list in puck tooltip.
- **Crew-row bell** and **Alert Center** unchanged (still use the persisted row).

No engine / `trigger_pairing` change in this slice.

## Shared helper

`pairingTasksOverlapViolationWindow(tasks, violation)` in a small util under `gantt/src/utils/` (or next to crew-bell-only-rules). Missing/invalid window → treat as overlap (`true`) so existing rules without dates keep current behavior.

## Touch points

- `buildLiveViolationMap` (Live)
- Scenario `buildViolationMap`
- `collectViolationTooltipEntries` puck mode (Live display + scenario pairing targets)

## Tests

- Crew 923-shaped: Aug pairing tasks + Sep window 7501 → crew severity on, task map empty for those Aug task ids.
- Same pairing overlapping window → puck still lights.
- Tooltip puck hover on Aug task omits that 7501; crew-header hover still includes it.

## Success

923 Aug FLY no longer shows `!` for the Sep 19–26 7501; crew bell / Alert Center still show the message.
