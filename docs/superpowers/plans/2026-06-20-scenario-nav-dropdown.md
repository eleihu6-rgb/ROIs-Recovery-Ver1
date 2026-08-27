# Scenario Nav Dropdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the right-extending `scenario-gantt:N` tabs in the gantt top nav with a dropdown on the "Scenario" tab: item 1 "Scenario List", item 2 "Scenarios" → submenu of open scenarios.

**Architecture:** Extract a self-contained `ScenarioNavDropdown` component (Radix `DropdownMenu` + `DropdownMenuSub` from `@rois/ui`) that reads the existing `useShellStore` state. `shell-top-nav.tsx` renders it in place of the plain "Scenario" button and drops the dynamic-tabs block. No store changes. A shared e2e helper centralizes the new two-click navigation so stale tests migrate cleanly.

**Tech Stack:** React 19, Zustand, `@rois/ui` (Radix dropdown), Playwright.

**Reference spec:** `docs/superpowers/specs/2026-06-20-scenario-nav-dropdown-design.md`

---

### Task 1: Shared e2e navigation helper

The new design needs two clicks to reach the management view (open dropdown → "Scenario List"). Centralize this so the ~16 call sites migrate to one helper.

**Files:**
- Create: `e2e/pages/gantt/scenario-nav.ts`

- [ ] **Step 1: Create the helper module**

```ts
// e2e/pages/gantt/scenario-nav.ts
/**
 * Shared helpers for the Scenario top-nav dropdown (replaces the old inline
 * `module-nav-scenario` button + right-extending scenario tabs).
 *
 * Trigger testid `module-nav-scenario` is unchanged; it now opens a dropdown
 * instead of navigating directly, so reaching the management view takes a
 * second click on `scenario-nav-list`.
 */
import { type Page } from '@playwright/test'

/** Open the Scenario dropdown and go to the Scenario List (management) view. */
export async function gotoScenarioList(page: Page): Promise<void> {
  await page.getByTestId('module-nav-scenario').click()
  await page.getByTestId('scenario-nav-list').click()
}

/** Switch to an already-open scenario Gantt via the Scenarios submenu. */
export async function switchToOpenScenario(page: Page, module: string): Promise<void> {
  await page.getByTestId('module-nav-scenario').click()
  await page.getByTestId('scenario-nav-scenarios-sub').click()
  await page.getByTestId(`scenario-nav-tab-${module}`).click()
}

/** Close an open scenario Gantt via the Scenarios submenu close (✕). */
export async function closeOpenScenario(page: Page, module: string): Promise<void> {
  await page.getByTestId('module-nav-scenario').click()
  await page.getByTestId('scenario-nav-scenarios-sub').click()
  await page.getByTestId(`scenario-nav-close-${module}`).click()
}
```

- [ ] **Step 2: Typecheck the helper compiles**

Run: `cd e2e && npx tsc --noEmit -p tsconfig.json 2>&1 | grep scenario-nav || echo "no scenario-nav type errors"`
Expected: `no scenario-nav type errors`

- [ ] **Step 3: Commit**

```bash
git add e2e/pages/gantt/scenario-nav.ts
git commit -m "test(e2e/gantt): add scenario-nav dropdown navigation helpers"
```

---

### Task 2: ScenarioNavDropdown component + wire into top nav (TDD)

**Files:**
- Create: `gantt/src/components/shell/scenario-nav-dropdown.tsx`
- Modify: `gantt/src/components/shell/shell-top-nav.tsx` (remove dynamic block at 110-161; special-case `scenario` in `NAV_ITEMS.map`; prune now-unused imports/selectors)
- Test: `e2e/tests/gantt/scenario/scenario-nav-dropdown.spec.ts`

- [ ] **Step 1: Write the failing regression test**

```ts
// e2e/tests/gantt/scenario/scenario-nav-dropdown.spec.ts
/**
 * Scenario top-nav dropdown — replaces the old right-extending scenario tabs.
 * The "Scenario" tab is now a dropdown: "Scenario List" navigates to the
 * management view; "Scenarios" submenu lists open scenario Gantts, lets you
 * switch to one, and close it. Uses stable demo scenario #6 (RO).
 *
 * Requires: live-server (SCENARIO_GANTT_SOURCE=db) + scenario #6.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'
const SCENARIO_ID = 6
const MODULE = `scenario-gantt:${SCENARIO_ID}`

interface Auth { token: string; userCode: string; userName: string; schema: string }

const login = async (request: APIRequestContext): Promise<Auth> => {
  const res = await request.post(`${GANTT_API}/api/auth/login`, { data: { userCode: GANTT_USER, password: GANTT_PASS } })
  expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy()
  return ((await res.json()) as { data: Auth }).data
}

async function openScenario6(page: Page): Promise<void> {
  await page.goto('/fpqe/gantt/')
  await page.waitForLoadState('networkidle')
  // Reach the RO list via the new dropdown (Scenario List → RO section).
  await page.getByTestId('module-nav-scenario').click()
  await page.getByTestId('scenario-nav-list').click()
  await page.getByTestId('scenario-nav-ro').click()
  await page.getByPlaceholder('Search scenarios…').fill('RO-2026-06 YEG Test---')
  const item = page.getByTestId('scenario-list-item').filter({
    has: page.getByTestId('scenario-item-id').getByText(`#${SCENARIO_ID}`, { exact: true }),
  })
  await expect(item).toBeVisible({ timeout: 15_000 })
  await item.click()
  await page.getByTestId('scenario-detail-panel').getByTestId('scenario-open-btn').click()
  await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('scenario-roster-canvas')).toBeVisible({ timeout: 15_000 })
}

test.describe('Scenario nav dropdown', () => {
  test.beforeEach(async ({ page, request }) => {
    const auth = await login(request)
    await page.addInitScript((a) => {
      window.sessionStorage.setItem('rois-auth', JSON.stringify({ user: { userCode: a.userCode, userName: a.userName, schema: a.schema }, token: a.token }))
    }, auth)
  })

  test('Scen-2050 — open scenario shows in trigger + Scenarios submenu, switch and close work', async ({ page }) => {
    await openScenario6(page)

    // 1. The trigger now shows the active scenario's name, not just "Scenario".
    const trigger = page.getByTestId('module-nav-scenario')
    await expect(trigger).toContainText('RO-2026-06 YEG Test---')

    // 2. Open dropdown → Scenarios submenu → the open scenario row is present.
    await trigger.click()
    await page.getByTestId('scenario-nav-scenarios-sub').click()
    const row = page.getByTestId(`scenario-nav-tab-${MODULE}`)
    await expect(row).toBeVisible()
    await expect(row).toContainText('RO-2026-06 YEG Test---')

    // 3. Navigate away to the management view, then switch back via the submenu.
    await page.keyboard.press('Escape')
    await page.getByTestId('module-nav-scenario').click()
    await page.getByTestId('scenario-nav-list').click()
    await expect(page.getByTestId('scenario-gantt-view')).toBeHidden()

    await page.getByTestId('module-nav-scenario').click()
    await page.getByTestId('scenario-nav-scenarios-sub').click()
    await page.getByTestId(`scenario-nav-tab-${MODULE}`).click()
    await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('module-nav-scenario')).toContainText('RO-2026-06 YEG Test---')

    // 4. Close the scenario from the submenu → it disappears; trigger falls back to "Scenario".
    await page.getByTestId('module-nav-scenario').click()
    await page.getByTestId('scenario-nav-scenarios-sub').click()
    await page.getByTestId(`scenario-nav-close-${MODULE}`).click()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('module-nav-scenario')).toContainText('Scenario')
    await expect(page.getByTestId('module-nav-scenario')).not.toContainText('RO-2026-06')

    // 5. Empty state: Scenarios submenu shows "No open scenarios".
    await page.getByTestId('module-nav-scenario').click()
    await page.getByTestId('scenario-nav-scenarios-sub').click()
    await expect(page.getByText('No open scenarios')).toBeVisible()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test e2e/tests/gantt/scenario/scenario-nav-dropdown.spec.ts --reporter=list`
Expected: FAIL — `scenario-nav-list` (and the other dropdown testids) do not exist yet; the click on `scenario-nav-list` times out.

- [ ] **Step 3: Create the `ScenarioNavDropdown` component**

```tsx
// gantt/src/components/shell/scenario-nav-dropdown.tsx
import { ChevronDown, ClipboardList, FlaskConical, X } from 'lucide-react'
import {
  cn,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from '@rois/ui'
import type { ScenarioType } from '@/types/scenario'
import { SCENARIO_TYPE_ICON, SCENARIO_TYPE_COLOR } from '@/utils/scenario-type'
import { destroyScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { useShellStore } from '@/stores/shell-store'

const SCENARIO_PREFIX = 'scenario-gantt:'
const scenarioIdOf = (module: string): number => Number(module.slice(SCENARIO_PREFIX.length))

/**
 * The "Scenario" top-nav entry, rendered as a dropdown:
 *  - "Scenario List" → the management view (module `scenario`)
 *  - "Scenarios" submenu → the currently-open scenario Gantts (switch / close)
 * Replaces the old right-extending `scenario-gantt:N` tabs.
 */
export const ScenarioNavDropdown = () => {
  const activeModule      = useShellStore((s) => s.activeModule)
  const openTabs          = useShellStore((s) => s.openTabs)
  const scenarioTabLabels = useShellStore((s) => s.scenarioTabLabels)
  const scenarioTabTypes  = useShellStore((s) => s.scenarioTabTypes)
  const setModule         = useShellStore((s) => s.setModule)
  const closeTab          = useShellStore((s) => s.closeTab)

  const openScenarios = openTabs.filter((t) => t.startsWith(SCENARIO_PREFIX))
  const activeIsScenario = activeModule.startsWith(SCENARIO_PREFIX)
  const activeIsList = activeModule === 'scenario'
  const isActive = activeIsScenario || activeIsList

  const activeType = activeIsScenario
    ? ((scenarioTabTypes[activeModule] ?? 'PO') as ScenarioType)
    : null
  const TriggerIcon = activeType ? SCENARIO_TYPE_ICON[activeType] : FlaskConical
  const triggerColors = activeType ? SCENARIO_TYPE_COLOR[activeType] : null
  const triggerLabel = activeIsScenario
    ? (scenarioTabLabels[activeModule] ?? `#${scenarioIdOf(activeModule)}`)
    : 'Scenario'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          data-testid="module-nav-scenario"
          className={cn(
            'group flex h-[28px] shrink-0 items-center gap-1.5 rounded-sm pl-2.5 pr-1.5 text-xs font-medium whitespace-nowrap transition-all duration-100',
            isActive
              ? activeIsScenario && triggerColors
                ? `${triggerColors.bg} ${triggerColors.text} font-semibold`
                : 'bg-accent text-foreground font-semibold'
              : 'text-muted-foreground/60 hover:bg-muted/60 hover:text-foreground',
          )}
        >
          <TriggerIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="max-w-[140px] truncate">{triggerLabel}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="min-w-[200px]">
        <DropdownMenuItem
          data-testid="scenario-nav-list"
          onSelect={() => setModule('scenario')}
          className={cn(activeIsList && 'font-semibold')}
        >
          <ClipboardList className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          Scenario List
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger data-testid="scenario-nav-scenarios-sub">
            <FlaskConical className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            Scenarios
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-[220px]">
            {openScenarios.length === 0 ? (
              <DropdownMenuItem disabled className="text-muted-foreground">
                No open scenarios
              </DropdownMenuItem>
            ) : (
              openScenarios.map((module) => {
                const scenarioId = scenarioIdOf(module)
                const type = (scenarioTabTypes[module] ?? 'PO') as ScenarioType
                const Icon = SCENARIO_TYPE_ICON[type]
                const colors = SCENARIO_TYPE_COLOR[type]
                const label = scenarioTabLabels[module] ?? `#${scenarioId}`
                const rowActive = module === activeModule
                return (
                  <DropdownMenuItem
                    key={module}
                    data-testid={`scenario-nav-tab-${module}`}
                    onSelect={() => setModule(module)}
                    className={cn('group/row pr-1', rowActive && `${colors.bg} ${colors.text} font-semibold`)}
                  >
                    <Icon className="mr-2 h-3.5 w-3.5 shrink-0" />
                    <span className="max-w-[160px] truncate">{label}</span>
                    <button
                      type="button"
                      data-testid={`scenario-nav-close-${module}`}
                      // Stop Radix from treating the ✕ as an item selection (it
                      // selects on pointerup); then remove the tab + its store.
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        closeTab(module)
                        destroyScenarioGanttStore(scenarioId)
                      }}
                      className="ml-auto flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground/50 opacity-0 transition-opacity group-hover/row:opacity-100 hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </DropdownMenuItem>
                )
              })
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 4a: Wire into `shell-top-nav.tsx` — imports**

Replace the type/util/store imports that the removed dynamic block used. In `gantt/src/components/shell/shell-top-nav.tsx`:

Remove these three import lines (lines 7-9):
```tsx
import type { ScenarioType } from '@/types/scenario'
import { SCENARIO_TYPE_ICON, SCENARIO_TYPE_COLOR } from '@/utils/scenario-type'
import { destroyScenarioGanttStore } from '@/stores/scenario-gantt-store'
```

Add this import (next to the other `@/components/shell` siblings / after the lucide imports):
```tsx
import { ScenarioNavDropdown } from '@/components/shell/scenario-nav-dropdown'
```

- [ ] **Step 4b: Wire into `shell-top-nav.tsx` — remove now-unused store selectors**

Remove these two lines from the `ShellTopNav` body (currently lines 45-46):
```tsx
  const scenarioTabLabels = useShellStore((s) => s.scenarioTabLabels)
  const scenarioTabTypes  = useShellStore((s) => s.scenarioTabTypes)
```

- [ ] **Step 4c: Wire into `shell-top-nav.tsx` — special-case `scenario` in the map**

At the very top of the `NAV_ITEMS.map(({ module, label, Icon, testid }) => {` callback body (just before `const isActive = module === activeModule`), insert:
```tsx
          if (module === 'scenario') {
            return <ScenarioNavDropdown key={module} />
          }
```

- [ ] **Step 4d: Wire into `shell-top-nav.tsx` — delete the dynamic scenario tabs block**

Delete the entire block currently at lines 110-161 (from the `{/* Dynamic scenario-gantt tabs */}` comment through the closing `})}` of the `.map`), i.e.:
```tsx
        {/* Dynamic scenario-gantt tabs */}
        {openTabs.some((t) => t.startsWith('scenario-gantt:')) && (
          <NavDivider />
        )}
        {openTabs
          .filter((t) => t.startsWith('scenario-gantt:'))
          .map((module) => {
            /* ...entire block... */
          })}
```
Leave the following `<div className="flex-1" />` and right-side controls untouched.

- [ ] **Step 5: Run the new test to verify it passes**

Run: `npx playwright test e2e/tests/gantt/scenario/scenario-nav-dropdown.spec.ts --reporter=list`
Expected: PASS (1 passed). Paste the summary into the completion message (§No-Illusion).

- [ ] **Step 6: Commit**

```bash
git add gantt/src/components/shell/scenario-nav-dropdown.tsx \
        gantt/src/components/shell/shell-top-nav.tsx \
        e2e/tests/gantt/scenario/scenario-nav-dropdown.spec.ts
git commit -m "feat(gantt): Scenario nav dropdown replaces right-extending tabs

Scenario top-nav tab is now a dropdown: Scenario List + Scenarios submenu
of open scenario Gantts (switch / close). Removes the inline scenario-gantt:N
tabs that grew the nav rightward."
```

---

### Task 3: Bump frontend version

**Files:**
- Modify: `gantt/src/version.ts:25`

- [ ] **Step 1: Increment `FRONTEND_VERSION` 286 → 287**

Change the line:
```tsx
export const FRONTEND_VERSION = 286  // Scenario Pairing Pane row selection tests; useKeyboard in ScenarioGanttView (ESC now works)
```
to:
```tsx
export const FRONTEND_VERSION = 287  // Scenario nav dropdown replaces right-extending scenario tabs
```

- [ ] **Step 2: Commit**

```bash
git add gantt/src/version.ts
git commit -m "chore(gantt): bump FRONTEND_VERSION to 287 (scenario nav dropdown)"
```

---

### Task 4: Migrate stale e2e call sites to the new dropdown

The component change breaks every test that clicked `module-nav-scenario` to navigate, or clicked an inline `module-tab-scenario-gantt:N` to switch (§Stale-Test). Migrate them to the Task 1 helpers.

**Files (navigation — replace bare `module-nav-scenario` click with `gotoScenarioList`):**
- Modify: `e2e/pages/gantt/scenario-page.ts` (lines 78, 87)
- Modify: `e2e/tests/gantt/scenario-gantt-zoom.spec.ts:33`
- Modify: `e2e/tests/gantt/scenario-popup-standard.spec.ts:147`
- Modify: `e2e/tests/gantt/scenario-status-colors.spec.ts:82`
- Modify: `e2e/tests/gantt/scenario-memory-baseline.spec.ts:86`
- Modify: `e2e/tests/gantt/scenario-id-badge.spec.ts:16`
- Modify: `e2e/tests/gantt/scenario/scenario-filter-pairing.spec.ts:48`
- Modify: `e2e/tests/gantt/scenario/scenario-filter-flight.spec.ts:42`
- Modify: `e2e/tests/gantt/scenario/scenario-filter-roster.spec.ts:38`
- Modify: `e2e/tests/gantt/scenario/scenario-db-source.spec.ts:61`
- Modify: `e2e/tests/gantt/scenario/scenario-roster-violation-bell.spec.ts:39`
- Modify: `e2e/tests/gantt/scenario/scenario-sort-persist.spec.ts:55`
- Modify: `e2e/tests/gantt/scenario/scenario-filter-parity.spec.ts:50`
- Modify: `e2e/tests/gantt/scenario/scenario-sort-dialog.spec.ts:55`

**Files (switch-to-open-tab — replace inline `module-tab-...` click with `switchToOpenScenario`):**
- Modify: `e2e/tests/gantt/scenario-memory-baseline.spec.ts:146`
- Modify: `e2e/tests/gantt/scenario/scenario-sort-persist.spec.ts:103`

**Files (screenshot scripts — same navigation migration):**
- Modify: `e2e/scripts/capture-release2-screenshots.ts:164`
- Modify: `e2e/scripts/capture-help-screenshots.ts:334`

- [ ] **Step 1: Enumerate exact call sites (sanity re-grep)**

Run: `grep -rn "module-nav-scenario\|module-tab-\${MODULE_KEY}\|module-tab-scenario-gantt" e2e/`
Expected: the lines listed above. If new ones appeared since planning, migrate them the same way.

- [ ] **Step 2: Migrate navigation call sites**

In each navigation file above, add the import (next to existing imports):
```ts
import { gotoScenarioList } from '../../pages/gantt/scenario-nav'
```
(adjust the relative path: from `e2e/tests/gantt/*.spec.ts` use `../../pages/gantt/scenario-nav`; from `e2e/tests/gantt/scenario/*.spec.ts` use `../../../pages/gantt/scenario-nav`; from `e2e/pages/gantt/scenario-page.ts` use `./scenario-nav`; from `e2e/scripts/*.ts` use `../pages/gantt/scenario-nav`.)

Then replace each occurrence of:
```ts
await page.getByTestId('module-nav-scenario').click()
```
with:
```ts
await gotoScenarioList(page)
```
For `scenario-page.ts` (a class method) the receiver is `this.page`:
```ts
await this.page.getByTestId('module-nav-scenario').click()   // before
await gotoScenarioList(this.page)                            // after
```

- [ ] **Step 3: Migrate the two switch-to-open-tab call sites**

In `e2e/tests/gantt/scenario-memory-baseline.spec.ts` and `e2e/tests/gantt/scenario/scenario-sort-persist.spec.ts`, add:
```ts
import { switchToOpenScenario } from '../../pages/gantt/scenario-nav'        // memory-baseline (tests/gantt)
import { switchToOpenScenario } from '../../../pages/gantt/scenario-nav'     // sort-persist (tests/gantt/scenario)
```
Replace:
```ts
await page.getByTestId(`module-tab-${MODULE_KEY}`).click()
```
with:
```ts
await switchToOpenScenario(page, MODULE_KEY)
```
(Combine the two imports from `scenario-nav` into one line if the file already imports `gotoScenarioList`, e.g. `import { gotoScenarioList, switchToOpenScenario } from '...'`.)

- [ ] **Step 4: Typecheck e2e**

Run: `cd e2e && npx tsc --noEmit -p tsconfig.json 2>&1 | tail -20 || true`
Expected: no errors referencing the migrated files / `scenario-nav`.

- [ ] **Step 5: Run a representative migrated subset to confirm green**

Run: `npx playwright test e2e/tests/gantt/scenario-gantt-zoom.spec.ts e2e/tests/gantt/scenario-id-badge.spec.ts e2e/tests/gantt/scenario/scenario-sort-persist.spec.ts --reporter=list`
Expected: PASS for all three (covers a navigation-only test, a list-assert test, and a switch-to-open-tab test). Paste the summary.

- [ ] **Step 6: Commit**

```bash
git add e2e/pages/gantt/scenario-page.ts e2e/tests/gantt e2e/scripts
git commit -m "test(e2e/gantt): migrate scenario nav call sites to dropdown helpers"
```

---

### Task 5: Final verification

- [ ] **Step 1: UI standard gate**

Run: `npm run check:ui`
Expected: PASS, hard violations = 0. Paste the result (§UI-Standard-Gate / §No-Illusion).

- [ ] **Step 2: Frontend build / typecheck**

Run: `cd gantt && npx tsc --noEmit 2>&1 | tail -20 || true`
Expected: no errors in `shell-top-nav.tsx` or `scenario-nav-dropdown.tsx` (e.g. no unused-import errors from the pruned imports).

- [ ] **Step 3: Confirm no stray inline scenario tab refs remain**

Run: `grep -rn "module-tab-scenario-gantt\|Dynamic scenario-gantt tabs" gantt/src e2e/ || echo "clean"`
Expected: only the intentional `scenario-memory-baseline.spec.ts:28` comment line (a `MODULE_KEY` doc comment) may remain; no live `module-tab-...` click. If a real usage remains, migrate it.

---

## Self-Review

**Spec coverage:**
- Scenario tab → dropdown trigger with active-scenario name/icon → Task 2 Step 3 (`ScenarioNavDropdown` trigger) ✓
- "Scenario List" item → management view → Task 2 Step 3 (`scenario-nav-list`) ✓
- "Scenarios" submenu of open scenarios, switch + per-row ✕ close → Task 2 Step 3 ✓
- Empty state "No open scenarios" → Task 2 Step 3 + test Step 1 (assertion 5) ✓
- Remove right-extending tabs → Task 2 Step 4d ✓
- Testids table (`module-nav-scenario`, `scenario-nav-list`, `scenario-nav-scenarios-sub`, `scenario-nav-tab-*`, `scenario-nav-close-*`) → Task 2 ✓
- Stale-test migration via shared helper → Task 1 + Task 4 ✓
- `FRONTEND_VERSION` +1 → Task 3 ✓
- New regression test → Task 2 Step 1 ✓

**Placeholder scan:** No TBD/TODO; every code/edit step shows full content. ✓

**Type/name consistency:** Helper names (`gotoScenarioList`, `switchToOpenScenario`, `closeOpenScenario`) match between Task 1 and Task 4. Testids match between component (Task 2), test (Task 2 Step 1), and helpers (Task 1). `SCENARIO_PREFIX`/`scenarioIdOf` used consistently within the component. ✓
