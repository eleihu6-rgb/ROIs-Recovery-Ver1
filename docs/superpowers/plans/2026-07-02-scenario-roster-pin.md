# Scenario Roster Pin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) superpowers:executing-plans implement plan task-by-task. Steps use checkbox (`- [ ]`) syntax tracking.

**Goal:** Add Scenario Roster crew-row pinning so selected crew rows can be pinned and unpinned from the Scenario context menu, mirroring Live's view-only pin workflow.

**Architecture:** Keep rendering in the existing shared frozen-row pipeline. Add minimal source/store-backed commands for Scenario roster frozen crew ids and expose them through `ScenarioContextMenu`. Preserve Live behavior and avoid broad context-menu unification.

**Tech Stack:** React 19, TypeScript, Zustand, Vite, Playwright/Vitest as available, Canvas Gantt shared pane architecture.

## Global Constraints

- Follow §Gantt-Unify: common Gantt behavior belongs in shared/source-backed paths, not duplicate UI forks.
- Pinning is view-only; do not create backend writes, draft ops, scenario patches, or optimizer changes.
- Preserve existing dirty worktree changes.
- Use TDD: write and run a failing regression test before production code.
- Frontend runtime changes must bump `gantt/src/version.ts`.
- Run `npm run check:ui` after UI changes.

---

### Task 1: Add Scenario Pin Regression Coverage

**Files:**
- Modify or create: `gantt/src/components/scenario-gantt/__tests__/scenario-context-menu.test.tsx` or nearest existing scenario context menu test.
- Reference: `gantt/src/components/scenario-gantt/scenario-context-menu.tsx`
- Reference: `gantt/src/stores/scenario-layout-store.ts`

**Interfaces:**
- Consumes: `useUiStore.openContextMenu(x, y, task, 'scenario-roster', rowIndex, scenarioId)`
- Consumes: `getPaneStore(scenarioId).getState().selectRow('scenario-roster', crewId)`
- Consumes: `getScenarioLayoutStore(scenarioId).getState().panes.get('roster-1')`
- Produces: failing test proving Scenario menu exposes pin and unpin actions.

- [ ] **Step 1: Write failing test**

Create a test that:

```ts
it('pins and unpins selected scenario roster crew rows from the context menu', async () => {
  const scenarioId = 2045
  getPaneStore(scenarioId).getState().selectRow('scenario-roster', '295')
  useUiStore.getState().openContextMenu(
    80,
    80,
    { id: -1, crewId: '295', pairingId: null } as never,
    'scenario-roster',
    0,
    scenarioId,
  )

  render(<ScenarioContextMenu />)

  await userEvent.click(screen.getByRole('button', { name: /Pin 1 Selected Row/i }))
  expect(getScenarioLayoutStore(scenarioId).getState().panes.get('roster-1')?.frozenCrewIds).toEqual(['295'])

  useUiStore.getState().openContextMenu(
    80,
    80,
    { id: -1, crewId: '295', pairingId: null } as never,
    'scenario-roster',
    0,
    scenarioId,
  )
  await userEvent.click(screen.getByRole('button', { name: /Unpin All \(1\)/i }))
  expect(getScenarioLayoutStore(scenarioId).getState().panes.get('roster-1')?.frozenCrewIds).toEqual([])
})
```

- [ ] **Step 2: Run test verify fails**

Run the smallest matching test command available in `gantt/package.json`, scoped to the new/modified test file. Expected: FAIL because Scenario menu does not expose the pin button yet.

### Task 2: Implement Scenario Roster Pin Commands

**Files:**
- Modify: `gantt/src/components/scenario-gantt/scenario-context-menu.tsx`
- Modify if needed: `gantt/src/components/gantt/source/gantt-pane-source.ts`
- Modify if needed: `gantt/src/components/gantt/source/scenario-gantt-source.ts`
- Modify if needed: `gantt/src/components/gantt/source/live-gantt-source.ts`
- Modify: `gantt/src/version.ts`

**Interfaces:**
- Consumes: `getPaneStore(scenarioId)` selected row ids for `scenario-roster`.
- Consumes: `getScenarioLayoutStore(scenarioId)` frozen crew ids for the roster pane.
- Produces: Scenario context menu actions `Pin N Selected Rows` and `Unpin All (N)`.

- [ ] **Step 1: Inspect current diffs before editing**

Run:

```bash
git diff -- gantt/src/components/gantt/source/live-gantt-source.ts \
  gantt/src/components/gantt/source/scenario-gantt-source.ts \
  gantt/src/components/scenario-gantt/scenario-context-menu.tsx \
  gantt/src/version.ts
```

Do not overwrite unrelated existing changes.

- [ ] **Step 2: Run graph impact checks**

Use codebase graph tracing for symbols to edit:

```text
trace_path(function_name="ScenarioContextMenu", direction="inbound", risk_labels=true)
trace_path(function_name="makeScenarioRosterPaneSource", direction="inbound", risk_labels=true)
```

If HIGH or CRITICAL risk appears, report it before editing.

- [ ] **Step 3: Add minimal implementation**

Implement helper logic equivalent to:

```ts
const rosterPaneId = getScenarioLayoutStore(scenarioId).getState().findPaneIdByType('roster')
const selectedRows = getPaneStore(scenarioId).getState().getSelectedRowIds('scenario-roster')
const frozenRows = rosterPaneId
  ? getScenarioLayoutStore(scenarioId).getState().panes.get(rosterPaneId)?.frozenCrewIds ?? []
  : []

const pinSelectedScenarioRows = () => {
  if (!rosterPaneId || selectedRows.length === 0) return
  const existing = new Set(frozenRows)
  getScenarioLayoutStore(scenarioId).getState().setFrozenCrewIds(
    rosterPaneId,
    [...frozenRows, ...selectedRows.filter((id) => !existing.has(id))],
  )
  getPaneStore(scenarioId).getState().clearRowSelection('scenario-roster')
  getScenarioLayoutStore(scenarioId).getState().setScrollY(rosterPaneId, 0)
  closeContextMenu()
}
```

Use the actual store API names from the codebase.

- [ ] **Step 4: Bump frontend version**

Increment `FRONTEND_VERSION` in `gantt/src/version.ts` by 1.

- [ ] **Step 5: Run focused test verify passes**

Run the same test command from Task 1. Expected: PASS.

### Task 3: Verify Touched Area

**Files:**
- Test: focused Scenario context menu regression test.
- Test: existing Scenario roster/shared canvas touched-area test if runtime allows.

- [ ] **Step 1: Run UI standard check**

Run:

```bash
npm run check:ui
```

Expected: PASS with zero hard violations.

- [ ] **Step 2: Run relevant Scenario Gantt test**

Run the smallest available existing Scenario Gantt test that exercises shared roster rendering or context menu behavior. Expected: PASS, or report blocker and residual risk.

- [ ] **Step 3: Run change impact detection**

Run:

```text
detect_changes(project="Users-kimi-Library-Mobile-Documents-com-apple-CloudDocs-DevOps-ROIs-Crew-Ver4-PBS", scope="compare", base_branch="main")
```

Review affected symbols and confirm scope is expected.

- [ ] **Step 4: Update Gantt playbook if the implementation adds a new durable lesson**

If the final implementation confirms a reusable pattern for Scenario view-only row actions, update `docs/modules/gantt/live-scenario-gantt-playbook.md`.
