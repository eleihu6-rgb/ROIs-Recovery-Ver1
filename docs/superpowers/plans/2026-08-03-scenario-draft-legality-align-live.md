# Scenario draft legality align Live — Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Make Scenario roster assign/remove/reassign draft legality match Live so unrelated pre-existing hard violations no longer silently block drops.

**Architecture:** Reuse `checkLiveDraftLegality` from Scenario by adding `contextType` / `scenarioId` options; Scenario builds before/after roster item lists and related pairing context, then delegates.

**Tech Stack:** gantt (React/TS), Vitest, existing `legalityPreviewApi.checkDraft`

## Global Constraints

- §Minimal-First / §Surgical — no speculative abstractions beyond shared Live path
- UI English; no new dialogs
- Tests must prove unrelated hard violations do not block Scenario assign

---

## Task 1: Failing Scenario controller tests

**Files:**
- Modify: `gantt/src/components/gantt/source/__tests__/scenario-edit-controller.test.ts`
- Modify mocks for `checkDraft` / `showConfirmDialog` / `toRuleViolations`

- [x] Mock `checkDraft` to return after with unrelated severity-2 violation; expect assign still pushes patch
- [x] Mock related soft violation; expect dialog called and patch applied when proceed=true
- [x] Mock related hard; expect no patch
- [x] Run test — PASS after code change

## Task 2: Extend `checkLiveDraftLegality` context

**Files:**
- Modify: `gantt/src/stores/roster-store.ts`
- Modify: `gantt/src/stores/__tests__/roster-store-draft-legality.test.ts` (assert scenario contextType passed when provided)

- [x] Add optional `contextType` / `scenarioId` to options; default live
- [x] Pass into both before/after `checkDraft` calls
- [x] Run existing draft-legality tests — PASS

## Task 3: Wire Scenario `previewScenarioPatch`

**Files:**
- Modify: `gantt/src/components/gantt/source/scenario-edit-controller.ts`

- [x] Build before + after via `buildScenarioRosterItems`
- [x] Call `checkLiveDraftLegality` with scenario context + related pairing ids/items
- [x] Remove local short-circuit `result.allowed && showConfirmDialog`
- [x] Run Scenario controller tests — PASS

## Task 4: Verify

- [x] `npx vitest run ...scenario-edit-controller.test.ts ...roster-store-draft-legality.test.ts`
- [x] Paste PASS receipt
