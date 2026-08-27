# Live Manday Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reliable live Manday refresh triggers for manual API calls, Linux scheduled jobs, and Gantt draft swap edits.

**Architecture:** Keep the unified Manday driver as the only computation path. Extend the admin route to opt into real BLH recomputation and add a thin CLI wrapper for cron/systemd. Keep draft commit behavior unchanged except for collecting swap dates.

**Tech Stack:** Fastify, TypeScript, Vitest, pg, existing `recompute` Manday driver.

---

### Task 1: Admin Refresh Route

**Files:**
- Modify: `live-server/src/routes/admin/manday-credit-refresh.ts`
- Test: `live-server/src/routes/admin/manday-credit-refresh.test.ts`

- [ ] Write failing tests proving `recomputeBlh=true` loads all crew ids and passes `crewIds` plus `recomputeBlh: true`.
- [ ] Write failing tests proving default `scope=all` keeps the existing non-BLH behavior.
- [ ] Implement query schema parsing for `recomputeBlh`.
- [ ] Implement all-crew id loading for `scope=all&recomputeBlh=true`.
- [ ] Run the focused Vitest file and confirm pass.

### Task 2: Draft Commit Swap Dates

**Files:**
- Modify: `live-server/src/routes/draft/draft.ts`
- Test: `live-server/src/routes/draft/draft-manday-swap.test.ts`

- [ ] Write failing test proving a swap-only draft commit passes swap roster dates into Manday recompute.
- [ ] Change the `swap` operation branch to collect `rosterService.swap(...)` result dates.
- [ ] Run the focused Vitest file and confirm pass.

### Task 3: Linux CLI

**Files:**
- Create: `live-server/scripts/live-manday-refresh.ts`
- Test: `live-server/src/__tests__/scripts/live-manday-refresh-args.test.ts`

- [ ] Write failing tests for CLI argument parsing using exported pure helpers.
- [ ] Implement `parseArgs` and `resolveWindow`.
- [ ] Implement CLI main that loads all crew ids when `--recompute-blh` is set and calls `recompute`.
- [ ] Run focused tests and confirm pass.

### Task 4: Verification

**Files:**
- Modify: `gantt/src/version.ts`

- [ ] Bump `BACKEND_VERSION`.
- [ ] Run `npm run build` in `live-server`.
- [ ] Run the focused Vitest files.
- [ ] Review `git diff` and commit.
