# Scenario Seed Legality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute persisted Scenario legality from the same seed/live-backed roster data shown in RO DRAFT/FAILED Scenario Gantt views.

**Architecture:** Keep the existing persisted Scenario legality route and storage. Add a seed-aware source adapter used only when a scenario has no loaded `scenario.roster_flight` and is an RO DRAFT/FAILED scenario. The adapter reads scoped live rows, feeds the existing Rust-backed `computeViolations` core, and persists results to `scenario.rule_violation`.

**Tech Stack:** live-server TypeScript/Fastify route orchestration, Node `.mjs` legality script, PostgreSQL, Vitest for focused service tests.

## Global Constraints

- Do not write seed assignments into `scenario.roster_flight`.
- Do not change loaded DONE scenario legality behavior.
- Do not change live legality.
- Do not add client-side legality calculation in Gantt.
- Use remote DB for manual business validation.
- Follow TDD: write the failing regression test before production code.

---

### Task 1: Seed Source Regression

**Files:**
- Modify: `live-server/scripts/scenario-legality.mjs`
- Create or modify: `live-server/src/__tests__/services/scenario-seed-legality-source.test.ts`

**Interfaces:**
- Produces: exported helpers from `scenario-legality.mjs`:
  - `isSeedLegalityScenario(ctx): boolean`
  - `buildSeedSource(db, scenarioId, ctx): LegalitySource`

- [ ] **Step 1: Write the failing test**

Create `live-server/src/__tests__/services/scenario-seed-legality-source.test.ts` that imports `buildSeedSource` from `../../../scripts/scenario-legality.mjs`, uses a fake `db.query`, and verifies `flyByPairing(['FLY'], [])` returns two FLY duties for the scoped crew from live `roster_flight`, not from empty scenario roster.

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
npm --prefix live-server run test -- src/__tests__/services/scenario-seed-legality-source.test.ts --run
```

Expected: FAIL because `buildSeedSource` is not exported or not implemented.

- [ ] **Step 3: Implement the minimal seed source**

In `live-server/scripts/scenario-legality.mjs`, export seed-source helpers guarded so CLI execution still only runs `main()` when invoked directly. `buildSeedSource` should:

- resolve scoped crew ids from `ctx.filterParams.crew`
- query live `roster_flight`
- filter duties by rule groups/codes
- group pairing rows by `(crew_id, pairing_id)`
- return start/end seconds and label/assignment metadata matching `scenarioSource.flyByPairing`

- [ ] **Step 4: Run the test to verify GREEN**

Run the same focused test and expect PASS.

### Task 2: Wire Seed Source Into Compute

**Files:**
- Modify: `live-server/scripts/scenario-legality.mjs`
- Modify: `live-server/src/__tests__/services/scenario-seed-legality-source.test.ts`

**Interfaces:**
- Consumes: `isSeedLegalityScenario(ctx)` and `buildSeedSource(db, scenarioId, ctx)`.
- Produces: `selectLegalitySource(db, scenarioId, ctx)` that returns the normal scenario source for loaded scenarios and seed source for seed scenarios.

- [ ] **Step 1: Add a failing source-selection test**

Add a test where `ctx.loadedRosterCount=0`, `status='DRAFT'`, and `fileType='RO'`; expect `selectLegalitySource(...).kind` to be `'seed'`. Add a loaded-roster case expecting `'scenario'`.

- [ ] **Step 2: Run RED**

Run:

```bash
npm --prefix live-server run test -- src/__tests__/services/scenario-seed-legality-source.test.ts --run
```

Expected: FAIL until `selectLegalitySource` exists.

- [ ] **Step 3: Implement selection and CLI wiring**

Extend `loadContext()` to include `status`, `fileType`, `filterParams`, and `loadedRosterCount`. Replace `const source = scenarioSource(...)` with `const source = selectLegalitySource(db, SCENARIO_ID, ctx).source`.

- [ ] **Step 4: Run GREEN**

Run the focused test and expect PASS.

### Task 3: Verification

**Files:**
- Modify only if tests reveal a gap.

- [ ] **Step 1: Run focused live-server tests**

```bash
npm --prefix live-server run test -- src/__tests__/services/scenario-seed-legality-source.test.ts src/__tests__/services/scenario/legality-status.test.ts --run
```

- [ ] **Step 2: Run TypeScript check**

```bash
./live-server/node_modules/.bin/tsc -p live-server/tsconfig.json --noEmit
```

- [ ] **Step 3: Manual SIT check for 672**

After deployment or against the target environment, force recheck Scenario 672 and read `/api/scenario/672/legality`. Expected: status reaches `READY` and includes 8056 violations for seed-visible live-backed assignments.
