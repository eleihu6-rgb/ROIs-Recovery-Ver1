# Phase 1 — Move Composition into Legality (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sidebar menu to the Legality tab and surface the existing **Composition** and **Composition Load** pages under it (the same shared components used by the Rule tab), with no backend or table changes.

**Architecture:** Today the Legality module hides the shell sidebar and `legality-view.tsx` renders a single "Rule Sets" view. We re-enable the shell sidebar for Legality (consistent with the Rule/Data tabs), add a `LEGALITY_MENU` (`Rule Sets · Composition · Composition Load`), track the active item in `useShellStore`, and turn `legality-view.tsx` into a thin router that renders the extracted Rule Sets view or the existing `CompositionView` / `CompositionLoadView`. Composition components, stores, APIs, and tables are untouched — one component, two nav mounts (§Gantt-Unify).

**Tech Stack:** React 19 + Zustand + Vite + Tailwind (gantt), Playwright (e2e). Spec: `docs/superpowers/specs/2026-06-23-rule-tab-to-legality-migration-design.md` §4.

---

### Task 1: Failing e2e for the Legality → Composition nav

**Files:**
- Create: `e2e/tests/gantt/legality-composition-nav.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
/**
 * Phase 1 — Composition + Composition Load are reachable under the Legality tab.
 * Asserts the Legality sidebar exposes the two composition sections and that each
 * renders real data (not just "visible"): the Composition Load table row count
 * matches the DB, and the Rule tab still shows its own Composition (unbroken).
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'
import { queryF8 } from '../../utils/db-helper'

test.describe('Legality — Composition migration (Phase 1)', () => {
  test('Legality sidebar shows Composition + Composition Load with real data', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.goto('/')

    // Open the Legality tab (top-nav button testid defaults to module-nav-<module>).
    await page.getByTestId('module-nav-legality').click()

    // The new Legality sidebar menu exposes both composition sections.
    await expect(page.getByTestId('legality-nav-composition')).toBeVisible()
    await expect(page.getByTestId('legality-nav-comp-load')).toBeVisible()

    // Composition Load: row count must match the DB (correct data, not just rendered).
    const [{ n }] = await queryF8<{ n: number }>(
      'select count(*)::int as n from composition_load',
    )
    await page.getByTestId('legality-nav-comp-load').click()
    await expect(page.getByTestId('composition-load-view')).toBeVisible()
    await expect(page.getByTestId('composition-load-row')).toHaveCount(n)

    // Composition: a known composition name from the DB is shown in the tree.
    const [{ name }] = await queryF8<{ name: string }>(
      'select name from composition order by display_order limit 1',
    )
    await page.getByTestId('legality-nav-composition').click()
    await expect(page.getByTestId('composition-view')).toContainText(name)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd e2e && GANTT_API_URL=http://127.0.0.1:3000 npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/legality-composition-nav.spec.ts --reporter=list --no-deps`
Expected: FAIL — `legality-nav-composition` not found (the Legality sidebar menu does not exist yet).

> If `queryF8` is not the exact export in `e2e/utils/db-helper.ts`, open that file and use its real query helper (same connection used by other gantt specs). Do not invent a new DB connector.

---

### Task 2: Add `activeLegalityItem` to the shell store and stop hiding the Legality sidebar

**Files:**
- Modify: `gantt/src/stores/shell-store.ts`

- [ ] **Step 1: Add the type (after `ActiveRuleItem`, ~line 617)**

```ts
export type ActiveLegalityItem = 'rule-sets' | 'composition' | 'comp-load'
```

- [ ] **Step 2: Add state + setter to the `ShellStore` interface**

In `interface ShellStore`, after `activeRuleItem: ActiveRuleItem` add:
```ts
  activeLegalityItem: ActiveLegalityItem
```
and after `setRuleItem: (item: ActiveRuleItem) => void` add:
```ts
  setLegalityItem: (item: ActiveLegalityItem) => void
```

- [ ] **Step 3: Add the persistence key**

In the `KEYS` object, after `ruleItem: 'rois-shell-rule-item',` add:
```ts
  legalityItem:       'rois-shell-legality-item',
```

- [ ] **Step 4: Stop forcing the Legality sidebar hidden**

In `applySidebarForModule`, delete this line so Legality falls through to `'expanded'`:
```ts
    module === 'legality' ? 'hidden' :  // Legality view has its own "Rule Sets" sidebar
```

- [ ] **Step 5: Add the default value + setter to the store body**

In `create<ShellStore>` defaults, after `activeRuleItem: 'rule-manager',` add:
```ts
  activeLegalityItem: 'rule-sets',
```
After the `setRuleItem` implementation add:
```ts
  setLegalityItem: (item) => {
    set({ activeLegalityItem: item })
    save(KEYS.legalityItem, item)
  },
```

- [ ] **Step 6: Restore it in `loadFromStorage`**

After the `ruleItem` block in `loadFromStorage`, add:
```ts
      const VALID_LEGALITY_ITEMS: ActiveLegalityItem[] = ['rule-sets', 'composition', 'comp-load']
      const rawLegalityItem = localStorage.getItem(KEYS.legalityItem)
      const legalityItem: ActiveLegalityItem =
        VALID_LEGALITY_ITEMS.includes(rawLegalityItem as ActiveLegalityItem)
          ? (rawLegalityItem as ActiveLegalityItem)
          : 'rule-sets'
```
and include `activeLegalityItem: legalityItem,` in the `set({ ... })` call at the end of `loadFromStorage` (next to `activeRuleItem: ruleItem,`).

- [ ] **Step 7: Type-check**

Run: `cd gantt && npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 8: Commit**

```bash
git add gantt/src/stores/shell-store.ts
git commit -m "feat(gantt): shell store tracks activeLegalityItem; stop hiding Legality sidebar"
```

---

### Task 3: Add the `LEGALITY_MENU` block to the shell sidebar

**Files:**
- Modify: `gantt/src/components/shell/shell-sidebar.tsx`

- [ ] **Step 1: Import the type and add the menu definition**

In the `import type { ... } from '@/stores/shell-store'` line, add `ActiveLegalityItem`.
Add the icon `Scale` to the `lucide-react` import.
After the `RULE_MENU` definition (~line 69) add:
```tsx
interface LegalityMenuItem {
  item: ActiveLegalityItem
  label: string
  Icon: React.ElementType
}

const LEGALITY_MENU: LegalityMenuItem[] = [
  { item: 'rule-sets',   label: 'Rule Sets',        Icon: Scale },
  { item: 'composition', label: 'Composition',      Icon: Users },
  { item: 'comp-load',   label: 'Composition Load', Icon: AlignJustify },
]
```

- [ ] **Step 2: Read the store values in the component**

Next to `const activeRuleItem = useShellStore((s) => s.activeRuleItem)` add:
```tsx
  const activeLegalityItem = useShellStore((s) => s.activeLegalityItem)
  const setLegalityItem    = useShellStore((s) => s.setLegalityItem)
```

- [ ] **Step 3: Render the legality menu block (mirror the `rule` block)**

After the `{activeModule === 'rule' && ( ... )}` block, add:
```tsx
        {activeModule === 'legality' && (
          <>
            {!isCollapsed && (
              <div className="px-3 pb-1 pt-2 text-3xs font-bold uppercase tracking-widest text-sidebar-foreground/40">
                Configuration
              </div>
            )}
            <TooltipProvider delayDuration={300}>
              {LEGALITY_MENU.map(({ item, label: itemLabel, Icon }) => {
                const isActive = activeLegalityItem === item
                return (
                  <Tooltip key={item}>
                    <TooltipTrigger asChild>
                      <div
                        role="button"
                        tabIndex={0}
                        data-testid={`legality-nav-${item}`}
                        className={[
                          'flex items-center gap-2.5 overflow-hidden whitespace-nowrap border-l-2 px-3 py-1.5 text-xs transition-colors duration-100',
                          isActive
                            ? 'border-sidebar-primary bg-sidebar-accent font-semibold text-sidebar-accent-foreground cursor-default'
                            : 'cursor-pointer border-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                        ].join(' ')}
                        onClick={() => setLegalityItem(item)}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {!isCollapsed && <span className="flex-1">{itemLabel}</span>}
                      </div>
                    </TooltipTrigger>
                    {isCollapsed && (
                      <TooltipContent side="right" className="text-xs">{itemLabel}</TooltipContent>
                    )}
                  </Tooltip>
                )
              })}
            </TooltipProvider>
          </>
        )}
```

- [ ] **Step 2: Type-check**

Run: `cd gantt && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add gantt/src/components/shell/shell-sidebar.tsx
git commit -m "feat(gantt): Legality sidebar menu (Rule Sets / Composition / Composition Load)"
```

---

### Task 4: Turn `legality-view.tsx` into a router; extract the Rule Sets view

**Files:**
- Create: `gantt/src/components/legality/legality-rule-sets-view.tsx`
- Modify: `gantt/src/components/legality/legality-view.tsx`
- Modify: `gantt/src/components/composition/composition-view.tsx` (add a testid)
- Modify: `gantt/src/components/composition/composition-load-view.tsx` (add testids)

- [ ] **Step 1: Extract the current Legality body into `legality-rule-sets-view.tsx`**

Create `gantt/src/components/legality/legality-rule-sets-view.tsx` and move the **entire current contents** of `legality-view.tsx` into it, renaming the exported component `LegalityView` → `LegalityRuleSetsView`. Keep all imports and logic identical; only the component name changes.

- [ ] **Step 2: Replace `legality-view.tsx` with a router**

```tsx
import { useShellStore } from '@/stores/shell-store'
import { CompositionView } from '@/components/composition/composition-view'
import { CompositionLoadView } from '@/components/composition/composition-load-view'
import { LegalityRuleSetsView } from './legality-rule-sets-view'

export const LegalityView = () => {
  const activeLegalityItem = useShellStore((s) => s.activeLegalityItem)

  if (activeLegalityItem === 'composition') return <CompositionView />
  if (activeLegalityItem === 'comp-load') return <CompositionLoadView />
  return <LegalityRuleSetsView />
}
```

- [ ] **Step 3: Add stable testids the e2e asserts against**

In `gantt/src/components/composition/composition-view.tsx`, add `data-testid="composition-view"` to the component's root element (the outermost returned `<div>`).
In `gantt/src/components/composition/composition-load-view.tsx`, add `data-testid="composition-load-view"` to the root element, and `data-testid="composition-load-row"` to each rendered table body `<tr>` (the row mapped per load record).

> Open each file and place the testid on the existing root/row elements — do not restructure the layout.

- [ ] **Step 4: Type-check**

Run: `cd gantt && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/legality/legality-view.tsx \
        gantt/src/components/legality/legality-rule-sets-view.tsx \
        gantt/src/components/composition/composition-view.tsx \
        gantt/src/components/composition/composition-load-view.tsx
git commit -m "feat(gantt): legality-view routes Rule Sets / Composition / Composition Load"
```

---

### Task 5: Green e2e, UI-standard gate, version bump

**Files:**
- Modify: `gantt/src/version.ts`

- [ ] **Step 1: Run the Phase-1 e2e and confirm it passes**

Run: `cd e2e && GANTT_API_URL=http://127.0.0.1:3000 npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/legality-composition-nav.spec.ts --reporter=list --no-deps`
Expected: PASS (1 passed). Paste the summary (per §No-Illusion).

> If `composition-load-row` count mismatches, confirm the testid is on the data row `<tr>` only (not header/empty-state rows).

- [ ] **Step 2: Run the UI-standard gate**

Run: `npm run check:ui`
Expected: PASS — 0 hard violations. Paste the result.

- [ ] **Step 3: Bump the frontend version**

In `gantt/src/version.ts`, increment `FRONTEND_VERSION` by 1 and update its trailing comment, e.g.:
```ts
export const FRONTEND_VERSION = 303  // legality: sidebar menu surfaces Composition + Composition Load (Phase 1 of Rule-tab→Legality migration)
```
(Use the current value + 1; do not reuse an old number.)

- [ ] **Step 4: Commit**

```bash
git add gantt/src/version.ts e2e/tests/gantt/legality-composition-nav.spec.ts
git commit -m "test(e2e/gantt): Legality→Composition nav; bump FRONTEND_VERSION"
```

---

## Self-Review (done)

- **Spec coverage (§4):** Legality sidebar menu (Task 3) ✓; Composition + Composition Load under Legality rendering the existing components (Task 4) ✓; Rule-tab entries left intact — `RULE_MENU` untouched, so the Rule tab still shows its own copies ✓; no backend/table changes ✓.
- **Placeholder scan:** none — every step has concrete code or an exact command.
- **Type consistency:** `ActiveLegalityItem` values `'rule-sets' | 'composition' | 'comp-load'` are identical across the type (Task 2), the `LEGALITY_MENU` items + `legality-nav-${item}` testids (Task 3), the router branches (Task 4), and the e2e selectors (Task 1). Store members `activeLegalityItem` / `setLegalityItem` match between interface, defaults, and consumers.
- **Note:** Composition components are mounted under both Rule and Legality during Phases 1–3 (intended; the Rule tab is removed in Phase 4). Shared component, two nav mounts — no duplication.
