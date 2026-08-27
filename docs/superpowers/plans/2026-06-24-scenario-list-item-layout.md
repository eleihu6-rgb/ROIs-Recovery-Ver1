# Scenario List Item Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the Gantt Scenario list item so it shows a denser, more meaningful two-row layout with type-before-ID, status icon tooltip, compact scenario date range, real user display name, highlighted optimized roster count, and relative update time.

**Architecture:** Enrich the Scenario list response in `live-server` by joining `scenario.updated_by` to `users.user_code` and returning `updatedByName`. Keep the visual layout change local to the Scenario list item component and a focused component test. Add small pure helper functions inside `scenario-list-item.tsx` because the compact scenario date wording is specific to this list and should not change the global `formatUiDateRange` standard.

**Tech Stack:** Fastify, Drizzle ORM, React 19, TypeScript, Vitest, jsdom, lucide-react, `@rois/ui` tooltip/dropdown components, Tailwind CSS utility classes.

## Global Constraints

- Do not change database schema.
- Do not add dependencies.
- Enrich user names in the existing list query; do not add per-row frontend requests.
- Use lucide icons for icon buttons/status indicators.
- Keep UI dense and professional for an aviation scheduling tool.
- Preserve existing row click and dropdown menu behavior.
- Follow TDD: add and run a failing component test before production code changes.

---

### Task 1: Scenario List User Display Name

**Files:**
- Modify: `live-server/src/services/scenario/scenario-service.ts`
- Modify: `live-server/src/__tests__/services/scenario/scenario-service.test.ts`
- Modify: `gantt/src/types/scenario.ts`

**Interfaces:**
- Consumes: `ScenarioItem` from `gantt/src/types/scenario.ts`.
- Produces: Scenario list items with optional `updatedByName: string | null`.

- [x] **Step 1: Write the failing backend test**

Update `live-server/src/__tests__/services/scenario/scenario-service.test.ts` list test so the mocked item has `updatedByName: 'Kevin Zhang'` and the result must preserve it.

- [x] **Step 2: Run backend test to verify it fails**

Run:

```bash
cd live-server && npm test -- src/__tests__/services/scenario/scenario-service.test.ts
```

Expected: FAIL until the list query selects `updatedByName`.

- [x] **Step 3: Implement backend enrichment**

Modify `live-server/src/services/scenario/scenario-service.ts`:

- Import `users` from `../../models/system/users.js`.
- Add `.leftJoin(users, eq(scenario.updatedBy, users.userCode))`.
- Select `scenario` fields plus `updatedByName: users.userName`.

- [x] **Step 4: Add frontend type field**

Modify `gantt/src/types/scenario.ts`:

```ts
updatedByName?: string | null
```

### Task 2: Scenario List Item Rendering

**Files:**
- Modify: `gantt/src/components/scenario/__tests__/scenario-list-item.test.tsx`
- Modify: `gantt/src/components/scenario/scenario-list-item.tsx`

**Interfaces:**
- Consumes: `ScenarioItem.updatedByName?: string | null`.
- Produces: `ScenarioListItem` with unchanged props and unchanged callbacks.

- [x] **Step 1: Write the failing test**

Create `gantt/src/components/scenario/__tests__/scenario-list-item.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ScenarioListItem } from '../scenario-list-item'
import type { ScenarioItem } from '@/types'

vi.mock('@rois/ui', () => ({
  Button: ({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: React.MouseEventHandler }) => (
    <button className={className} onClick={onClick}>{children}</button>
  ),
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: React.MouseEventHandler }) => (
    <button className={className} onClick={onClick}>{children}</button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
  formatUiDateRange: (start: string, end: string) => `${start} - ${end}`,
}))

const makeItem = (overrides: Partial<ScenarioItem> = {}): ScenarioItem => ({
  id: 524,
  name: 'RO-DUP-SRC-1781803508099',
  fileType: 'RO',
  status: 'DONE',
  strDtLoc: '2026-05-01',
  endDtLoc: '2026-05-31',
  optimizedCount: 3,
  leadinLive: 1,
  updatedBy: 'admin',
  updatedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
  ...overrides,
})

describe('ScenarioListItem', () => {
  const renderItem = (item: ScenarioItem): HTMLElement => {
    const container = document.createElement('div')
    const root = createRoot(container)
    act(() => {
      root.render(
        <ScenarioListItem
          item={item}
          isSelected={false}
          onSelect={vi.fn()}
          onDelete={vi.fn()}
          onDuplicate={vi.fn()}
          onRename={vi.fn()}
        />,
      )
    })
    return container
  }

  it('renders the dense scenario summary layout', () => {
    const container = renderItem(makeItem())

    const typeBadge = container.querySelector('[data-testid="scenario-item-type"]')
    const idBadge = container.querySelector('[data-testid="scenario-item-id"]')
    expect(typeBadge).not.toBeNull()
    expect(idBadge).not.toBeNull()
    expect(typeBadge.textContent).toBe('RO')
    expect(idBadge.textContent).toBe('#524')
    expect(typeBadge.compareDocumentPosition(idBadge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const meta = container.querySelector('[data-testid="scenario-item-meta"]')
    expect(meta?.textContent).toContain('1-31 May 2026')
    expect(meta?.textContent).toContain('Kevin Zhang')
    expect(meta?.textContent).toContain('3 optimized rosters')
    expect(meta?.textContent).toContain('days ago')
    expect(meta?.textContent).not.toContain('Live')
    const optimized = container.querySelector('[data-testid="scenario-item-optimized-count"]')
    expect(optimized).not.toBeNull()
    expect(optimized.textContent).toContain('3 optimized rosters')
    expect(optimized.className).toContain('text-emerald')

    expect(container.querySelector('[aria-label="Scenario status: Done"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="scenario-item-status-dot"]')).toBeNull()
  })

  it('formats cross-month dates and leaves zero optimized rosters unhighlighted', () => {
    const container = renderItem(makeItem({
      strDtLoc: '2026-05-20',
      endDtLoc: '2026-06-10',
      optimizedCount: 0,
      status: 'RUNNING',
    }))

    expect(container.querySelector('[data-testid="scenario-item-date-range"]')?.textContent).toContain('20 May-10 Jun 2026')
    const optimized = container.querySelector('[data-testid="scenario-item-optimized-count"]')
    expect(optimized).not.toBeNull()
    expect(optimized.textContent).toContain('0 optimized rosters')
    expect(optimized.className).not.toContain('text-emerald')
    expect(container.querySelector('[aria-label="Scenario status: Running"]')).not.toBeNull()
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
cd gantt && npm test -- src/components/scenario/__tests__/scenario-list-item.test.tsx
```

Expected: FAIL because `scenario-item-type`, `scenario-item-date-range`, `scenario-item-optimized-count`, and the status icon label are not implemented.

- [x] **Step 3: Implement the minimal component change**

Modify `gantt/src/components/scenario/scenario-list-item.tsx`:

- Import lucide status icons and tooltip components.
- Add local helpers for compact date ranges, status metadata, and optimized roster label.
- Render row 1 as type badge, ID badge, name, status icon tooltip.
- Render row 2 as compact date range, display name, optimized roster count, and relative update time.
- Remove row 3.
- Use strict relative time so labels render `6 hours ago`, not `about 6 hours ago`.
- Preserve dropdown behavior.

- [x] **Step 4: Run focused frontend test**

Run:

```bash
cd gantt && npm test -- src/components/scenario/__tests__/scenario-list-item.test.tsx
```

Expected: PASS.

- [x] **Step 5: Run backend test**

Run:

```bash
cd live-server && npm test -- src/__tests__/services/scenario/scenario-service.test.ts
```

Expected: PASS.

- [x] **Step 6: Run TypeScript checks**

Run:

```bash
cd gantt && npx tsc --noEmit
cd live-server && npm run build
```

Expected: 0 TypeScript errors.

Actual on 2026-06-24: blocked by unrelated untracked `gantt/src/components/scenario/filter/rule-group-select.tsx` errors:

```text
Property 'listRuleGroups' does not exist on type scenarioApi
Parameter 'rows' implicitly has an 'any' type
```

Follow-up on 2026-06-24: user confirmed this rule-group scenario filter was intentionally removed. Deleted the stale unreferenced file; `cd gantt && npx tsc --noEmit` now passes.

Actual live-server build on 2026-06-24: blocked by unrelated worker/admin rule-engine typing errors outside this scenario list change:

```text
src/routes/admin/violations-init.ts: Property 'violationsInitQueue' does not exist on type FastifyInstance
src/services/rule-engine-client.ts: Property 'RULE_ENGINE_URL' does not exist on env type
src/workers/check-pairing-worker.ts: 'ruleGroupCode' does not exist in type UpsertPairingInput
src/workers/check-roster-worker.ts: string is not assignable to number
src/workers/violations-init-worker.ts: Cannot find module '@rois/rule-engine'
```

- [x] **Step 7: Inspect final diff**

Run:

```bash
git diff -- docs/superpowers/specs/2026-06-24-scenario-list-item-layout-design.md docs/superpowers/plans/2026-06-24-scenario-list-item-layout.md gantt/src/components/scenario/scenario-list-item.tsx gantt/src/components/scenario/__tests__/scenario-list-item.test.tsx
```

Expected: Only the approved Scenario list item docs, test, and component change appear.
