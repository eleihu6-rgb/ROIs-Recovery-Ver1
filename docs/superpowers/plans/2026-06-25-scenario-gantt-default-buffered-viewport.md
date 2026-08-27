# Scenario Gantt Default Buffered Viewport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open Scenario Gantt with a default viewport from scenario definition start minus 5 days through scenario definition end plus 5 days, without changing Live Gantt defaults.

**Architecture:** Keep the change frontend-only and scenario-only. Add a Playwright regression first, then update `ScenarioGanttView` first-load zoom math to compute a buffered calendar window while leaving full canvas range bounds on `strDtLoc` / `endDtLoc`.

**Tech Stack:** React 19, Zustand, Canvas Gantt, Playwright, TypeScript.

## Global Constraints

- Do not change Live Gantt default date range behavior.
- Use `scenarioStrDt` / `scenarioEndDt` for the default Scenario Gantt opening viewport.
- Keep full canvas range on `strDtLoc` / `endDtLoc`.
- Frontend runtime changes increment `FRONTEND_VERSION`.
- UI behavior changes require Playwright coverage.

---

### Task 1: Add Scenario Default Viewport Regression

**Files:**
- Create: `e2e/tests/gantt/scenario-gantt-default-viewport.spec.ts`

**Interfaces:**
- Consumes: `seedScenarioListMocks(page, id, name)` from `e2e/utils/gantt-hook.ts`
- Consumes: `window.__ganttTest!.scenarioZoom(id)` from `gantt/src/utils/gantt-test-hook.ts`
- Produces: a failing Playwright test that expects a 40-day buffered viewport for a June 1-30 scenario.

- [ ] **Step 1: Write the failing test**

Create a Playwright test that mocks `/api/scenario/:id/gantt-data`, opens the scenario, reads `scenarioZoom`, computes viewport start from `scrollX / pxPerHour`, and computes visible days from measured viewport width divided by `pxPerHour`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd e2e && npx playwright test tests/gantt/scenario-gantt-default-viewport.spec.ts --config=config/playwright.config.ts --project=gantt`

Expected before production change: FAIL because visible days are about 30, not 40.

### Task 2: Implement Buffered First-Load Viewport

**Files:**
- Modify: `gantt/src/components/shell/scenario-gantt-view.tsx`
- Modify: `gantt/src/version.ts`

**Interfaces:**
- Produces: `SCENARIO_DEFAULT_VIEWPORT_BUFFER_DAYS = 5`
- Uses: `calendarDateToUtcMidnight(date, timezone)` for timezone-aware day boundaries.

- [ ] **Step 1: Update first-load zoom math**

In `ScenarioGanttView`, subtract five UTC calendar days from the scenario start date before conversion, add six UTC calendar days to the scenario end date before conversion, and fit that buffered exclusive range into the scenario viewport.

- [ ] **Step 2: Increment frontend version**

Increment `FRONTEND_VERSION` by one and update its comment to mention the scenario buffered default viewport.

- [ ] **Step 3: Run regression**

Run: `cd e2e && npx playwright test tests/gantt/scenario-gantt-default-viewport.spec.ts --config=config/playwright.config.ts --project=gantt`

Expected after production change: PASS.

### Task 3: Verify Focused Frontend Health

**Files:**
- No additional source changes unless verification exposes a touched-area failure.

**Interfaces:**
- Consumes: repository frontend checks.
- Produces: verification evidence for completion.

- [ ] **Step 1: Run TypeScript check**

Run: `cd gantt && npx tsc --noEmit`

Expected: exit code 0.

- [ ] **Step 2: Run UI standard gate**

Run: `npm run check:ui`

Expected: zero hard violations.

- [ ] **Step 3: Review diff**

Run: `git diff -- gantt/src/components/shell/scenario-gantt-view.tsx gantt/src/version.ts e2e/tests/gantt/scenario-gantt-default-viewport.spec.ts docs/superpowers/specs/2026-06-25-scenario-gantt-default-buffered-viewport-design.md docs/superpowers/plans/2026-06-25-scenario-gantt-default-buffered-viewport.md`

Expected: diff only contains scoped scenario viewport, test, docs, and version changes.

## Self-Review

- Spec coverage: Task 1 covers Playwright behavior, Task 2 covers scenario-only implementation and version bump, Task 3 covers verification gates.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: the plan uses existing `ScenarioGanttView`, `calendarDateToUtcMidnight`, and `scenarioZoom` interfaces.
