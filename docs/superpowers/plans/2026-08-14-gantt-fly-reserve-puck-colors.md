# Gantt FLY / Reserve Puck Colors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make FLY pucks blue and Reserve pucks light green (`#66CDAA`) in both Pairing and Roster panes.

**Architecture:** Extract a shared Reserve classifier and shared FLY/Reserve gradient constants. Wire `pairing-renderer.ts` and `roster-renderer.ts` segment paths through that helper so the two panes cannot drift.

**Tech Stack:** TypeScript, Canvas Gantt renderers, Vitest, Playwright.

## Global Constraints

- Shared Live/Scenario Gantt path only — no Live-only / Scenario-only fork.
- Reserve = `assignmentGroup === 'RES'` OR assignment ∈ `RES|CRAM|CRPM|PRAM|PRPM` (trim + upper).
- Do not recolor ordinary `SBY` / `ASBY` / `SSB`.
- FLY blue = existing roster gradient `#1e40af` → `#2563eb`.
- Reserve green = `#66CDAA` (same as pre-assigned RES).
- Flight pane / DB colors out of scope.
- §No-Auto-Commit unless user asks.
- TDD for the shared helper; Playwright for UI gate.

---

### Task 1: Shared Reserve classifier + color constants

**Files:**
- Create: `gantt/src/utils/puck-duty-color.ts`
- Create: `gantt/src/utils/__tests__/puck-duty-color.test.ts`

**Interfaces:**
- Produces:
  - `isReservePuck(assignmentGroup: string | null | undefined, assignment: string | null | undefined): boolean`
  - `ROSTER_FLIGHT_TOP`, `ROSTER_FLIGHT_BOTTOM`, `RESERVE_PUCK_COLOR` (`#66CDAA`)
  - `resolveSegmentPuckBaseColor(opts: { assignmentGroup, assignment, isDeadhead }): 'dhd' | 'reserve' | 'fly' | 'ground-fallback'` — or simpler: return hex for non-DHD segment fills.

- [ ] **Step 1: Write failing tests** for classifier + color selection
- [ ] **Step 2: Run vitest — expect FAIL**
- [ ] **Step 3: Implement helper**
- [ ] **Step 4: Run vitest — expect PASS**

### Task 2: Wire Pairing + Roster renderers

**Files:**
- Modify: `gantt/src/components/gantt/renderers/pairing-renderer.ts`
- Modify: `gantt/src/components/gantt/renderers/roster-renderer.ts`

- [ ] **Step 1: Pairing** — Reserve → `#66CDAA` gradient; normal FLY → blue (drop dark green)
- [ ] **Step 2: Roster segment path** — Reserve → `#66CDAA` gradient; FLY stays blue
- [ ] **Step 3: Re-run helper tests + any renderer unit tests**
- [ ] **Step 4: `npm run check:ui`**

### Task 3: Playwright + local visual verify

**Files:**
- Create or extend: `e2e/tests/gantt/...` with fixture FLY + RES + standalone RES
- Optionally extend `gantt-test-hook` with a read-only color probe if needed

- [ ] **Step 1: Add Playwright asserting FLY blue / Reserve light-green in both panes**
- [ ] **Step 2: Run Playwright**
- [ ] **Step 3: Start local gantt (`npm run dev` in gantt) and visually confirm**

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Reserve classifier C | 1 |
| FLY blue both panes | 2 |
| Reserve light green both panes (incl. segment path) | 2 |
| Pre-assigned RES unchanged | 2 (no change to ground path) |
| Unit tests | 1 |
| Playwright + local verify | 3 |
| Out of scope Flight/DB/SBY | none |
