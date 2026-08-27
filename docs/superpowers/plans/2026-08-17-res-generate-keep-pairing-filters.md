# RES Generate Keep Pairing Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After RES Pairing Generate, pairing assignment filter chips stay as they were (no auto PRAM/PRMM/PRPM or CRAM/CRPM chips).

**Architecture:** Remove `setPairingFilter({ assignments: codes })` from `handleGenerate`. Keep `applyGanttFilters()` so the pane refetches under the existing snapshot. Keep `codes` on `lastResult` for the result banner.

**Tech Stack:** Zustand filter-store, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-08-17-res-generate-keep-pairing-filters-design.md`

## Global Constraints

- Do not change generate API, conflict policy, or result banner.
- Keep `applyGanttFilters()` after generate (refresh without rewriting assignment filter).
- Keep `lastResult.codes` for the banner.
- §Stale-Test: YVR/YYZ acceptance tests that require auto chips and `pairings().length === 60` (that count only held because the pane was assignment-filtered) must be updated.
- Do not git commit unless the user explicitly asked.

---

## File map

| File | Role |
|------|------|
| `e2e/tests/gantt/res-pairing-yvr-acceptance.spec.ts` | Stop expecting PRAM/PRPM chips; count RES pairings by assignment |
| `e2e/tests/gantt/res-pairing-yyz-cabin-acceptance.spec.ts` | Same for CRAM/CRPM |
| `gantt/src/components/res-pairing/review-generate.tsx` | Remove `setPairingFilter` |

---

### Task 1: Failing e2e — Generate must not add assignment chips

**Files:**
- Modify: `e2e/tests/gantt/res-pairing-yvr-acceptance.spec.ts` (chip asserts ~108–110)
- Modify: `e2e/tests/gantt/res-pairing-yyz-cabin-acceptance.spec.ts` (chip asserts ~114–116)

**Interfaces:**
- Consumes: `pairing-filter-chip-PRAM` etc. from `pane-condition-strip.tsx`
- Produces: RED until product code stops calling `setPairingFilter`

- [ ] **Step 1: Change chip assertions**

YVR — replace:

```typescript
  await expect(page.getByTestId('pairing-filter-chip-PRAM')).toBeVisible()
  await expect(page.getByTestId('pairing-filter-chip-PRPM')).toBeVisible()
```

with:

```typescript
  await expect(page.getByTestId('pairing-filter-chip-PRAM')).toHaveCount(0)
  await expect(page.getByTestId('pairing-filter-chip-PRPM')).toHaveCount(0)
  await expect(page.getByTestId('pairing-filter-chip-PRMM')).toHaveCount(0)
```

YYZ cabin — replace CRAM/CRPM `toBeVisible()` with `toHaveCount(0)`.

Leave the `pairings().length === EXPECTED_TOTAL` asserts for now (they will stay green on RED run because auto-filter is still on).

- [ ] **Step 2: Run one acceptance file to prove RED**

```bash
cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps \
  tests/gantt/res-pairing-yvr-acceptance.spec.ts --reporter=list --workers=1
```

Expected: FAIL — `pairing-filter-chip-PRAM` count 1, expected 0.

If YVR is too slow/blocked, still land the assertion change and note the blocker; Task 2 must not skip the product deletion.

- [ ] **Step 3: Do not commit unless asked.**

---

### Task 2: Remove auto assignment filter + fix stale pane counts

**Files:**
- Modify: `gantt/src/components/res-pairing/review-generate.tsx`
- Modify: both acceptance specs (count helper)

**Interfaces:**
- Consumes: `useFilterStore` currently; after change, drop that import if unused
- Produces: generate no longer mutates `pairingFilter.assignments`

- [ ] **Step 1: Product change**

In `handleGenerate`, delete:

```typescript
      useFilterStore.getState().setPairingFilter({ assignments: codes })
```

Keep:

```typescript
      await applyGanttFilters()
      setLastResult({ created: result.created, skipped: result.skipped, codes })
      close()
```

Remove `import { useFilterStore } from '@/stores/filter-store'` if unused.

- [ ] **Step 2: Stale count asserts**

Without assignment filter, `__ganttTest.pairings().length` is the full loaded pairing list, not 60. Count by assignment instead.

YVR (`EXPECTED_TOTAL` still 60):

```typescript
  await page.waitForFunction(
    ({ expected, codes }) => {
      type P = { assignment?: string }
      type GanttTest = { pairings?: () => P[] }
      const w = window as unknown as { __ganttTest?: GanttTest }
      const n = (w.__ganttTest?.pairings?.() ?? []).filter((p) => codes.includes(p.assignment ?? '')).length
      return n >= expected
    },
    { expected: EXPECTED_TOTAL, codes: ['PRAM', 'PRPM'] },
    { timeout: 30_000 },
  )
  const count = await page.evaluate((codes: string[]) => {
    type P = { assignment?: string }
    type GanttTest = { pairings?: () => P[] }
    const w = window as unknown as { __ganttTest?: GanttTest }
    return (w.__ganttTest?.pairings?.() ?? []).filter((p) => codes.includes(p.assignment ?? '')).length
  }, ['PRAM', 'PRPM'])
  expect(count).toBe(EXPECTED_TOTAL)
```

YYZ: same with `['CRAM', 'CRPM']`.

Verify pairing objects expose `assignment` via `gantt/src/utils/gantt-test-hook.ts` `pairings()`. If the field is named `type` / `assignmentGroup`, use that field (inspect hook; do not guess in implementation).

- [ ] **Step 3: Run Playwright**

```bash
cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps \
  tests/gantt/res-pairing-yvr-acceptance.spec.ts \
  tests/gantt/res-pairing-yyz-cabin-acceptance.spec.ts \
  --reporter=list --workers=1
```

Expected: PASS. If YYZ/YVR cannot run (env), run whatever subset is possible and state the gap.

- [ ] **Step 4: Do not commit unless asked.**

---

## Spec coverage check

| Spec § | Task |
|--------|------|
| Remove auto assignment filter | Task 2 Step 1 |
| Keep applyGanttFilters + banner codes | Task 2 |
| YVR/YYZ chip asserts | Task 1 then 2 |
| Counts still prove generate | Task 2 Step 2 |

## Placeholder scan

None.

---

**Plan complete and saved to `docs/superpowers/plans/2026-08-17-res-generate-keep-pairing-filters.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task  
**2. Inline Execution** — this session  

**Which approach?**
