# Scenario Ref TZ after assign/recheck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After Scenario assign Save and after legality Recheck READY, Pairing Detail shows crew Rule 7500 Ref TZ without a full page refresh.

**Architecture:** Sync `recalculateAccRefTz` on `patch-output` before response so Save’s existing `reloadData` loads refs. On `scenario-legality-updated` → READY, reload gantt data and refresh an open Pairing Info dialog from the store.

**Tech Stack:** live-server Fastify + `acc-ref-tz-service`, gantt React stores/hooks, Vitest.

## Global Constraints

- Do not change 7500 algorithm; Acc Ref remains the writer of `duty_ref_tz`.
- Do not invent refs in INSERT or `applyScenarioPatchesToData`.
- Touch only scenario Save / Recheck READY / Pairing Detail refresh paths.
- UI strings stay English; §Minimal-First / §Surgical.

---

### Task 1: Sync Acc Ref on scenario patch-output

**Files:**
- Modify: `live-server/src/routes/scenario/scenario.ts` (`patch-output` handler)
- Modify or Create: focused Vitest under `live-server/src/` proving recalculate is invoked after successful patch (mock pool / service)

**Interfaces:**
- Consumes: `recalculateAccRefTz` from `services/rule-check/acc-ref-tz-service.ts` with `{ schema: 'scenario', scenarioId, rulesetId }` (same shape as `scenario-result-loader`)
- Produces: DB rows with written `duty_ref_tz` before `success(reply, …)`

- [ ] **Step 1:** Add failing test that patch-output path calls `recalculateAccRefTz` with scenario id + ruleset after patches apply.
- [ ] **Step 2:** Wire call after `applyScenarioRosterPatches` using `sc.rulesetId` (fallback 103 only if null, matching loader).
- [ ] **Step 3:** Run the focused Vitest; confirm PASS.

### Task 2: Reload gantt on legality READY

**Files:**
- Modify: `gantt/src/hooks/use-scenario-ws-updates.ts`
- Modify: `gantt/src/hooks/__tests__/use-scenario-ws-updates.test.ts`

**Interfaces:**
- Consumes: `fetchScenarioLegality` → `applyScenarioLegalityResponse`; `getScenarioGanttStore(id).getState().reloadData`
- Produces: refreshed `data.rosterDutyRefs` after READY

- [ ] **Step 1:** Failing test: READY legality message triggers `reloadData` for that scenarioId.
- [ ] **Step 2:** In READY branch, `await reloadData` then apply legality (or reload then apply — order: reload first so Pairing Detail rebuild sees refs; still apply violations).
- [ ] **Step 3:** Run Vitest PASS.

### Task 3: Open Pairing Info rebuilds refs after store refresh

**Files:**
- Modify: `gantt/src/components/pairing/pairing-info-dialog.tsx`
- Modify: `gantt/src/components/pairing/__tests__/pairing-info-dialog-crew-ref.test.tsx` (or small new test)

**Interfaces:**
- Consumes: scenario store `dataRevision` / `rosterDutyRefs`; `buildScenarioPairingInfo`
- Produces: updated dialog `rosterDutyRefs` while open

- [ ] **Step 1:** When `scenarioId != null` and dialog open, effect depends on gantt `dataRevision` (or `rosterDutyRefs`) and re-runs `buildScenarioPairingInfo`.
- [ ] **Step 2:** Unit test that revision bump refreshes refs in dialog state.
- [ ] **Step 3:** Run focused gantt Vitest PASS.

### Task 4: Verify

- [ ] Run live-server + gantt focused tests from Tasks 1–3; paste PASS summary.
- [ ] Optional: Playwright skipped unless time allows (spec marks optional).
