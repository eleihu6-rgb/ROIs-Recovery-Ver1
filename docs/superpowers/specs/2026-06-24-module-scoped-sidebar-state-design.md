# Module-Scoped Sidebar State Design

Date: 2026-06-24

## Goal

Make the Gantt shell sidebar expand/collapse state local to each top-level module so changing the sidebar in Live does not automatically change Data, Scenario, Legality, Regression, PBS, or other top-level tabs.

## Current Behavior

The shell stores one global `sidebarState` and one global `sidebarUserOverride`.

When a user manually expands or collapses the sidebar in any module, `sidebarUserOverride` becomes `true`. After that, module switches stop applying each module's default sidebar behavior. This makes a manual expand in Live leak into other tabs such as Data and Scenario.

## Desired Behavior

Sidebar state is remembered per top-level module group:

- `live`
- `scenario`, including the Scenario management page and all dynamic `scenario-gantt:*` tabs
- `data`
- `legality`
- `regression`
- `pbs`
- `dashboard`
- `dev`
- `help`
- `release`

When the user expands or collapses the sidebar, the state is saved only for the current top-level module group. Switching modules restores the target module group's saved state. If the target module group has no saved state, it uses the existing default behavior:

- Live: `collapsed`
- Scenario Gantt: `collapsed`
- Help: `hidden`
- Release: `hidden`
- Other modules: `expanded`

The current global `sidebarUserOverride` behavior should be removed or made irrelevant, because user overrides must no longer block default/restored behavior for unrelated modules.

The existing safety rule remains: when the top nav is hidden, the shell sidebar cannot be fully hidden; it must render as collapsed so the "Show Top Nav" control stays reachable.

## Scope

In scope:

- `gantt/src/stores/shell-store.ts`
- Focused shell/sidebar tests if an existing test location is available
- Browser or Playwright verification of switching between Live, Data, and Scenario/Scenario Gantt sidebar states

Out of scope:

- Redesigning sidebar visuals
- Changing sidebar menu contents
- Changing active module, open tab, Scenario dropdown, or Data page behavior
- Changing the older non-shell Gantt pane sidebar controlled by `useUiStore.sidebarCollapsed`

## Design Notes

Add a persisted map keyed by normalized top-level module group, for example:

```ts
sidebarStatesByModule: Record<string, SidebarState>
```

Normalize modules before reading or writing sidebar state:

- `scenario-gantt:*` maps to `scenario`
- known top-level modules map to themselves
- unknown module strings can map to themselves as a safe fallback

`setModule(module)` should:

1. Update `activeModule` and `openTabs`.
2. Resolve the module's normalized sidebar key.
3. Apply `sidebarStatesByModule[key]` if present.
4. Otherwise apply the module default.

`setSidebarState(state, true)` should update both the current visible `sidebarState` and the map entry for the active module's normalized key. Non-user calls may update only the active state unless a call site needs to persist a default.

Persistence should use a new localStorage key such as `rois-shell-sidebar-by-module`. Existing `rois-shell-sidebar` may remain as a legacy fallback for the first load, but it should no longer be the primary source of truth for module switches.

## Acceptance Criteria

- Expanding Live does not expand Data.
- Expanding Data does not expand Live.
- Expanding Data does not expand Scenario or any opened scenario Gantt tab.
- Scenario management and `scenario-gantt:*` share one sidebar state group.
- On first visit with no saved per-module state, existing defaults still apply.
- The top-nav-hidden safety behavior still prevents a zero-width sidebar.
- Existing unrelated shell navigation behavior is unchanged.
