# Scenario Roster Puck Violation Hover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the shared Rule Violations tooltip when hovering a Scenario roster puck with persisted legality violations.

**Architecture:** Reuse the shared `ViolationTooltip` and shared hover state. The Scenario roster source writes hovered task ids into `useGanttViewStore`; the tooltip aggregation helper resolves Scenario roster items and matches Scenario violations against the hovered task.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, Playwright.

## Global Constraints

- Scope is only Scenario roster puck hover; do not implement Pairing pane hover.
- Keep Live tooltip behavior and Scenario crew-header bell hover unchanged.
- No backend/API/database schema changes.
- Use TDD: write failing test, run RED, implement, run GREEN.
- Do not include database passwords or tokens in docs or code.

---

### Task 1: Unit Regression for Scenario Task-Puck Aggregation

**Files:**
- Modify: `gantt/src/components/gantt/__tests__/violation-tooltip.test.ts`
- Modify: `gantt/src/components/gantt/violation-tooltip.tsx`

**Interfaces:**
- Consumes: `collectViolationTooltipEntriesForTest(input)`
- Produces: aggregation behavior where a Scenario hovered roster task includes exact roster, pairing, and crew-owned persisted violations.

- [x] **Step 1: Write the failing test**

Add a test that passes `hoveredTaskId`, `scenarioViolations`, and one matching `RosterItem`. Assert entries include rule codes from roster-target, pairing-target, and crew-owned violations.

- [x] **Step 2: Run test to verify it fails**

Run: `npm --prefix gantt run test -- src/components/gantt/__tests__/violation-tooltip.test.ts --run`

Expected: FAIL because task-puck mode ignores `scenarioViolations`.

- [x] **Step 3: Write minimal implementation**

Extend `collectViolationTooltipEntries` task-puck mode to inspect `scenarioViolations` when provided. A Scenario violation applies when it targets the hovered roster task, targets the hovered task's pairing, or has the same `crewId`.

- [x] **Step 4: Run test to verify it passes**

Run: `npm --prefix gantt run test -- src/components/gantt/__tests__/violation-tooltip.test.ts --run`

Expected: PASS.

### Task 2: Wire Scenario Roster Hover State

**Files:**
- Modify: `gantt/src/components/gantt/source/scenario-gantt-source.ts`
- Modify: `gantt/src/components/gantt/violation-tooltip.tsx`

**Interfaces:**
- Consumes: `useGanttViewStore.getState().setHoveredTask(taskId, clientX, clientY)`
- Produces: Scenario roster puck hover drives the same shared tooltip state as Live.

- [x] **Step 1: Write/extend E2E coverage**

Extend `e2e/tests/gantt/crew-bell-click-popup.spec.ts` mocked Scenario data with one assigned pairing roster puck for `C0001`. Hover the puck and assert the tooltip contains `8002/001` and the violation message.

- [x] **Step 2: Run E2E to verify it fails**

Run from `e2e/`:

```bash
GANTT_API_URL=https://crew-f8-usva-sit.roiscloud.com/live \
VITE_LIVE_TARGET=https://crew-f8-usva-sit.roiscloud.com/live \
GANTT_TEST_USER=Ryan GANTT_TEST_PASS=Our2027 \
npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps \
  tests/gantt/crew-bell-click-popup.spec.ts -g "Scenario roster puck hover" --reporter=list
```

Expected: FAIL because hovering the Scenario roster puck does not set `hoveredTaskId`.

- [x] **Step 3: Write minimal implementation**

In Scenario roster `onItemHover`, call `setHoveredTask(hit.itemId, clientX, clientY)` when a roster item exists and `setHoveredTask(null, clientX, clientY)` when the hover has no task. Keep status-bar text unchanged.

In `ViolationTooltip`, provide Scenario roster items to the aggregation helper when `scenarioId` is present.

- [x] **Step 4: Run E2E to verify it passes**

Run the same focused Playwright command.

Expected: PASS.

### Task 3: Final Verification and Diff Review

**Files:**
- Review all touched files.

**Interfaces:**
- Produces: verified branch ready for commit/push decision.

- [x] **Step 1: Run focused unit test**

Run: `npm --prefix gantt run test -- src/components/gantt/__tests__/violation-tooltip.test.ts --run`

Expected: PASS.

- [x] **Step 2: Run typecheck**

Run: `npm --prefix gantt exec -- tsc -p tsconfig.json --noEmit`

Expected: PASS.

- [x] **Step 3: Run diff hygiene**

Run: `git diff --check`

Expected: no output.

- [x] **Step 4: Inspect git diff**

Run: `git diff --stat` and inspect changed files for scope creep. Expected files are the spec, plan, tooltip, scenario source, and focused tests.
