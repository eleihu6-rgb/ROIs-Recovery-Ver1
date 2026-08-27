# Module-Scoped Sidebar State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make the Gantt shell sidebar expand/collapse state persist per top-level module so a manual change in one tab does not leak into other tabs.

**Architecture:** Keep `ShellSidebar` rendering unchanged and move the behavior into `shell-store`. Add a normalized sidebar module key, a persisted `sidebarStatesByModule` map, and tests covering module switches and Scenario/Scenario Gantt grouping.

**Tech Stack:** React 19, Zustand, TypeScript, Vitest, browser `localStorage`.

## Global Constraints

- Scope is limited to the Gantt shell sidebar state.
- Do not redesign sidebar visuals or menu contents.
- Do not change active module, open tab, Scenario dropdown, or Data page behavior.
- Do not touch the older non-shell Gantt pane sidebar controlled by `useUiStore.sidebarCollapsed`.
- Scenario management and `scenario-gantt:*` share one sidebar state group.
- Run focused Vitest tests and `cd gantt && npx tsc --noEmit` before completion.

---

### Task 1: Red Test For Per-Module Sidebar State

**Files:**
- Create: `gantt/src/stores/__tests__/shell-store-sidebar.test.ts`

**Interfaces:**
- Consumes: `useShellStore`
- Produces: failing tests for `setSidebarState`, `setModule`, and Scenario group normalization

- [x] **Step 1: Write the failing tests**

Create `gantt/src/stores/__tests__/shell-store-sidebar.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { useShellStore } from '../shell-store'

const resetShellStore = (): void => {
  localStorage.clear()
  useShellStore.setState({
    activeModule: 'dashboard',
    activeLiveItem: 'roster',
    activeScenarioItem: 'all',
    activeLegalityItem: 'rule-sets',
    activeSystemItem: 'queue-tasks',
    activePbsItem: 'period',
    openTabs: ['dashboard'],
    scenarioTabLabels: {},
    scenarioTabTypes: {},
    topNavVisible: true,
    sidebarState: 'expanded',
    sidebarUserOverride: false,
    sidebarStatesByModule: {},
    filterDialogOpen: false,
    filterDialogTab: null,
  })
}

describe('shell-store module-scoped sidebar state', () => {
  beforeEach(() => resetShellStore())

  it('does not let a Live sidebar expansion leak into Data', () => {
    useShellStore.getState().setModule('live')
    expect(useShellStore.getState().sidebarState).toBe('collapsed')

    useShellStore.getState().setSidebarState('expanded', true)
    expect(useShellStore.getState().sidebarState).toBe('expanded')

    useShellStore.getState().setModule('data')
    expect(useShellStore.getState().sidebarState).toBe('expanded')

    useShellStore.getState().setSidebarState('collapsed', true)
    useShellStore.getState().setModule('live')
    expect(useShellStore.getState().sidebarState).toBe('expanded')
  })

  it('shares sidebar state between Scenario list and opened scenario Gantt tabs', () => {
    useShellStore.getState().setModule('scenario')
    useShellStore.getState().setSidebarState('expanded', true)

    useShellStore.getState().setModule('scenario-gantt:596')
    expect(useShellStore.getState().sidebarState).toBe('expanded')

    useShellStore.getState().setSidebarState('collapsed', true)
    useShellStore.getState().setModule('scenario')
    expect(useShellStore.getState().sidebarState).toBe('collapsed')
  })

  it('restores persisted module states from localStorage', () => {
    localStorage.setItem('rois-shell-module', 'data')
    localStorage.setItem('rois-shell-open-tabs', JSON.stringify(['data']))
    localStorage.setItem('rois-shell-sidebar-by-module', JSON.stringify({
      live: 'expanded',
      data: 'collapsed',
    }))

    useShellStore.getState().loadFromStorage()
    expect(useShellStore.getState().activeModule).toBe('data')
    expect(useShellStore.getState().sidebarState).toBe('collapsed')

    useShellStore.getState().setModule('live')
    expect(useShellStore.getState().sidebarState).toBe('expanded')
  })
})
```

- [x] **Step 2: Run the focused tests and verify RED**

Run: `cd gantt && npx vitest run src/stores/__tests__/shell-store-sidebar.test.ts`

Expected: FAIL because `sidebarStatesByModule` does not exist and module switching is still governed by global `sidebarUserOverride`.

---

### Task 2: Implement Module-Scoped Sidebar State

**Files:**
- Modify: `gantt/src/stores/shell-store.ts`

**Interfaces:**
- Consumes: existing `SidebarState`, `ActiveModule`, `setModule`, `setSidebarState`, `loadFromStorage`
- Produces: `sidebarStatesByModule: Record<string, SidebarState>` on `ShellStore`

- [x] **Step 1: Add the map to the store interface**

In `gantt/src/stores/shell-store.ts`, add:

```ts
  /** Per top-level module sidebar state; scenario-gantt:* is normalized to scenario. */
  sidebarStatesByModule: Record<string, SidebarState>
```

- [x] **Step 2: Add the localStorage key and helpers**

Add `sidebarByModule` to `KEYS`:

```ts
  sidebarByModule:    'rois-shell-sidebar-by-module',
```

Add helper functions near `save`:

```ts
const sidebarModuleKey = (module: ActiveModule): string =>
  module.startsWith('scenario-gantt:') ? 'scenario' : module

const defaultSidebarForModule = (module: ActiveModule): SidebarState =>
  module === 'live' ? 'collapsed' :
  module === 'help' ? 'hidden' :
  module === 'release' ? 'hidden' :
  module.startsWith('scenario-gantt:') ? 'collapsed' : 'expanded'

const sidebarForModule = (
  module: ActiveModule,
  statesByModule: Record<string, SidebarState>,
): SidebarState => statesByModule[sidebarModuleKey(module)] ?? defaultSidebarForModule(module)
```

- [x] **Step 3: Replace global override application**

Replace `applySidebarForModule` with:

```ts
const applySidebarForModule = (
  module: ActiveModule,
  statesByModule: Record<string, SidebarState>,
  set: (patch: Partial<ShellStore>) => void,
): void => {
  set({ sidebarState: sidebarForModule(module, statesByModule) })
}
```

- [x] **Step 4: Initialize map state**

Add to the Zustand initial state:

```ts
  sidebarStatesByModule: {},
```

- [x] **Step 5: Update module-switch call sites**

In `setModule`, read `sidebarStatesByModule` instead of `sidebarUserOverride` and call:

```ts
    applySidebarForModule(module, sidebarStatesByModule, set)
```

In `closeTab`, read `sidebarStatesByModule` and call:

```ts
      applySidebarForModule(nextActive, sidebarStatesByModule, set)
```

In `closeTabAndSetModule`, read `sidebarStatesByModule` and call:

```ts
      applySidebarForModule(fallbackModule, sidebarStatesByModule, set)
```

and at the end:

```ts
    applySidebarForModule(fallbackModule, sidebarStatesByModule, set)
```

- [x] **Step 6: Persist user sidebar changes by module key**

Replace `setSidebarState` with:

```ts
  setSidebarState: (state, byUser = false) => {
    if (!byUser) {
      set({ sidebarState: state })
      save(KEYS.sidebar, state)
      return
    }

    const key = sidebarModuleKey(get().activeModule)
    const nextStates = { ...get().sidebarStatesByModule, [key]: state }
    set({ sidebarState: state, sidebarUserOverride: true, sidebarStatesByModule: nextStates })
    save(KEYS.sidebar, state)
    save(KEYS.sidebarOverride, 'true')
    save(KEYS.sidebarByModule, JSON.stringify(nextStates))
  },
```

- [x] **Step 7: Restore the persisted map**

In `loadFromStorage`, parse `KEYS.sidebarByModule`:

```ts
      const sidebarStatesRaw = localStorage.getItem(KEYS.sidebarByModule)
      const sidebarStatesByModule: Record<string, SidebarState> = sidebarStatesRaw
        ? (JSON.parse(sidebarStatesRaw) as Record<string, SidebarState>)
        : {}
      const sidebarState = sidebarForModule(module, sidebarStatesByModule)
```

Remove or bypass the old single-value `sidebarState` assignment in that block, and include `sidebarStatesByModule` in the final `set(...)`.

- [x] **Step 8: Run the focused tests and verify GREEN**

Run: `cd gantt && npx vitest run src/stores/__tests__/shell-store-sidebar.test.ts`

Expected: PASS.

---

### Task 3: Verify UI Behavior

**Files:**
- No code files.

**Interfaces:**
- Consumes: implemented store behavior
- Produces: verification evidence

- [x] **Step 1: Run focused unit tests**

Run: `cd gantt && npx vitest run src/stores/__tests__/shell-store-sidebar.test.ts`

Expected: PASS.

- [x] **Step 2: Run TypeScript check**

Run: `cd gantt && npx tsc --noEmit`

Expected: either PASS, or the known pre-existing `rule-group-select.tsx` errors only.

- [x] **Step 3: Run a browser-level smoke check**

Use local Playwright against `http://localhost:5173/fpqe/gantt/`:

1. Seed auth.
2. Open Live.
3. Expand the shell sidebar.
4. Open Data.
5. Verify Data uses its own sidebar state.
6. Collapse Data.
7. Return to Live.
8. Verify Live remains expanded.

- [x] **Step 4: Commit and push**

```bash
git add gantt/src/stores/shell-store.ts gantt/src/stores/__tests__/shell-store-sidebar.test.ts docs/superpowers/plans/2026-06-24-module-scoped-sidebar-state.md
git commit -m "fix: scope sidebar state by module"
git push origin main
```
