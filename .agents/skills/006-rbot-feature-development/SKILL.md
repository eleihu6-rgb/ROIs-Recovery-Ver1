---
name: 006-rbot-feature-development
description: Use when adding, changing, or debugging RBot chat capabilities in the ROIS Gantt app, including ai-server chat tools, tool_call_to_action mappings, Gantt AiAction types, dispatch-ai-action behavior, filter/sort/date actions, RBot prompts, and RBot E2E tests.
---

# RBot Feature Development

## Required Workflow

Use the repository brainstorming/spec workflow before implementation when behavior changes. Use test-driven development for implementation: write a failing backend or frontend test, verify it fails for the expected reason, then implement the minimum change.

## Existing Path

RBot board actions flow through:

1. `ai-server/src/chat/tools.py` for tool schemas, normalization, and `tool_call_to_action()`.
2. `ai-server/src/chat/routes.py` for system prompt guidance and server-resolved tools.
3. `gantt/src/components/ai-chat/types.ts` for the frontend `AiAction` contract.
4. `gantt/src/components/ai-chat/dispatch-ai-action.ts` for store mutation.
5. Existing stores such as `useFilterStore`, `usePaneStore`, and `useTimezoneStore`.

Prefer extending the existing tool/action path over adding a new path. Do not mutate pane state directly from backend-shaped actions when a store already owns that behavior.

## Filter Behavior

Roster and pairing filters intentionally write into `useFilterStore`.

- Normal facets replace filter-store values and are applied by `applyGanttFilters()`.
- Lookup/overlay fields such as `crewIds`, pairing `label`, pairing `coverage`, and `pairingIds` rely on existing frontend apply behavior.
- Keep RBot behavior aligned with the filter dialog for the same fields.

## Tests

For backend changes, add or update `ai-server/tests/test_chat_tools.py`.

For frontend dispatch changes, add or update `gantt/src/components/ai-chat/__tests__/dispatch-ai-action.test.ts`.

Use browser/E2E tests only when changing chat prompt behavior, UI wiring, or full in-browser interaction.
