# Scenario Nav Dropdown — Design Spec

> Date: 2026-06-20
> Module: gantt (shell top navigation)
> Status: Approved design, pending implementation plan

## Problem

When a user opens a scenario's Gantt, the shell top nav appends a dynamic
`scenario-gantt:N` tab to the right of the static module tabs
(`gantt/src/components/shell/shell-top-nav.tsx:110-161`). Each opened scenario
adds another tab, so the tab strip keeps growing rightward and consumes
horizontal space, eventually crowding the right-side controls (ThemeSwitcher,
user, version, logout).

## Goal

Replace the right-extending dynamic tabs with a single **dropdown on the
"Scenario" top-nav tab**:

- Item 1 — **Scenario List**: navigates to the scenario management view (the
  existing static `scenario` module).
- Item 2 — **Scenarios**: a nested submenu listing the currently-open scenario
  Gantt tabs; selecting one switches to it, and each row can be closed.

The top-nav width stays fixed regardless of how many scenarios are open.

## Scope

- **Single file changed:** `gantt/src/components/shell/shell-top-nav.tsx`.
- **No store changes.** All required state and actions already exist on
  `useShellStore`:
  - `openTabs: ActiveModule[]`
  - `scenarioTabLabels: Record<string, string>`
  - `scenarioTabTypes: Record<string, string>`
  - `activeModule: string`
  - `setModule(module)`
  - `closeTab(module)`
- **No new UI primitives.** `DropdownMenu`, `DropdownMenuTrigger`,
  `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSub`,
  `DropdownMenuSubTrigger`, `DropdownMenuSubContent` are already exported from
  `@rois/ui` (`packages/ui/src/index.ts:79-92`).

## Design

### 1. "Scenario" nav entry becomes a dropdown

Inside `NAV_ITEMS.map`, special-case `module === 'scenario'` to render a
`DropdownMenu` whose trigger replaces the plain `<button>`. All other nav
entries render unchanged.

**Trigger content / label rules:**

- When `activeModule` starts with `scenario-gantt:` (a scenario Gantt is the
  active view):
  - Show that scenario's **type icon** (`SCENARIO_TYPE_ICON[type]`) + its
    **name** (`scenarioTabLabels[activeModule] ?? '#<id>'`).
  - Apply the type color highlight (`SCENARIO_TYPE_COLOR[type].bg/text`),
    matching today's active-scenario-tab styling.
  - Append a chevron-down (`ChevronDown`) to signal the dropdown.
- Otherwise:
  - Show the `FlaskConical` icon + label **"Scenario"** + chevron-down.
  - Apply the active style only when `activeModule === 'scenario'`.

The trigger keeps the existing nav-tab sizing/typography
(`h-[28px]`, `text-xs font-medium`, etc.) so it visually matches sibling tabs.
The scenario name is truncated (`max-w-[140px] truncate`) as the old dynamic
tab did.

Clicking the trigger **opens the menu** (no direct navigation) — confirmed
behavior. To reach the management view the user picks "Scenario List".

### 2. Dropdown content

`DropdownMenuContent` (aligned start under the trigger) contains exactly two
top-level entries:

1. **Scenario List**
   - Icon: `ClipboardList`.
   - `onSelect` → `setModule('scenario')`.
   - Visually marked active when `activeModule === 'scenario'` (e.g. `font-semibold`
     + accent), so the user sees they're already on it.

2. **Scenarios** (`DropdownMenuSub`)
   - `DropdownMenuSubTrigger`: `FlaskConical` icon + label "Scenarios".
   - `DropdownMenuSubContent`: one row per open `scenario-gantt:N` tab, using
     the same filter as today: `openTabs.filter(t => t.startsWith('scenario-gantt:'))`.
     - Row content: scenario **type icon** + **name** (truncated), plus a
       trailing **✕** close affordance shown on hover/focus.
     - Row click (not on ✕) → `setModule(module)`.
     - Active row (`module === activeModule`) is highlighted.
     - ✕ click → `closeTab(module)` **and** `destroyScenarioGanttStore(scenarioId)`,
       and stops propagation so the row's switch handler does not also fire.
   - **Empty state:** when no scenario Gantt tabs are open, render a single
     disabled `DropdownMenuItem` reading **"No open scenarios"** (the submenu
     structure stays stable).

### 3. Removal

Delete the dynamic right-extending tabs block and its leading `NavDivider`
(currently `shell-top-nav.tsx:110-161`). No scenario tab is rendered inline in
the strip anymore; the dropdown is the sole entry point.

### 4. Behavior preserved (no change)

- Opening a scenario still happens from `scenario-toolbar.tsx` `handleOpen()`
  (`setScenarioTabType` + `setModule('scenario-gantt:N')`); the newly opened
  scenario becomes `activeModule`, so the trigger immediately shows its name and
  it appears in the Scenarios submenu. No change to that flow.
- Closing the active scenario delegates to the existing `closeTab` logic in
  `shell-store` for choosing the next active module — unchanged.

## Testids (for Playwright)

| Element | testid |
|---|---|
| Dropdown trigger (the Scenario tab) | `module-nav-scenario` (**kept** from today's button, for test continuity) |
| "Scenario List" item | `scenario-nav-list` |
| "Scenarios" sub-trigger | `scenario-nav-scenarios-sub` |
| Each open-scenario row | `scenario-nav-tab-${module}` (e.g. `scenario-nav-tab-scenario-gantt:6`) |
| Row close button | `scenario-nav-close-${module}` |

Keeping `module-nav-scenario` on the trigger means the ~16 existing
`getByTestId('module-nav-scenario').click()` call sites keep their first line;
they only need the follow-up "Scenario List" click, centralized in a shared
helper.

## Testing

New regression test under `e2e/gantt/` (e.g.
`scenario-nav-dropdown.spec.ts`) covering the multi-step flow:

1. Open a scenario from the Scenario List / detail panel → assert the
   `scenario-nav-dropdown` trigger now shows that scenario's name (not just
   "Scenario").
2. Open the dropdown → open the **Scenarios** submenu → assert the scenario row
   is present (`toContainText` the scenario name, `toHaveCount` as expected).
3. Navigate away (e.g. to Live), reopen the dropdown, click the scenario row →
   assert the scenario Gantt is active again and the trigger shows its name.
4. Open the dropdown → Scenarios submenu → click the row's ✕ → assert the
   scenario is gone from the submenu and the trigger falls back to "Scenario".
5. Empty state: with no scenarios open, assert the Scenarios submenu shows
   "No open scenarios".

Run: `npx playwright test e2e/gantt/scenario-nav-dropdown.spec.ts --reporter=list`
and paste the PASS summary (per §No-Illusion).

### Stale tests (§Stale-Test)

Any existing e2e that depends on the old structure must be rewritten to drive
the dropdown (same intent, new selectors). A shared helper module
`e2e/pages/gantt/scenario-nav.ts` centralizes the new navigation so call sites
change minimally:

- `gotoScenarioList(page)` — click `module-nav-scenario` (opens dropdown) then
  `scenario-nav-list`. Replaces the ~16 bare `getByTestId('module-nav-scenario').click()`
  navigation call sites.
- `switchToOpenScenario(page, module)` — open dropdown → Scenarios sub →
  click `scenario-nav-tab-${module}`. Replaces the 2 inline
  `getByTestId('module-tab-scenario-gantt:N').click()` tab-switch usages.
- `closeOpenScenario(page, module)` — open dropdown → Scenarios sub →
  click `scenario-nav-close-${module}`.

Call sites enumerated during implementation (grep `module-nav-scenario` and
`module-tab-scenario-gantt` across `e2e/`).

## Versioning

Frontend-only change → bump `FRONTEND_VERSION` +1 in `gantt/src/version.ts`.

## Out of scope (§Minimal-First)

- Open-count badge on the Scenario tab.
- Reordering / drag-and-drop of open scenarios.
- Keyboard shortcuts for switching scenarios.
- Any persistence / store schema change (localStorage keys unchanged).

## Constraints honored

- **§Surgical:** only `shell-top-nav.tsx` (+ version + tests) touched; no
  drive-by refactor of the store or sibling nav entries.
- **§Gantt-Unify:** this is shell-level navigation chrome, not Gantt pane
  render/interaction code, so it does not fork the shared Live/Scenario Gantt
  path.
- **Style/Typography standard:** reuse existing nav-tab tokens and
  `SCENARIO_TYPE_*` helpers; no magic font sizes/weights/radii. Run
  `npm run check:ui` before completion.
- **Language:** all UI strings English ("Scenario List", "Scenarios",
  "No open scenarios").
