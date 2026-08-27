# RBOT Main Roster Sorting Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade R'Bot so it can sort the Live main roster by validated single-key and multi-key criteria.

**Architecture:** Reuse the existing `sort_roster` AI tool and frontend dispatch path. The AI server normalizes natural-language sort fields into canonical roster column keys and emits ordered criteria; the Gantt frontend validates those criteria before writing to `usePaneStore.setSortCriteria('roster-main', criteria)`.

**Tech Stack:** Python 3.12 FastAPI/Pydantic ai-server with pytest; React 19 + TypeScript + Zustand Gantt frontend with Vitest and Playwright.

## Global Constraints

- Target only Live main roster pane (`roster-main`) in this version.
- Do not add dependencies.
- Do not create a second sorting path outside existing pane-store and roster source logic.
- Preserve legacy `sort_roster` action with `field` + `direction`.
- Cap AI sort criteria to 5 entries.
- Validate frontend criteria before mutating pane-store.
- Assertions must use `window.__ganttTest` roster panel/order hooks and pane-store sort criteria, not canvas pixels alone.

---

## File Structure

- `ai-server/src/chat/tools.py`: Owns tool schema, alias normalization, criteria capping, and action mapping.
- `ai-server/src/chat/routes.py`: Owns R'Bot system prompt guidance for multi-key roster sorting.
- `ai-server/tests/test_chat_tools.py`: Backend unit coverage for legacy and multi-key sort action mapping.
- `gantt/src/components/ai-chat/types.ts`: Frontend `AiAction` contract.
- `gantt/src/components/ai-chat/dispatch-ai-action.ts`: Frontend action validation and pane-store mutation.
- `gantt/src/components/ai-chat/__tests__/dispatch-ai-action.test.ts`: Frontend unit coverage for dispatch behavior.
- `e2e/tests/gantt/ai-chat.spec.ts`: Browser coverage for real R'Bot sorting behavior.

## Task 1: Backend Sort Criteria Normalization

**Files:**
- Modify: `ai-server/src/chat/tools.py`
- Modify: `ai-server/tests/test_chat_tools.py`

**Interfaces:**
- Consumes: existing `tool_call_to_action(call: dict[str, Any]) -> dict[str, Any] | None`
- Produces: `sort_roster` actions with `criteria: list[{'column': str, 'direction': 'asc' | 'desc'}]`

- [ ] **Step 1: Write failing backend tests**

Add tests after `test_sort_roster_maps_with_defaults`:

```python
def test_sort_roster_maps_legacy_field_to_criteria():
    action = tool_call_to_action({'name': 'sort_roster', 'input': {'field': 'crew id', 'direction': 'desc'}})
    assert action == {
        'type': 'sort_roster',
        'paneId': 'roster',
        'criteria': [{'column': 'crewId', 'direction': 'desc'}],
    }


def test_sort_roster_maps_multi_key_criteria_with_aliases():
    action = tool_call_to_action({'name': 'sort_roster', 'input': {
        'criteria': [
            {'field': 'rank'},
            {'field': 'sen', 'direction': 'asc'},
            {'field': 'crew id', 'direction': 'desc'},
        ],
    }})
    assert action == {
        'type': 'sort_roster',
        'paneId': 'roster',
        'criteria': [
            {'column': 'rank', 'direction': 'asc'},
            {'column': 'seniority', 'direction': 'asc'},
            {'column': 'crewId', 'direction': 'desc'},
        ],
    }


def test_sort_roster_drops_invalid_fields_and_caps_criteria():
    action = tool_call_to_action({'name': 'sort_roster', 'input': {
        'criteria': [
            {'field': 'rank'},
            {'field': 'unknown'},
            {'field': 'base'},
            {'field': 'mcred'},
            {'field': 'mdo'},
            {'field': 'crew'},
            {'field': 'seniority'},
        ],
    }})
    assert action == {
        'type': 'sort_roster',
        'paneId': 'roster',
        'criteria': [
            {'column': 'rank', 'direction': 'asc'},
            {'column': 'base', 'direction': 'asc'},
            {'column': 'mcred', 'direction': 'asc'},
            {'column': 'mdo', 'direction': 'asc'},
            {'column': 'crewId', 'direction': 'asc'},
        ],
    }


def test_sort_roster_all_invalid_returns_none():
    assert tool_call_to_action({'name': 'sort_roster', 'input': {
        'criteria': [{'field': 'banana'}, {'field': ''}],
    }}) is None
```

- [ ] **Step 2: Run backend tests and confirm failure**

Run:

```bash
cd ai-server && python -m pytest tests/test_chat_tools.py -q
```

Expected: failures for the new tests because legacy output still uses `field` / `direction` and `criteria` is not implemented.

- [ ] **Step 3: Implement backend normalization**

In `ai-server/src/chat/tools.py`, add constants near `MAX_FILTER_ITEMS`:

```python
MAX_SORT_CRITERIA = 5

SORT_FIELD_ALIASES = {
    'crewid': 'crewId',
    'crew_id': 'crewId',
    'crew id': 'crewId',
    'crew': 'crewId',
    'employee id': 'crewId',
    'emp id': 'crewId',
    'seniority': 'seniority',
    'sen': 'seniority',
    'seniority number': 'seniority',
    'rank': 'rank',
    'position': 'rank',
    'base': 'base',
    'crew base': 'base',
    'mcred': 'mcred',
    'monthly credit': 'mcred',
    'credit': 'mcred',
    'mdo': 'mdo',
    'monthly days off': 'mdo',
    'days off': 'mdo',
}
```

Add helpers before `tool_call_to_action`:

```python
def _normalize_sort_field(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    raw = value.strip()
    if not raw:
        return None
    compact = raw.replace('-', ' ').replace('_', ' ').lower()
    return SORT_FIELD_ALIASES.get(compact) or SORT_FIELD_ALIASES.get(raw)


def _normalize_sort_direction(value: Any) -> str:
    return 'desc' if isinstance(value, str) and value.lower() == 'desc' else 'asc'


def _sort_criteria_from_input(data: dict[str, Any]) -> list[dict[str, str]]:
    raw_criteria = data.get('criteria')
    source = raw_criteria if isinstance(raw_criteria, list) and raw_criteria else [
        {'field': data.get('field'), 'direction': data.get('direction')},
    ]
    criteria: list[dict[str, str]] = []
    for raw in source:
        if not isinstance(raw, dict):
            continue
        column = _normalize_sort_field(raw.get('field') or raw.get('column'))
        if column is None:
            continue
        criteria.append({'column': column, 'direction': _normalize_sort_direction(raw.get('direction'))})
        if len(criteria) >= MAX_SORT_CRITERIA:
            break
    return criteria
```

Replace the `sort_roster` branch with:

```python
    if name == 'sort_roster':
        criteria = _sort_criteria_from_input(data)
        if not criteria:
            return None
        return {
            'type': 'sort_roster',
            'paneId': data.get('paneId', 'roster'),
            'criteria': criteria,
        }
```

Update the tool schema description to mention multi-key sorting and add the `criteria` array property.

- [ ] **Step 4: Run backend tests and confirm pass**

Run:

```bash
cd ai-server && python -m pytest tests/test_chat_tools.py -q
```

Expected: all tests pass.

## Task 2: Frontend Action Contract And Dispatch

**Files:**
- Modify: `gantt/src/components/ai-chat/types.ts`
- Modify: `gantt/src/components/ai-chat/dispatch-ai-action.ts`
- Modify: `gantt/src/components/ai-chat/__tests__/dispatch-ai-action.test.ts`

**Interfaces:**
- Consumes: backend action `{ type: 'sort_roster', paneId: string, criteria: SortCriterion[] }`
- Produces: validated `usePaneStore.setSortCriteria('roster-main', validCriteria)`

- [ ] **Step 1: Write failing frontend tests**

Add tests near the existing `sort_roster` dispatch test:

```typescript
  it('applies multi-key sort_roster criteria to roster-main', () => {
    const chip = dispatchAiAction({
      type: 'sort_roster',
      paneId: 'roster',
      criteria: [
        { column: 'rank', direction: 'asc' },
        { column: 'seniority', direction: 'asc' },
        { column: 'crewId', direction: 'desc' },
      ],
    })
    expect(chip).toBe('Sorted roster by rank asc, seniority asc, crewId desc')
    expect(usePaneStore.getState().getSortCriteria('roster-main')).toEqual([
      { column: 'rank', direction: 'asc' },
      { column: 'seniority', direction: 'asc' },
      { column: 'crewId', direction: 'desc' },
    ])
  })

  it('skips invalid sort_roster criteria before mutating pane-store', () => {
    const chip = dispatchAiAction({
      type: 'sort_roster',
      paneId: 'roster',
      criteria: [
        { column: 'bad-field', direction: 'asc' },
        { column: 'crewId', direction: 'desc' },
      ],
    })
    expect(chip).toBe('Sorted roster by crewId desc')
    expect(usePaneStore.getState().getSortCriteria('roster-main')).toEqual([
      { column: 'crewId', direction: 'desc' },
    ])
  })

  it('returns null when sort_roster has no valid criteria', () => {
    expect(dispatchAiAction({
      type: 'sort_roster',
      paneId: 'roster',
      criteria: [{ column: 'bad-field', direction: 'asc' }],
    })).toBeNull()
    expect(usePaneStore.getState().getSortCriteria('roster-main')).toEqual([])
  })
```

- [ ] **Step 2: Run frontend unit tests and confirm failure**

Run:

```bash
cd gantt && npm test -- src/components/ai-chat/__tests__/dispatch-ai-action.test.ts
```

Expected: failures because `criteria` is not in the action type and dispatch only reads `field` / `direction`.

- [ ] **Step 3: Implement frontend contract and validation**

In `types.ts`, add:

```typescript
export interface AiSortCriterion {
  column: string
  direction: 'asc' | 'desc'
}
```

Change the `sort_roster` action member to:

```typescript
  | {
      type: 'sort_roster'
      paneId: string
      field?: string
      direction?: 'asc' | 'desc'
      criteria?: AiSortCriterion[]
    }
```

In `dispatch-ai-action.ts`, add:

```typescript
const ROSTER_SORT_FIELDS = new Set(['crewId', 'seniority', 'rank', 'base', 'mcred', 'mdo'])

const normalizeRosterSortCriteria = (action: Extract<AiAction, { type: 'sort_roster' }>) => {
  const raw = action.criteria?.length
    ? action.criteria
    : action.field
      ? [{ column: action.field, direction: action.direction ?? 'asc' }]
      : []
  return raw
    .filter((c) => ROSTER_SORT_FIELDS.has(c.column))
    .map((c) => ({ column: c.column, direction: c.direction === 'desc' ? 'desc' as const : 'asc' as const }))
}
```

Replace the `sort_roster` case body with:

```typescript
      const pane = SORT_PANES[action.paneId]
      if (!pane) return null
      const criteria = normalizeRosterSortCriteria(action)
      if (criteria.length === 0) return null
      usePaneStore.getState().setSortCriteria(pane, criteria)
      return `Sorted roster by ${criteria.map((c) => `${c.column} ${c.direction}`).join(', ')}`
```

- [ ] **Step 4: Run frontend unit tests and confirm pass**

Run:

```bash
cd gantt && npm test -- src/components/ai-chat/__tests__/dispatch-ai-action.test.ts
```

Expected: all dispatch tests pass.

## Task 3: R'Bot Prompt Guidance And E2E Coverage

**Files:**
- Modify: `ai-server/src/chat/routes.py`
- Modify: `e2e/tests/gantt/ai-chat.spec.ts`

**Interfaces:**
- Consumes: working backend criteria output and frontend dispatch.
- Produces: browser-level proof that R'Bot sorting changes rendered main roster order.

- [ ] **Step 1: Update system prompt**

In `ai-server/src/chat/routes.py`, replace the sentence:

```python
"filter the roster/crew, pairing, or flight panes; sort a roster pane; change the "
```

with:

```python
"filter the roster/crew, pairing, or flight panes; sort the Live main roster by one "
"or more fields in priority order; change the "
```

Add after the rank/division guidance:

```python
    "Roster sort fields include crew id, seniority, rank, base, mcred, and mdo. "
    "For multi-key sorting, call sort_roster with criteria in the requested priority "
    "order, for example rank asc then crew id desc. "
```

- [ ] **Step 2: Add Playwright coverage**

Add a test to `e2e/tests/gantt/ai-chat.spec.ts` in the interactive combos describe block:

```typescript
  test('Live-1006 — RBot applies multi-key roster sorting criteria', async ({ page }) => {
    await page.route('**/fpqe/ai/chat', (route) =>
      route.fulfill({
        json: {
          role: 'assistant',
          content: 'Sorted.',
          actions: [{
            type: 'sort_roster',
            paneId: 'roster',
            criteria: [
              { column: 'rank', direction: 'asc' },
              { column: 'crewId', direction: 'desc' },
            ],
          }],
        },
      }),
    )

    await sendChat(page, 'sort roster by rank asc then crew id descending')

    await expect(page.getByTestId('ai-chat-applied')).toContainText(
      'Sorted roster by rank asc, crewId desc',
    )
    expect(await readHook<Array<{ column: string; direction: string }>>(page, 'rosterSort'))
      .toEqual([
        { column: 'rank', direction: 'asc' },
        { column: 'crewId', direction: 'desc' },
      ])

    await expect
      .poll(async () => {
        const rows = await readHook<Array<{ crewId: string; rank: string }>>(page, 'rosterPanelOrder')
        if (rows.length < 2) return false
        return rows.every((row, index) => {
          if (index === 0) return true
          const prev = rows[index - 1]
          const rankCmp = prev.rank.localeCompare(row.rank)
          if (rankCmp < 0) return true
          if (rankCmp > 0) return false
          return Number(prev.crewId) >= Number(row.crewId)
        })
      }, { timeout: 30_000 })
      .toBe(true)
  })
```

- [ ] **Step 3: Run focused browser test**

Run:

```bash
cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/ai-chat.spec.ts -g 'Live-1006' --reporter=list
```

Expected: test passes.

## Task 4: Final Verification

**Files:**
- No new files.

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: verified implementation.

- [ ] **Step 1: Run backend focused tests**

Run:

```bash
cd ai-server && python -m pytest tests/test_chat_tools.py -q
```

Expected: all tests pass.

- [ ] **Step 2: Run frontend focused tests**

Run:

```bash
cd gantt && npm test -- src/components/ai-chat/__tests__/dispatch-ai-action.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Run browser smoke for existing combo**

Run:

```bash
cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/ai-chat.spec.ts -g 'Live-1004|Live-1006' --reporter=list
```

Expected: both tests pass.

- [ ] **Step 4: Inspect git diff**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; changed files limited to the plan, ai-server chat files/tests, Gantt AI chat files/tests, and e2e AI chat spec.
