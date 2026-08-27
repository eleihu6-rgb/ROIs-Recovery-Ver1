# Flight Detail Crew Assignment Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crew Assignment table shows only CREW ID, NAME, ACTIVE RANK, ACTING RANK, SOURCE (Live + Scenario).

**Architecture:** Surgical edit of shared `FlightDetailDialog` + CSS; Playwright asserts headers.

**Tech Stack:** React/TS (gantt), Playwright e2e

## Global Constraints

- English UI labels only
- Live + Scenario shared path (§Gantt-Unify)
- No API changes
- Playwright required for UI change

---

### Task 1: Columns + CSS + Playwright

**Files:**
- Modify: `gantt/src/components/flight/flight-detail-dialog.tsx`
- Modify: `gantt/src/components/flight/flight-detail-dialog.css`
- Modify: `e2e/tests/gantt/flight-pane.spec.ts` (extend Live-1073) or add focused assertions

- [ ] **Step 1: Failing Playwright assertion** — open Flight Detail; expect headers CREW ID, NAME, ACTIVE RANK, ACTING RANK, SOURCE; expect Seq/Label/MBH/MFDP absent
- [ ] **Step 2: Update table** — five columns; remap Rank/Acting labels; fix unfilled/empty `colSpan`
- [ ] **Step 3: Trim CSS** — remove unused `.col-seq` / `.col-label` / `.col-mbh` / `.col-mfdp` (and dead helpers if unused)
- [ ] **Step 4: Run** `npx playwright test e2e/tests/gantt/flight-pane.spec.ts --reporter=list` (or the file you extended)
- [ ] **Step 5: Commit** when user asks
