# Rule 7504 gap-endpoint puck badges

Port the rois-ai Gantt paint path so a persisted 7504 WOCL-spacing finding that appears in Alert Center also marks the two bounding FLY duty pucks.

## Problem

Rule 7504 stores `startDt`/`endDt` as the **rest gap** between two consecutive WOCL flight duties, not as either duty’s own schedule. Recovery currently paints a pairing puck only when a segment overlaps that window. For crew `1015` the before-duty ends before the gap starts, so Alert Center lists 7504 while no puck badge is drawn.

## Scope (approved)

- Live + Scenario shared paint path (`mark7504GapDutyPucks` / `crew7504GapEndpointTasks`).
- Hover tooltip uses the same endpoint resolver.
- Unit tests for the 1015 shape + Playwright against Live crew 1015.
- Do **not** port unrelated 7501/7506/8056/8071 window changes from rois-ai.

## Behavior

1. Group the crew’s FLY tasks by `(pairingId, dutySeq)`.
2. `before` = latest FLY duty with `endMs <= gapStart`.
3. `after` = earliest FLY duty with `startMs >= gapEnd`.
4. Bump severity on every segment of those two duties.
5. Crew-row bell stays on the existing Alert Center / `crewViolationSeverityMap` path (already works).

## Files

- `gantt/src/utils/violation-puck-window.ts`
- `gantt/src/components/gantt/source/live-gantt-source.ts`
- `gantt/src/components/gantt/source/scenario-gantt-source.ts`
- `gantt/src/components/gantt/violation-tooltip.tsx`
- matching Vitest files + `e2e/tests/gantt/rule-7504-gap-endpoint-pucks.spec.ts`
