# Scenario Lock State Changes Without Success Toast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stop showing success toasts when a Scenario Gantt user acquires or releases the edit lock while preserving the `Viewing` / `Editing` transitions and all failure feedback.

**Architecture:** Keep the existing Scenario Gantt toolbar and API unchanged. Change only the successful branches of the per-scenario Zustand store's `acquireLock` and `releaseLock` actions, then verify the state transitions at the store level and through the real toolbar interaction.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, Playwright, Vite.

## Global Constraints

- Keep the smallest real solution and preserve existing Live/Scenario architecture.
- Do not change the Scenario lock API contract or toolbar markup.
- Preserve error notifications for lock contention and request failures.
- UI behavior changes require real Playwright coverage.
- Run `npm run check:ui` after frontend changes.
- Do not modify unrelated untracked files such as `TERAX.md`.

## File Map

- Modify: `gantt/src/stores/scenario-gantt-store.ts` — remove only the successful lock-acquisition and lock-release toasts.
- Modify: `gantt/src/stores/__tests__/scenario-gantt-store.test.ts` — mock the lock API/notifications and assert the successful branches update state without success notifications.
- Modify: `e2e/tests/gantt/scenario-gantt-edit.spec.ts` — assert real lock acquire/release clicks change toolbar state without rendering success toasts.
- Modify: `e2e/tests/gantt/scenario-roster-edit.spec.ts` — exercise the same real lock buttons through the deterministic mocked Scenario flow and assert the toasts stay absent.

### Task 1: Add the failing store regression test

**Files:**
- Modify: `gantt/src/stores/__tests__/scenario-gantt-store.test.ts`

- [ ] Mock `scenarioGanttApi.acquireLock`, `scenarioGanttApi.getLockStatus`, and `@/utils/notify` in the focused store test.
- [ ] Add a test that resolves acquisition with `{ acquired: true }`, returns an owner lock status, calls `store.getState().acquireLock(scenarioId)`, expects `isOwner` to be true and `acquiringLock` to be false, and expects `notify.success` not to have been called.
- [ ] Run the focused test and confirm it fails because the current implementation calls `notify.success('Edit lock acquired')`.

Run:

```bash
cd gantt && npm test -- src/stores/__tests__/scenario-gantt-store.test.ts
```

Expected: the new test fails only on the unexpected success notification.

### Task 2: Implement the minimal behavior change

**Files:**
- Modify: `gantt/src/stores/scenario-gantt-store.ts:129-142`

- [ ] Delete only `notify.success('Edit lock acquired')` from the `result.acquired` branch.
- [ ] Leave the API calls, `set({ lockStatus, acquiringLock: false })`, lock contention error, request error, and release-lock notification unchanged.

The resulting success branch must remain equivalent to:

```ts
if (result.acquired) {
  const status = await scenarioGanttApi.getLockStatus(scenarioId)
  set({ lockStatus: status, acquiringLock: false })
}
```

- [ ] Re-run the focused Vitest test and confirm it passes.

### Task 3: Add the release-lock no-toast regression

**Files:**
- Modify: `gantt/src/stores/__tests__/scenario-gantt-store.test.ts`
- Modify: `gantt/src/stores/scenario-gantt-store.ts:147-155`

- [ ] Add a store test that starts from an owned dirty lock state, resolves `scenarioGanttApi.releaseLock`, calls `store.getState().releaseLock(scenarioId)`, expects the lock state to become read-only, pending edit state to clear, and `notify.success` not to be called.
- [ ] Run the focused test and confirm it fails because the current implementation calls `notify.success('Edit lock released')`.
- [ ] Delete only `notify.success('Edit lock released')` from the successful `releaseLock` branch.
- [ ] Re-run the focused Vitest test and confirm it passes.

### Task 4: Add the real UI regression assertion

**Files:**
- Modify: `e2e/tests/gantt/scenario-gantt-edit.spec.ts`
- Modify: `e2e/tests/gantt/scenario-roster-edit.spec.ts`

- [ ] After clicking `sg-acquire-lock-btn`, assert `sg-release-lock-btn` becomes visible as the existing edit-state proof.
- [ ] Assert the shell toast container does not contain `Edit lock acquired` after the transition.
- [ ] After clicking `sg-release-lock-btn`, assert `sg-acquire-lock-btn` becomes visible again.
- [ ] Assert the shell toast container does not contain `Edit lock released` after the transition.
- [ ] Keep the existing save/remove/release assertions intact so the test still proves the lock transition remains functional.
- [ ] Keep acquire and release assertions in the deterministic `scenario-roster-edit.spec.ts` flow so the regression can run without requiring a remote DONE scenario or engine-server output.

The assertion should use the existing toast DOM contract used by the app's shell rather than mocking the notification utility.

### Task 5: Verify affected scope

- [ ] Run the focused Vitest store test.
- [ ] Run the Gantt TypeScript check.
- [ ] Run `npm run check:ui` from the repository root.
- [ ] Run the focused Scenario Playwright lock/edit test with the repository's configured Playwright command and report any environment blocker.
- [ ] Run GitNexus `detect_changes()` before any commit; if the MCP is unavailable, report that limitation and use `git diff --check` plus the exact changed-file diff as fallback.

Expected result: Scenario lock acquire/release changes only the Scenario store success-notification behavior and the associated regression coverage; no Live behavior changes.
