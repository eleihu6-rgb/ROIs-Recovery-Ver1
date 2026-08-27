# Rule 8030 Confirm Dialog Flight Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group RuleConfirmDialog 8030 findings by `fltId` (cross-pairing) and keep only the earliest-`windowStartDt` flight.

**Architecture:** Frontend-only change in `groupRuleConfirmViolations`: parse `on flight N` from engine messages, aggregate members by flight, then filter 8030 groups to the single earliest segment start.

**Tech Stack:** TypeScript, Vitest (`gantt`), existing `RuleViolation` / confirm dialog.

**Spec:** `docs/superpowers/specs/2026-08-21-rule-8030-confirm-dialog-flight-group-design.md`

## Global Constraints

- Confirm dialog only; no API / recheck / Alert Center changes.
- Parse `fltId` from message; use `windowStartDt` for first-flight selection.
- Do not commit unless the user asks.

---

### Task 1: Unit tests for flight grouping + first-flight filter

**Files:**
- Modify: `gantt/src/components/roster/__tests__/rule-confirm-groups.test.ts`

- [ ] **Step 1:** Update fixture message to engine shape `Pilot aged N on flight {fltId} carrying…` and add `windowStartDt`.
- [ ] **Step 2:** Add/adjust cases: same flight different pairing → one group; two flights → only earlier `windowStartDt`; different pairings still separate when different flights.
- [ ] **Step 3:** Run `npx vitest run src/components/roster/__tests__/rule-confirm-groups.test.ts` in `gantt/` — expect FAIL on new assertions.

### Task 2: Implement grouping logic

**Files:**
- Modify: `gantt/src/components/roster/rule-confirm-groups.ts`
- Modify: `gantt/src/components/roster/rule-confirm-dialog.tsx` (comment only if still says pairing-level)

- [ ] **Step 1:** Update `RULE_8030_MESSAGE` regex + shared message rewrite for `on flight {id}`.
- [ ] **Step 2:** Group key = rule + instance + fltId (+ row prefix); merge members across pairings.
- [ ] **Step 3:** After grouping, among 8030 groups keep only earliest `windowStartDt` (tie-break smaller fltId).
- [ ] **Step 4:** Re-run vitest — expect PASS.
- [ ] **Step 5:** Grep e2e for 8030 confirm grouping; update if stale. Run focused Playwright if present.

### Task 3: Verify

- [ ] **Step 1:** Paste vitest PASS summary.
- [ ] **Step 2:** Stop; wait for user commit command.
