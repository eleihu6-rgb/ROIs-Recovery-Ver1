# Rule 8030 flt_num Message Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 8030 messages show `flt_num`; confirm dialog groups by structured `flightId`.

**Spec:** `docs/superpowers/specs/2026-08-21-rule-8030-message-flt-num-design.md`

## Global Constraints

- Do not commit unless asked.
- COF remains `flt_id`; never group confirm by `flt_num`.

---

### Task 1: Backend message + flight_id on rows

**Files:** `live-server/scripts/{live,scenario}-legality.mjs`, `legality-recheck-core.mjs`, related tests

- [ ] pilotAge returns `flt_num`
- [ ] rule8030 message uses flt_num; push `flight_id`
- [ ] normalizePreviewViolations maps `flightId`
- [ ] Unit test message / flight_id

### Task 2: Gantt confirm grouping by flightId

**Files:** `rule-check.ts`, `legality-preview-api.ts`, `rule-confirm-groups.ts` + tests, e2e mock

- [ ] Map `flightId` onto `RuleViolation`
- [ ] Group by `flightId`; display text still parses `on flight {label}`
- [ ] Vitest PASS
