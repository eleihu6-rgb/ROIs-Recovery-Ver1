# Scenario Roster Puck Violation Scope Design

## Goal

When hovering a Scenario roster puck, the Rule Violations tooltip must show only violations related to that exact roster puck. It must not show unrelated violations that merely belong to the same crew.

## Problem

The previous Scenario roster puck hover fix made the tooltip appear, but its Scenario task aggregation included every violation whose `crewId` matched the hovered task's crew. For Scenario 672 this causes a roster puck hover to show the crew member's full violation list instead of only puck-related violations.

## Confirmed Scope

- Change only Scenario roster puck tooltip aggregation.
- Keep Scenario crew-header bell hover unchanged; crew-header hover should continue showing all violations for that crew.
- Keep Live behavior unchanged unless covered by the same pure helper test.
- Do not implement Pairing pane hover.
- Do not change backend, database, legality persistence, or API contracts.

## Desired Filtering

For roster puck hover, a Scenario violation is related to the hovered puck only when one of these is true:

- `targetType === 'roster' && targetId === hoveredTaskId`
- `targetType === 'pairing' && targetId === task.pairingId`

The tooltip must not include a Scenario violation only because `v.crewId === task.crewId`.

## Test Plan

- Unit regression: `collectViolationTooltipEntriesForTest` excludes a same-crew, crew-target Scenario violation from task-puck hover.
- E2E regression: the mocked Scenario roster puck hover test asserts the tooltip shows the pairing violation and does not show an unrelated same-crew rest violation.
- Focused verification:
  - `npm --prefix gantt run test -- src/components/gantt/__tests__/violation-tooltip.test.ts --run`
  - focused Playwright Scenario puck hover test
  - `cd gantt && npm exec -- tsc -p tsconfig.json --noEmit`
  - `git diff --check`
