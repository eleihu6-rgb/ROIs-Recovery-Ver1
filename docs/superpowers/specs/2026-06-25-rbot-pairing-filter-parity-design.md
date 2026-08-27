# RBot Pairing Filter Parity

> Date: 2026-06-25
> Status: approved direction -> spec review

## Goal

Extend RBot's existing pairing filter command so it supports every criterion currently available in the Gantt Live filter dialog's Pairing tab. The behavior must match the roster pane filter model: RBot maps clear natural-language filter requests to one existing action path, the frontend writes those values into the shared filter store, and the existing apply/refresh behavior decides whether to reload, float matches, or hard-filter rows.

This is a parity change for the existing `filter_pairing` RBot tool, not a new bid-rule or PBS pairing-property system.

## Current Behavior

RBot already supports roster, pairing, and flight filters through `ai-server/src/chat/tools.py`:

- `filter_crew` accepts roster facets and `crewIds`.
- `filter_pairing` accepts only `bases`, `fleets`, `divisions`, `depArps`, and legacy `isFull`.
- `filter_flight` accepts flight facets.

The Gantt frontend dispatch path is intentionally thin:

- `gantt/src/components/ai-chat/dispatch-ai-action.ts` receives `filter_*` actions.
- It passes action fields directly into `useFilterStore`.
- `applyGanttFilters()` later performs the same reload/overlay behavior used by the filter dialog.

The roster filter has two behavior classes:

- Normal facets, such as division/base/rank/fleet, replace values in `useFilterStore.crew`.
- Explicit crew IDs are an overlay. They bring matching rows to the top through `bringCrewIdsToTop()` and do not behave like normal facet reload fields.

Pairing already has the same split in the current filter store and filter dialog:

- Normal facets: `bases`, `fleets`, `divisions`, `depArps`, `assignments`.
- Overlay/row-target fields: `label`, `coverage`, `pairingIds`.
- `pairingIds` is a client-side hard filter that does not force a server reload.

## Supported Criteria

RBot `filter_pairing` must support the current Pairing tab criteria:

| UI label | Store field | Behavior |
|---|---|---|
| Label | `label` | Text overlay; searches matching pairing labels and floats matches to top. |
| Pairing ID | `pairingIds` | Client-side hard filter by `pairing.id`; no server reload. |
| Division | `divisions` | Normal facet, values `P` or `C`. |
| Base | `bases` | Normal facet, airport/base codes. |
| Fleet | `fleets` | Normal facet. |
| Type | `assignments` | Normal facet using pairing assignment/type codes. |
| Origin Arpt | `depArps` | Normal facet using departure airport codes. |
| Coverage | `coverage` | Overlay reorder using current coverage states. |

Coverage values must use the existing canonical states from `gantt/src/utils/pairing-coverage.ts`: `open`, `partial`, `full`, and `over`.

## Architecture

Use the current RBot schema -> action -> dispatch -> filter-store path.

### Backend Tool Schema

Update `ai-server/src/chat/tools.py`:

- Keep the tool name `filter_pairing`.
- Extend its schema with `assignments`, `coverage`, `label`, and `pairingIds`.
- Update the description so the LLM understands the same terms visible in the Pairing tab, including "pairing label", "pairing id", "type", "assignment", "origin airport", and coverage states.
- Add the same fields to `_FILTER_KEYS['filter_pairing']`.
- Normalize code-like arrays consistently with existing filters:
  - Uppercase `bases`, `fleets`, `divisions`, `depArps`, and `assignments`.
  - Trim and cap `pairingIds`, but do not uppercase them because they are numeric/string row identifiers.
  - Normalize `coverage` to lowercase canonical states and drop invalid states.
  - Trim `label` to a bounded string; blank label is ignored.
- Drop legacy `isFull` from new prompting emphasis. It may remain tolerated for backward compatibility only if existing tests or callers require it.

### Frontend Action Contract

Update `gantt/src/components/ai-chat/types.ts` so `filter_pairing` accepts:

```ts
{
  type: 'filter_pairing'
  bases?: string[]
  fleets?: string[]
  divisions?: string[]
  depArps?: string[]
  assignments?: string[]
  coverage?: CoverageState[]
  label?: string
  pairingIds?: string[]
}
```

The dispatch implementation should remain the same if TypeScript accepts the new shape:

```ts
const { type: _type, ...rest } = action
useFilterStore.getState().setPairingFilter(rest)
```

Do not add an alternate store or direct pane mutation path. This keeps the behavior aligned with roster filters.

### Apply Behavior

Do not change `applyGanttFilters()` unless tests reveal an existing bug.

The current desired behavior is:

- Facet field changes can trigger pairing data reloads.
- `label` and `coverage` use `bringPairingLabelToTop()` and `bringPairingCoverageToTop()`.
- `pairingIds` behaves like the current filter dialog: client-side hard filter, tracked separately from server reload criteria.

## Error Handling

- If RBot extracts no valid pairing filter fields, `tool_call_to_action()` returns `None`.
- Invalid coverage states are dropped. If all requested coverage states are invalid and no other fields are valid, return `None`.
- Blank labels are ignored.
- Empty arrays are allowed only when intentionally clearing a field through the existing action path; normal LLM calls should omit empty fields.
- Values remain capped by the existing filter item cap to avoid oversized chat actions.

## Testing

### Backend Pytest

Add or update tests in `ai-server/tests/test_chat_tools.py`:

- `filter_pairing` advertises all current Pairing tab fields.
- `filter_pairing` maps `assignments`, `coverage`, `label`, and `pairingIds`.
- Code arrays are normalized consistently.
- Coverage invalid values are dropped.
- Empty/invalid-only calls return `None` if the implementation adds a no-op guard.

### Frontend Vitest

Add tests in `gantt/src/components/ai-chat/__tests__/dispatch-ai-action.test.ts`:

- Dispatching `filter_pairing` with every supported field writes the same values into `useFilterStore.getState().pairing`.
- `filter_pairing` returns a chip that includes the relevant fields.
- Existing `filter_crew` tests remain unchanged, proving the pairing behavior follows the same store-write model.

### Optional Browser Check

If implementation touches chat prompt behavior or E2E fixtures, add one RBot browser test later:

- User prompt: "filter pairings by label 4506, coverage open, type F, origin YVR".
- Expected: chat emits an applied chip and the filter store contains matching pairing fields.

This is optional for the initial parity implementation because the backend and dispatch tests cover the contract directly.

## Out Of Scope

- Do not add PBS bid-rule/property filtering to RBot.
- Do not add a new `filter_pairing_rule` tool.
- Do not change the filter dialog UI.
- Do not change pairing search, pairing bid, or PBS portal behavior.
- Do not introduce new dependencies.

## Implementation Notes

The implementation should be small and test-first:

1. Add failing backend tests for the expanded schema/action mapping.
2. Extend `filter_pairing` schema and normalization in `ai-server/src/chat/tools.py`.
3. Add failing frontend dispatch tests for all Pairing tab fields.
4. Extend the frontend `AiAction` type.
5. Run targeted pytest and Vitest.

If a reusable skill is created for future RBot work, it should document this path: backend tool schema, backend action mapping, frontend action type, frontend dispatch, store behavior, and targeted tests.
