# Scenario Broad Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Scenario search box find scenarios by partial scenario id, scenario name, updater code, or updater display name across the full backend result set.

**Architecture:** Keep pagination authoritative on the backend. The frontend sends one `search` term with the existing type/status filters; live-server turns that term into an `OR` condition grouped with the existing filters and applies it to both item and count queries.

**Tech Stack:** React 19 + Zustand + TypeScript in `gantt`; Fastify + Drizzle ORM + Vitest in `live-server`; Playwright for real UI verification.

## Global Constraints

- Existing worktree is dirty, including staged scenario-run-health and audit-user changes; do not revert unrelated changes.
- Runtime frontend changes increment `FRONTEND_VERSION`; runtime backend changes increment `BACKEND_VERSION`.
- UI text stays English.
- Do not load the full scenario list into browser cache for local filtering.
- Keep the implementation minimal: no fuzzy ranking, no advanced-search UI, no ordering changes.
- Tests come first: watch a search test fail before production code changes.

---

### Task 1: Backend Broad Search

**Files:**
- Modify: `live-server/src/__tests__/services/scenario/scenario-service.test.ts`
- Modify: `live-server/src/services/scenario/scenario-service.ts`
- Modify: `live-server/src/routes/scenario/scenario.ts`

**Interfaces:**
- Consumes: `scenarioService.list(fastify, query)`
- Produces: `ScenarioListQuery.search?: string`, with fallback to `name?: string`

- [ ] **Step 1: Write failing backend tests**

Add tests under `describe('list', ...)` proving the service source contains broad search targets and that the cache key differentiates `search` from `name`.

- [ ] **Step 2: Run backend test and verify RED**

Run: `cd live-server && npm test -- src/__tests__/services/scenario/scenario-service.test.ts --runInBand`

Expected: FAIL because `search` is not present in `scenario-service.ts`.

- [ ] **Step 3: Implement backend broad search**

Update service query typing to include `search`; derive `const searchTerm = (search ?? name)?.trim()`. Use `ilike(sql<string>\`${scenario.id}::text\`, pattern)`, `ilike(scenario.name, pattern)`, `ilike(scenario.updatedBy, pattern)`, and `ilike(users.userName, pattern)` inside one `or(...)` condition. Add `search` to the route schema.

- [ ] **Step 4: Run backend test and verify GREEN**

Run: `cd live-server && npm test -- src/__tests__/services/scenario/scenario-service.test.ts --runInBand`

Expected: PASS.

### Task 2: Frontend Search Parameter

**Files:**
- Modify: `gantt/src/types/scenario.ts`
- Modify: `gantt/src/services/scenario-api.ts`
- Modify: `gantt/src/stores/scenario-store.ts`
- Modify: `gantt/src/components/scenario/scenario-search-bar.tsx`

**Interfaces:**
- Consumes: `ScenarioListQuery.search?: string`
- Produces: UI request `GET /api/scenario?...&search=<term>`

- [ ] **Step 1: Write failing frontend test or update existing API-level assertion**

Add a focused test if an existing scenario store/API test exists; otherwise rely on TypeScript plus Playwright in Task 4 because this path is currently tested mostly through E2E.

- [ ] **Step 2: Implement frontend wiring**

Rename local store naming from `searchName` to `searchTerm` where practical, send `query.search`, and update placeholder to `Search ID, name, or user...`.

- [ ] **Step 3: Run frontend typecheck**

Run: `cd gantt && npx tsc --noEmit`

Expected: PASS.

### Task 3: Versions

**Files:**
- Modify: `gantt/src/version.ts`

**Interfaces:**
- Produces: bumped `BACKEND_VERSION` and `FRONTEND_VERSION`

- [ ] **Step 1: Increment runtime versions**

Increment `BACKEND_VERSION` by 1 and `FRONTEND_VERSION` by 1 from the current file values; update comments to mention scenario broad search.

### Task 4: UI Verification

**Files:**
- Modify or create: a focused Playwright scenario-list search test under `e2e/tests/gantt/`

**Interfaces:**
- Consumes: real Scenario UI search input placeholder and `scenario-item-id` badge.
- Produces: test receipt proving typing an id fragment surfaces the matching scenario row.

- [ ] **Step 1: Add or adapt Playwright coverage**

Use a stable existing scenario id/name from the suite. Type the id fragment into the Scenario search box, then assert the matching `#<id>` badge appears.

- [ ] **Step 2: Run focused Playwright test**

Run the focused test through the real app/dev-server setup used by the repo.

Expected: PASS, with a receipt command in the final response.

### Task 5: Final Verification

**Files:**
- No new files unless tests require it.

**Interfaces:**
- Produces: verification receipt.

- [ ] **Step 1: Run touched checks**

Run backend unit test, frontend typecheck, and focused Playwright test.

- [ ] **Step 2: Run UI standard gate if style changed**

Only if CSS/classes are changed, run `cd gantt && npm run check:ui`.

- [ ] **Step 3: Summarize changed files and test receipts**

Report only files touched for this task and any commands that could not run.
