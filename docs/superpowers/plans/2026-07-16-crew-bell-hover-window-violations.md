# Crew Bell Hover Window Violations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Live crew row bell hover show the same crew-scoped persisted violations as the clicked per-crew popup, including window-overlap 8002 rows whose anchor pairing is outside the opened month.

**Architecture:** Extract the tooltip violation collection into a pure helper in `violation-tooltip.tsx`. In crew-header mode, add all non-passed `displayViolations` matching the hovered `crewId` before scanning visible roster items, relying on the existing dedup key to avoid duplicate visible-pairing rows.

**Tech Stack:** React 19, TypeScript, Zustand stores, Vitest.

## Global Constraints

- Keep the fix surgical and shared where behavior is common.
- Do not change backend violation persistence or `/api/violations`.
- Do not attach cross-window 8002 to a visible June task puck.
- Write the regression test before implementation.
- GitNexus impact/detect should run when available; if unavailable, report the exact blocker.

---

### Task 1: Tooltip Crew-Scoped Aggregation

**Files:**
- Modify: `gantt/src/components/gantt/violation-tooltip.tsx`
- Create: `gantt/src/components/gantt/__tests__/violation-tooltip.test.ts`

**Interfaces:**
- Produces: `collectViolationTooltipEntriesForTest(input)` exported from `violation-tooltip.tsx` for focused tests.
- Consumes: `DisplayViolation[]` from `useSessionViolationStore.displayViolations` and `RosterItem[]` from `useRosterStore.main.rosterItems`.

- [ ] **Step 1: Write the failing test**

Create `gantt/src/components/gantt/__tests__/violation-tooltip.test.ts` with a test where crew `2380` has one visible June pairing violation and one cross-window `8002` stored under July pairing id `13429`; assert crew-hover collection includes both.

- [ ] **Step 2: Run the test to verify RED**

Run: `npm --prefix gantt run test -- src/components/gantt/__tests__/violation-tooltip.test.ts --run`

Expected: FAIL because the helper does not exist yet or because `8002` is not included.

- [ ] **Step 3: Implement minimal code**

Extract the current `useMemo` aggregation logic into a helper and add a crew-mode pass over all `displayViolations` where `v.crewId === hoveredCrewId`.

- [ ] **Step 4: Run focused tests**

Run: `npm --prefix gantt run test -- src/components/gantt/__tests__/violation-tooltip.test.ts --run`

Expected: PASS.

- [ ] **Step 5: Run broader touched-area verification**

Run: `npm --prefix gantt run test -- src/components/gantt/source/__tests__/violation-window-severity.test.ts src/components/gantt/source/__tests__/live-violation-attribution.test.ts src/components/gantt/__tests__/violation-tooltip.test.ts --run`

Expected: PASS.

- [ ] **Step 6: Review diff and commit**

Run: `git diff --stat` and `git diff --check`.

Commit message: `fix: include crew window violations in bell hover`
