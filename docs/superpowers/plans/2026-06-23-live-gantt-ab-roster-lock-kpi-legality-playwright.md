# Live Gantt A/B Roster Lock KPI Legality Playwright Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Live Gantt Playwright validation for two concurrent users covering unsaved roster edits, monthly roster lock visibility, lock owner, edit blocking, MCred changes, undo/save propagation, and rule `8002`; then use the Live results to plan the Scenario Gantt mirror.

**Architecture:** Build from the current Live Gantt draft model instead of creating a parallel harness. Add only non-production test hooks where Canvas/store state is otherwise not observable. Keep user-visible functional fixes separate from test-helper work: first prove the gaps, then implement month-lock rendering, edit blocking, assignment driving, candidate discovery, and saved legality propagation.

**Tech Stack:** React 19, Vite, TypeScript, Zustand, Canvas Gantt renderer, Fastify live-server, Redis lock/WebSocket service, Playwright.

## Global Constraints

- Live Gantt first, Scenario Gantt second.
- Use dedicated users `e2e_a` and `e2e_b`, configurable through `GANTT_E2E_USER_A`, `GANTT_E2E_PASS_A`, `GANTT_E2E_USER_B`, and `GANTT_E2E_PASS_B`.
- Do not hardcode crew IDs, pairing IDs, duty IDs, rule thresholds, or airline-specific constants.
- Prefer store-backed test hooks and stable `data-testid` selectors. Use visual/render receipts for Canvas-only requirements.
- The red monthly lock line must span the whole visible roster month, including blank days.
- Saved Live mutations must be cleaned up through supported APIs or isolated test data, never destructive database reset.
- Do not add production dependencies.

---

## Current-Code Gap Audit

This audit is based on the current working tree on 2026-06-23.

### Already Available

- `e2e/tests/gantt/mcred-cross-user-update.spec.ts` already covers part of the A/B deassign story: User A unsaved delete, User A undo, User A save, User B roster/MCred update after save.
- `e2e/utils/gantt-hook.ts` already provides `seedGanttAuth`, `gotoGantt`, `readHook`, `counts`, `rosterObjects`, `pairingObjects`, `flightObjects`, and readiness helpers.
- `gantt/src/utils/gantt-test-hook.ts` already exposes `roster`, `rosterMcred`, `rosterProbeWithCredit`, `selectRosterTasks`, and `liveViolations`.
- `gantt/src/stores/lock-store.ts` already tracks `crew:*` and `pairing:*` locks and receives `lock-acquired`, `lock-released`, `locks-snapshot`, and `roster-updated`.
- `gantt/src/stores/draft-store.ts` already supports always-on draft operations, undo/redo, discard, and commit.
- `gantt/src/utils/save-draft.ts` already runs a before/after rule pre-check before save.
- `live-server/src/routes/draft/draft.ts` already broadcasts `roster-updated` after commit, and the client refetches roster + MCred from that broadcast.

### Gaps To Close

1. **A/B auth gap:** `seedGanttAuth()` uses only global `GANTT_TEST_USER/GANTT_TEST_PASS`, so the suite cannot authenticate two named users without duplicating login logic.
2. **Lock assertion gap:** `window.__ganttTest` does not expose `auth`, `liveLocks`, `crewLock`, `draftState`, or month-lock receipts.
3. **Monthly lock visual gap:** `lock-overlay.ts` only draws task underlines and row-header badges. There is no full-month lock line across blank days.
4. **Edit blocking gap:** `roster-store.ts` draft paths call `acquireLock(...).catch(() => {})` and proceed even when another user owns the lock. This conflicts with the User B “cannot modify locked month” requirement.
5. **Assign-pairing duplication/gap:** assignment placeholder creation is duplicated in `app-layout.tsx` and `pane-container.tsx`, and there is no stable Playwright-visible helper to assign a pairing to a crew without fragile drag geometry.
6. **8002 discovery gap:** no helper can find a Crew Z + pairing candidate that triggers `8002` from loaded data.
7. **Saved legality propagation gap:** User B roster/MCred propagation is clear, but saved `8002` visibility depends on persisted violation paths (`violations.updated` → `violations:updated` → `usePersistedViolations`) and must be proven.
8. **Cleanup gap:** the existing saved deassign test mutates shared data and does not restore the removed roster rows.
9. **Scenario split:** Scenario Gantt uses scenario-level locks and persisted scenario legality, so it should not be implemented until the Live contract is stable.

---

## File Map

- Modify `e2e/utils/gantt-hook.ts`: add per-user auth helper.
- Create `e2e/utils/gantt-ab.ts`: shared A/B page openers and assertions.
- Modify `gantt/src/utils/gantt-test-hook.ts`: expose auth, locks, draft state, assign driver, and month-lock receipts.
- Modify `gantt/src/components/gantt/lock-overlay.ts`: add full-month lock-line drawing primitive.
- Modify `gantt/src/components/gantt/renderers/roster-renderer.ts`: draw month lock lines for locked visible crew rows and publish receipts.
- Modify `gantt/src/components/gantt/source/live-gantt-source.ts`: provide locked crew map to the roster renderer.
- Modify `gantt/src/stores/roster-store.ts`: block draft roster mutations when the target crew is locked by another user.
- Modify `gantt/src/components/layout/app-layout.tsx` and `gantt/src/components/layout/pane-container.tsx`: use shared assign-pairing utility and block assignment to other-user locked crew.
- Create `gantt/src/utils/live-assign-pairing.ts`: shared assign-pairing placeholder and draft operation logic.
- Create `e2e/utils/gantt-8002-candidates.ts`: candidate discovery.
- Create `e2e/utils/gantt-roster-cleanup.ts`: reversible mutation cleanup.
- Modify `e2e/tests/gantt/mcred-cross-user-update.spec.ts`: expand existing deassign suite.
- Create `e2e/tests/gantt/live-ab-lock-gap.spec.ts`, `live-ab-edit-block.spec.ts`, `live-ab-assign-8002-discovery.spec.ts`, and `live-ab-assign-8002.spec.ts`.

---

### Task 1: Per-User A/B Auth Helpers

**Files:**
- Modify: `e2e/utils/gantt-hook.ts`
- Create: `e2e/utils/gantt-ab.ts`
- Modify: `gantt/src/utils/gantt-test-hook.ts`
- Test: `e2e/tests/gantt/live-ab-helper-smoke.spec.ts`

**Interfaces:**
- `seedGanttAuthAs(page, request, userCode, password): Promise<string>`
- `openLiveGanttAs(page, request, creds): Promise<GanttDashboardPage>`
- `mcredFor(page, crewId): Promise<string>`
- `hasPairing(page, crewId, pairingId): Promise<boolean>`
- `window.__ganttTest.auth(): { userCode, userName, schema, isAdmin }`

- [ ] Add a failing smoke test that opens Live Gantt as `e2e_a` and asserts `auth().userCode`.
- [ ] Add `auth()` to `GanttTestApi` and `installGanttTestHook()`.
- [ ] Add `seedGanttAuthAs()` beside `seedGanttAuth()`, reusing the existing API login flow.
- [ ] Add `e2e/utils/gantt-ab.ts` with shared A/B helpers.
- [ ] Run:

```bash
cd e2e
npx playwright test tests/gantt/live-ab-helper-smoke.spec.ts --config=config/playwright.config.ts --project=gantt
```

Expected: PASS when `e2e_a` exists.

---

### Task 2: Lock Introspection and Current Gap Proof

**Files:**
- Modify: `gantt/src/utils/gantt-test-hook.ts`
- Test: `e2e/tests/gantt/live-ab-lock-gap.spec.ts`

**Interfaces:**
- `liveLocks(): Array<{ lockType, lockId, userId, mine }>`
- `crewLock(crewId): { locked, mine, owner }`
- `draftState(): { opCount, dirtyCrewIds, dirtyPairingIds }`
- `monthLockLines(): Array<{ crewId, owner, mine, startIso, endIso, x1, x2 }>`

- [ ] Add a failing test for LG-AB-011: User A unsaved deassign locks Crew X; User B sees owner lock, unchanged roster/MCred, and expects a month-lock receipt.
- [ ] Implement `liveLocks()`, `crewLock()`, and `draftState()` from existing Zustand stores.
- [ ] Implement `monthLockLines()` initially as an empty receipt list to prove the visual gap.
- [ ] Run:

```bash
cd e2e
npx playwright test tests/gantt/live-ab-lock-gap.spec.ts --config=config/playwright.config.ts --project=gantt
```

Expected before Task 3: FAIL only on the missing month-lock line receipt.

---

### Task 3: Full-Month Lock Line Rendering

**Files:**
- Modify: `gantt/src/components/gantt/lock-overlay.ts`
- Modify: `gantt/src/components/gantt/renderers/roster-renderer.ts`
- Modify: `gantt/src/components/gantt/source/live-gantt-source.ts`
- Modify: `gantt/src/utils/gantt-test-hook.ts`
- Test: `e2e/tests/gantt/live-ab-lock-gap.spec.ts`

**Interfaces:**
- `drawMonthLockLine(ctx, x1, x2, rowCenterY, lockType): void`
- `publishMonthLockLines(lines): void`
- `RosterRenderContext.monthLocks: Map<string, { owner: string; mine: boolean }>`

- [ ] Add `drawMonthLockLine()` using the same lock colors as the existing lock overlay.
- [ ] Add non-production receipt storage and `publishMonthLockLines()` to `gantt-test-hook.ts`.
- [ ] Build `monthLocks` in `live-gantt-source.ts` from `useLockStore.locks` for `crew:*` locks.
- [ ] In `renderRosterTasks()`, draw a horizontal month lock line for each visible locked crew row across the current visible roster month.
- [ ] Publish receipts with the drawn `x1/x2`, owner, and crew ID.
- [ ] Re-run `live-ab-lock-gap.spec.ts`.

Expected: PASS and proves the red line spans blank days, not just duty pucks.

---

### Task 4: Block Other-User Locked Edits

**Files:**
- Modify: `gantt/src/stores/roster-store.ts`
- Modify: `gantt/src/components/layout/app-layout.tsx`
- Modify: `gantt/src/components/layout/pane-container.tsx`
- Test: `e2e/tests/gantt/live-ab-edit-block.spec.ts`

**Interfaces:**
- `isCrewLockedByOther(crewId): boolean` local helper in `roster-store.ts`.
- Draft mutations return without adding operations when affected crew is locked by another user.

- [ ] Add a failing LG-AB-012 test: User A locks Crew X; User B attempts delete/modify on Crew X; `draftState().opCount` remains `0`.
- [ ] Add lock checks before draft mutation in `moveTask`, `swapTasks`, `addTask`, `addGroundTask`, `updateTask`, `removeTask`, and `removeTasksByPairingAndCrew`.
- [ ] Add lock checks before assign-pairing in both layout executors.
- [ ] Keep same-user own locks editable.
- [ ] Run:

```bash
cd e2e
npx playwright test tests/gantt/live-ab-edit-block.spec.ts --config=config/playwright.config.ts --project=gantt
```

Expected: PASS.

---

### Task 5: Expand Deassign A/B Coverage and Cleanup

**Files:**
- Modify: `e2e/tests/gantt/mcred-cross-user-update.spec.ts`
- Create: `e2e/utils/gantt-roster-cleanup.ts`

**Coverage:**
- LG-AB-010
- LG-AB-011
- LG-AB-012, locked-month part
- LG-AB-013
- LG-AB-020
- LG-AB-021

- [ ] Refactor existing helpers out of `mcred-cross-user-update.spec.ts` into `gantt-ab.ts`.
- [ ] Add owner/month-line assertions to the unsaved deassign path.
- [ ] Add lock release assertions after undo and save.
- [ ] Add cleanup that captures removed roster rows before save and recreates them if the test mutates shared data.
- [ ] Re-run:

```bash
cd e2e
npx playwright test tests/gantt/mcred-cross-user-update.spec.ts --config=config/playwright.config.ts --project=gantt
```

Expected: PASS and no permanent roster drain from the saved deassign case.

---

### Task 6: Shared Assign-Pairing Driver

**Files:**
- Create: `gantt/src/utils/live-assign-pairing.ts`
- Modify: `gantt/src/components/layout/app-layout.tsx`
- Modify: `gantt/src/components/layout/pane-container.tsx`
- Modify: `gantt/src/utils/gantt-test-hook.ts`
- Test: `e2e/tests/gantt/live-ab-assign-driver.spec.ts`

**Interfaces:**
- `assignLivePairingToCrew(pairingId: number, crewId: string): Promise<boolean>`
- `window.__ganttTest.assignPairingToCrew(pairingId, crewId): Promise<boolean>`

- [ ] Extract the duplicated placeholder-building logic from `app-layout.tsx` and `pane-container.tsx`.
- [ ] Preserve current optimistic MCred behavior by carrying `dutyActCreditedMinutes`.
- [ ] Preserve current pre-check behavior after assignment.
- [ ] Expose a test-only hook that calls the shared helper.
- [ ] Write a driver test that assigns one loaded pairing to a loaded crew, verifies a draft op exists, then undoes it.

Expected: assignment can be driven without fragile cross-pane mouse drag geometry.

---

### Task 7: 8002 Candidate Discovery

**Files:**
- Create: `e2e/utils/gantt-8002-candidates.ts`
- Test: `e2e/tests/gantt/live-ab-assign-8002-discovery.spec.ts`

**Interfaces:**
- `find8002AssignmentCandidate(page): Promise<{ crewId: string; pairingId: number }>`

- [ ] Discover candidate crews and pairings from `roster()`, `rosterMcred()`, and `pairings()` instead of hardcoding IDs.
- [ ] Try assignment through `assignPairingToCrew()`.
- [ ] Poll `liveViolations()` for ruleCode `8002`.
- [ ] Undo after every failed attempt.
- [ ] Throw this exact error if no candidate is found:

```text
No Crew Z + pairing candidate triggered rule 8002 in the loaded Live Gantt data
```

Expected: PASS when a candidate exists; otherwise fail clearly with the candidate-discovery error.

---

### Task 8: Assignment A/B Suite

**Files:**
- Create: `e2e/tests/gantt/live-ab-assign-8002.spec.ts`
- Modify: `e2e/utils/gantt-roster-cleanup.ts`

**Coverage:**
- LG-AB-030
- LG-AB-031
- LG-AB-032, locked-month part
- LG-AB-033
- LG-AB-034

- [ ] User A assigns discovered pairing to Crew Z without saving.
- [ ] Assert User A roster addition, MCred increase, Crew Z lock, and `8002`.
- [ ] Assert User B sees lock owner/month line only: no roster addition, no MCred update, no `8002`.
- [ ] Assert User B cannot edit locked Crew Z month.
- [ ] Undo and assert both users revert to baseline.
- [ ] Redo assignment and save.
- [ ] Assert User B receives saved roster and MCred update without manual reload.
- [ ] Assert User B receives saved `8002`.
- [ ] Cleanup saved assignment rows.

Expected: PASS after Task 9 if saved legality propagation is missing today.

---

### Task 9: Saved Legality Propagation Fix If Needed

**Files:**
- Modify only the boundary proven faulty by Task 8:
  - `live-server/src/routes/draft/draft.ts`
  - `gantt/src/hooks/use-rule-check-ws.ts`
  - `gantt/src/hooks/use-persisted-violations.ts`
  - rule/session persistence code behind `rule-session-api.ts`

**Possible proven failures:**
- Save does not persist the `8002` violation.
- Save persists the violation but does not emit `violations.updated`.
- Client receives the event but groupCode does not match current Gantt group.
- Client refetches persisted violations but not for the affected crew/date window.

- [ ] Run Task 8 first and identify the exact failing boundary.
- [ ] Fix only that boundary.
- [ ] Re-run Task 8.

Expected: User B sees saved `8002` after User A saves, without manual page reload.

---

### Task 10: Other-Unlocked-Month Coverage Decision

**Files:**
- Modify: the relevant Live A/B tests if multi-month data is loaded.
- Or create: `docs/test-cases/gantt/live-ab-unlocked-month-gap.md`

**Reason:** The approved spec requires User B cannot edit the locked month but can edit another unlocked month. Current default Live opening appears month-oriented. If only one month is loaded, this assertion needs deliberate multi-month setup.

- [ ] Check whether the current Live Gantt test setup loads at least two months.
- [ ] If yes, add the other-month edit assertion.
- [ ] If no, document the setup gap and keep the locked-month blocking test active.

Expected: No vague skip; either covered or explicitly documented.

---

### Task 11: Scenario Follow-Up Plan

**Files:**
- Create: `docs/superpowers/plans/2026-06-23-scenario-gantt-ab-roster-lock-kpi-legality-playwright.md`

- [ ] Write the Scenario plan only after Live tests pass.
- [ ] Map `LG-AB-*` cases to `SG-AB-*`.
- [ ] Document Scenario differences: scenario-level edit lock, persisted scenario legality, scenario save path, and scenario-specific cleanup.

---

## Verification

Run targeted tests after each task. Final Live verification:

```bash
cd e2e
npx playwright test \
  tests/gantt/live-ab-helper-smoke.spec.ts \
  tests/gantt/live-ab-lock-gap.spec.ts \
  tests/gantt/live-ab-edit-block.spec.ts \
  tests/gantt/mcred-cross-user-update.spec.ts \
  tests/gantt/live-ab-assign-driver.spec.ts \
  tests/gantt/live-ab-assign-8002-discovery.spec.ts \
  tests/gantt/live-ab-assign-8002.spec.ts \
  --config=config/playwright.config.ts \
  --project=gantt
```

Expected final result: all Live A/B tests pass; saved mutations are restored or isolated; Scenario follow-up has a separate plan.

