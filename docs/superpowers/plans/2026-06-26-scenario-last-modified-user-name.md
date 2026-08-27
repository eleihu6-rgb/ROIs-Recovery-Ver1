# Scenario Last Modified User Name Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scenario list rows show the real last authenticated modifier name instead of `system` for normal user actions.

**Architecture:** The backend Scenario write routes will derive audit identity from `request.authUser.userCode`, which the global auth plugin attaches from the JWT. The existing list service already joins `scenario.updated_by` to `users.user_code` and returns `updatedByName`, and the frontend already displays that field first.

**Tech Stack:** Fastify, TypeScript, Drizzle, Vitest, React Scenario sidebar.

## Global Constraints

- Runtime backend code changes must bump `gantt/src/version.ts` `BACKEND_VERSION`.
- Keep the fix surgical: do not backfill old rows and do not redesign the Scenario list UI.
- Do not trust request body `username` for authenticated Scenario writes.
- Existing dirty worktree changes must be preserved.

---

### Task 1: Scenario Route Audit User

**Files:**
- Modify: `live-server/src/routes/scenario/scenario.ts`
- Modify: `live-server/src/__tests__/services/scenario/scenario-service.test.ts` or add a focused route test if one exists for scenario routes
- Modify: `gantt/src/version.ts`

**Interfaces:**
- Consumes: `request.authUser?.userCode`
- Produces: Scenario service calls receive `username: string` from authenticated JWT user code for create, update, duplicate, and transition.

- [ ] **Step 1: Write the failing test**

Add focused tests that call the Scenario route handlers with `request.authUser.userCode = 'kevin'` and a body that either omits `username` or includes `username: 'system'`. Assert the mocked `scenarioService.create`, `update`, `duplicate`, and `transition` calls receive `'kevin'`.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `cd live-server && npm test -- scenario`

Expected: the new assertions fail because current routes pass `body.username ?? 'system'`.

- [ ] **Step 3: Implement the minimal route helper**

In `live-server/src/routes/scenario/scenario.ts`, add a local helper:

```ts
const getAuthUsername = (request: FastifyRequest): string => request.authUser?.userCode ?? 'system'
```

Use it in POST `/`, PUT `/:id`, POST `/:id/duplicate`, and POST `/:id/transition` instead of body-derived usernames.

- [ ] **Step 4: Bump backend version**

Increment `BACKEND_VERSION` in `gantt/src/version.ts` by one. Leave `FRONTEND_VERSION` unchanged.

- [ ] **Step 5: Verify**

Run:

```bash
cd live-server && npm test -- scenario
cd live-server && npx tsc --noEmit
cd gantt && npx tsc --noEmit
```

Expected: focused tests and TypeScript checks pass.
