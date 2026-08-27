# Scenario Nav Opened List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flatten the Gantt Scenario top-nav dropdown so opened scenarios appear directly under `Scenarios`, and closing one returns to the Scenario management page while preserving remaining opened scenarios.

**Architecture:** Keep the existing shell state model (`openTabs`, `scenarioTabLabels`, `scenarioTabTypes`) and update only the dropdown rendering plus a focused close fallback path. Avoid changing global tab behavior for unrelated modules.

**Tech Stack:** React 19, TypeScript, Zustand, Radix-style dropdown components from `@rois/ui`, lucide-react icons, Vite.

## Global Constraints

- New behavior must be limited to the Gantt Scenario top navigation.
- Do not change scenario list filtering, sorting, detail panel behavior, or scenario Gantt rendering.
- Do not introduce new dependencies.
- Reuse existing scenario type icons and stored labels.
- Preserve remaining opened scenario tabs after closing one scenario.
- After closing a scenario from this dropdown, activate `activeModule = 'scenario'`.
- Run `cd gantt && npx tsc --noEmit` before completion.

---

### Task 1: Add Scenario-Specific Close Fallback

**Files:**
- Modify: `gantt/src/stores/shell-store.ts`

**Interfaces:**
- Consumes: existing `ShellStore.closeTab(module: ActiveModule): void`
- Produces: `closeTabAndSetModule(module: ActiveModule, fallbackModule: ActiveModule): void`

- [x] **Step 1: Add the store interface method**

In `gantt/src/stores/shell-store.ts`, extend `interface ShellStore` near `closeTab`:

```ts
  /** Close a tab, then force a caller-owned fallback view when that tab was active or when the caller wants deterministic navigation. */
  closeTabAndSetModule: (module: ActiveModule, fallbackModule: ActiveModule) => void
```

- [x] **Step 2: Implement the method**

Add this method in the Zustand object immediately after `closeTab`:

```ts
  closeTabAndSetModule: (module, fallbackModule) => {
    const { openTabs, sidebarUserOverride, scenarioTabLabels, scenarioTabTypes } = get()
    if (openTabs.length <= 1) {
      set({ activeModule: fallbackModule })
      save(KEYS.module, fallbackModule)
      applySidebarForModule(fallbackModule, sidebarUserOverride, set)
      return
    }

    const nextTabsWithoutModule = openTabs.filter((t) => t !== module)
    const nextTabs = nextTabsWithoutModule.includes(fallbackModule)
      ? nextTabsWithoutModule
      : [fallbackModule, ...nextTabsWithoutModule]

    const nextLabels = { ...scenarioTabLabels }
    delete nextLabels[module]
    const nextTypes = { ...scenarioTabTypes }
    delete nextTypes[module]

    set({
      openTabs: nextTabs,
      activeModule: fallbackModule,
      scenarioTabLabels: nextLabels,
      scenarioTabTypes: nextTypes,
    })
    save(KEYS.openTabs, JSON.stringify(nextTabs))
    save(KEYS.scenarioTabLabels, JSON.stringify(nextLabels))
    save(KEYS.scenarioTabTypes, JSON.stringify(nextTypes))
    save(KEYS.module, fallbackModule)
    applySidebarForModule(fallbackModule, sidebarUserOverride, set)
  },
```

- [x] **Step 3: Type-check this store change**

Run: `cd gantt && npx tsc --noEmit`

Expected: no TypeScript errors caused by the new store method.

---

### Task 2: Flatten Scenario Dropdown Rows

**Files:**
- Modify: `gantt/src/components/shell/scenario-nav-dropdown.tsx`
- Modify: `e2e/tests/gantt/scenario/scenario-nav-dropdown.spec.ts`

**Interfaces:**
- Consumes: `closeTabAndSetModule(module: ActiveModule, fallbackModule: ActiveModule): void`
- Produces: Flat dropdown rows with `data-testid="scenario-nav-tab-${module}"` and `data-testid="scenario-nav-close-${module}"`

- [x] **Step 1: Remove nested submenu imports**

Replace the `@rois/ui` import block with:

```ts
import {
  cn,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@rois/ui'
```

- [x] **Step 2: Use deterministic close fallback**

Replace:

```ts
  const closeTab          = useShellStore((s) => s.closeTab)
```

with:

```ts
  const closeTabAndSetModule = useShellStore((s) => s.closeTabAndSetModule)
```

- [x] **Step 3: Remove the plain-button shortcut**

Delete the `if (lastOpenScenario) { ... }` block so `ScenarioNavDropdown` always returns a `DropdownMenu`.

- [x] **Step 4: Render opened scenarios directly below `Scenarios`**

Replace the whole `DropdownMenuSub` block with:

```tsx
        {openScenarios.map((module) => {
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
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  closeTabAndSetModule(module, 'scenario')
                  destroyScenarioGanttStore(scenarioId)
                }}
                className="ml-auto flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground/50 opacity-0 transition-opacity group-hover/row:opacity-100 hover:bg-muted hover:text-foreground"
                aria-label={`Close ${label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </DropdownMenuItem>
          )
        })}
```

- [x] **Step 5: Verify no empty-state row remains**

Confirm there is no `No open scenarios` dropdown row and no `Opened Scenarios` text.

- [x] **Step 6: Type-check**

Run: `cd gantt && npx tsc --noEmit`

Expected: no TypeScript errors.

---

### Task 3: Verify Behavior Manually

**Files:**
- Modify: `e2e/tests/gantt/scenario/scenario-nav-dropdown.spec.ts`

**Interfaces:**
- Consumes: implemented dropdown and store behavior.
- Produces: verification evidence for final response.

- [x] **Step 1: Start or reuse the Gantt dev server**

Run: `cd gantt && npm run dev -- --host 0.0.0.0`

Expected: Vite serves the app. If port `5173` is already in use, use the existing server.

- [x] **Step 2: Inspect the dropdown**

Open the app in the browser at the active Vite URL. With opened scenarios available, click the top-nav `Scenario` dropdown.

Expected:

- `Scenarios` appears first.
- Scenario rows appear directly below it.
- `Opened Scenarios` does not appear.

- [x] **Step 3: Close one scenario**

Click the `X` for one opened scenario row.

Expected:

- The app navigates to the Scenario management/list page.
- Other opened scenario rows remain available in the next `Scenario` dropdown open.

- [x] **Step 4: Final type-check**

Run: `cd gantt && npx tsc --noEmit`

Expected: no TypeScript errors.

- [x] **Step 5: Commit implementation**

```bash
git add gantt/src/stores/shell-store.ts gantt/src/components/shell/scenario-nav-dropdown.tsx e2e/tests/gantt/scenario/scenario-nav-dropdown.spec.ts docs/superpowers/plans/2026-06-24-scenario-nav-opened-list.md
git commit -m "fix: flatten scenario nav opened list"
```
