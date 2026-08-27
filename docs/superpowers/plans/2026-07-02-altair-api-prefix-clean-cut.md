# Altair API Prefix Clean-Cut Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) superpowers:executing-plans implement plan task-by-task. Steps use checkbox (`- [ ]`) syntax tracking.
**Goal:** Replace the Gantt/ai-server public `/fpqe/*` contract with `/altair/*` in one clean cut.
**Architecture:** Keep upstream services and internal ai-server routes unchanged, but change the public Gantt-facing prefix to `/altair/*` everywhere the frontend builds URLs or the ai-server emits clickable public links. Limit the sweep to runtime code, directly affected tests, and the nearby module note that documents the public ai prefix.
**Tech Stack:** React/Vite/TypeScript frontend, FastAPI/Python ai-server, Vitest, pytest.

## Global Constraints

- Frontend app base remains `/altair/`.
- Backend-facing Gantt paths must move to `/altair/live`, `/altair/rule`, `/altair/engine`, and `/altair/ai`.
- Use a clean cut only; do not add `/fpqe/*` fallback logic.
- Keep internal ai-server routes mounted under `/ai/*`; only public proxy-facing prefixes change.
- Keep edits surgical to Gantt, ai-server, and directly affected tests/docs.
- Runtime code changes require a version bump in `gantt/src/version.ts`.

---

### Task 1: Switch Shared Gantt Public API Bases
**Files:**
- Modify: `gantt/src/config/api-paths.ts`
- Modify: `gantt/vite.config.ts`
- Modify: `gantt/src/services/timezone-api.ts`
- Test: `gantt/src/hooks/__tests__/use-url-sync.test.ts`

**Interfaces:**
- Consumes: existing `VITE_API_PREFIX`, `LIVE_API_BASE`, `RULE_API_BASE`, `ENGINE_API_BASE`, `AI_API_BASE`.
- Produces: Gantt runtime and local Vite proxy both using `/altair/*`.

- [ ] Step 1: Change the default public API prefix in `gantt/src/config/api-paths.ts` from `fpqe` to `altair`.
- [ ] Step 2: Change the default proxy prefix in `gantt/vite.config.ts` from `fpqe` to `altair`, preserving the existing `/altair/ai -> /ai` rewrite behavior.
- [ ] Step 3: Update the nearby timezone service comment to document `/altair/live/base/timezone-options`.
- [ ] Step 4: Update the URL-sync test fixture path from `/fpqe/gantt/` to the current `/altair/` route expectation if that test still covers the old contract.

### Task 2: Switch Gantt Ancillary Public Links
**Files:**
- Modify: `gantt/src/config/system-tools.ts`
- Test: `gantt/src/__tests__/config/system-tools.test.ts`

**Interfaces:**
- Consumes: hard-coded system tool URLs surfaced by the frontend.
- Produces: public tool links aligned to `/altair/*`.

- [ ] Step 1: Change the Gantt-exposed monitor/connector URLs from `/fpqe/...` to `/altair/...`.
- [ ] Step 2: Update the matching unit test expectations.

### Task 3: Switch ai-server Public Prefix Emission
**Files:**
- Modify: `ai-server/src/config/settings.py`
- Modify: `ai-server/src/regression/runner.py`
- Modify: `ai-server/src/live/viewer.py`
- Modify: `ai-server/CLAUDE.md`
- Test: `ai-server/tests/test_chat_route.py`
- Test: `ai-server/tests/test_crewbids.py`

**Interfaces:**
- Consumes: `settings.public_ai_prefix` and regression/live-stream helpers that emit public URLs.
- Produces: `/altair/ai/live/...` watch URLs and `/altair/live` base URLs in regression-runner env overrides.

- [ ] Step 1: Change `public_ai_prefix` default from `/fpqe/ai` to `/altair/ai`.
- [ ] Step 2: Update regression runner’s public live API base from `${base_url}/fpqe/live` to `${base_url}/altair/live`.
- [ ] Step 3: Update any nearby ai-server comments/module notes that still document `/fpqe/ai`.
- [ ] Step 4: Update pytest assertions that still expect `/fpqe/ai/live/streams/...`.

### Task 4: Version Bump And Focused Verification
**Files:**
- Modify: `gantt/src/version.ts`

**Interfaces:**
- Consumes: current frontend version constants.
- Produces: incremented frontend version for the routing contract change.

- [ ] Step 1: Increment `FRONTEND_VERSION` by 1 in `gantt/src/version.ts`.
- [ ] Step 2: Run focused searches:
  - `rg -n '/fpqe|fpqe' gantt ai-server e2e --glob '!**/test-results/**' --glob '!**/results/**' --glob '!**/dist/**' --glob '!**/.venv/**'`
- [ ] Step 3: Run focused tests:
  - `cd gantt && npm run test -- src/__tests__/config/system-tools.test.ts src/hooks/__tests__/use-url-sync.test.ts`
  - `cd ai-server && pytest tests/test_chat_route.py tests/test_crewbids.py -q`
- [ ] Step 4: If local runtime is available, verify at least one live path and one ai path resolve under `/altair/*`; otherwise report that deployment verification remains external.
