# Playwright UI Regression Enhancement Ver1

**Created**: 2026-06-13 23:17:33 America/Vancouver  
**Scope**: existing Playwright UI regression tests only (`e2e/tests/**`)  
**Audience**: next AI coder improving UI regression coverage and assertion strength  
**Status**: implementation backlog, no code changes applied in this pass

## Executive Summary

The current Playwright suite is strongest in Gantt and much thinner in PBS Portal / PBS App. Gantt already has good no-illusion helpers and several strong workflow tests, but coverage is uneven: many tests prove one isolated UI behavior, while high-value user journeys still need multi-step action chains with state assertions.

Ignore AI-generation support in this task. Do not modify `ai-server` regression generation, prompts, or validation. Focus only on hand-authored Playwright tests currently used by AI coders as examples and regression protection.

Highest-value work:

1. Add a strict Playwright case standard so future AI coders write workflow-level tests, not page-open smoke checks.
2. Strengthen critical Gantt workflows: open Gantt -> assign/edit/navigate -> verify business state.
3. Expand PBS Portal E2E coverage beyond auth/navigation into bidding workflows.
4. Add coverage inventory docs so missing function areas are visible before coding.
5. Add reusable page-object/test-helper methods for high-risk workflows to keep future cases consistent.

Current E2E distribution from `e2e/tests/**`:

| Area | Approx. spec files | Current risk |
|---|---:|---|
| Gantt | 101 | Medium: broad coverage, but workflow depth uneven |
| PBS Portal | 3 | High: only auth/navigation smoke coverage |
| PBS App | 1 | High: only minimal home/schedule checks |
| Perf | 1 | Low/medium: separate from UI workflow coverage |

## Priority Matrix

| Rank | Item | Potential Enhance | Quick Window | Risk |
|---:|---|---|---|---|
| 1 | Regression case standard and inventory | Very high for all future AI-written cases | Small | Low |
| 2 | Gantt assignment/edit workflow tests | Very high for catching broken core scheduling functions | Medium | Medium |
| 3 | Gantt flight/pairing/crew navigation workflows | High for real user task coverage | Medium | Medium |
| 4 | PBS Portal bidding workflow E2E | Very high because current coverage is thin | Large | Medium |
| 5 | PBS App workflow E2E | High for mobile regressions | Medium/Large | Medium |
| 6 | Page-object/helper consolidation | Medium-high for future case quality | Medium | Low |
| 7 | Evidence and diagnostics in existing tests | Medium for debugging and trust | Small/Medium | Low |
| 8 | CI grouping and tags | Medium for fast feedback | Small | Low |

## Non-Goals

- Do not change AI-generated test support, prompts, apply gates, or `ai-server`.
- Do not add or change product functionality.
- Do not rewrite the whole Playwright suite.
- Do not replace existing good single-function tests; strengthen them only where they are shallow or duplicate a better helper.
- Do not add brittle pixel-coordinate assertions unless testing Canvas hit behavior and no test hook exists.

## Required Playwright Case Standard

Apply this standard to every new or strengthened UI regression case.

### Case Levels

| Level | Purpose | Minimum proof |
|---|---|---|
| Smoke | Route/app shell loads | Page visible plus one route/session assertion |
| Functional | One feature works | Precondition -> action -> measured business assertion |
| Workflow | Real user task chain works | 3+ actions, intermediate assertions, final persisted/store/API proof |

### Minimum Rules

- Every functional/workflow test must have a clear oracle that would fail if the function is broken.
- Visibility alone is not enough. Pair `toBeVisible()` with data, count, URL, store, API, text, or persisted-state assertions.
- For Gantt Canvas content, prefer `window.__ganttTest` through `e2e/utils/gantt-hook.ts`.
- Tests should use data-driven selection when possible instead of hardcoded values that may disappear from test data.
- Every workflow test should assert intermediate state after each major user action.
- If a case mutates data, it must clean up or use a unique test-owned record.
- Add `@smoke` only to fast, high-value checks suitable for quick health runs.
- Add `@workflow` to multi-step user journeys once the tag is introduced.
- Avoid `waitForTimeout`; use `expect.poll`, `toPass`, URL waits, network response waits, or app test hooks.

### Recommended Test Shape

```ts
test('Live-XXXX — user workflow description @workflow', async ({ page, request }) => {
  // 1. Auth + open the real app state.
  // 2. Capture baseline from UI/store/API.
  // 3. Perform first user action.
  // 4. Assert immediate UI response.
  // 5. Perform second/third action.
  // 6. Assert business state changed.
  // 7. Reload or refetch where persistence matters.
  // 8. Clean up mutations.
})
```

## 1. Regression Case Inventory and Gap Map

**Potential enhance**: Very high. Prevents AI coders from adding random tests while leaving core workflows uncovered.

**Quick window**: Small.

**Target files**:

- New: `docs/test-cases/ui-regression/2026-06-13-playwright-coverage-inventory.md`
- Existing source to inspect:
  - `e2e/tests/gantt/*.spec.ts`
  - `e2e/tests/gantt/help/*.spec.ts`
  - `e2e/tests/pbs-portal/*.spec.ts`
  - `e2e/tests/pbs-app/*.spec.ts`

**Implementation direction**:

Create an inventory table with one row per major user-facing function:

| Module | Function | Existing spec(s) | Current level | Gap | Priority |
|---|---|---|---|---|---|
| Gantt | Open Live and load panes | `pane-auto-load`, `live-full-load` | Functional | Add workflow with filter + navigation | P1 |
| Gantt | Assign crew/pairing | `pairing-composition-fill` | Functional/API-heavy | Add user workflow assign/remove | P0 |
| Gantt | Flight info and navigation | `flight-pane`, `flight-navi`, `find-by-flight` | Functional | Add end-to-end flight -> pairing -> detail chain | P1 |
| PBS Portal | Pairing bid | none in E2E | Missing | Add add/edit/delete/reload workflow | P0 |
| PBS Portal | Days Off bid | none in E2E | Missing | Add add/delete/reload workflow | P0 |
| PBS App | Schedule detail | `home.spec.ts` | Smoke | Assert real detail content | P1 |

**Action details**:

1. Read all spec names and test titles.
2. Group them by feature area.
3. Mark each as `Smoke`, `Functional`, or `Workflow`.
4. Identify every navigation tab or business function with no E2E.
5. Prioritize missing workflows that can break while current smoke tests still pass.

**Verification**:

- The document exists under `docs/test-cases/ui-regression/`.
- It lists Gantt, PBS Portal, and PBS App.
- It clearly names P0/P1 gaps for next implementation.

## 2. Gantt Assignment/Edit Workflow Tests

**Potential enhance**: Very high. This directly addresses the problem: tests can pass while assignment functionality is broken.

**Quick window**: Medium.

**Target files**:

- `e2e/tests/gantt/pairing-composition-fill.spec.ts`
- `e2e/tests/gantt/scenario-gantt-edit.spec.ts`
- New candidate: `e2e/tests/gantt/assignment-workflow.spec.ts`
- Helpers:
  - `e2e/utils/gantt-hook.ts`
  - `e2e/pages/gantt/gantt-dashboard-page.ts`

**Current observed pattern**:

- There is already a useful assignment-related test, `pairing-composition-fill.spec.ts`.
- There is scenario edit coverage in `scenario-gantt-edit.spec.ts`.
- The suite still needs a realistic user action chain: open Gantt, select real crew/pairing, perform assignment or removal, verify the UI/store/API result, then reverse/clean up.

**Implementation direction**:

Add or strengthen tests around these workflows:

### Workflow A: Pairing Assign Then Remove

Required steps:

1. Seed Gantt auth.
2. Open Live Gantt and wait for readiness.
3. Capture a pairing with an available/open composition slot.
4. Capture baseline fill/composition for that pairing.
5. Assign a valid crew member through the real UI if possible.
6. Assert:
   - pairing fill increased by 1 or expected slot is now filled
   - roster contains the new pairing assignment for that crew
   - Pairing Info shows the assigned crew
7. Remove/unassign the test assignment.
8. Assert fill and roster state return to baseline.

Fallback if the UI lacks a stable control:

- Use API only for setup/cleanup, but the user-facing assertion must be through the UI and `window.__ganttTest`.
- Add TODO in the test title/comment for missing UI locator support.

### Workflow B: Scenario Gantt Remove, Save, Reload

Required steps:

1. Create or find a DONE scenario with output.
2. Open Scenario Gantt.
3. Acquire edit lock.
4. Remove one pairing bar through the real interaction.
5. Save.
6. Reload the scenario view.
7. Assert the removed assignment remains absent after reload.
8. Release lock and delete test scenario.

Strengthen existing `scenario-gantt-edit.spec.ts` if it only proves save button state and not persistence after reload.

**Verification**:

Run targeted tests:

```bash
cd e2e
npm run test:gantt -- assignment-workflow.spec.ts
npm run test:gantt -- scenario-gantt-edit.spec.ts
```

Run related smoke:

```bash
cd e2e
npm run test:gantt -- --grep "pairing|roster|scenario gantt"
```

**Caution**:

- Assignment tests mutate sensitive scheduling data. Use unique test-owned records or fully reversible operations.
- Avoid depending on a specific crew id unless selected dynamically from current data.

## 3. Gantt Flight -> Pairing -> Crew Navigation Workflow

**Potential enhance**: High. Users often start from a flight, then inspect related pairings or crew. Current tests cover pieces, but the full task chain should be explicit.

**Quick window**: Medium.

**Target files**:

- `e2e/tests/gantt/flight-pane.spec.ts`
- `e2e/tests/gantt/flight-navi.spec.ts`
- `e2e/tests/gantt/find-by-flight.spec.ts`
- New candidate: `e2e/tests/gantt/flight-inspection-workflow.spec.ts`

**Implementation direction**:

Add a workflow test:

1. Open Gantt.
2. Add Flight pane.
3. Choose a real visible flight from `flightObjects(page)` or Flight Navi table.
4. Open Flight Detail.
5. Assert exact flight identity:
   - flight number
   - dep/arr airport
   - date/time or status line
6. Click PTNs / Find Pairing by Flight.
7. Assert related pairing floats to top of Pairing pane using `foundIds` or `pairingPanelOrder`.
8. Open Pairing Info for that pairing.
9. Assert Pairing Info includes segments and crew/composition details.
10. If roster-covered, click Roster and assert crew floats to top of Roster pane.

**Required assertion quality**:

- Do not stop at dialog visible.
- Assert the same flight/pairing identity across detail dialog, pairing pane, and roster navigation.

**Verification**:

```bash
cd e2e
npm run test:gantt -- flight-inspection-workflow.spec.ts
npm run test:gantt -- flight-navi.spec.ts find-by-flight.spec.ts pairing-info.spec.ts
```

## 4. Gantt Filter Workflow Coverage

**Potential enhance**: High. Filters are already well covered, but AI coders should copy the strongest multi-step pattern.

**Quick window**: Small/Medium.

**Target files**:

- `e2e/tests/gantt/filter-coverage.spec.ts`
- `e2e/tests/gantt/multi-step-workflow.spec.ts`
- `e2e/tests/gantt/query-filter.spec.ts`

**Current strong pattern**:

`multi-step-workflow.spec.ts` already does baseline -> filter -> assert narrowed data -> reset -> assert restored -> reapply.

**Implementation direction**:

Add two more workflow-level filters:

### Workflow A: Crew Filter + Pairing Filter Together

1. Capture baseline roster and pairing object counts.
2. Apply data-driven crew base/rank.
3. Assert all visible roster objects match.
4. Apply data-driven pairing base/fleet.
5. Assert pairing objects match while roster filter remains active.
6. Remove one chip.
7. Assert only that dimension changed.
8. Reset all.
9. Assert baseline dimensions restored.

### Workflow B: Flight Filter + Detail Inspection

1. Add Flight pane.
2. Select data-driven flight number or arrival airport.
3. Assert all flight objects match.
4. Open one filtered flight detail.
5. Assert detail uses the same selected value.
6. Clear filter and assert broader set returns.

**Verification**:

```bash
cd e2e
npm run test:gantt -- filter-coverage.spec.ts multi-step-workflow.spec.ts
```

## 5. PBS Portal Workflow E2E Expansion

**Potential enhance**: Very high. PBS Portal currently has real auth/navigation E2E, but major bidding functions are mostly covered only by component/unit tests.

**Quick window**: Large.

**Target files**:

- Existing:
  - `e2e/tests/pbs-portal/auth.spec.ts`
  - `e2e/tests/pbs-portal/portal-navigation.spec.ts`
  - `e2e/tests/pbs-portal/portal-smoke.spec.ts`
- New candidates:
  - `e2e/tests/pbs-portal/pairing-bid-workflow.spec.ts`
  - `e2e/tests/pbs-portal/days-off-bid-workflow.spec.ts`
  - `e2e/tests/pbs-portal/line-bid-workflow.spec.ts`
  - `e2e/tests/pbs-portal/reserve-bid-workflow.spec.ts`
  - `e2e/tests/pbs-portal/tier-review-workflow.spec.ts`
- Page objects:
  - `e2e/pages/pbs-portal/pbs-login-page.ts`
  - `e2e/pages/pbs-portal/pbs-dashboard-page.ts`
  - Add feature page objects as needed.

**Implementation direction**:

Add P0 workflows first:

### Workflow A: Pairing Bid Add/Edit/Delete/Reload

1. Login through real backend.
2. Navigate to Pairing.
3. Wait for draft/current bid data to load.
4. Select a data-driven available pairing property.
5. Add bid to a tier.
6. Assert existing bid row appears with exact property name and tier.
7. Edit a value if the property supports configuration.
8. Assert updated value appears.
9. Reload page.
10. Assert bid persists.
11. Delete the test-created bid.
12. Reload and assert it is gone.

### Workflow B: Days Off Bid Add/Delete/Reload

1. Login.
2. Navigate to Days Off.
3. Search for a data-driven property.
4. Add it to T1 or another available tier.
5. Assert it appears in Existing Days Off Properties.
6. Reload and assert persistence.
7. Delete it and assert removal.

### Workflow C: Tier Review Drilldown

1. Login.
2. Navigate to Tier.
3. Assert summary tabs/counts are loaded.
4. Click a concrete diagnostic or bid summary item.
5. Assert right panel/detail shows the selected item and related rows.

**Required assertion quality**:

- Do not only assert route changed.
- Assert actual bid rows, tier labels, draft version/state, or persisted values.
- Prefer real backend E2E for at least one happy path per feature.
- Mocked tests can remain for routing edge cases, but not as the only workflow proof.

**Verification**:

```bash
cd e2e
npm run test:pbs-portal
```

For targeted work:

```bash
cd e2e
npm run test:pbs-portal -- pairing-bid-workflow.spec.ts
npm run test:pbs-portal -- days-off-bid-workflow.spec.ts
```

**Caution**:

- PBS tests mutate bid drafts. Use one known test account and clean up created bids.
- If cleanup cannot be guaranteed, use API helpers to reset the draft before/after each test.
- Do not hardcode production-like personal data in logs or snapshots.

## 6. PBS App Workflow E2E Expansion

**Potential enhance**: High. Current mobile E2E is only minimal load/navigation.

**Quick window**: Medium/Large.

**Target files**:

- `e2e/tests/pbs-app/home.spec.ts`
- `e2e/pages/pbs-app/pbs-app-page.ts`
- New candidate: `e2e/tests/pbs-app/schedule-detail-workflow.spec.ts`

**Implementation direction**:

Strengthen mobile tests:

1. Load app home.
2. Assert authenticated crew identity or dashboard data, not only a visible screen.
3. Navigate to schedule.
4. Open a schedule item or pairing detail.
5. Assert concrete fields:
   - flight/pairing number
   - date
   - dep/arr
   - report/check-in time if present
6. Navigate back and assert state remains stable.

**Verification**:

```bash
cd e2e
npm run test:pbs-app
```

## 7. Page Object and Helper Consolidation

**Potential enhance**: Medium-high. This makes future AI-authored Playwright tests more consistent.

**Quick window**: Medium.

**Target files**:

- `e2e/pages/gantt/gantt-dashboard-page.ts`
- `e2e/pages/gantt/scenario-page.ts`
- `e2e/pages/pbs-portal/*.ts`
- `e2e/utils/gantt-hook.ts`
- New candidate: `e2e/utils/pbs-portal-workflows.ts`

**Implementation direction**:

Add reusable helpers for common workflow actions:

### Gantt helpers

- `openFlightDetailByFirstVisibleFlight(page)`
- `findPairingByVisibleFlight(page)`
- `openPairingInfoByPairingId(page, pairingId)`
- `assertPairingAtTop(page, pairingId)`
- `assertCrewAtTop(page, crewIds)`
- `getDataDrivenAssignablePairing(page)`

### PBS Portal helpers

- `loginPbsPortal(page)`
- `navigatePortalSection(page, sectionName)`
- `waitForDraftLoaded(page)`
- `cleanupBidByLabel(page/request, label)`
- `assertBidExists(page, { propertyName, tier })`
- `assertBidAbsent(page, { propertyName, tier })`

**Rules**:

- Helpers must not hide important assertions. They should return concrete values that tests assert.
- Keep helper names business-oriented, not CSS-oriented.
- Prefer role/testid locators over raw CSS.

**Verification**:

Run all tests touched by helper migrations:

```bash
cd e2e
npm run test:gantt -- --grep "@smoke|@workflow"
npm run test:pbs-portal
```

## 8. Evidence and Diagnostics for Existing Workflow Tests

**Potential enhance**: Medium. Makes failures easier for AI coders to diagnose.

**Quick window**: Small/Medium.

**Target files**:

- `e2e/utils/regression-snapshot.ts`
- High-value specs only:
  - Gantt assignment workflow
  - Gantt flight inspection workflow
  - PBS Portal bid workflows

**Implementation direction**:

For each new workflow test:

1. Attach a small JSON evidence object with expected/actual ids/counts.
2. Use screenshots only at meaningful assertion points, not page load.
3. For Canvas workflows, attach `window.__ganttTest` evidence:
   - selected pairing id
   - found ids
   - pane order top rows
   - before/after counts

Example evidence:

```ts
await testInfo.attach('assignment-workflow-evidence.json', {
  body: JSON.stringify({
    pairingId,
    crewId,
    beforeFill,
    afterFill,
    restoredFill,
  }, null, 2),
  contentType: 'application/json',
})
```

**Verification**:

- Failure report contains actionable evidence without exposing sensitive payload dumps.
- No test logs full crew/personnel datasets to console.

## 9. CI Grouping and Tags

**Potential enhance**: Medium. Keeps feedback fast as workflow tests grow.

**Quick window**: Small.

**Target files**:

- `e2e/package.json`
- `e2e/config/playwright.config.ts`

**Implementation direction**:

Add scripts once `@workflow` tests exist:

```json
{
  "test:workflow": "playwright test --config=config/playwright.config.ts --grep @workflow",
  "test:gantt:workflow": "playwright test --config=config/playwright.config.ts --project=gantt --grep @workflow",
  "test:pbs-portal:workflow": "playwright test --config=config/playwright.config.ts --project=pbs-portal --grep @workflow"
}
```

Recommended execution layers:

| Layer | Command | Purpose |
|---|---|---|
| Smoke | `npm run test:smoke` | quick app health |
| Workflow | `npm run test:workflow` | core user journeys |
| Full UI | `npm test` | nightly/full regression |

**Verification**:

```bash
cd e2e
npm run test:smoke
npm run test:workflow
```

## Acceptance Criteria

The implementation pass is complete when:

1. A UI regression inventory exists under `docs/test-cases/ui-regression/`.
2. At least one P0 Gantt assignment/edit workflow test exists or an existing one is strengthened to assert persistence/state.
3. At least one Gantt flight -> pairing/crew inspection workflow test exists.
4. At least two PBS Portal workflow E2E specs exist: Pairing and Days Off.
5. New workflow tests use real assertions beyond visibility.
6. Mutating tests clean up their own data or use documented reset helpers.
7. Targeted Playwright commands pass locally for changed areas.
8. No `ai-server` generation/prompt/validation code is modified for this task.

## Suggested Implementation Order

1. Create coverage inventory.
2. Add `@workflow` convention and optional package scripts.
3. Strengthen/add Gantt assignment workflow.
4. Add Gantt flight inspection workflow.
5. Add PBS Portal Pairing workflow.
6. Add PBS Portal Days Off workflow.
7. Add PBS App schedule detail workflow if mobile scope remains active.
8. Run targeted suites, then smoke suite.

## Commands for the AI Coder

Initial inspection:

```bash
cd e2e
npm run test:gantt -- --list
npm run test:pbs-portal -- --list
npm run test:pbs-app -- --list
```

After Gantt workflow work:

```bash
cd e2e
npm run test:gantt -- assignment-workflow.spec.ts flight-inspection-workflow.spec.ts
npm run test:gantt -- --grep "@smoke"
```

After PBS Portal workflow work:

```bash
cd e2e
npm run test:pbs-portal -- pairing-bid-workflow.spec.ts days-off-bid-workflow.spec.ts
npm run test:pbs-portal -- --grep "@smoke"
```

Before handoff:

```bash
cd e2e
npm run test:smoke
```

If time allows:

```bash
cd e2e
npm test
```

## Notes for Future AI Coders

- Copy patterns from `multi-step-workflow.spec.ts`, `flight-navi.spec.ts`, and `pairing-info.spec.ts` before writing new Gantt tests.
- Do not copy shallow patterns that only assert route changed or a button is visible.
- When adding a new test, ask: "Would this fail if the function behind the button is broken?" If not, the test is too shallow.
- Prefer one strong workflow test over five page-open checks.
- Keep assertions business-readable: pairing id, crew id, tier, property name, count, status, persisted value.
