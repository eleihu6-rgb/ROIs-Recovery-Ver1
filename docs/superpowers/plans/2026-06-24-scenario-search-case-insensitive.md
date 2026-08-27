# Scenario Search Case-Insensitive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Scenario keyword search case-insensitive while preserving existing filters and query flow.

**Architecture:** Keep frontend unchanged. Replace the backend Scenario list name predicate with Drizzle `ilike`, which maps to PostgreSQL case-insensitive matching.

**Tech Stack:** Fastify, Drizzle ORM, Vitest, TypeScript.

## Global Constraints

- Do not change database schema.
- Do not add dependencies.
- Do not change type/status exact filter behavior.
- Keep existing Scenario list API query parameters.

---

### Task 1: Backend Name Predicate

**Files:**
- Modify: `live-server/src/services/scenario/scenario-service.ts`
- Modify: `live-server/src/__tests__/services/scenario/scenario-service.test.ts`

**Interfaces:**
- Consumes: existing `name?: string` scenario list query parameter.
- Produces: case-insensitive matching for scenario names.

- [x] **Step 1: Write the failing guard test**

Add a test that reads `scenario-service.ts` and verifies the scenario name filter uses `ilike(scenario.name`.

- [x] **Step 2: Run the focused test**

Run:

```bash
cd live-server && npm test -- src/__tests__/services/scenario/scenario-service.test.ts -t "scenarioService.*case-insensitive"
```

Expected before implementation: FAIL because the service imports and uses `like`.

- [x] **Step 3: Implement the predicate change**

Change:

```ts
import { eq, and, sql, asc, desc, like, getTableColumns } from 'drizzle-orm'
```

to:

```ts
import { eq, and, sql, asc, desc, ilike, getTableColumns } from 'drizzle-orm'
```

and change:

```ts
...(name ? [like(scenario.name, `%${name}%`)] : []),
```

to:

```ts
...(name ? [ilike(scenario.name, `%${name}%`)] : []),
```

- [ ] **Step 4: Run verification**

Run:

```bash
cd live-server && npm test -- src/__tests__/services/scenario/scenario-service.test.ts -t "scenarioService.*case-insensitive"
cd live-server && npm test -- src/__tests__/services/scenario/scenario-service.test.ts -t "scenarioService.*list"
cd gantt && npx tsc --noEmit
```
