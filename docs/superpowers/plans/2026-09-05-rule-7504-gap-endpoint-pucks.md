# Rule 7504 gap-endpoint pucks Implementation Plan

> **For agentic workers:** implement task-by-task in this session (surgical port from rois-ai).

**Goal:** Crew 1015’s Alert Center 7504 finding lights the two WOCL duty pucks that bound the rest gap.

**Architecture:** Shared resolver in `violation-puck-window.ts`; Live/Scenario `build*ViolationMap` and tooltip call it. No renderer change.

**Tech Stack:** Gantt React/TS, Vitest, Playwright.

## Global Constraints

- §Gantt-Unify: Live and Scenario share the helper.
- §Surgical: 7504 only; do not copy 8056/8071 helpers.
- §Playwright-Required + §PW-Snapshot for the Live UI proof.

## Tasks

- [x] Spec written
- [ ] Failing Vitest for `mark7504GapDutyPucks` / tooltip 1015 shape
- [ ] Implement helper + wire Live/Scenario/tooltip
- [ ] Playwright: Alert Center 7504 + puck severity for crew 1015
- [ ] Playbook gotcha note
