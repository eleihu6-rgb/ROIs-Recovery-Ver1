# Scenario Duplicate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fully-wired "Duplicate" action to the Scenario list that POSTs to a new backend endpoint, creates a DRAFT copy with `"Copy of <name>"`, auto-selects it in the detail panel, and focuses the name input so the user can rename immediately.

**Architecture:** A dedicated `POST /api/scenario/:id/duplicate` backend route delegates to `scenarioService.duplicate()`, which copies all config fields and calls the existing `create()` path (which auto-creates a fresh workset, required by the DB unique constraint). The frontend adds `duplicateScenario()` to the Zustand store; the detail panel reads a transient `focusNameField` flag from the store to call `.select()` on the name `<input>` ref after navigation.

**Tech Stack:** Fastify + Drizzle (backend), React 19 + Zustand + Vite (frontend), Playwright (E2E)

**Spec:** `docs/superpowers/specs/2026-06-06-scenario-duplicate-design.md`

---

## File Map

| Action | Path |
|--------|------|
| Modify | `live-server/src/services/scenario/scenario-service.ts` |
| Modify | `live-server/src/routes/scenario/scenario.ts` |
| Modify | `gantt/src/services/scenario-api.ts` |
| Modify | `gantt/src/stores/scenario-store.ts` |
| Modify | `gantt/src/components/scenario/scenario-detail-panel.tsx` |
| Modify | `gantt/src/components/scenario/scenario-list-item.tsx` |
| Modify | `gantt/src/components/scenario/scenario-list-panel.tsx` |
| Modify | `gantt/src/version.ts` |
| Create | `e2e/tests/gantt/scenario-duplicate.spec.ts` |
| Modify | `live-server/src/__tests__/services/scenario/scenario-service.test.ts` |

---

## Task 1: Backend service — `scenarioService.duplicate()`

**Files:**
- Modify: `live-server/src/services/scenario/scenario-service.ts`
- Modify: `live-server/src/__tests__/services/scenario/scenario-service.test.ts`

### Context

`scenarioService` lives in `live-server/src/services/scenario/scenario-service.ts`. The `create()` method auto-creates a workset when `worksetId` is absent — so the duplicate must omit `worksetId`. The existing test file uses a chainable mock DB helper (`createChainableDb`) and mocks `utils/cache.js` and `utils/audit.js` at the top.

The DB schema fields you MUST copy: `fileType`, `strDtLoc`, `endDtLoc`, `leadinLive`, `ruleGroupCode`, `cqfsetId`, `pairingScenarioId`, `flightScenarioId`, `rankCross`, `filterParams`, `comments`, `isPublic`, `isFavorite`.

Fields to omit (reset to defaults via `create`): `worksetId`, `taskId`, `filePath`, `fileSize`, `checksum`, `processId`, `status`, `version`, `optimizedCount`, `action`.

- [ ] **Step 1: Write the failing unit test**

Open `live-server/src/__tests__/services/scenario/scenario-service.test.ts` and append this `describe` block **inside** the existing `describe('scenarioService', ...)` but after all other describe blocks:

```typescript
  // ---------- duplicate ----------

  describe('duplicate', () => {
    it('throws when source scenario not found', async () => {
      fastify.db.then.mockImplementation((resolve: any) => resolve([]))
      await expect(scenarioService.duplicate(fastify, 999, 'tester')).rejects.toThrow('Scenario not found')
    })

    it('creates a copy with "Copy of" name and DRAFT status', async () => {
      const source = {
        id: 1,
        name: 'March 2026',
        fileType: 'RO',
        status: 'DONE',
        strDtLoc: new Date('2026-03-01'),
        endDtLoc: new Date('2026-03-31'),
        leadinLive: 0,
        ruleGroupCode: 'RO_BASE',
        cqfsetId: 'CQF01',
        pairingScenarioId: 5,
        flightScenarioId: null,
        rankCross: null,
        filterParams: { crew: { bases: ['YEG'] } },
        comments: 'test',
        isPublic: 0,
        isFavorite: 1,
        worksetId: 10,
        taskId: 'task-abc',
        filePath: '/some/path.gz',
        fileSize: 12345,
        checksum: 'abc123',
        processId: 'P001',
        version: 3,
        optimizedCount: 2,
        action: 'OPTIMIZE',
      }

      // getById mock (called by duplicate, then internally by create → select)
      let selectCallCount = 0
      fastify.db.then.mockImplementation((resolve: any) => {
        selectCallCount++
        if (selectCallCount === 1) return resolve([source])  // getById
        return resolve([])                                   // workset insert returning
      })

      // workset insert + scenario insert returning
      fastify.db.returning
        .mockResolvedValueOnce([{ id: 99 }])   // workset
        .mockResolvedValueOnce([{              // new scenario
          id: 42,
          name: 'Copy of March 2026',
          status: 'DRAFT',
          fileType: 'RO',
        }])

      const result = await scenarioService.duplicate(fastify, 1, 'tester')

      expect(result.name).toBe('Copy of March 2026')
      expect(result.status).toBe('DRAFT')
      expect(result.id).toBe(42)
    })

    it('truncates name to 200 chars', async () => {
      const longName = 'A'.repeat(196)  // "Copy of " (8) + 196 = 204 → truncated to 200
      const source = {
        id: 1,
        name: longName,
        fileType: 'PO',
        status: 'DRAFT',
        strDtLoc: new Date(),
        endDtLoc: new Date(),
        leadinLive: 0,
        ruleGroupCode: '',
        cqfsetId: '',
        pairingScenarioId: null,
        flightScenarioId: null,
        rankCross: null,
        filterParams: {},
        comments: null,
        isPublic: 0,
        isFavorite: 0,
        worksetId: 1,
        taskId: null,
        filePath: null,
        fileSize: null,
        checksum: null,
        processId: null,
        version: 0,
        optimizedCount: 0,
        action: null,
      }

      fastify.db.then.mockImplementation((resolve: any) => resolve([source]))
      fastify.db.returning
        .mockResolvedValueOnce([{ id: 55 }])
        .mockResolvedValueOnce([{ id: 56, name: `Copy of ${longName}`.slice(0, 200), status: 'DRAFT' }])

      const result = await scenarioService.duplicate(fastify, 1, 'tester')
      expect(result.name!.length).toBeLessThanOrEqual(200)
    })
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd live-server && npx vitest run src/__tests__/services/scenario/scenario-service.test.ts 2>&1 | tail -20
```

Expected: 3 failures mentioning `scenarioService.duplicate is not a function`.

- [ ] **Step 3: Implement `duplicate()` in the service**

Open `live-server/src/services/scenario/scenario-service.ts`. Append the following method to the `scenarioService` object, **after** the `removeScenario` method and **before** the `transition` method:

```typescript
  async duplicate(fastify: FastifyInstance, id: number, username: string) {
    const source = await this.getById(fastify, id)
    if (!source) throw new Error('Scenario not found')

    const rawName = `Copy of ${source.name ?? ''}`
    const name = rawName.slice(0, 200)

    return this.create(
      fastify,
      {
        name,
        fileType: source.fileType as typeof scenario.$inferInsert['fileType'],
        strDtLoc: source.strDtLoc,
        endDtLoc: source.endDtLoc,
        leadinLive: source.leadinLive,
        ruleGroupCode: source.ruleGroupCode ?? '',
        cqfsetId: source.cqfsetId ?? '',
        pairingScenarioId: source.pairingScenarioId ?? undefined,
        flightScenarioId: source.flightScenarioId ?? undefined,
        rankCross: source.rankCross ?? undefined,
        filterParams: source.filterParams ?? {},
        comments: source.comments ?? undefined,
        isPublic: source.isPublic,
        isFavorite: source.isFavorite,
        // worksetId intentionally omitted → create() auto-generates a new workset
      } as typeof scenario.$inferInsert,
      username,
    )
  },
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd live-server && npx vitest run src/__tests__/services/scenario/scenario-service.test.ts 2>&1 | tail -20
```

Expected: all tests in the file pass (`PASS`).

- [ ] **Step 5: Commit**

```bash
git add live-server/src/services/scenario/scenario-service.ts \
        live-server/src/__tests__/services/scenario/scenario-service.test.ts
git commit -m "feat(scenario): add duplicate() service method"
```

---

## Task 2: Backend route — `POST /api/scenario/:id/duplicate`

**Files:**
- Modify: `live-server/src/routes/scenario/scenario.ts`

### Context

All scenario routes are registered inside the `export default async function scenarioRoutes(fastify)` function in this file. The pattern for a POST action with an `:id` param is already used by `/:id/transition`, `/:id/run`, etc. Add the duplicate route in the same style, in the "Scenario CRUD" section near the top.

- [ ] **Step 1: Add the route**

Open `live-server/src/routes/scenario/scenario.ts`. Find the DELETE `/:id` handler (around line 67). **After** the DELETE handler, insert:

```typescript
  // POST /api/scenario/:id/duplicate — clone scenario as a new DRAFT
  fastify.post('/:id/duplicate', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid id')
    }

    const username = ((request.body as Record<string, unknown>)?.username as string) ?? 'system'

    try {
      const result = await scenarioService.duplicate(fastify, numId, username)
      return success(reply, result)
    } catch (err) {
      const msg = (err as Error).message
      if (msg === 'Scenario not found') return fail(reply, 404, msg)
      return error(reply, 500, msg)
    }
  })
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd live-server && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Manual smoke test (server must be running)**

```bash
# replace <ID> with any valid scenario id in your dev DB
curl -s -X POST http://localhost:3000/api/scenario/<ID>/duplicate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(cat /tmp/dev-token.txt 2>/dev/null || echo '')" \
  -d '{}' | jq '.data.name'
```

Expected: `"Copy of <original name>"`.

- [ ] **Step 4: Commit**

```bash
git add live-server/src/routes/scenario/scenario.ts
git commit -m "feat(scenario): POST /:id/duplicate route"
```

---

## Task 3: Frontend API method

**Files:**
- Modify: `gantt/src/services/scenario-api.ts`

### Context

`scenarioApi` is a plain object of async functions in `gantt/src/services/scenario-api.ts`. Each method wraps `api.get/post/put/delete` from `./api`. The existing `run()` method is the closest analogy: `api.post(\`/api/scenario/${id}/run\`, {})`.

- [ ] **Step 1: Add the `duplicate()` method**

Open `gantt/src/services/scenario-api.ts`. Find the `run()` method. **After** it, insert:

```typescript
  /** Clone a scenario as a new DRAFT with "Copy of <name>". */
  async duplicate(id: number): Promise<ScenarioDetail> {
    return api.post(`/api/scenario/${id}/duplicate`, {}) as Promise<ScenarioDetail>
  },
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd gantt && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add gantt/src/services/scenario-api.ts
git commit -m "feat(scenario): add scenarioApi.duplicate()"
```

---

## Task 4: Frontend store — `duplicateScenario` action + `focusNameField` flag

**Files:**
- Modify: `gantt/src/stores/scenario-store.ts`

### Context

`useScenarioStore` is a Zustand store created via `create<ScenarioStore>()`. The store interface is `ScenarioStore`. The `removeScenario()` action is the structural analogue: it calls an API method, then `fetchList()`, and handles `saving` flag. The `selectScenario(id)` action loads detail + kpis for the given id.

We add:
- `focusNameField: boolean` state (default `false`)
- `duplicateScenario(id: number): Promise<void>` action
- `clearFocusNameField(): void` action

- [ ] **Step 1: Extend the `ScenarioStore` interface**

In `gantt/src/stores/scenario-store.ts`, find the `ScenarioStore` interface. Add after the existing `publishing: boolean` field:

```typescript
  // Duplicate
  focusNameField: boolean
  duplicateScenario: (id: number) => Promise<void>
  clearFocusNameField: () => void
```

- [ ] **Step 2: Add initial state**

In the `create<ScenarioStore>((set, get) => ({` block, find the line `publishing: false,`. Add after it:

```typescript
  focusNameField: false,
```

- [ ] **Step 3: Add the actions**

Find the `publishRoster` action (last action in the store). **After** the closing `},` of `publishRoster`, add:

```typescript
  duplicateScenario: async (id) => {
    set({ saving: true })
    try {
      const created = await scenarioApi.duplicate(id)
      set({ focusNameField: true })
      await get().fetchList()
      await get().selectScenario(created.id)
      notify.success('Scenario duplicated')
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to duplicate scenario')
    } finally {
      set({ saving: false })
    }
  },

  clearFocusNameField: () => set({ focusNameField: false }),
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd gantt && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/stores/scenario-store.ts
git commit -m "feat(scenario): duplicateScenario store action + focusNameField flag"
```

---

## Task 5: Detail panel — name input focus on duplicate

**Files:**
- Modify: `gantt/src/components/scenario/scenario-detail-panel.tsx`

### Context

The name `<input>` is in the panel header:
```tsx
<input
  data-testid="scenario-name-input"
  className="flex-1 bg-transparent text-sm font-semibold ..."
  value={draftDetail.name ?? ''}
  ...
/>
```

We add a `useRef<HTMLInputElement>` to this element, then a `useEffect` that fires when `focusNameField` becomes `true`. The effect calls `.select()` (selects all text so the user can type to replace) and immediately clears the flag.

The current imports at the top of the file are:
```tsx
import type { ReactNode } from 'react'
```

We need to add `useRef`, `useEffect`.

- [ ] **Step 1: Update imports**

In `gantt/src/components/scenario/scenario-detail-panel.tsx`, replace:

```tsx
import type { ReactNode } from 'react'
```

with:

```tsx
import { useRef, useEffect, type ReactNode } from 'react'
```

- [ ] **Step 2: Add store subscriptions and ref**

Inside `ScenarioDetailPanel`, the current store subscriptions are:
```tsx
  const detail        = useScenarioStore((s) => s.detail)
  const draftDetail   = useScenarioStore((s) => s.draftDetail)
  const kpis          = useScenarioStore((s) => s.kpis)
  const detailLoading = useScenarioStore((s) => s.detailLoading)
  const patchDraft    = useScenarioStore((s) => s.patchDraft)
```

Add after `patchDraft`:

```tsx
  const focusNameField     = useScenarioStore((s) => s.focusNameField)
  const clearFocusNameField = useScenarioStore((s) => s.clearFocusNameField)
  const nameInputRef       = useRef<HTMLInputElement>(null)
```

- [ ] **Step 3: Add the focus effect**

After the `nameInputRef` line, add:

```tsx
  useEffect(() => {
    if (!focusNameField) return
    nameInputRef.current?.select()
    clearFocusNameField()
  }, [focusNameField, clearFocusNameField])
```

- [ ] **Step 4: Wire the ref to the input element**

Find the name input JSX:

```tsx
        <input
          data-testid="scenario-name-input"
          className="flex-1 bg-transparent text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground"
          value={draftDetail.name ?? ''}
          placeholder="Scenario name"
          disabled={isReadonly}
          onChange={(e) => patchDraft({ name: e.target.value })}
        />
```

Add `ref={nameInputRef}` as the first prop:

```tsx
        <input
          ref={nameInputRef}
          data-testid="scenario-name-input"
          className="flex-1 bg-transparent text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground"
          value={draftDetail.name ?? ''}
          placeholder="Scenario name"
          disabled={isReadonly}
          onChange={(e) => patchDraft({ name: e.target.value })}
        />
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd gantt && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add gantt/src/components/scenario/scenario-detail-panel.tsx
git commit -m "feat(scenario): focus name input after duplicate via focusNameField flag"
```

---

## Task 6: UI wiring — enable Duplicate button and connect handler

**Files:**
- Modify: `gantt/src/components/scenario/scenario-list-item.tsx`
- Modify: `gantt/src/components/scenario/scenario-list-panel.tsx`

### Context

**`scenario-list-item.tsx`:** The Duplicate `DropdownMenuItem` currently has `disabled` as a prop. Remove it.

**`scenario-list-panel.tsx`:** `handleDuplicate` is currently a stub:
```tsx
const handleDuplicate = (_id: number): void => {
  // Duplicate action — reserved for future implementation
}
```
Replace it to call the store.

- [ ] **Step 1: Enable the Duplicate menu item**

In `gantt/src/components/scenario/scenario-list-item.tsx`, find:

```tsx
          <DropdownMenuItem disabled onClick={handleDuplicateClick}>
            <Copy className="mr-2 h-3.5 w-3.5" />
            Duplicate
          </DropdownMenuItem>
```

Remove `disabled`:

```tsx
          <DropdownMenuItem onClick={handleDuplicateClick}>
            <Copy className="mr-2 h-3.5 w-3.5" />
            Duplicate
          </DropdownMenuItem>
```

- [ ] **Step 2: Wire `handleDuplicate` in the list panel**

In `gantt/src/components/scenario/scenario-list-panel.tsx`, add the store subscription near the other store bindings (after `removeScenario`):

```tsx
  const duplicateScenario = useScenarioStore((s) => s.duplicateScenario)
```

Then replace the stub handler:

```tsx
  const handleDuplicate = (_id: number): void => {
    // Duplicate action — reserved for future implementation
  }
```

with:

```tsx
  const handleDuplicate = (id: number): void => {
    void duplicateScenario(id)
  }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd gantt && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add gantt/src/components/scenario/scenario-list-item.tsx \
        gantt/src/components/scenario/scenario-list-panel.tsx
git commit -m "feat(scenario): wire Duplicate button to duplicateScenario store action"
```

---

## Task 7: Version bump

**Files:**
- Modify: `gantt/src/version.ts`

### Context

Current values: `BACKEND_VERSION = 44`, `FRONTEND_VERSION = 78`. This PR touches both backend (`live-server`) and frontend (`gantt`), so both must increment by 1.

- [ ] **Step 1: Bump versions**

In `gantt/src/version.ts`, replace:

```typescript
export const BACKEND_VERSION = 44
export const FRONTEND_VERSION = 78
```

with:

```typescript
export const BACKEND_VERSION = 45
export const FRONTEND_VERSION = 79
```

- [ ] **Step 2: Commit**

```bash
git add gantt/src/version.ts
git commit -m "chore: bump B45/F79 for scenario duplicate feature"
```

---

## Task 8: E2E test

**Files:**
- Create: `e2e/tests/gantt/scenario-duplicate.spec.ts`

### Context

The test follows the same pattern as `scenario-create.spec.ts`:
- Uses `GANTT_API`, `GANTT_USER`, `GANTT_PASS` env vars
- Seeds `sessionStorage` auth in `beforeEach` via `addInitScript`
- Cleans up all created scenarios in `afterEach` by listing + deleting via API
- Uses `ScenarioPage` object from `../../pages/gantt/scenario-page`

The test:
1. Creates a source RO scenario via API (deterministic, no UI noise)
2. Navigates to the RO scenario list
3. Hovers the source item to show the three-dot menu, opens it, clicks Duplicate
4. Asserts a new list item with `"Copy of <name>"` appears
5. Asserts the detail panel opens with the correct name
6. Asserts the name input has focus / selection (verify `document.activeElement` is the input)

**Important:** The `listItemByName` helper on `ScenarioPage` returns `page.getByTestId('scenario-list-item').filter({ hasText: name })`.

- [ ] **Step 1: Create the test file**

Create `e2e/tests/gantt/scenario-duplicate.spec.ts` with this content:

```typescript
/**
 * Scenario Duplicate E2E Tests.
 *
 * Verifies that clicking Duplicate from the scenario three-dot menu:
 *   - creates a new DRAFT scenario named "Copy of <original>"
 *   - auto-selects it and opens the detail panel
 *   - focuses / selects the name input for immediate rename
 *
 * The source scenario is created via API to keep the test focused.
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'

const GANTT_API  = process.env.GANTT_API_URL  ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'

test.describe('Scenario — Duplicate', () => {
  const unique = `${Date.now()}`
  const sourceName  = `RO-DUP-SRC-${unique}`
  const copiedName  = `Copy of ${sourceName}`

  let token = ''
  let sourceId = 0

  const login = async (request: import('@playwright/test').APIRequestContext) => {
    const res = await request.post(`${GANTT_API}/api/auth/login`, {
      data: { userCode: GANTT_USER, password: GANTT_PASS },
    })
    expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy()
    const json = (await res.json()) as { data: { token: string; userCode: string; userName: string; schema: string } }
    return json.data
  }

  test.beforeEach(async ({ page, request }) => {
    const auth = await login(request)
    token = auth.token

    // Seed auth into sessionStorage for every navigation
    await page.addInitScript((a) => {
      window.sessionStorage.setItem(
        'rois-auth',
        JSON.stringify({ user: { userCode: a.userCode, userName: a.userName, schema: a.schema }, token: a.token }),
      )
    }, auth)

    // Create source scenario via API
    const createRes = await request.post(`${GANTT_API}/api/scenario`, {
      data: {
        name: sourceName,
        fileType: 'RO',
        strDtLoc: '2026-05-01',
        endDtLoc: '2026-05-31',
        leadinLive: 1,
        username: GANTT_USER,
      },
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(createRes.ok(), `source create failed: ${createRes.status()}`).toBeTruthy()
    const { data } = (await createRes.json()) as { data: { id: number } }
    sourceId = data.id
  })

  test.afterEach(async ({ request }) => {
    // Delete all scenarios whose name matches source or copy
    for (const nameFilter of [sourceName, copiedName]) {
      const listRes = await request.get(`${GANTT_API}/api/scenario`, {
        params: { page: 1, pageSize: 50, fileType: 'RO', name: nameFilter },
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!listRes.ok()) continue
      const { data } = (await listRes.json()) as { data: { items: Array<{ id: number }> } }
      for (const item of data.items) {
        await request.delete(`${GANTT_API}/api/scenario/${item.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      }
    }
  })

  test('duplicates scenario: new item appears in list with "Copy of" name and detail panel opens with name selected', async ({ page }) => {
    const scenario = new ScenarioPage(page)

    // Navigate to RO scenario list
    await scenario.gotoRo()

    // Confirm the source scenario is visible
    const sourceItem = scenario.listItemByName(sourceName)
    await expect(sourceItem).toBeVisible()

    // Open the three-dot menu for the source item and click Duplicate
    await sourceItem.hover()
    const menuTrigger = sourceItem.locator('button[aria-haspopup="menu"], button').last()
    await menuTrigger.click()
    await page.getByRole('menuitem', { name: 'Duplicate' }).click()

    // The copied item must appear in the list
    const copiedItem = scenario.listItemByName(copiedName)
    await expect(copiedItem).toBeVisible({ timeout: 8000 })

    // The detail panel must open and show the copied name
    await expect(scenario.detailPanel).toBeVisible()
    await expect(scenario.nameInput).toHaveValue(copiedName)

    // The name input must be focused (ready for rename)
    await expect(scenario.nameInput).toBeFocused()
  })
})
```

- [ ] **Step 2: Run the E2E test**

Make sure the gantt dev server and live-server are running, then:

```bash
cd e2e && npx playwright test tests/gantt/scenario-duplicate.spec.ts --reporter=list 2>&1 | tail -30
```

Expected: `1 passed`.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/gantt/scenario-duplicate.spec.ts
git commit -m "test(e2e): scenario duplicate — copy appears in list, detail panel opens, name focused"
```

---

## Self-Review Checklist

- [x] Backend `duplicate()` copies all config fields, omits optimization artifacts
- [x] `worksetId` omitted → `create()` auto-generates a fresh workset (unique constraint safe)
- [x] `name` capped at 200 chars (DB varchar limit)
- [x] Route returns 404 when source not found
- [x] `focusNameField` cleared synchronously after `.select()` to prevent double-focus
- [x] `saving` flag covers the full async flow (prevents double-click during API call)
- [x] Version bump covers both backend (B44→45) and frontend (F78→79)
- [x] E2E test cleans up both source and copy in `afterEach`
- [x] E2E regression: test would fail without the implementation (button was disabled)
