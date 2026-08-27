# Flight Detail Departure-Local Date Implementation Plan

> **For agentic workers:** Execute task-by-task with TDD. Checkboxes for tracking.

**Goal:** Flight Detail header date and Flight Date use departure-airport local calendar day of `schDepDtUtc`, matching STD.

**Architecture:** Add `formatFlightAirportLocalDate` (UTC ISO + IANA zone → `YYYY-MM-DD`); `flight-detail-dialog.tsx` prefers that over `flight.fltDt`.

**Tech Stack:** React/TS gantt, `date-fns`, existing `timezone-store` / airport TZ store, Vitest, Playwright if a Flight Detail e2e exists.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-24-flight-detail-dep-local-date-design.md`
- STD instant only (`schDepDtUtc`); fallback `fltDt` then `—`
- Display-only; no DB/API changes
- §Minimal-First / §Surgical; §Playwright-Required for UI
- Commit only when user asks

---

### Task 1: Helper + unit tests (TDD)

**Files:**
- Create: `gantt/src/components/flight/format-flight-airport-local-date.ts`
- Create: `gantt/src/components/flight/__tests__/format-flight-airport-local-date.test.ts`

- [x] **Step 1: Failing tests** — Vancouver evening: UTC next calendar day → local previous `YYYY-MM-DD`; missing inputs → `null`
- [x] **Step 2: Implement** using same Z-normalization spirit as `formatTime` / local date formatter in `timezone-store` (reuse or call existing day formatter)
- [x] **Step 3: Vitest PASS**

### Task 2: Wire dialog + Playwright

**Files:**
- Modify: `gantt/src/components/flight/flight-detail-dialog.tsx`
- Create or update: `e2e/tests/gantt/…` Flight Detail date assertion

- [x] Prefer local date from `schDepDtUtc` + `depZone` for both header and Flight Date
- [x] Keep testids; run focused Playwright; report PASS/FAIL

### Task 3: Docs status

- [x] Spec Status → Implemented (link this plan)
