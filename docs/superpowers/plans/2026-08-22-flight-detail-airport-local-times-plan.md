# Flight Detail Airport Local Times — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show STD/ETD/ATD in departure-airport local `HH:mm` and STA/ETA/ATA in arrival-airport local `HH:mm`.

**Architecture:** Thin helper wraps `formatTime(utc, zoneId)`; dialog passes `zoneIdFor(depArp|arvArp)`. Missing instant or zone → `—`.

**Tech Stack:** gantt React, `timezone-store.formatTime`, Vitest, Playwright.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-22-flight-detail-airport-local-times-design.md`
- Display: `HH:mm` only (no UTC/LT suffix)
- Do not change Block Hours / ops Status / header offsets
- §No-Auto-Commit unless user asks

---

### Task 1: Helper + Vitest

**Files:**
- Create: `gantt/src/components/flight/format-flight-airport-local-time.ts`
- Create: `gantt/src/components/flight/__tests__/format-flight-airport-local-time.test.ts`

**Interfaces:**
- Produces: `formatFlightAirportLocalTime(utcIso: string | null | undefined, zoneId: string | undefined): string`

- [ ] **Step 1:** Failing tests — null/empty/`—`; YVR `2026-09-08T02:15:00.000Z` + `America/Vancouver` → `19:15`; YUL `2026-09-08T07:15:00.000Z` + `America/Montreal` → `03:15`; missing zone → `—`
- [ ] **Step 2:** Implement via `formatTime` from timezone-store
- [ ] **Step 3:** Vitest PASS

### Task 2: Wire Flight Detail dialog

**Files:**
- Modify: `gantt/src/components/flight/flight-detail-dialog.tsx`

- [ ] Replace `formatTimeUtc` usages on STD/ATD/STA/ATA with helper + dep/arv zone
- [ ] Remove unused `formatTimeUtc` if orphaned

### Task 3: Playwright

**Files:**
- Modify: `e2e/tests/gantt/scenario-detail-dialogs.spec.ts` (Scen-2020)

- [ ] Assert STD/STA time cells do not contain `UTC` and match `HH:mm` when airport TZ available; or assert helper coverage if TZ mock unavailable
- [ ] Run Scen-2020 with proper config; paste PASS

---

**Self-review:** Spec mapping → Task 1+2; E2E → Task 3; no placeholders.
