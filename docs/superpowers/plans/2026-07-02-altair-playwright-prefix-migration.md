# Altair Playwright Prefix Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans implement plan task-by-task. Steps use checkbox (`- [ ]`) syntax tracking.

**Goal:** Update Playwright tests/helpers/config so active routes no longer depend on `/fpqe`.

**Architecture:** This is a Playwright-only test contract change. Runtime Vite proxy, backend services, Cloudflare/nginx, and product routing remain unchanged in this slice.

**Tech Stack:** Playwright TypeScript E2E tests, Gantt test helpers, existing Vite-served Gantt app.

## Global Constraints

- Modify only Playwright tests/helpers/config/scripts covered by `docs/superpowers/specs/2026-07-02-altair-playwright-prefix-migration-design.md`.
- Use `/pbs` for PBS Portal Playwright defaults because that is the currently served local portal base.
- Do not edit runtime app or backend code in this slice.
- Scenario deep-link tests should expect `/altair/scenario/:id` to remain visible.

---

### Task 1: Update Gantt AI Route Mocks

**Files:**

- Modify: `e2e/tests/gantt/ai-chat.spec.ts`

**Interfaces:**

- Consumes: Playwright `page.route()` URL globs.
- Produces: Gantt AI chat tests that mock `/altair/ai/chat` and `/altair/live/api/ai/hints`.

- [ ] **Step 1: Replace AI chat route mocks**

Change every `page.route('**/fpqe/ai/chat', ...)` to:

```ts
page.route('**/altair/ai/chat', ...)
```

- [ ] **Step 2: Replace live hint route mocks**

Change the hint mock from:

```ts
page.route('**/fpqe/live/api/ai/hints', ...)
```

to:

```ts
page.route('**/altair/live/api/ai/hints', ...)
```

- [ ] **Step 3: Verify no Gantt AI mock remains on `/fpqe`**

Run:

```bash
rg -n '/fpqe/(ai|live)' e2e/tests/gantt/ai-chat.spec.ts
```

Expected: no output.

### Task 2: Update Scenario Deep-Link Playwright Contract

**Files:**

- Modify: `e2e/tests/gantt/altair-url-routing.spec.ts`

**Interfaces:**

- Consumes: Existing `/altair/scenario/:id` direct navigation test.
- Produces: A Playwright assertion requiring scenario-id URLs to stay visible.

- [ ] **Step 1: Update direct scenario URL assertion**

Change the direct scenario test expectation from:

```ts
await expect(page).toHaveURL(/\/altair\/scenario$/)
```

to:

```ts
await expect(page).toHaveURL(/\/altair\/scenario\/77$/)
```

- [ ] **Step 2: Run targeted route test**

Run:

```bash
cd e2e && npx playwright test tests/gantt/altair-url-routing.spec.ts --project=gantt --reporter=list
```

Expected: may fail until runtime URL sync preserves scenario ids; record result honestly.

### Task 3: Update Gantt Test Comment References

**Files:**

- Modify: `e2e/tests/gantt/composition-dialogs.spec.ts`

**Interfaces:**

- Consumes: Existing comment explaining Vite proxy prefix.
- Produces: Comments aligned with `/altair/live`.

- [ ] **Step 1: Update stale proxy comment**

Change comment text from `/fpqe/live` to `/altair/live`.

- [ ] **Step 2: Search active Gantt tests for remaining service `/fpqe`**

Run:

```bash
rg -n '/fpqe/(live|ai|rule|engine)' e2e/tests/gantt e2e/config
```

Expected: no Gantt service-route matches. PBS Portal `/fpqe/pbs` matches may remain outside this scope.

### Task 4: Verification Summary

**Files:**

- No additional file changes.

**Interfaces:**

- Consumes: Results from Tasks 1-3.
- Produces: Final report listing exact commands and PASS/FAIL.

- [ ] **Step 1: Run focused text search**

Run:

```bash
rg -n '/fpqe|fpqe|\\/fpqe' e2e --glob '!e2e/test-results/**' --glob '!e2e/results/**' --glob '!test-results/**' --glob '!results/**'
```

Expected: no output.

- [ ] **Step 2: Report runtime dependency clearly**

If Playwright fails because backend services are down or setup dependencies include unrelated projects, report that as a remaining blocker separate from `/fpqe`.
