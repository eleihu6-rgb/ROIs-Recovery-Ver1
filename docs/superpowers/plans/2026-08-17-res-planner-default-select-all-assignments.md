# RES Planner Default-Select All Assignments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pilot (and Cabin) RES Pairing Creator Define-tab assignment chips default to **all** call options for the active division (so PRPM is selected with PRAM/PRMM).

**Architecture:** One-line behavior change in three sites inside `gantt/src/stores/res-planner-store.ts`: stop capping defaults at 2 (`slice(0, 2)`). Cover with a focused Vitest store test, then a Playwright assertion on `data-active` for PRPM.

**Tech Stack:** Zustand store (gantt), Vitest, Playwright (`e2e/tests/gantt/`).

**Spec:** `docs/superpowers/specs/2026-08-17-res-planner-default-select-all-assignments-design.md`

## Global Constraints

- Touch only default-selection logic + tests; no Apply/Generate/backend/dictionary changes.
- Default = full list of assignment codes for the active division’s `callOptions` / fallback options.
- Preserve `setCallOptions` behavior when user already has a non-empty intersection of selected codes.
- UI English; Playwright must drive real UI (§Simulate-User).
- Do not commit unless the user explicitly asks (§No-Auto-Commit), except when the user already commanded commit for that deliverable.

---

## File map

| File | Role |
|------|------|
| `gantt/src/stores/res-planner-store.ts` | Fix three default-selection sites |
| `gantt/src/stores/__tests__/res-planner-store.test.ts` | Create — unit coverage for defaults |
| `e2e/tests/gantt/res-pairing-dialog.spec.ts` | Extend Live-1401 (or sibling) for PRPM `data-active` |

---

### Task 1: Failing store unit tests + fix defaults

**Files:**
- Create: `gantt/src/stores/__tests__/res-planner-store.test.ts`
- Modify: `gantt/src/stores/res-planner-store.ts` (initial state ~221, `setDivision` ~175, `setCallOptions` ~214)

**Interfaces:**
- Consumes: `useResPlannerStore`, `FALLBACK_CALL_OPTIONS` from `res-planner-store.ts`
- Produces: Pilot defaults include `PRAM`, `PRMM`, `PRPM`; Cabin defaults include `CRAM`, `CRPM`

- [ ] **Step 1: Write the failing test**

```typescript
// gantt/src/stores/__tests__/res-planner-store.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import { FALLBACK_CALL_OPTIONS, useResPlannerStore } from '../res-planner-store'

describe('res-planner-store default selectedAssignments', () => {
  beforeEach(() => {
    useResPlannerStore.setState({
      division: 'P',
      callOptions: {
        P: [...FALLBACK_CALL_OPTIONS.P],
        C: [...FALLBACK_CALL_OPTIONS.C],
      },
      selectedAssignments: FALLBACK_CALL_OPTIONS.P.slice(0, 2).map((o) => o.assignment),
    })
  })

  it('initial Pilot selection includes all fallback call codes including PRPM', () => {
    // Re-read after implementation will use store initial; for RED, assert desired API:
    useResPlannerStore.setState({
      selectedAssignments: FALLBACK_CALL_OPTIONS.P.map((o) => o.assignment),
    })
    // Actually for RED: reset to current production initial via a fresh import is hard;
    // instead call setDivision after seeding slice(0,2) state and assert full list —
    // OR assert setDivision('P') expands to all three (fails today).
    useResPlannerStore.getState().setDivision('P')
    expect(useResPlannerStore.getState().selectedAssignments).toEqual(
      FALLBACK_CALL_OPTIONS.P.map((o) => o.assignment),
    )
    expect(useResPlannerStore.getState().selectedAssignments).toContain('PRPM')
  })

  it('setDivision Cabin selects all cabin call codes', () => {
    useResPlannerStore.getState().setDivision('C')
    expect(useResPlannerStore.getState().selectedAssignments).toEqual(
      FALLBACK_CALL_OPTIONS.C.map((o) => o.assignment),
    )
  })

  it('setCallOptions falls back to all codes when selection empty for active division', () => {
    useResPlannerStore.setState({ division: 'P', selectedAssignments: [] })
    useResPlannerStore.getState().setCallOptions('P', [...FALLBACK_CALL_OPTIONS.P])
    expect(useResPlannerStore.getState().selectedAssignments).toEqual(
      FALLBACK_CALL_OPTIONS.P.map((o) => o.assignment),
    )
  })

  it('setCallOptions keeps non-empty intersection', () => {
    useResPlannerStore.setState({
      division: 'P',
      selectedAssignments: ['PRPM'],
    })
    useResPlannerStore.getState().setCallOptions('P', [...FALLBACK_CALL_OPTIONS.P])
    expect(useResPlannerStore.getState().selectedAssignments).toEqual(['PRPM'])
  })
})
```

Simplify the first test: do **not** pre-set full list; start from buggy `slice(0,2)` via `beforeEach`, then `setDivision('P')` — today that still applies `slice(0,2)`, so assertion for three codes **fails**.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd gantt && npx vitest run src/stores/__tests__/res-planner-store.test.ts
```

Expected: FAIL — `selectedAssignments` missing `PRPM` / length 2 vs 3.

- [ ] **Step 3: Minimal implementation**

In `res-planner-store.ts`:

1. `setDivision`:
```typescript
selectedAssignments: defaults, // was defaults.slice(0, Math.min(2, defaults.length))
```

2. Initial state:
```typescript
selectedAssignments: FALLBACK_CALL_OPTIONS.P.map((o) => o.assignment),
```

3. `setCallOptions` fallback branch:
```typescript
? (selected.length > 0 ? selected : codes)
```
(remove `codes.slice(0, Math.min(2, codes.length))`)

- [ ] **Step 4: Run tests — PASS**

```bash
cd gantt && npx vitest run src/stores/__tests__/res-planner-store.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit only if user asked** — otherwise leave staged/unstaged for user command.

---

### Task 2: Playwright — Pilot chips all active including PRPM

**Files:**
- Modify: `e2e/tests/gantt/res-pairing-dialog.spec.ts`

**Interfaces:**
- Consumes: `data-testid="res-assignment-PRAM|PRPM|PRMM"`, `data-active="true"|"false"`
- Produces: regression that would have failed before the store fix

- [ ] **Step 1: Extend Live-1401 (or add Live-1401b in same file)**

```typescript
test('Live-1401b: Pilot RES assignments default all selected including PRPM', async ({ page, request }) => {
  await seedGanttAuth(page, request)
  await gotoGantt(page)
  await page.getByTestId('res-pairing-button').click()
  await expect(page.getByTestId('res-planner-dialog')).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('res-div-P').click()
  for (const code of ['PRAM', 'PRMM', 'PRPM'] as const) {
    await expect(page.getByTestId(`res-assignment-${code}`)).toHaveAttribute('data-active', 'true')
  }
})
```

- [ ] **Step 2: Run Playwright**

```bash
cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps \
  tests/gantt/res-pairing-dialog.spec.ts --reporter=list
```

Expected: Live-1401 and Live-1401b PASS.

- [ ] **Step 3: Commit only if user asked.**

---

## Spec coverage check

| Spec § | Task |
|--------|------|
| §3 Goal all division options | Task 1 |
| §6 three store sites | Task 1 Step 3 |
| §7 store unit | Task 1 |
| §7 Playwright PRPM active | Task 2 |
| §4 non-goals | No backend tasks |

## Placeholder scan

None.

---

**Plan complete and saved to `docs/superpowers/plans/2026-08-17-res-planner-default-select-all-assignments.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
**2. Inline Execution** — execute in this session with checkpoints  

**Which approach?**
