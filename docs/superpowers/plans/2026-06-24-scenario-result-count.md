# Scenario Result Count Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Scenario list `x results` count actual optimizer-placed roster-flight rows from `scenario.roster_flight`.

**Architecture:** Keep the list API field name `optimizedCount`, but override it in `scenarioService.list()` with a scalar SQL count of non-deleted `source = 'CR'` rows for each scenario. Preserve the frontend rendering and highlight logic.

**Tech Stack:** Fastify, Drizzle ORM, PostgreSQL, Vitest, React/Vite Gantt frontend.

## Global Constraints

- New behavior counts only `scenario.roster_flight` rows where `is_deleted = 0` and `source = 'CR'`.
- Keep `scenario.optimized_count` storage semantics unchanged.
- Keep frontend API field name `optimizedCount` unchanged.
- Do not add dependencies or database migrations.

---

### Task 1: Backend List Count Source

**Files:**
- Modify: `live-server/src/services/scenario/scenario-service.ts`
- Modify: `live-server/src/__tests__/services/scenario/scenario-service.test.ts`

**Interfaces:**
- Consumes: `scenarioService.list(fastify, query)` list response rows with `optimizedCount`.
- Produces: `optimizedCount: number` in list rows, sourced from non-deleted `scenario.roster_flight` rows where `source = 'CR'`.

- [ ] **Step 1: Write the regression guard**

Add this test inside `describe('list', ...)` in `live-server/src/__tests__/services/scenario/scenario-service.test.ts`:

```ts
it('uses optimizer-placed roster flight rows as the scenario list result count', () => {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const serviceSource = readFileSync(resolve(__dirname, '../../../services/scenario/scenario-service.ts'), 'utf8')

  expect(serviceSource).toContain('optimizedCount:')
  expect(serviceSource).toContain('scenario.roster_flight')
  expect(serviceSource).toContain("rf.source = 'CR'")
  expect(serviceSource).toContain('rf.is_deleted = 0')
})
```

- [ ] **Step 2: Run the targeted backend test and confirm it fails**

Run:

```bash
cd live-server && npm test -- src/__tests__/services/scenario/scenario-service.test.ts -t "scenarioService.*optimizer-placed|scenarioService.*list"
```

Expected before implementation: FAIL because `scenario-service.ts` does not yet count `scenario.roster_flight` rows in `list()`.

- [ ] **Step 3: Implement the list query override**

In `live-server/src/services/scenario/scenario-service.ts`, update the `select()` inside `scenarioService.list()`:

```ts
.select({
  ...getTableColumns(scenario),
  optimizedCount: sql<number>`(
    SELECT count(*)::int
    FROM scenario.roster_flight rf
    WHERE rf.scenario_id = ${scenario.id}
      AND rf.is_deleted = 0
      AND rf.source = 'CR'
  )`,
  updatedByName: users.userName,
})
```

- [ ] **Step 4: Run targeted backend tests**

Run:

```bash
cd live-server && npm test -- src/__tests__/services/scenario/scenario-service.test.ts -t "scenarioService.*optimizer-placed|scenarioService.*list|scenarioService.*case-insensitive"
```

Expected: PASS.

- [ ] **Step 5: Run frontend scenario item tests**

Run:

```bash
cd gantt && npm test -- src/components/scenario/__tests__/scenario-list-item.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Run Gantt typecheck**

Run:

```bash
cd gantt && npx tsc --noEmit
```

Expected: PASS.
