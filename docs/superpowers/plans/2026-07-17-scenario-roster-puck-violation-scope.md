# Scenario Roster Puck Violation Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict Scenario roster puck violation tooltips to violations related to the hovered puck.

**Architecture:** Keep the existing shared tooltip and Scenario hover event chain. Narrow only the Scenario task-puck aggregation predicate so it matches roster-target and pairing-target violations, while crew-header hover remains crew-wide.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, Playwright.

## Global Constraints

- Scope is only Scenario roster puck tooltip filtering.
- Scenario crew-header bell hover remains crew-wide.
- Pairing pane hover is out of scope.
- No backend, database, legality persistence, or API contract changes.
- Use TDD: write failing tests before production code.

---

### Task 1: Unit Regression

**Files:**
- Modify: `gantt/src/components/gantt/__tests__/violation-tooltip.test.ts`
- Modify: `gantt/src/components/gantt/violation-tooltip.tsx`

**Interfaces:**
- Consumes: `collectViolationTooltipEntriesForTest(input)`
- Produces: task-puck aggregation excludes same-crew Scenario violations unless the violation targets the hovered roster item or its pairing.

- [x] **Step 1: Write the failing test**

Change the Scenario roster puck unit test so it includes a same-crew crew-target violation and expects only the roster-target and pairing-target rules.

- [x] **Step 2: Run RED**

Run: `npm --prefix gantt run test -- src/components/gantt/__tests__/violation-tooltip.test.ts --run`

Expected: FAIL because the current implementation includes the same-crew crew-target rule.

- [x] **Step 3: Implement minimal predicate change**

Remove `v.crewId === taskCrewId` from Scenario task-puck aggregation in `gantt/src/components/gantt/violation-tooltip.tsx`.

- [x] **Step 4: Run GREEN**

Run: `npm --prefix gantt run test -- src/components/gantt/__tests__/violation-tooltip.test.ts --run`

Expected: PASS.

### Task 2: E2E Regression

**Files:**
- Modify: `e2e/tests/gantt/crew-bell-click-popup.spec.ts`

**Interfaces:**
- Consumes: the mocked Scenario 6 roster puck and legality response.
- Produces: browser-level proof that puck hover excludes unrelated same-crew violation text.

- [x] **Step 1: Write the failing E2E assertion**

In `Scenario roster puck hover shows Scenario violation tooltip`, assert the tooltip does not contain `Minimum rest between duties violated`.

- [x] **Step 2: Run RED**

Run from `e2e/`:

```bash
GANTT_API_URL=https://crew-f8-usva-sit.roiscloud.com/live \
VITE_LIVE_TARGET=https://crew-f8-usva-sit.roiscloud.com/live \
GANTT_TEST_USER=Ryan GANTT_TEST_PASS=Our2027 \
npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps \
  tests/gantt/crew-bell-click-popup.spec.ts -g "Scenario roster puck hover" --reporter=list
```

Expected: FAIL because the tooltip currently contains the unrelated rest violation.

- [x] **Step 3: Run GREEN after Task 1 implementation**

Run the same Playwright command.

Expected: PASS.

### Task 3: Final Verification

**Files:**
- Review all touched files.

**Interfaces:**
- Produces: verified branch ready to commit, push, and merge.

- [x] **Step 1: Run typecheck**

Run: `cd gantt && npm exec -- tsc -p tsconfig.json --noEmit`

Expected: PASS.

- [x] **Step 2: Run diff hygiene**

Run: `git diff --check`

Expected: no output.

- [x] **Step 3: Review diff scope**

Run: `git diff --stat`

Expected: touched files limited to the tooltip, focused tests, and docs.
