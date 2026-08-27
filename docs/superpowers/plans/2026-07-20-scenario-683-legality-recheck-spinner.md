# Scenario 683 Legality Recheck Spinner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Scenario 683 legality recheck so READY results can be read and frontend polling failures do not leave the UI in an indefinite computing state.

**Architecture:** The backend route keeps persisted violation reads in the scenario schema but reads scenario period bounds from the live schema. The frontend keeps the existing recheck/poll flow and adds a small explicit failure transition in the per-scenario violation store.

**Tech Stack:** Fastify, PostgreSQL, TypeScript, Vitest, React/Zustand.

## Global Constraints

- Keep the change surgical: no solver, rule-engine, schema, or data migration changes.
- Do not change persisted violation format or Gantt alert display semantics.
- Dynamic schema SQL must use existing schema helpers, not string literals from user input.
- Use TDD: write failing tests before production code changes.
- Run focused live-server and gantt verification before claiming completion.

---

### Task 1: Backend READY Read Schema

**Files:**
- Modify: `live-server/src/__tests__/routes/scenario-legality-window-overlap.test.ts`
- Modify: `live-server/src/routes/scenario/legality.ts`

**Interfaces:**
- Consumes: `liveSchema(): string` and `scenarioSchema(): string` from `live-server/src/utils/db-schema.ts`.
- Produces: `GET /api/scenario/:id/legality` READY SQL that reads `${liveSchema()}.scenario` for bounds and `${scenarioSchema()}.rule_violation` for violations.

- [ ] **Step 1: Write the failing backend regression test**

Update the db-schema mock:

```typescript
vi.mock('../../utils/db-schema.js', () => ({
  liveSchema: () => '"f8_sit_live"',
  scenarioSchema: () => '"f8_sit_scenario"',
}))
```

Add assertions after `const sql = String(query.mock.calls[0][0])`:

```typescript
expect(sql).toContain('from "f8_sit_live".scenario s')
expect(sql).toContain('from "f8_sit_scenario".rule_violation rv')
expect(sql).not.toContain('from "f8_sit_scenario".scenario s')
```

- [ ] **Step 2: Run backend test and verify RED**

Run: `npm --prefix live-server run test -- src/__tests__/routes/scenario-legality-window-overlap.test.ts --run`

Expected: FAIL because current SQL still contains `from "f8_sit_scenario".scenario s`.

- [ ] **Step 3: Implement minimal backend fix**

In `live-server/src/routes/scenario/legality.ts`, change the import:

```typescript
import { liveSchema, scenarioSchema } from '../../utils/db-schema.js'
```

Change only the bounds CTE source:

```sql
from ${liveSchema()}.scenario s
```

Keep violation rows on:

```sql
from ${scenarioSchema()}.rule_violation rv
```

- [ ] **Step 4: Run backend test and verify GREEN**

Run: `npm --prefix live-server run test -- src/__tests__/routes/scenario-legality-window-overlap.test.ts --run`

Expected: PASS.

### Task 2: Frontend Recheck Failure Recovery

**Files:**
- Modify: `gantt/src/stores/__tests__/scenario-violation-computing-since.test.ts`
- Modify: `gantt/src/stores/scenario-violation-store.ts`
- Modify: `gantt/src/services/scenario-legality-api.ts`

**Interfaces:**
- Produces: `markRecheckFailed(errorText: string): void` on `ScenarioViolationStore`.
- Consumes: `getScenarioViolationStore(scenarioId).getState().markRecheckFailed(...)` from `pollScenarioLegality` when max consecutive fetch failures is reached.

- [ ] **Step 1: Write the failing store test**

Add a test to `gantt/src/stores/__tests__/scenario-violation-computing-since.test.ts`:

```typescript
it('markRecheckFailed clears computing state and records the error', () => {
  const store = getScenarioViolationStore(9002)
  store.getState().markRecheckTriggered()

  store.getState().markRecheckFailed('Legality recheck polling failed')

  expect(store.getState().legalityStatus).toBe('FAILED')
  expect(store.getState().computingSince).toBeNull()
  expect(store.getState().errorText).toBe('Legality recheck polling failed')
})
```

- [ ] **Step 2: Run frontend store test and verify RED**

Run: `npm --prefix gantt run test -- src/stores/__tests__/scenario-violation-computing-since.test.ts --run`

Expected: FAIL because `markRecheckFailed` does not exist.

- [ ] **Step 3: Implement minimal store action**

Extend `ScenarioViolationStore`:

```typescript
markRecheckFailed: (errorText: string) => void
```

Add the implementation:

```typescript
markRecheckFailed: (errorText) =>
  set({
    legalityStatus: 'FAILED',
    errorText,
    computingSince: null,
  }),
```

- [ ] **Step 4: Wire polling failure to the store**

In `gantt/src/services/scenario-legality-api.ts`, replace the max-failure branch with:

```typescript
if (fetchFailures >= MAX_FETCH_FAILURES) {
  const message = 'Legality recheck polling failed — click Recheck to retry'
  getScenarioViolationStore(scenarioId).getState().markRecheckFailed(message)
  notify.error(message)
  return
}
```

- [ ] **Step 5: Run frontend store test and verify GREEN**

Run: `npm --prefix gantt run test -- src/stores/__tests__/scenario-violation-computing-since.test.ts --run`

Expected: PASS.

### Task 3: Final Verification

**Files:**
- Verify only; no planned edits.

**Interfaces:**
- Confirms backend route, frontend store, and TypeScript contracts.

- [ ] **Step 1: Run focused backend route test**

Run: `npm --prefix live-server run test -- src/__tests__/routes/scenario-legality-window-overlap.test.ts --run`

Expected: PASS.

- [ ] **Step 2: Run live-server typecheck**

Run: `npm --prefix live-server exec -- tsc -p tsconfig.json --noEmit`

Expected: exit code 0.

- [ ] **Step 3: Run focused gantt store test**

Run: `npm --prefix gantt run test -- src/stores/__tests__/scenario-violation-computing-since.test.ts --run`

Expected: PASS.

- [ ] **Step 4: Run gantt typecheck**

Run: `npm --prefix gantt exec -- tsc -p tsconfig.json --noEmit`

Expected: exit code 0.
