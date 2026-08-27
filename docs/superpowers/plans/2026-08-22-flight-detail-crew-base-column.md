# Flight Detail Crew Assignment Base Column — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Base column after Name in Flight Detail Crew Assignment, resolved from `crew_base` as of Flight Date (latest `eff_dt`).

**Architecture:** Extend `FlightCrewItem.base`; Live `getCrewList` batch-resolves via the same `DISTINCT ON` pattern as Pairing Info; Scenario helper uses `crew.base`; dialog renders the column. Shared Live+Scenario UI path (§Gantt-Unify).

**Tech Stack:** live-server (Drizzle/Postgres), gantt React dialog, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-22-flight-detail-crew-base-column-design.md`

## Global Constraints

- Base after Name; missing → `—`
- As-of: `fltDt` else `schDepDtUtc` date; latest matching `eff_dt` (not `is_prime_base`)
- English UI only
- Touch only flight crew path + tests; no assignee/composition logic changes
- Do not commit unless user asks

## File map

| File | Role |
|------|------|
| `gantt/src/types/flight.ts` | Add `base: string \| null` to `FlightCrewItem` |
| `live-server/.../flight-service.ts` | Resolve bases in `getCrewList` |
| `live-server/.../flight-service.test.ts` | Vitest as-of-date base |
| `gantt/.../build-scenario-flight-crew.ts` (+ test) | Scenario `base` + merge |
| `gantt/.../flight-detail-dialog.tsx` (+ css) | Column UI |
| `e2e/.../scenario-detail-dialogs.spec.ts` | Scen-2020 header + base assert |
| `e2e/.../flight-pane.spec.ts` | Live-1073 header (if crew loads) |

---

### Task 1: Live API — base on FlightCrewItem

**Files:** `flight-service.ts`, `flight-service.test.ts`, `gantt/src/types/flight.ts`

- [x] Write failing Vitest: assignees get `base` from `crew_base` as of flight date; no covering row → `null`
- [x] Run test → expect fail
- [x] Implement: load flight date; `selectDistinctOn([crewId])` from `crewBase` with `effDt <= asOf`, `expDt` null or `> asOf`, `orderBy crewId, desc(effDt)`; map into items; add `base` to TS type
- [x] Run Vitest → pass

### Task 2: Scenario helper + dialog UI

**Files:** `build-scenario-flight-crew.ts` (+ test), `flight-detail-dialog.tsx`, `flight-detail-dialog.css`

- [x] Write failing Vitest: scenario items include `crew.base`; merge keeps Live mate base
- [x] Implement helper `base` field
- [x] Dialog: th `Base` after Name; cell `item.base \|\| '—'`; colspan 6 for empty row; css `.col-base`
- [x] Run gantt Vitest → pass

### Task 3: Playwright

**Files:** `scenario-detail-dialogs.spec.ts`, optionally `flight-pane.spec.ts`

- [x] Update header expect to include `Base`
- [x] Mock Live crew item with `base: 'YYZ'`; assert Live mate row shows `YYZ` (or scenario crew base for C0001)
- [x] Run `npx playwright test --config=config/playwright.config.ts --project=gantt -g Scen-2020 --reporter=list` → PASS
- [x] Paste PASS receipt; stop for user commit
