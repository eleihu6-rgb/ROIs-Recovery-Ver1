# Flight Pane Badge Flight Total — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flight pane title badge shows single-leg flight count (`flightTotal`), not RegNo row count.

**Architecture:** `listGrouped` returns `flightTotal` (pre-group flight rows) alongside `total` (post-group FlightItems). Live `flight-store` drives the badge from `flightTotal` / `unfilteredFlightTotal`. Scenario Flight toolbar uses the same leg-count semantic.

**Tech Stack:** live-server (Fastify + Vitest), gantt (Zustand + Playwright)

**Spec:** `docs/superpowers/specs/2026-07-19-flight-pane-badge-flight-total-design.md`

## Global Constraints

- UI English; badge tooltip: "Flights in date range" / "Filtered / total flights in date range"
- Do not change RegNo grouping / bin-pack behavior
- Cache key suffix bump (`:ft1`) so Redis does not serve payloads without `flightTotal`
- §Gantt-Unify: Scenario Flight badge same meaning as Live

---

### Task 1: live-server `flightTotal` on listGrouped

**Files:**
- Modify: `live-server/src/services/flight/flight-service.ts` (`listGrouped` return)
- Test: existing or new Vitest under `live-server/src/__tests__/` for flight list / groupFlights

**Produces:** `{ items, total, flightTotal }` where `flightTotal === allFlights.length`, `total === allItems.length`

- [x] Write failing test: fixture where two overlapping legs on same register → `flightTotal === 2`, `total === 2` (or 1 if no overlap — use forced overlap so `total < flightTotal` when `#2` appears)
- [x] Implement `flightTotal` + cache key `:ft1`
- [x] Run unit test PASS

### Task 2: gantt flight-store + Live badge

**Files:**
- Modify: `gantt/src/services/flight-api.ts` (types)
- Modify: `gantt/src/stores/flight-store.ts`
- Modify: `gantt/src/components/panes/flight-pane.tsx`
- Modify: `gantt/src/components/panes/pane-toolbar.tsx` (tooltip copy if needed)
- Modify: `gantt/src/utils/gantt-test-hook.ts` (`flightTotals` / `counts.flightLegs`)

**Produces:** Badge uses flight totals; row `total` retained for sessions

- [x] Store `flightTotal` + `unfilteredFlightTotal`; unfiltered probe uses `r.flightTotal`
- [x] FlightPane passes flight totals to PaneToolbar
- [x] Update tooltips to flights wording
- [x] Vitest or hook assertion if store unit tests exist

### Task 3: Scenario Flight badge parity

**Files:**
- Modify: `gantt/src/components/panes/shared/flight-pane.tsx` and/or `scenario-flight-pane.tsx`
- Modify: `gantt/src/components/scenario-gantt/scenario-pane-toolbar.tsx` only if needed

**Produces:** Scenario toolbar `rowCount` for flight pane = leg count (sum of flights)

- [x] Compute leg count from scenario flight rows
- [x] Pass to ScenarioPaneToolbar

### Task 4: Playwright

**Files:**
- Create or extend: `e2e/tests/gantt/flight-pane-badge.spec.ts` (or similar)

- [x] Assert Flight badge equals flight leg count from hook/API
- [x] Prefer a case where legs ≠ RegNo rows when available; otherwise assert badge == `flightLegs` and document

### Task 5: Docs touch

- [x] One-line note in `docs/modules/gantt/flight-pane.md` that the header badge is flight legs
- [x] Mark spec status Implemented
