# Altair Missing Scenario Redirect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redirect missing direct scenario URLs from `/altair/scenario/:id` to `/altair/scenario` while leaving other scenario load errors visible.

**Architecture:** Add a small pure helper for missing-scenario error detection, then have `ScenarioGanttView` close the failed scenario tab and switch to the Scenario module when the active tab receives that error. Existing `useUrlSync` converts the module change into `/altair/scenario`.

**Tech Stack:** React 19, TypeScript, Zustand shell/scenario stores, Vite/Vitest, Playwright E2E.

## Global Constraints

- Keep the change scoped to Gantt frontend routing/error handling and E2E coverage.
- Do not change backend APIs.
- Do not redirect non-not-found scenario Gantt errors.
- Do not modify unrelated dirty files in the working tree.
- Use existing shell store and scenario store patterns.

---

### Task 1: Missing Scenario Error Predicate

**Files:**
- Create: `gantt/src/components/shell/scenario-error-routing.ts`
- Create: `gantt/src/components/shell/__tests__/scenario-error-routing.test.ts`

**Interfaces:**
- Produces: `isScenarioNotFoundError(message: string | null | undefined): boolean`
- Consumes: no project state.

- [ ] **Step 1: Write the failing test**

Create `gantt/src/components/shell/__tests__/scenario-error-routing.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isScenarioNotFoundError } from '../scenario-error-routing'

describe('isScenarioNotFoundError', () => {
  it.each([
    'Scenario not found',
    'scenario not found',
    'Error: Scenario not found',
  ])('returns true for missing scenario message "%s"', (message) => {
    expect(isScenarioNotFoundError(message)).toBe(true)
  })

  it.each([
    null,
    undefined,
    '',
    'Scenario 577 fixture intentionally absent',
    'Failed to fetch scenario gantt data',
    'Internal server error',
  ])('returns false for non-missing-scenario message "%s"', (message) => {
    expect(isScenarioNotFoundError(message)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd gantt && npm test -- src/components/shell/__tests__/scenario-error-routing.test.ts
```

Expected: FAIL because `../scenario-error-routing` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `gantt/src/components/shell/scenario-error-routing.ts`:

```ts
export const isScenarioNotFoundError = (message: string | null | undefined): boolean =>
  typeof message === 'string' && /\bscenario not found\b/i.test(message)
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd gantt && npm test -- src/components/shell/__tests__/scenario-error-routing.test.ts
```

Expected: PASS, 6 assertions.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/shell/scenario-error-routing.ts gantt/src/components/shell/__tests__/scenario-error-routing.test.ts
git commit -m "feat(gantt): detect missing scenario errors"
```

### Task 2: Redirect Active Missing Scenario Tab

**Files:**
- Modify: `gantt/src/components/shell/scenario-gantt-view.tsx`

**Interfaces:**
- Consumes: `isScenarioNotFoundError(message: string | null | undefined): boolean`
- Consumes: `useShellStore.getState().closeTabAndSetModule(moduleKey, 'scenario')`
- Produces: active missing scenario tabs navigate to the Scenario module.

- [ ] **Step 1: Add the import**

In `gantt/src/components/shell/scenario-gantt-view.tsx`, add:

```ts
import { isScenarioNotFoundError } from './scenario-error-routing'
```

- [ ] **Step 2: Add the redirect effect**

In `ScenarioGanttView`, after `const active = activeModule === moduleKey`, add:

```tsx
  useEffect(() => {
    if (!active || !isScenarioNotFoundError(error)) return
    useShellStore.getState().closeTabAndSetModule(moduleKey, 'scenario')
    destroyScenarioGanttStore(scenarioId)
    destroyScenarioLayoutStore(scenarioId)
  }, [active, error, moduleKey, scenarioId])
```

This closes the missing scenario tab only when it is the foreground tab. Hidden scenario tabs keep the current behavior until activated.

- [ ] **Step 3: Run focused TypeScript validation**

Run:

```bash
cd gantt && npx tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 4: Run focused predicate test**

Run:

```bash
cd gantt && npm test -- src/components/shell/__tests__/scenario-error-routing.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/shell/scenario-gantt-view.tsx
git commit -m "feat(gantt): redirect missing Altair scenario URLs"
```

### Task 3: E2E Coverage

**Files:**
- Modify: `e2e/tests/gantt/altair-url-routing.spec.ts`

**Interfaces:**
- Consumes: existing Playwright auth helper `seedGanttAuth`.
- Produces: regression coverage that missing scenario direct URLs end at `/altair/scenario`.

- [ ] **Step 1: Add the E2E test**

Append this test inside `test.describe('Altair URL routing and branding', () => { ... })`:

```ts
  test('Altair-7005 - missing direct scenario URL redirects to Scenario', async ({ page }) => {
    await page.route('**/api/scenario/77/gantt-data', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 404, data: null, message: 'Scenario not found' }),
    }))
    await page.route('**/api/scenario/77/lock-status', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { locked: false, owner: null, expiresAt: null } }),
    }))
    await page.route('**/api/scenario/77/legality', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { status: 'DONE', violations: [] } }),
    }))

    await page.goto('/altair/scenario/77')
    await expect(page).toHaveURL(/\/altair\/scenario$/)
    await expect(page.getByText('Error: Scenario not found')).toHaveCount(0)
  })
```

- [ ] **Step 2: Run the focused E2E spec**

Run:

```bash
cd e2e && npx playwright test tests/gantt/altair-url-routing.spec.ts --config=config/playwright.config.ts --project=gantt --reporter=list
```

Expected: PASS, including `Altair-7005`.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/gantt/altair-url-routing.spec.ts
git commit -m "test(gantt): cover missing Altair scenario redirect"
```

### Task 4: Final Verification and Push

**Files:**
- No source edits.

**Interfaces:**
- Consumes: all prior task commits.
- Produces: pushed `main` with verified behavior.

- [ ] **Step 1: Run focused unit tests**

```bash
cd gantt && npm test -- src/components/shell/__tests__/scenario-error-routing.test.ts src/hooks/__tests__/use-url-sync.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript**

```bash
cd gantt && npx tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 3: Run focused E2E**

```bash
cd e2e && npx playwright test tests/gantt/altair-url-routing.spec.ts --config=config/playwright.config.ts --project=gantt --reporter=list
```

Expected: PASS.

- [ ] **Step 4: Inspect only this task's changes**

```bash
git status --short
git log --oneline -5
```

Expected: working tree still contains unrelated pre-existing dirty files, but all files changed for this task are committed.

- [ ] **Step 5: Push main**

```bash
git push origin main
```

Expected: push succeeds after project pre-push checks.
