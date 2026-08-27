# RBOT Main Roster Sorting Tool Design

Date: 2026-06-25
Module: Gantt / AI Chat
Status: Approved design direction, pending implementation plan

## Goal

Upgrade R'Bot roster sorting from a narrow single-field command into a reliable main-roster sorting tool that matches the Gantt Sort dialog semantics for the Live main roster pane.

R'Bot should understand natural-language sorting prompts such as:

- `sort roster by crew id descending`
- `sort roster by seniority`
- `sort roster by rank then seniority`
- `sort roster by rank asc then crew id desc`
- `show YVR crew sorted by rank asc then seniority asc`

The first version targets only the Live main roster pane (`roster-main`). Roster Sub and Scenario roster sorting are out of scope for this version.

## Current State

The system already has a `sort_roster` AI tool:

- Backend: `ai-server/src/chat/tools.py`
- Route prompt: `ai-server/src/chat/routes.py`
- Frontend action contract: `gantt/src/components/ai-chat/types.ts`
- Frontend dispatch: `gantt/src/components/ai-chat/dispatch-ai-action.ts`
- Store target: `usePaneStore.setSortCriteria('roster-main', criteria)`

Today the tool is effectively single-field. It documents `crewId` as the main example, accepts arbitrary field strings from the LLM, and the frontend applies the field without validating it against the roster pane's supported sort columns.

The Gantt Sort dialog already supports ordered multi-key sort criteria through pane-store `SortCriterion[]`. R'Bot should reuse that path instead of creating a separate sorting mechanism.

## Scope

In scope:

- Main Live roster sorting only (`roster-main`).
- Single-key and multi-key roster sorting.
- Field alias normalization in the AI server.
- Frontend validation before mutating pane-store sort state.
- Clear confirmation chips that reflect every applied sort criterion.
- Playwright coverage that proves rendered roster order changes, not just that a chat chip appears.

Out of scope:

- Roster Sub targeting.
- Scenario roster targeting.
- Opening or controlling the Sort dialog through R'Bot.
- Pairing or flight sorting changes.
- New visual UI for sorting.
- RES creator control from R'Bot.

## Tool Contract

Keep the existing `sort_roster` tool name to avoid overlapping tools.

Extend the backend input schema to support both legacy single-field input and new multi-key criteria:

```json
{
  "paneId": "roster",
  "field": "crewId",
  "direction": "desc",
  "criteria": [
    { "field": "rank", "direction": "asc" },
    { "field": "seniority", "direction": "asc" },
    { "field": "crewId", "direction": "desc" }
  ]
}
```

Rules:

- `criteria` wins when present and non-empty.
- Legacy `field` + `direction` remains supported.
- `paneId` is ignored or normalized to `roster` / `roster-main`; any other pane target is rejected for this version.
- Direction defaults to `asc` when omitted.
- Empty or fully invalid criteria produce no action.

## Supported Fields And Aliases

Canonical field keys should match the roster pane column/sort keys used by the existing Sort dialog and pane-store.

Initial allowlist:

| Canonical key | Natural language aliases |
| --- | --- |
| `crewId` | crew id, crew, employee id, emp id |
| `seniority` | seniority, sen, seniority number |
| `rank` | rank, position |
| `base` | base, crew base |
| `mcred` | mcred, monthly credit, credit |
| `mdo` | mdo, monthly days off, days off |

If a listed stat column is not available in the current roster Sort dialog, frontend validation must reject it rather than applying a dead criterion. This keeps the AI contract aligned with the actual UI.

## Backend Design

Update `ai-server/src/chat/tools.py`:

- Expand `sort_roster` description with multi-key examples.
- Add `criteria` to the tool schema.
- Add alias normalization for sort fields.
- Cap criteria to 5 entries.
- Drop invalid criteria.
- Return `None` if no valid criteria remain.

Return action shape:

```json
{
  "type": "sort_roster",
  "paneId": "roster",
  "criteria": [
    { "column": "rank", "direction": "asc" },
    { "column": "seniority", "direction": "asc" }
  ]
}
```

For backward compatibility the frontend can still accept `{ field, direction }`, but new backend output should prefer `criteria`.

Update `ai-server/src/chat/routes.py` system prompt:

- State that R'Bot can sort the Live main roster by multiple fields in priority order.
- Give examples using `rank`, `seniority`, and `crew id`.
- Say R'Bot should ask for clarification when the requested sort field is not supported.

## Frontend Design

Update `gantt/src/components/ai-chat/types.ts`:

- Extend `sort_roster` action to accept `criteria?: Array<{ column: string; direction: 'asc' | 'desc' }>` while keeping legacy `field` / `direction`.

Update `gantt/src/components/ai-chat/dispatch-ai-action.ts`:

- Continue targeting only `roster-main`.
- Convert legacy `field` / `direction` into one criterion.
- Validate criteria against the Live roster's supported sort fields before calling pane-store.
- Apply all valid criteria with `usePaneStore.getState().setSortCriteria('roster-main', validCriteria)`.
- Return a confirmation chip such as:
  - `Sorted roster by crewId desc`
  - `Sorted roster by rank asc, seniority asc`
- If no valid criteria remain, return `null` and do not mutate pane-store.

Validation source:

- Prefer a shared roster sort field allowlist/helper if available.
- Otherwise introduce a small local helper that matches the existing Live roster sort dialog keys and labels.

## Data Flow

1. User sends a prompt in R'Bot.
2. AI server maps the natural-language request to `sort_roster`.
3. Backend normalizes aliases into canonical field keys and emits ordered criteria.
4. Frontend dispatch validates criteria against supported roster sort fields.
5. Frontend writes `SortCriterion[]` to `usePaneStore` for `roster-main`.
6. Existing Live roster source recomputes panel rows with `sortPanelRowsByValues`.
7. Existing PaneConditionStrip / PaneToolbar show sort chips from pane-store state.

No roster data refetch should be required for sort-only actions. Sorting should remain client-side.

## Error Handling

- Unknown sort fields are ignored on the backend.
- If all requested fields are unknown, backend returns no `sort_roster` action and the assistant text should ask for a supported field.
- Frontend repeats validation and skips unknown fields defensively.
- Invalid direction values normalize to `asc`.
- Unsupported pane targets do not mutate state.

## Testing

Backend unit tests:

- `sort_roster` maps legacy `field=crewId direction=desc`.
- `sort_roster` maps multi-key `criteria`.
- Natural aliases normalize to canonical keys.
- Invalid criteria are dropped.
- All-invalid criteria returns `None`.
- Criteria cap is enforced.

Frontend unit tests:

- Dispatch applies multi-key criteria to `roster-main`.
- Dispatch still supports legacy single-field action.
- Dispatch skips invalid fields.
- Dispatch skips unsupported pane targets.
- Confirmation text lists all applied criteria.

Playwright:

- R'Bot prompt `sort roster by crew id descending` still sorts descending.
- R'Bot prompt `sort roster by seniority ascending` sorts rendered rows by seniority.
- R'Bot prompt `sort roster by rank then crew id descending` applies two criteria and shows corresponding sort chips.
- Combo prompt `show YVR crew sorted by rank asc then crew id desc` filters crew and sorts rendered rows without a sort-triggered network reload.

Assertions must use `window.__ganttTest` roster panel/order hooks and pane-store sort criteria, not canvas pixels alone.

## Acceptance Criteria

- R'Bot supports main roster multi-key sorting through natural-language prompts.
- Existing `sort roster by crew id descending` behavior remains compatible.
- Unsupported fields do not corrupt pane-store sort state.
- Sort chips and rendered row order match the applied criteria.
- No implementation creates a second sorting path outside existing pane-store and roster source logic.
