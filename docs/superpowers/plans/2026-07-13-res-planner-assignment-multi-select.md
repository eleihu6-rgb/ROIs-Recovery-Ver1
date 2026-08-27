# RES Planner Assignment Multi-Select Implementation Plan

> **For agentic workers:** Implement task-by-task. Checkboxes track progress.
> Spec: `docs/superpowers/specs/2026-07-13-res-planner-assignment-multi-select-design.md`

**Goal:** RES Pairing Planner multi-selects assignments (including PRMM), windows from `assignment.fixed_*` as `HH:mm`, per-assignment plan matrices.

**Architecture:** Cell key becomes `date|base|assignment` (drop AM/PM). Options from `RES_CALL_TYPE`; default windows from assignment master then dictionary. Same local wall time → base-specific UTC via `localWallTimeToUtc`.

**Tech Stack:** PostgreSQL migration/seed, Drizzle, live-server Fastify, gantt Zustand + React, Vitest, Playwright.

## Global Constraints

- Live-only (`canCreateRes`); no Scenario RES create.
- Do not write user window edits back to `assignment`.
- `fixed_str_tm` / `fixed_end_tm` = `varchar(5)` `HH:mm`.
- Window order: cell override → assignment fixed → RES_CALL_TYPE → hard fallback.
- UI English; §Minimal-First / §Surgical.

---

### Task 1: Schema + seed + Drizzle

**Files:**
- Create: `sql/migration/2026-07-13-assignment-fixed-tm-hhmm.sql`
- Create: `sql/seed/31-res-assignment-fixed-windows.sql` (or extend `30-res-pairing-config.sql`)
- Modify: `sql/schema/live/01-base.sql` (column types + comments)
- Modify: `live-server/src/models/base/assignment.ts`
- Modify: `live-server/src/routes/base/assignment.ts` (zod string)
- Modify: `live-server/src/services/data/data-save-service.ts` if needed
- Modify: `gantt/src/config/data-entity-registry.ts` (text fields)

**Default times:** PRAM 04:00–16:00, PRMM 10:00–22:00, PRPM 14:00–23:59, CRAM 03:00–15:00, CRPM 10:00–22:00.

- [ ] Migration alter columns to varchar(5)
- [ ] Upsert assignment fixed times + RES_CALL_TYPE (incl P_MM) with UPDATE for existing windows
- [ ] Drizzle + API zod + Data UI field type

### Task 2: Backend generate contract

**Files:**
- Modify: `live-server/src/services/res-pairing/res-pairing-service.ts`
- Modify: `live-server/src/services/res-pairing/__tests__/*`
- Modify: route zod if present

- [ ] `ResCell.assignment` replaces `timing`
- [ ] `loadResConfig` loads call defs + assignment fixed windows; `windowFor(code)` / validate allowed codes
- [ ] `summarize` / conflict keys use assignment
- [ ] Unit tests green

### Task 3: Frontend store + API types

**Files:**
- Modify: `gantt/src/stores/res-planner-store.ts`
- Modify: `gantt/src/services/res-api.ts`
- Optional: config fetch for RES_CALL_TYPE + assignment windows

- [ ] `selectedAssignments`, per-assignment windows, per-assignment brush
- [ ] Cells keyed by assignment

### Task 4: Define / Review UI

**Files:**
- Modify: `gantt/src/components/res-pairing/res-entry-panel.tsx`
- Modify: `gantt/src/components/res-pairing/review-generate.tsx`
- Modify: related define workspace if needed

- [ ] Multi-select chips from RES_CALL_TYPE
- [ ] Per-assignment window + plan matrix
- [ ] Review groups by assignment; generate uses new cells

### Task 5: Tests + stale E2E

**Files:**
- Modify: `e2e/tests/gantt/res-pairing-*.spec.ts` as needed
- Add focused regression if missing

- [ ] Backend vitest
- [ ] Playwright RES paths updated for new windows / PRMM multi-select
- [ ] `npm run check:ui` if styles touched

---

## Execution

Inline in this session (user said 继续). Commit only if user asks.
