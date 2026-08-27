# Gantt Pairing Rank Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared Pairing Rank filter with invalid Division/Rank motion feedback for Live and Scenario Gantt.

**Architecture:** Extend the shared `PairingFilter` model with `ranks`, add one shared composition-rank predicate, and consume it from both Scenario shared pairing filtering and the Live legacy pairing path. The Filter dialog owns the non-blocking invalid-combination UI feedback while filtering remains strict.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, Playwright, Tailwind token classes, Gantt shared source abstraction.

## Global Constraints

- Apply §Gantt-Unify: common filter behavior must work in Live and Scenario through shared code.
- Do not add backend filtering or indexes in this pass.
- Keep coverage as whole-pairing coverage; rank-scoped coverage is out of scope.
- Keep invalid combinations selectable; show warning and motion, do not auto-clear.
- Run `npm run check:ui` after frontend style changes.
- Bump `gantt/src/version.ts` frontend version for runtime frontend code changes.

---

### Task 1: Add Shared Rank Predicate And Store Shape

**Files:**

- Modify: `gantt/src/stores/filter-store.ts`
- Test: existing TypeScript compile and targeted filter tests in later tasks

**Interfaces:**

- Produces: `PairingFilter.ranks: string[]`
- Produces: `pairingCompositionMatchesRank(composition, ranks): boolean`
- Produces: store defaults/equality/active count/storage compatible with missing `ranks`

- [ ] Step 1: Run impact analysis for `PairingFilter` and `matchesPairingIdFilter`.
- [ ] Step 2: Add `ranks` to `PairingFilter`, default filters, reset state, equality checks, active count, and stored-filter normalization.
- [ ] Step 3: Add shared predicate:

```ts
export const pairingCompositionMatchesRank = (
  composition: Array<{ rank?: string | null }>,
  ranks: string[],
): boolean => ranks.length === 0 || composition.some((slot) => ranks.includes(slot.rank ?? ''))
```

---

### Task 2: Add Failing Predicate Tests

**Files:**

- Create or modify: `gantt/src/stores/__tests__/filter-store.test.ts`

**Interfaces:**

- Consumes: `pairingCompositionMatchesRank`

- [ ] Step 1: Write tests for no selected ranks, matching rank, non-matching rank, and empty composition.
- [ ] Step 2: Run the targeted test and verify it fails before implementation if the predicate is not yet present, or fails for the missing cases before final implementation.
- [ ] Step 3: Run again after implementation and verify pass.

Command:

```bash
cd gantt && npm run test -- src/stores/__tests__/filter-store.test.ts --runInBand
```

If the project uses Vitest directly instead of `npm run test`, use the package script shown in `gantt/package.json`.

---

### Task 3: Wire Shared Matching Into Scenario And Live

**Files:**

- Modify: `gantt/src/components/gantt/source/scenario-gantt-source.ts`
- Modify: `gantt/src/components/panes/pairing-pane.tsx`
- Modify if needed: `gantt/src/components/gantt/source/live-gantt-source.ts`

**Interfaces:**

- Consumes: `PairingFilter.ranks`
- Consumes: `pairingCompositionMatchesRank(composition, ranks)`

- [ ] Step 1: Run impact analysis for `pairingMatchesSharedFilter`, `PairingPane`, and `makeLivePairingPaneSource`.
- [ ] Step 2: Update Scenario `pairingMatchesSharedFilter` to require composition rank match.
- [ ] Step 3: Update Live pairing item filtering so `ranks` hard-filters loaded pairings before coverage float/reorder.
- [ ] Step 4: Ensure Live source rows and legacy pane do not diverge on rank semantics.

---

### Task 4: Add Rank UI And Invalid Feedback

**Files:**

- Modify: `gantt/src/components/layout/filter-dialog.tsx`

**Interfaces:**

- Consumes: `PairingFilter.ranks`
- Produces: `getPairingRankDivisionConflict(divisions, ranks): string | null`
- Produces: `data-testid="filter-pairing-rank"`
- Produces: invalid warning text exactly:
  `Invalid rank for selected division. Use P with CA/FO, or C with FA/IFD.`

- [ ] Step 1: Run impact analysis for `FilterDialog`.
- [ ] Step 2: Add Pairing `Rank` dropdown after Division and before Base.
- [ ] Step 3: Add summary chip `pairing:rank`.
- [ ] Step 4: Add warning and motion class around the rank field when a P/C + rank conflict exists.

---

### Task 5: Add UI Regression Coverage

**Files:**

- Create or modify: `e2e/tests/gantt/filter-pairing-rank.spec.ts`
- Reuse existing Gantt helpers in `e2e/utils/gantt-hook.ts`

**Interfaces:**

- Consumes: `data-testid="filter-pairing-rank"`
- Consumes: warning text from Task 4

- [ ] Step 1: Add Playwright coverage that opens Live Gantt, opens Pairing filter, selects rank, applies, and checks chips/state.
- [ ] Step 2: Add Scenario coverage for the same rank selector path.
- [ ] Step 3: Add invalid combination coverage for `Division=P` + `Rank=FA` warning and active chips.

Command:

```bash
cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/filter-pairing-rank.spec.ts --reporter=list
```

---

### Task 6: Version And Verification

**Files:**

- Modify: `gantt/src/version.ts`
- Run: targeted unit test, targeted Playwright test, `npm run check:ui`

- [ ] Step 1: Bump `FRONTEND_VERSION` by 1.
- [ ] Step 2: Run targeted unit tests.
- [ ] Step 3: Run targeted Playwright test.
- [ ] Step 4: Run `npm run check:ui`.
- [ ] Step 5: Run `detect_changes({ scope: "compare", base_ref: "main" })` or the available codebase-memory change detector to confirm affected scope.
