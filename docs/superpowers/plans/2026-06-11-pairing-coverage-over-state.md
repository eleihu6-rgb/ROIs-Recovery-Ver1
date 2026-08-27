# Pairing Coverage `over` State — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class `over` (over-staffed) crewing-coverage state to the live Pairing pane — selectable in the Coverage filter alongside Open/Partial/Full, with chips and bring-to-top behavior — backed by one shared classifier so all surfaces agree.

**Architecture:** Replace four copy-pasted coverage classifiers with a single canonical `classifyCoverage()` in gantt (mirrored once in live-server, which is a separate package). Coverage becomes a 4-state enum; every hardcoded "all 3 selected" check derives from `ALL_COVERAGE.length`. Precedence is shortage-wins: `over` requires no shortage anywhere plus at least one surplus. The left-edge border switches to a "no shortage" (`full` or `over`) predicate, fixing today's over-staffed inconsistency. The Comp column (`plan:fill`) is untouched.

**Tech Stack:** React 19 + TS + Zustand (gantt), Fastify + Drizzle + TS (live-server), Vitest (unit), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-06-11-pairing-coverage-over-state-design.md`

**Out of scope:** `scenario-pairing-pane.tsx` (keeps its own 3-state copy; its local `< 3` checks stay).

---

## File Structure

| File | Change |
|---|---|
| `gantt/src/utils/pairing-coverage.ts` | **Create** — `CoverageState`, `ALL_COVERAGE`, `classifyCoverage`, `isCoverageMet` |
| `gantt/src/utils/__tests__/pairing-coverage.test.ts` | **Create** — classifier table |
| `gantt/src/stores/filter-store.ts` | Re-export coverage types from the util; `< 3` → `< ALL_COVERAGE.length` |
| `gantt/src/components/layout/filter-dialog.tsx` | Add `Over` option; derive counts/chip/reset from `ALL_COVERAGE` |
| `gantt/src/components/panes/pairing-pane.tsx` | Use `classifyCoverage`; `< 3` → `< ALL_COVERAGE.length`; reset → all states |
| `gantt/src/services/pairing-api.ts` | `getDetail` isFull via `isCoverageMet` |
| `gantt/src/utils/bring-matches-to-top.ts` | `>= 3` → `>= ALL_COVERAGE.length` |
| `gantt/src/version.ts` | `FRONTEND_VERSION +1`, `BACKEND_VERSION +1` |
| `live-server/src/services/pairing/pairing-service.ts` | Mirrored `classifyCoverage`; `isFull` = no-shortage; `coverageActive` length `< 4` |
| `live-server/src/services/pairing/__tests__/coverage.test.ts` | **Create** — same classifier table |
| `live-server/src/routes/pairing/pairing.ts` | Validate `coverage` CSV against known states |
| `e2e/tests/gantt/pairing-coverage-over.spec.ts` | **Create** — filter option + chip regression |

---

## Task 1: Shared coverage classifier (gantt)

**Files:**
- Create: `gantt/src/utils/pairing-coverage.ts`
- Test: `gantt/src/utils/__tests__/pairing-coverage.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// gantt/src/utils/__tests__/pairing-coverage.test.ts
import { describe, it, expect } from 'vitest'
import { classifyCoverage, isCoverageMet, ALL_COVERAGE } from '../pairing-coverage'

describe('classifyCoverage', () => {
  it('no composition requirement → full', () => {
    expect(classifyCoverage([])).toBe('full')
  })
  it('total fill 0 → open', () => {
    expect(classifyCoverage([{ plan: 1, fill: 0 }, { plan: 1, fill: 0 }])).toBe('open')
  })
  it('every slot exactly met → full', () => {
    expect(classifyCoverage([{ plan: 2, fill: 2 }, { plan: 1, fill: 1 }])).toBe('full')
  })
  it('a slot short → partial', () => {
    expect(classifyCoverage([{ plan: 2, fill: 1 }, { plan: 1, fill: 1 }])).toBe('partial')
  })
  it('no shortage, a slot over → over', () => {
    expect(classifyCoverage([{ plan: 2, fill: 3 }, { plan: 1, fill: 1 }])).toBe('over')
  })
  it('shortage wins over surplus (over on one rank, short on another) → partial', () => {
    expect(classifyCoverage([{ plan: 2, fill: 3 }, { plan: 1, fill: 0 }])).toBe('partial')
  })
  it('isCoverageMet true for full and over, false for open/partial', () => {
    expect(isCoverageMet([{ plan: 1, fill: 1 }])).toBe(true)   // full
    expect(isCoverageMet([{ plan: 1, fill: 2 }])).toBe(true)   // over
    expect(isCoverageMet([{ plan: 1, fill: 0 }])).toBe(false)  // open
    expect(isCoverageMet([{ plan: 2, fill: 1 }])).toBe(false)  // partial
  })
  it('ALL_COVERAGE lists exactly the four states', () => {
    expect(ALL_COVERAGE).toEqual(['open', 'partial', 'full', 'over'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gantt && npx vitest run src/utils/__tests__/pairing-coverage.test.ts`
Expected: FAIL — `Cannot find module '../pairing-coverage'`.

- [ ] **Step 3: Write the implementation**

```ts
// gantt/src/utils/pairing-coverage.ts
/**
 * Canonical pairing crewing-coverage classifier (single source of truth).
 *
 * States (mutually exclusive, exactly one per pairing):
 *  - full    : no composition requirement, OR every slot fill === plan
 *  - open    : has requirement(s) but total fill === 0 (nobody assigned)
 *  - partial : at least one slot is short (fill < plan)        ← shortage wins
 *  - over    : no slot short AND at least one slot over (fill > plan)
 *
 * Precedence is shortage-wins: a pairing over-staffed on one rank but short on
 * another classifies as `partial` — a row that still needs crew never hides
 * under `over`.
 *
 * MIRROR: live-server/src/services/pairing/pairing-service.ts keeps an identical
 * copy (separate package, cannot import). Keep both and their test tables in sync.
 */
export type CoverageState = 'open' | 'partial' | 'full' | 'over'

export const ALL_COVERAGE: CoverageState[] = ['open', 'partial', 'full', 'over']

export interface CoverageSlot {
  plan: number
  fill: number
}

export const classifyCoverage = (comp: CoverageSlot[]): CoverageState => {
  if (comp.length === 0) return 'full'
  let totalFill = 0
  let anyShort = false
  let anyOver = false
  for (const s of comp) {
    const plan = s.plan ?? 0
    const fill = s.fill ?? 0
    totalFill += fill
    if (fill < plan) anyShort = true
    if (fill > plan) anyOver = true
  }
  if (totalFill === 0) return 'open'
  if (anyShort) return 'partial'
  if (anyOver) return 'over'
  return 'full'
}

/** "All needs met" predicate for the left-edge border: full or over (no shortage). */
export const isCoverageMet = (comp: CoverageSlot[]): boolean => {
  const state = classifyCoverage(comp)
  return state === 'full' || state === 'over'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gantt && npx vitest run src/utils/__tests__/pairing-coverage.test.ts`
Expected: PASS (8 passing).

- [ ] **Step 5: Commit**

```bash
git add gantt/src/utils/pairing-coverage.ts gantt/src/utils/__tests__/pairing-coverage.test.ts
git commit -m "feat(gantt): canonical pairing coverage classifier with over state"
```

---

## Task 2: Re-export coverage types from filter-store; un-hardcode the 3

**Files:**
- Modify: `gantt/src/stores/filter-store.ts`

`filter-store.ts` currently declares (around lines 36-38):
```ts
/** Pairing crewing coverage state, computed from composition fill vs plan. */
export type CoverageState = 'open' | 'partial' | 'full'
export const ALL_COVERAGE: CoverageState[] = ['open', 'partial', 'full']
```

- [ ] **Step 1: Re-export from the new util instead of redeclaring**

Replace those three lines with:
```ts
/** Pairing crewing coverage state (canonical definition lives in utils/pairing-coverage). */
export type { CoverageState } from '@/utils/pairing-coverage'
export { ALL_COVERAGE } from '@/utils/pairing-coverage'
```

Add to the import block at the top of the file:
```ts
import { ALL_COVERAGE } from '@/utils/pairing-coverage'
```
(Needed because Step 2 references `ALL_COVERAGE.length` at runtime; the `export {}` re-export alone is type/value-erased at use sites in this module.)

- [ ] **Step 2: Replace the hardcoded coverage count check**

In `activeFilterCount` (around line 225):
```ts
// before
if (pairing.coverage.length > 0 && pairing.coverage.length < 3) count++
// after
if (pairing.coverage.length > 0 && pairing.coverage.length < ALL_COVERAGE.length) count++
```

Leave `DEFAULT_PAIRING_FILTER.coverage: ['open', 'partial']` unchanged (Over off by default).

- [ ] **Step 3: Typecheck**

Run: `cd gantt && npx tsc --noEmit`
Expected: no new errors from `filter-store.ts` (pre-existing repo errors per project notes are unrelated).

- [ ] **Step 4: Commit**

```bash
git add gantt/src/stores/filter-store.ts
git commit -m "refactor(gantt): source CoverageState/ALL_COVERAGE from shared util"
```

---

## Task 3: Filter dialog — add Over option, derive counts/chip/reset

**Files:**
- Modify: `gantt/src/components/layout/filter-dialog.tsx`

- [ ] **Step 1: Import ALL_COVERAGE**

Add to the imports (near the `CoverageState` import):
```ts
import { ALL_COVERAGE } from '@/utils/pairing-coverage'
```

- [ ] **Step 2: Add the Over pill option**

Replace `COVERAGE_OPTIONS` (around lines 29-31):
```ts
const COVERAGE_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'partial', label: 'Partial' },
  { value: 'full', label: 'Full' },
  { value: 'over', label: 'Over' },
]
```

- [ ] **Step 3: Un-hardcode the reset default in the dialog Reset handler (around line 89)**

```ts
// before
setLocalPairing({ bases: [], fleets: [], divisions: [], depArps: [], coverage: ['open', 'partial'], assignments: [], label: '' })
```
Leave this as-is — the dialog's Reset returns to the app default (`open + partial`), which is correct. No change.

- [ ] **Step 4: Un-hardcode the active-count and "remove resets to all" (lines ~94 and ~111)**

In `pairingCount` (line ~94), replace the `< 3`:
```ts
+ ((localPairing.coverage.length > 0 && localPairing.coverage.length < ALL_COVERAGE.length) ? 1 : 0)
```

In the coverage chip (`summaryChips`, line ~111), replace BOTH the `< 3` guard and the reset literal:
```ts
if (localPairing.coverage.length > 0 && localPairing.coverage.length < ALL_COVERAGE.length)
  chips.push({
    id: 'p-cov', tier: 'pairing', key: 'pairing:coverage',
    val: localPairing.coverage.map((c) => c[0].toUpperCase() + c.slice(1)).join(', '),
    onRemove: () => setLocalPairing((p) => ({ ...p, coverage: [...ALL_COVERAGE] })),
  })
```

- [ ] **Step 5: Typecheck**

Run: `cd gantt && npx tsc --noEmit`
Expected: no new errors. The `PillGroup` `onChange` cast `v as CoverageState[]` now accepts `'over'`.

- [ ] **Step 6: Commit**

```bash
git add gantt/src/components/layout/filter-dialog.tsx
git commit -m "feat(gantt): Over coverage option + chip in pairing filter"
```

---

## Task 4: Pairing pane — use classifier, un-hardcode 3, reset to all

**Files:**
- Modify: `gantt/src/components/panes/pairing-pane.tsx`

The pane currently has a local `computeCoverage` (lines ~45-56) and two `coverage.length < 3` checks (chip at ~360, `coverageActive` at ~435), plus reset literals.

- [ ] **Step 1: Import the shared classifier + ALL_COVERAGE**

Add to imports:
```ts
import { classifyCoverage, ALL_COVERAGE } from '@/utils/pairing-coverage'
```

- [ ] **Step 2: Delete the local computeCoverage, use the shared one**

Remove the local `const computeCoverage = (p: Pairing): CoverageState => { ... }` block (lines ~45-56). Replace its two call sites:
```ts
// line ~446
if (coverageSel.includes(classifyCoverage(pi.pairing.composition ?? []))) n++
// line ~459
coverageActive && !isLabel(pi) && coverageSel.includes(classifyCoverage(pi.pairing.composition ?? []))
```

- [ ] **Step 3: Un-hardcode the chip guard + reset (lines ~360-368)**

```ts
if (appliedPairingFilter && appliedPairingFilter.coverage.length > 0 && appliedPairingFilter.coverage.length < ALL_COVERAGE.length) {
  chips.push({
    id: `coverage:${appliedPairingFilter.coverage.join(',')}`,
    label: 'Coverage',
    value: appliedPairingFilter.coverage.map((c) => c[0].toUpperCase() + c.slice(1)).join(', '),
    onRemove: () => {
      useFilterStore.getState().setPairingFilter({ coverage: [...ALL_COVERAGE] })
      void applyGanttFilters()
    },
  })
}
```

- [ ] **Step 4: Un-hardcode coverageActive (line ~435)**

```ts
const coverageActive = coverageSel.length > 0 && coverageSel.length < ALL_COVERAGE.length
```

- [ ] **Step 5: Typecheck**

Run: `cd gantt && npx tsc --noEmit`
Expected: no new errors; `CoverageState` import in the pane (if now unused) removed.

- [ ] **Step 6: Commit**

```bash
git add gantt/src/components/panes/pairing-pane.tsx
git commit -m "feat(gantt): pairing pane floats Over rows; shared classifier"
```

---

## Task 5: Pairing detail isFull via shared "met" predicate

**Files:**
- Modify: `gantt/src/services/pairing-api.ts`

`getDetail` backfills `isFull` (line ~81) as `composition.length > 0 && composition.every((s) => s.fill >= s.plan)`. Switch to the shared predicate so detail-loaded and list-loaded rows (and the left-edge border) agree, including over-staffed.

- [ ] **Step 1: Import isCoverageMet**

```ts
import { isCoverageMet } from '@/utils/pairing-coverage'
```

- [ ] **Step 2: Replace the isFull backfill (line ~81)**

```ts
// before
pairing.isFull = pairing.composition.length > 0 && pairing.composition.every((s) => s.fill >= s.plan)
// after
pairing.isFull = isCoverageMet(pairing.composition)
```

- [ ] **Step 3: Typecheck**

Run: `cd gantt && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add gantt/src/services/pairing-api.ts
git commit -m "fix(gantt): unify detail-load isFull with coverage met predicate"
```

---

## Task 6: bring-to-top "all selected = no-op" check

**Files:**
- Modify: `gantt/src/utils/bring-matches-to-top.ts`

- [ ] **Step 1: Import ALL_COVERAGE**

```ts
import { ALL_COVERAGE } from '@/utils/pairing-coverage'
```
(If the file already imports from `@/stores/filter-store`, importing `ALL_COVERAGE` directly from the util is fine and avoids a cycle.)

- [ ] **Step 2: Replace the guard (line ~227)**

```ts
// before
if (coverage.length === 0 || coverage.length >= 3) return
// after
if (coverage.length === 0 || coverage.length >= ALL_COVERAGE.length) return
```

- [ ] **Step 3: Typecheck**

Run: `cd gantt && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add gantt/src/utils/bring-matches-to-top.ts
git commit -m "fix(gantt): coverage bring-to-top no-op uses ALL_COVERAGE length"
```

---

## Task 7: live-server — mirrored classifier, isFull = no-shortage, length < 4

**Files:**
- Modify: `live-server/src/services/pairing/pairing-service.ts`
- Test: `live-server/src/services/pairing/__tests__/coverage.test.ts` (create)

Current code (lines ~362, ~374-387) computes `itemIsFull = composition.every((s) => s.plan === s.fill)` and classifies coverage inline with a `length < 3` gate.

- [ ] **Step 1: Write the failing test**

```ts
// live-server/src/services/pairing/__tests__/coverage.test.ts
import { describe, it, expect } from 'vitest'
import { classifyCoverage, isCoverageMet } from '../coverage'

describe('classifyCoverage (live-server mirror)', () => {
  it('empty → full', () => expect(classifyCoverage([])).toBe('full'))
  it('total fill 0 → open', () => expect(classifyCoverage([{ plan: 1, fill: 0 }])).toBe('open'))
  it('exact → full', () => expect(classifyCoverage([{ plan: 2, fill: 2 }])).toBe('full'))
  it('short → partial', () => expect(classifyCoverage([{ plan: 2, fill: 1 }])).toBe('partial'))
  it('over (no short) → over', () => expect(classifyCoverage([{ plan: 1, fill: 2 }])).toBe('over'))
  it('short beats over → partial', () =>
    expect(classifyCoverage([{ plan: 1, fill: 2 }, { plan: 1, fill: 0 }])).toBe('partial'))
  it('met = full|over', () => {
    expect(isCoverageMet([{ plan: 1, fill: 1 }])).toBe(true)
    expect(isCoverageMet([{ plan: 1, fill: 2 }])).toBe(true)
    expect(isCoverageMet([{ plan: 1, fill: 0 }])).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd live-server && npx vitest run src/services/pairing/__tests__/coverage.test.ts`
Expected: FAIL — `Cannot find module '../coverage'`.

- [ ] **Step 3: Create the mirrored classifier**

```ts
// live-server/src/services/pairing/coverage.ts
/**
 * Pairing crewing-coverage classifier — MIRROR of
 * gantt/src/utils/pairing-coverage.ts. live-server is a separate package and
 * cannot import the gantt copy; keep both (and their test tables) in sync.
 * Precedence: shortage wins (over requires no shortage + at least one surplus).
 */
export type CoverageState = 'open' | 'partial' | 'full' | 'over'

export interface CoverageSlot { plan: number; fill: number }

export const classifyCoverage = (comp: CoverageSlot[]): CoverageState => {
  if (comp.length === 0) return 'full'
  let totalFill = 0
  let anyShort = false
  let anyOver = false
  for (const s of comp) {
    const plan = s.plan ?? 0
    const fill = s.fill ?? 0
    totalFill += fill
    if (fill < plan) anyShort = true
    if (fill > plan) anyOver = true
  }
  if (totalFill === 0) return 'open'
  if (anyShort) return 'partial'
  if (anyOver) return 'over'
  return 'full'
}

export const isCoverageMet = (comp: CoverageSlot[]): boolean => {
  const state = classifyCoverage(comp)
  return state === 'full' || state === 'over'
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd live-server && npx vitest run src/services/pairing/__tests__/coverage.test.ts`
Expected: PASS.

- [ ] **Step 5: Use the classifier in the list service**

In `pairing-service.ts`, add the import:
```ts
import { classifyCoverage, isCoverageMet } from './coverage'
```

Replace `itemIsFull` (line ~362):
```ts
const itemIsFull = isCoverageMet(composition)
```

Replace the coverage post-filter block (lines ~374-387):
```ts
const coverageActive = Array.isArray(coverage) && coverage.length > 0 && coverage.length < 4
if (coverageActive) {
  const want = new Set(coverage)
  enrichedItems = enrichedItems.filter((item) => want.has(classifyCoverage(item.composition)))
}
```

- [ ] **Step 6: Run the pairing service test suite**

Run: `cd live-server && npx vitest run src/__tests__/services/pairing`
Expected: PASS (update any assertion that hardcoded the old `plan===fill` isFull for an over-staffed fixture — bring it up to date per §Stale-Test; if none, all green).

- [ ] **Step 7: Commit**

```bash
git add live-server/src/services/pairing/coverage.ts live-server/src/services/pairing/__tests__/coverage.test.ts live-server/src/services/pairing/pairing-service.ts
git commit -m "feat(live-server): over coverage state + shared no-shortage isFull"
```

---

## Task 8: live-server route — validate coverage CSV

**Files:**
- Modify: `live-server/src/routes/pairing/pairing.ts`

`coverage` is `z.string().max(40).optional()` (line ~46) and is split on `,` downstream. Harden it so unknown tokens are dropped (defensive; keeps the contract a CSV string).

- [ ] **Step 1: Transform/validate the coverage query**

Replace the `coverage` zod field (line ~46):
```ts
coverage: z.string().max(40).optional()
  .transform((s) =>
    s == null ? s
      : s.split(',').map((t) => t.trim()).filter((t) => ['open', 'partial', 'full', 'over'].includes(t)).join(','),
  ),
```

- [ ] **Step 2: Typecheck**

Run: `cd live-server && npx tsc --noEmit`
Expected: no new errors. (`coverage` stays `string | undefined`.)

- [ ] **Step 3: Commit**

```bash
git add live-server/src/routes/pairing/pairing.ts
git commit -m "chore(live-server): validate pairing coverage query tokens"
```

---

## Task 9: Version bump

**Files:**
- Modify: `gantt/src/version.ts`

- [ ] **Step 1: Bump both counters**

```ts
export const BACKEND_VERSION = 80   // was 79
export const FRONTEND_VERSION = 165 // was 164
```
(`RULE_VERSION` unchanged.)

- [ ] **Step 2: Commit**

```bash
git add gantt/src/version.ts
git commit -m "chore: bump version B80/F165 (pairing over coverage state)"
```

---

## Task 10: Playwright e2e — Over option + chip regression

**Files:**
- Create: `e2e/tests/gantt/pairing-coverage-over.spec.ts`

This is the regression that would fail **before** the change (Over is not a selectable coverage option). Classification correctness (shortage-wins) is covered by the Vitest tables in Tasks 1 and 7. Data-dependent float assertions are guarded so the test is deterministic on the demo dataset.

Reference existing pairing/filter specs in `e2e/tests/gantt/` for the auth/setup pattern (sessionStorage seed via `addInitScript`, base path `/fpqe/gantt/`) and the filter-dialog test ids (`filter-pairing-coverage*`). Match their `beforeEach`/login helper exactly.

- [ ] **Step 1: Write the test**

```ts
// e2e/tests/gantt/pairing-coverage-over.spec.ts
import { test, expect } from '@playwright/test'
import { gotoGanttAuthed } from './helpers/gantt-auth' // use the same helper the other gantt specs use

test.describe('Pairing coverage — Over state', () => {
  test.beforeEach(async ({ page }) => {
    await gotoGanttAuthed(page)              // lands on the Live view, authed
    // ensure the Pairing pane is visible (PaneToggles) — mirror sibling pairing specs
  })

  test('Over is a selectable coverage option and renders an "Over" chip', async ({ page }) => {
    // Open the Filter dialog → Pairing tab → Coverage pill group
    await page.getByTestId('toolbar-filter-btn').click()
    await page.getByRole('tab', { name: /pairing/i }).click()

    // Regression core: an "Over" pill exists in the coverage group
    const overPill = page.getByTestId('filter-pairing-coverage-over')
    await expect(overPill).toBeVisible()

    // Select ONLY Over: deselect the defaults (Open, Partial) then pick Over
    await page.getByTestId('filter-pairing-coverage-open').click()    // toggle off
    await page.getByTestId('filter-pairing-coverage-partial').click() // toggle off
    await overPill.click()                                            // toggle on
    await page.getByRole('button', { name: /apply/i }).click()

    // A coverage chip reading "Over" appears in the pairing pane condition strip
    const chip = page.getByText('Over', { exact: true })
    await expect(chip).toBeVisible()
  })

  test('selecting all four coverage states clears the narrowing chip', async ({ page }) => {
    await page.getByTestId('toolbar-filter-btn').click()
    await page.getByRole('tab', { name: /pairing/i }).click()
    // defaults are open+partial; add full+over → all four selected → no narrowing
    await page.getByTestId('filter-pairing-coverage-full').click()
    await page.getByTestId('filter-pairing-coverage-over').click()
    await page.getByRole('button', { name: /apply/i }).click()
    // With all four selected the Coverage chip must NOT be present (no narrowing)
    await expect(page.getByText('Coverage', { exact: false })).toHaveCount(0)
  })
})
```

> NOTE for the implementer: confirm the exact test ids and toolbar/apply selectors against the live DOM and the sibling `e2e/tests/gantt/*pairing*`/`*filter*` specs before finalizing — the `PillGroup` `testIdPrefix="filter-pairing-coverage"` yields per-option ids like `filter-pairing-coverage-over`; adjust if the project's convention differs. Do not assert against guessed selectors — read the rendered DOM first.

- [ ] **Step 2: Run the test**

Run: `npx playwright test e2e/tests/gantt/pairing-coverage-over.spec.ts --reporter=list`
(Use `--no-deps` if pbs-server :3002 is down, per project e2e notes.)
Expected: PASS — both tests green.

- [ ] **Step 3: If selectors differ, fix the test to match the real DOM (not the other way around), re-run, and paste the PASS summary.**

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/gantt/pairing-coverage-over.spec.ts
git commit -m "test(e2e): pairing coverage Over option + chip regression"
```

---

## Final verification

- [ ] `cd gantt && npx vitest run src/utils/__tests__/pairing-coverage.test.ts` → PASS
- [ ] `cd live-server && npx vitest run src/services/pairing` → PASS
- [ ] `cd gantt && npx tsc --noEmit` → no new errors vs. baseline
- [ ] `npx playwright test e2e/tests/gantt/pairing-coverage-over.spec.ts --reporter=list` → PASS
- [ ] Paste all four receipts into the completion message (§No-Illusion).

## Self-review notes

- **Spec coverage:** model (T1/T7) · type+plumbing (T2,T3,T4,T6) · filter UI (T3) · backend (T7,T8) · border consistency via isFull=met (T5,T7) · versioning (T9) · tests (T1,T7,T10). All spec sections mapped.
- **`< 3` audit (live pane only):** filter-store:225 (T2), filter-dialog:94/111 (T3), pairing-pane:360/435 (T4), bring-matches-to-top:227 (T6), pairing-service coverageActive (T7). `scenario-pairing-pane.tsx:825` intentionally **left at `< 3`** (out of scope, stays 3-state).
- **Type consistency:** `classifyCoverage(CoverageSlot[]) → CoverageState`, `isCoverageMet(CoverageSlot[]) → boolean`, `ALL_COVERAGE: CoverageState[]` used identically across gantt and the live-server mirror.
