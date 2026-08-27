# Scenario Sidebar Taxonomy Cleanup Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Goal:** Rename Scenario sidebar labels to planner-facing terms, show the missing Roster label, and remove the dead TO nav entry without changing backend ScenarioType contracts.
>
> **Architecture:** Keep the change inside the `gantt` frontend shell/state layer. Preserve existing PO/RO filter mappings and stable `data-testid` selectors while trimming the dead `to` sidebar state branch.
>
> **Tech Stack:** React 19, TypeScript, Zustand, Playwright, Vitest

## Global Constraints

- Use `brainstorming` before implementation for behavior changes.
- UI features and UI bug fixes need Playwright coverage that drives the real UI.
- Runtime frontend code changes must bump `gantt/src/version.ts` `FRONTEND_VERSION`.
- Run `npm run check:ui` after frontend style changes and report the PASS result.
- Keep the change surgical and limited to the Scenario frontend surface.

---

### Task 1: Add failing sidebar regression
**Files:**
- Create: `e2e/tests/gantt/scenario-sidebar-labels.spec.ts`

**Interfaces:**
- Consumes: `gotoScenarioList(page: Page): Promise<void>` from `e2e/pages/gantt/scenario-nav.ts`
- Produces: Playwright regression proving the desired visible sidebar labels

- [ ] **Step 1: Write failing test**

```ts
import { test, expect } from '@playwright/test'
import { gotoScenarioList } from '../../pages/gantt/scenario-nav'
import { seedGanttAuth } from '../../utils/gantt-hook'

test('Scen-2046 — Scenario sidebar uses Pairing and Roster labels and hides TO', async ({ page, request }) => {
  await seedGanttAuth(page, request)
  await page.goto('/altair/')
  await gotoScenarioList(page)

  const pairing = page.getByTestId('scenario-nav-po')
  const roster = page.getByTestId('scenario-nav-ro')
  const to = page.getByText(/^TO$/)

  await expect(pairing).toContainText('Pairing')
  await expect(roster).toContainText('Roster')
  await expect(to).toHaveCount(0)
})
```

- [ ] **Step 2: Run test verify fails**

```bash
npx playwright test e2e/tests/gantt/scenario-sidebar-labels.spec.ts
```

Expected: FAIL because the sidebar still renders `PO`, hides the `RO` text label, and still shows `TO`.

### Task 2: Implement the sidebar/state cleanup
**Files:**
- Modify: `gantt/src/components/shell/shell-sidebar.tsx`
- Modify: `gantt/src/stores/shell-store.ts`
- Modify: `gantt/src/version.ts`

**Interfaces:**
- Consumes: existing `setScenarioItem(item)` and `setFilterType(type)` behavior
- Produces: updated visible labels, removed `to` nav entry, valid persisted Scenario sidebar state

- [ ] **Step 1: Write minimal implementation**

```ts
// shell-sidebar.tsx
const SCENARIO_MENU: ScenarioMenuItem[] = [
  { item: 'all', label: 'All Scenarios', Icon: Layers },
  { item: 'po', label: 'Pairing', Icon: Link2 },
  { item: 'ro', label: 'Roster', Icon: Users },
]

// render label normally for ro in expanded mode
{!isCollapsed && <span className="flex-1">{itemLabel}</span>}

// shell-store.ts
export type ActiveScenarioItem = 'all' | 'po' | 'ro' | 'crew-bids'
const VALID_SCENARIO_ITEMS: ActiveScenarioItem[] = ['all', 'po', 'ro', 'crew-bids']

// version.ts
export const FRONTEND_VERSION = FRONTEND_VERSION + 1
```

- [ ] **Step 2: Run test verify passes**

```bash
npx playwright test e2e/tests/gantt/scenario-sidebar-labels.spec.ts
```

Expected: PASS

### Task 3: Run focused verification
**Files:**
- Modify if needed: touched tests/helpers only

**Interfaces:**
- Consumes: final `gantt` sidebar/store implementation
- Produces: verification evidence for the scoped UI change

- [ ] **Step 1: Run touched unit tests**

```bash
npx vitest run gantt/src/components/scenario/__tests__/scenario-list-item.test.tsx
```

Expected: PASS

- [ ] **Step 2: Run UI standards check**

```bash
npm run check:ui
```

Expected: PASS with zero hard violations

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-06-27-scenario-sidebar-taxonomy-cleanup-design.md \
  docs/superpowers/plans/2026-06-27-scenario-sidebar-taxonomy-cleanup.md \
  e2e/tests/gantt/scenario-sidebar-labels.spec.ts \
  gantt/src/components/shell/shell-sidebar.tsx \
  gantt/src/stores/shell-store.ts \
  gantt/src/version.ts
git commit -m "fix: clean up scenario sidebar taxonomy"
```

