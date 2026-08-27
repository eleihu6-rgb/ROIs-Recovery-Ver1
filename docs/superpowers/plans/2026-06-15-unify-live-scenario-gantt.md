# Unify Live & Scenario Gantt — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Live and Scenario Gantt render from one shared component set, so a feature is built once and appears in both views; end state deletes the `scenario-gantt/*` fork.

**Architecture:** Generalize the existing scenario per-scenario store registry into a context-keyed factory (`contextId = 'live' | scenarioId`) provided by a `<GanttContextProvider>`, with a compatibility shim so Live's existing singleton imports keep working. UI differences become capability flags, not separate files. Delivered in 6 phases; both views stay green + Playwright-tested after each.

**Tech Stack:** React 19 + Vite + TypeScript, Zustand stores, Canvas gantt, Playwright + Vitest. Spec: `docs/superpowers/specs/2026-06-15-unify-live-scenario-gantt-design.md`.

---

## Phase roadmap (each phase = a self-contained, testable unit)

| Phase | Deliverable | Gate (both views green) |
|---|---|---|
| **1** (detailed below) | Store-context factory + `<GanttContextProvider>` + compat shim; Live keyed `'live'`. Zero behavior change. | Vitest factory unit tests pass; full existing Live + scenario 6/460 Playwright suites green. |
| **2** ✅ DONE | Unify filter + sort store shapes: add `register?` to `FlightFilter` (Live `CrewFilter` already had fleets/crewIds); convert `pane-store` to context factory + shim; move scenario roster sort into the context `pane-store` (`'scenario-roster'`). | ✅ Scenario sort persists across tab suspend (Scen-2031, 3/3 stable); Live filter/sort unaffected; 200 unit tests pass; check:ui 0 hard; scenario-460 renders. Commits `d81066c4`..`a1127ab9`. |
| **3** ✅ DONE | Scenario panes consume the shared `FilterDialog` (contextId-driven) + multi-key `SortDialog` + condition strip; client-side filtering from `getFilterStore(scenarioId)`; dead scenario filter code removed. | ✅ Scenario filter parity (Scen-2032/2033/2034) + multi-key sort (Scen-2035) + parity gate on **6 & 460** (Scen-2036); pairing coverage-default regression caught+fixed; Live filter unchanged. Commits `7c24173f`..`98864b9d`. |
| **4** | Collapse toolbar into one capability-gated component (`gantt-toolbar`). | Live toolbar unchanged; scenario shows edit-lock section + capability-allowed shared controls. |
| **5** | Collapse pane wrappers (`roster`/`pairing`/`flight`) + layout grid + panel splitter to shared. | Both views render identically from shared wrappers; canvas/edit/lock preserved. |
| **6** | Delete `scenario-gantt/scenario-*` forks + `ScenarioCrewFilter`; re-measure sharing %. | `scripts/measure-gantt-sharing.sh` shows a large jump from 45.3%; append tracker row. |

> Phases 2–6 are expanded into their own detailed task lists (via writing-plans) when reached. Their deliverables/gates above are the contract. This document fully details **Phase 1**.

---

## Phase 1 — Store-context factory + provider + compat shim

**Why first:** Everything else resolves stores through context. This phase introduces the
mechanism with **zero behavior change** (Live keeps its singleton via an alias), so it's safe to
land and verify before any UI collapse.

### File structure (Phase 1)

- Create `gantt/src/components/gantt/context/gantt-context.tsx` — the `contextId` provider + hook. One responsibility: expose `'live' | number` to the subtree.
- Create `gantt/src/stores/create-context-store.ts` — generic registry helper (`get`/`destroy` keyed by `contextId`). One responsibility: instance-per-context bookkeeping.
- Create `gantt/src/stores/__tests__/create-context-store.test.ts` — unit tests for the helper.
- Modify `gantt/src/stores/filter-store.ts` — convert to factory + registry + compat shim (proof-of-pattern store for Phase 1).
- Create `gantt/src/stores/__tests__/filter-store-context.test.ts` — unit tests for the shim + context resolution.
- Modify `gantt/src/components/layout/app-layout.tsx` — wrap Live tree in `<GanttContextProvider contextId="live">`.
- Modify `gantt/src/components/scenario-gantt/scenario-gantt-view.tsx` — wrap scenario tree in `<GanttContextProvider contextId={scenarioId}>`.
- Modify `gantt/src/version.ts` — bump `FRONTEND_VERSION`.

---

### Task 1: Generic context-store registry helper

**Files:**
- Create: `gantt/src/stores/create-context-store.ts`
- Test: `gantt/src/stores/__tests__/create-context-store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// gantt/src/stores/__tests__/create-context-store.test.ts
import { describe, expect, it } from 'vitest'
import { createContextStoreRegistry, type GanttContextId } from '../create-context-store'

describe('createContextStoreRegistry', () => {
  it('returns the same instance for the same contextId', () => {
    let calls = 0
    const reg = createContextStoreRegistry((id: GanttContextId) => ({ id, n: calls++ }))
    expect(reg.get('live')).toBe(reg.get('live'))
    expect(reg.get(6)).toBe(reg.get(6))
  })

  it('returns distinct instances per contextId', () => {
    const reg = createContextStoreRegistry((id: GanttContextId) => ({ id }))
    expect(reg.get('live')).not.toBe(reg.get(6))
    expect(reg.get(6)).not.toBe(reg.get(460))
  })

  it('recreates after destroy', () => {
    const reg = createContextStoreRegistry((id: GanttContextId) => ({ id }))
    const first = reg.get(6)
    reg.destroy(6)
    expect(reg.get(6)).not.toBe(first)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gantt && npx vitest run src/stores/__tests__/create-context-store.test.ts`
Expected: FAIL — cannot find module `../create-context-store`.

- [ ] **Step 3: Write minimal implementation**

```ts
// gantt/src/stores/create-context-store.ts
export type GanttContextId = 'live' | number

/**
 * Registry of per-context store instances. Live uses the permanent 'live' key
 * (effectively a singleton); each scenario uses its numeric scenarioId.
 * Generalizes the existing getScenarioGanttStore(id) pattern to also serve Live.
 */
export function createContextStoreRegistry<S>(factory: (id: GanttContextId) => S) {
  const registry = new Map<GanttContextId, S>()
  const get = (id: GanttContextId): S => {
    let inst = registry.get(id)
    if (!inst) {
      inst = factory(id)
      registry.set(id, inst)
    }
    return inst
  }
  const destroy = (id: GanttContextId): void => {
    registry.delete(id)
  }
  return { get, destroy }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gantt && npx vitest run src/stores/__tests__/create-context-store.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add gantt/src/stores/create-context-store.ts gantt/src/stores/__tests__/create-context-store.test.ts
git commit -m "feat(gantt): context-store registry helper (live|scenarioId)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: GanttContext provider + hook

**Files:**
- Create: `gantt/src/components/gantt/context/gantt-context.tsx`
- Test: `gantt/src/components/gantt/context/__tests__/gantt-context.test.tsx`

- [ ] **Step 1: Write the failing test**

> NOTE: `@testing-library/react` is NOT a dependency (only `@testing-library/jest-dom`). Do NOT add
> it. Use `react-dom/server`'s `renderToStaticMarkup` (react-dom is already a dep, jsdom env is
> configured in `vite.config.ts`) to exercise the provider + hook without a new dependency.

```tsx
// gantt/src/components/gantt/context/__tests__/gantt-context.test.tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GanttContextProvider, useGanttContextId } from '../gantt-context'

const Probe = () => <span>{String(useGanttContextId())}</span>

describe('GanttContext', () => {
  it("defaults to 'live' with no provider", () => {
    const html = renderToStaticMarkup(<Probe />)
    expect(html).toContain('live')
  })

  it('provides the scenario id', () => {
    const html = renderToStaticMarkup(
      <GanttContextProvider contextId={6}>
        <Probe />
      </GanttContextProvider>,
    )
    expect(html).toContain('6')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gantt && npx vitest run src/components/gantt/context/__tests__/gantt-context.test.tsx`
Expected: FAIL — cannot find module `../gantt-context`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// gantt/src/components/gantt/context/gantt-context.tsx
import { createContext, useContext, type ReactNode } from 'react'
import type { GanttContextId } from '@/stores/create-context-store'

/** Default 'live' so existing Live trees resolve correctly even before the provider is mounted. */
const GanttContextIdContext = createContext<GanttContextId>('live')

export const GanttContextProvider = ({
  contextId,
  children,
}: {
  contextId: GanttContextId
  children: ReactNode
}) => <GanttContextIdContext.Provider value={contextId}>{children}</GanttContextIdContext.Provider>

export const useGanttContextId = (): GanttContextId => useContext(GanttContextIdContext)

export type { GanttContextId }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gantt && npx vitest run src/components/gantt/context/__tests__/gantt-context.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/gantt/context/
git commit -m "feat(gantt): GanttContextProvider + useGanttContextId (default live)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Convert filter-store to factory + registry + compat shim

**Files:**
- Modify: `gantt/src/stores/filter-store.ts`
- Test: `gantt/src/stores/__tests__/filter-store-context.test.ts`

> Before editing, READ the full current `gantt/src/stores/filter-store.ts` so the factory wraps the
> EXACT existing state/actions verbatim (only the create-wrapping changes; no logic edits this phase).

- [ ] **Step 1: Write the failing test**

```ts
// gantt/src/stores/__tests__/filter-store-context.test.ts
import { describe, expect, it } from 'vitest'
import { getFilterStore, useFilterStore } from '../filter-store'

describe('filter-store context factory', () => {
  it("aliases the singleton export to the 'live' instance", () => {
    // Compat shim: existing Live code uses useFilterStore(...) / useFilterStore.getState()
    expect(useFilterStore).toBe(getFilterStore('live'))
  })

  it('isolates state between live and a scenario instance', () => {
    getFilterStore('live').getState().setCrewFilter({ bases: ['YEG'] })
    expect(getFilterStore(6).getState().crew.bases).not.toContain('YEG')
    expect(getFilterStore('live').getState().crew.bases).toContain('YEG')
  })

  it('exposes getState/subscribe on resolved instances (zustand API preserved)', () => {
    const s = getFilterStore(460)
    expect(typeof s.getState).toBe('function')
    expect(typeof s.subscribe).toBe('function')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gantt && npx vitest run src/stores/__tests__/filter-store-context.test.ts`
Expected: FAIL — `getFilterStore` is not exported.

- [ ] **Step 3: Write minimal implementation**

Wrap the existing `create<FilterStore>((set, get) => ({ ...current body... }))` in a factory and
build the registry. Keep the singleton export as an alias to the `'live'` instance. Concretely:

```ts
// gantt/src/stores/filter-store.ts  (structure — preserve the existing state/actions body verbatim)
import { create } from 'zustand'
import { createContextStoreRegistry, type GanttContextId } from './create-context-store'
// ... existing imports + interfaces (CrewFilter/PairingFilter/FlightFilter/FilterStore) unchanged ...

const makeFilterStore = () =>
  create<FilterStore>((set, get) => ({
    // ⬇️ EXACT existing initial state + actions, copied unchanged from the current file
  }))

const registry = createContextStoreRegistry<ReturnType<typeof makeFilterStore>>(() => makeFilterStore())

export const getFilterStore = (id: GanttContextId) => registry.get(id)
export const destroyFilterStore = (id: GanttContextId) => registry.destroy(id)

/** Compatibility shim: existing Live imports keep working unchanged. */
export const useFilterStore = getFilterStore('live')
```

> The factory ignores the `id` arg (filter state shape is identical per context); the registry still
> keys instances so Live and each scenario are isolated. Do NOT change any action logic in this phase.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gantt && npx vitest run src/stores/__tests__/filter-store-context.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck the whole gantt app (no Live consumer broke)**

Run: `cd gantt && npx tsc --noEmit`
Expected: PASS. (Per memory, 2 pre-existing tsc errors may exist — confirm no NEW errors vs `git stash` baseline; if the only errors are the known pre-existing ones, proceed.)

- [ ] **Step 6: Commit**

```bash
git add gantt/src/stores/filter-store.ts gantt/src/stores/__tests__/filter-store-context.test.ts
git commit -m "refactor(gantt): filter-store as context factory + live compat shim

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Per-context storage key + context-resolved hook for shared consumers

**Files:**
- Modify: `gantt/src/stores/filter-store.ts`
- Test: `gantt/src/stores/__tests__/filter-store-context.test.tsx` (renamed from `.ts`, extended)

> **Why the storage-key part:** Task 3's review found all instances share the localStorage key
> `gantt-filter-v2`. Once a non-live (scenario) instance persists, it would clobber Live's saved
> filter. Fix now: the `'live'` instance keeps `gantt-filter-v2` (preserves existing persisted
> state); every other context uses a suffixed key. This requires the factory to receive `id`.

- [ ] **Step A1: Add the failing storage-isolation test** (append to the context test file)

```ts
it('persists live and scenario filters to separate localStorage keys', () => {
  localStorage.clear()
  getFilterStore('live').getState().setCrewFilter({ bases: ['YEG'] })
  getFilterStore(6).getState().setCrewFilter({ bases: ['YOW'] })
  // setCrewFilter calls saveToStorage internally
  expect(localStorage.getItem('gantt-filter-v2')).toContain('YEG')
  expect(localStorage.getItem('gantt-filter-v2')).not.toContain('YOW')
  expect(localStorage.getItem('gantt-filter-v2-6')).toContain('YOW')
})
```

- [ ] **Step A2: Run** `npx vitest run src/stores/__tests__/filter-store-context.test.tsx` → FAIL
  (scenario writes land in the shared `gantt-filter-v2` key).

- [ ] **Step A3: Make the storage key per-context.** Change the factory to take `id` and compute a
  per-instance key; reference that key inside `loadFromStorage`/`saveToStorage` instead of the
  module-level `STORAGE_KEY`:

```ts
const STORAGE_KEY = 'gantt-filter-v2' // live (unchanged — preserves existing persisted state)

const makeFilterStore = (id: GanttContextId) => {
  const storageKey = id === 'live' ? STORAGE_KEY : `${STORAGE_KEY}-${id}`
  return create<FilterStore>((set, get) => ({
    // ... existing body, but loadFromStorage/saveToStorage use `storageKey` (closure) ...
  }))
}

const registry = createContextStoreRegistry<ReturnType<typeof makeFilterStore>>(makeFilterStore)
```

  Inside the store body, replace `localStorage.getItem(STORAGE_KEY)` →
  `localStorage.getItem(storageKey)` and `localStorage.setItem(STORAGE_KEY, ...)` →
  `localStorage.setItem(storageKey, ...)`. No other logic changes.

- [ ] **Step A4: Run** `npx vitest run src/stores/__tests__/filter-store-context.test.tsx` → the new
  storage test plus the 3 existing tests all PASS.

- [ ] **Step A5: `npx tsc --noEmit`** → 0 new errors.

Now add the context-resolved hook:

- [ ] **Step 1: Add the failing test**

> The test file becomes `.tsx` (it now renders JSX). Rename `filter-store-context.test.ts` →
> `filter-store-context.test.tsx` when adding this step. Use `renderToStaticMarkup` (no
> `@testing-library/react`).

```tsx
// append to filter-store-context.test.tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { GanttContextProvider } from '@/components/gantt/context/gantt-context'
import { useFilterStoreForContext } from '../filter-store'

it('useFilterStoreForContext resolves the instance from GanttContext', () => {
  const Probe = () => (
    <span>{useFilterStoreForContext() === getFilterStore(6) ? 'match' : 'no-match'}</span>
  )
  const html = renderToStaticMarkup(
    <GanttContextProvider contextId={6}>
      <Probe />
    </GanttContextProvider>,
  )
  expect(html).toContain('match')
  expect(html).not.toContain('no-match')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gantt && npx vitest run src/stores/__tests__/filter-store-context.test.ts`
Expected: FAIL — `useFilterStoreForContext` not exported.

- [ ] **Step 3: Implement**

```ts
// gantt/src/stores/filter-store.ts (add)
import { useGanttContextId } from '@/components/gantt/context/gantt-context'

/** For shared wrappers: resolves the right filter-store instance from <GanttContextProvider>. */
export const useFilterStoreForContext = () => getFilterStore(useGanttContextId())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gantt && npx vitest run src/stores/__tests__/filter-store-context.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add gantt/src/stores/filter-store.ts gantt/src/stores/__tests__/filter-store-context.test.ts
git commit -m "feat(gantt): useFilterStoreForContext resolves store from GanttContext

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Mount `<GanttContextProvider>` in Live and Scenario trees

**Files:**
- Modify: `gantt/src/components/layout/app-layout.tsx` (around the existing `<GanttSourceProvider value={liveSource}>`, ~line 316)
- Modify: `gantt/src/components/scenario-gantt/scenario-gantt-view.tsx` (wrap the scenario gantt subtree)

> READ both files first to place the provider OUTSIDE the existing `<GanttSourceProvider>` so the
> contextId is available to every pane/toolbar in the subtree.

- [ ] **Step 1: Wrap the Live tree**

In `app-layout.tsx`, wrap the existing source provider:

```tsx
// import at top:
import { GanttContextProvider } from '@/components/gantt/context/gantt-context'

// wrap the existing <GanttSourceProvider value={liveSource}> ... </GanttSourceProvider>:
<GanttContextProvider contextId="live">
  <GanttSourceProvider value={liveSource}>
    {/* existing children unchanged */}
  </GanttSourceProvider>
</GanttContextProvider>
```

- [ ] **Step 2: Wrap the Scenario tree**

In `scenario-gantt-view.tsx`, wrap the scenario gantt subtree with the scenarioId:

```tsx
import { GanttContextProvider } from '@/components/gantt/context/gantt-context'

// wrap the rendered scenario gantt body:
<GanttContextProvider contextId={scenarioId}>
  {/* existing scenario gantt subtree unchanged */}
</GanttContextProvider>
```

- [ ] **Step 3: Typecheck**

Run: `cd gantt && npx tsc --noEmit`
Expected: PASS (no new errors vs baseline).

- [ ] **Step 4: Commit**

```bash
git add gantt/src/components/layout/app-layout.tsx gantt/src/components/scenario-gantt/scenario-gantt-view.tsx
git commit -m "feat(gantt): mount GanttContextProvider in live + scenario trees

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Bump frontend version

**Files:**
- Modify: `gantt/src/version.ts`

- [ ] **Step 1: Read current value, increment `FRONTEND_VERSION` by 1** (per CLAUDE.md version rule; never reuse/decrement).

- [ ] **Step 2: Commit**

```bash
git add gantt/src/version.ts
git commit -m "chore(gantt): bump FRONTEND_VERSION for store-context factory

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Phase 1 verification gate (both views green)

> No behavior changed, so this is a REGRESSION gate, not new feature coverage. Paste real receipts
> (§No-Illusion). Run from the `e2e/` directory; use `--no-deps` if pbs-server :3002 is down (memory).

- [ ] **Step 1: Vitest — all new + existing gantt unit tests**

Run: `cd gantt && npx vitest run`
Expected: new factory/context/shim tests PASS; pre-existing gantt unit suite unchanged.

- [ ] **Step 2: UI standard gate**

Run: `npm run check:ui` (repo root)
Expected: hard violations = 0 (no new tokens introduced this phase).

- [ ] **Step 3: Scenario DB-source regression (scenario 6 + 460)**

Requires live-server with `SCENARIO_GANTT_SOURCE=db`. Run:
`cd e2e && npx playwright test tests/gantt/scenario/scenario-db-source.spec.ts --reporter=list`
Expected: all cases (6, 459, 460) still render 26 crew + MCred. PASS.

- [ ] **Step 4: Live + scenario gantt regression sweep**

Run a representative slice that exercises the wrapped providers:
`cd e2e && npx playwright test tests/gantt/scenario-gantt-open.spec.ts tests/gantt/scenario-capabilities.spec.ts tests/filter/ --reporter=list`
Expected: PASS (no regression from the provider wrap / store shim).

- [ ] **Step 5: Paste the PASS/FAIL summaries into the completion message. Only then mark Phase 1 done.**

---

## Phase 5 — Collapse pane wrappers (detailed approach; flight first, scenario-then-Live)

**Design (from the flight-pane delta investigation):** Live & scenario flight panes produce the identical
`FlightItem` shape and already share canvas/filter/sort. They diverge in ~9 behaviors (selection
global-vs-local, hover, drag-to-roster, lazy-load-vs-atomic data, scroll/zoom scope, rubber-band, frozen
rows, sort). Unify by adding a per-pane **row+interaction accessor to the source** and building ONE
capability-gated pane component that reads only from `useGanttSource()` + the already-shared
filter/sort/canvas. Panes are mounted INSIDE the source provider in both modes (unlike the toolbar), so
`useGanttSource()` works.

**Risk control:** Migrate **scenario first** (lower-risk side) to the new unified component, delete the
scenario fork, gate scenario green. Then **separately** switch Live to the same component and delete the
Live fork, gating the full Live flight regression. Live stays untouched until its own gated step.

Sub-phases: **5A** flight (scenario→unified, then Live→unified, delete both forks) · **5B** pairing ·
**5C** roster (edit-lock/drag/violations — hardest) · **5D** layout grid + delete `scenario-gantt/*` +
re-measure sharing %. Each pane: both views green + Playwright before the next.

> Detailed per-task TDD lists authored as each sub-phase is reached.

## Phase 2 — Unify filter + sort store shapes (detailed)

**Goal:** Add the one missing shared filter field (`register`), convert `pane-store` to the
context-factory (so sort can be per-context), and move scenario roster sort out of component-local
state into the context-resolved `pane-store` (`'scenario-roster'` key) so it **survives tab suspend**.
Both views stay green.

### File structure (Phase 2)
- Modify `gantt/src/stores/filter-store.ts` — add `register?: string[]` to `FlightFilter` + default/equality/hasValues.
- Test `gantt/src/stores/__tests__/filter-store-register.test.ts`.
- Modify `gantt/src/stores/pane-store.ts` — wrap in context factory + registry + compat shim + `usePaneStoreForContext`.
- Test `gantt/src/stores/__tests__/pane-store-context.test.tsx`.
- Modify `gantt/src/components/scenario-gantt/scenario-roster-pane.tsx` — sort via context pane-store (`'scenario-roster'`).
- Test (Playwright) `e2e/tests/gantt/scenario/scenario-sort-persist.spec.ts`.
- Modify `gantt/src/version.ts` — bump `FRONTEND_VERSION`.

---

### Task P2-1: Add optional `register` to the shared FlightFilter

**Files:**
- Modify: `gantt/src/stores/filter-store.ts`
- Test: `gantt/src/stores/__tests__/filter-store-register.test.ts`

- [ ] **Step 1: Failing test**

```ts
// gantt/src/stores/__tests__/filter-store-register.test.ts
import { describe, expect, it } from 'vitest'
import {
  type FlightFilter, flightFiltersEqual, hasFlightFilterValues,
} from '../filter-store'

const base: FlightFilter = { depArps: [], arvArps: [], fltNums: [], fleets: [], statuses: [] }

describe('FlightFilter register field', () => {
  it('treats differing register lists as not equal', () => {
    expect(flightFiltersEqual({ ...base, register: ['C-ABC'] }, { ...base, register: ['C-XYZ'] })).toBe(false)
    expect(flightFiltersEqual({ ...base, register: ['C-ABC'] }, { ...base, register: ['C-ABC'] })).toBe(true)
  })
  it('counts register as an active value', () => {
    expect(hasFlightFilterValues({ ...base, register: ['C-ABC'] })).toBe(true)
    expect(hasFlightFilterValues(base)).toBe(false)
  })
  it('is backward compatible when register is omitted', () => {
    expect(flightFiltersEqual(base, base)).toBe(true)
    expect(hasFlightFilterValues(base)).toBe(false)
  })
})
```

- [ ] **Step 2: Run → FAIL** `npx vitest run src/stores/__tests__/filter-store-register.test.ts` (register not in type / not compared).

- [ ] **Step 3: Implement** in `filter-store.ts`:
  - Add to the interface: `register?: string[]` (optional — keeps Live callers and existing literals valid).
  - `DEFAULT_FLIGHT_FILTER`: add `register: []`.
  - `flightFiltersEqual`: add `&& arrEq(a.register ?? [], b.register ?? [])`.
  - `hasFlightFilterValues`: add `|| (f.register?.length ?? 0) > 0`.

- [ ] **Step 4: Run → PASS** (3 tests). Then `npx tsc --noEmit` → 0 new errors (the optional field must not break the ~existing FlightFilter literals).

- [ ] **Step 5: Commit**
```bash
git add src/stores/filter-store.ts src/stores/__tests__/filter-store-register.test.ts
git commit -m "feat(gantt): add optional register field to shared FlightFilter

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task P2-2: Convert pane-store to context factory + compat shim

**Files:**
- Modify: `gantt/src/stores/pane-store.ts`
- Test: `gantt/src/stores/__tests__/pane-store-context.test.tsx`

> Mirror the proven `filter-store` conversion (Phase 1 Task 3/4). READ the full current
> `pane-store.ts` first; wrap the existing `create<PaneStore>((set,get)=>({...}))` body VERBATIM in a
> factory — no logic/state changes. `pane-store` has 28 importers; the compat shim keeps them working.

- [ ] **Step 1: Failing test** `gantt/src/stores/__tests__/pane-store-context.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GanttContextProvider } from '@/components/gantt/context/gantt-context'
import { getPaneStore, usePaneStore, usePaneStoreForContext } from '../pane-store'

describe('pane-store context factory', () => {
  it("aliases the singleton export to the 'live' instance", () => {
    expect(usePaneStore).toBe(getPaneStore('live'))
  })
  it('isolates sort state between live and a scenario instance', () => {
    getPaneStore('live').getState().setSortColumn('scenario-roster', 'rank')
    expect(getPaneStore(6).getState().getSortColumn('scenario-roster')).toBeNull()
    expect(getPaneStore('live').getState().getSortColumn('scenario-roster')).toBe('rank')
  })
  it('resolves the instance from GanttContext', () => {
    const Probe = () => <span>{usePaneStoreForContext() === getPaneStore(6) ? 'match' : 'no'}</span>
    const html = renderToStaticMarkup(
      <GanttContextProvider contextId={6}><Probe /></GanttContextProvider>,
    )
    expect(html).toContain('match')
  })
})
```

> Verify the real sort API names against the file: `setSortColumn(paneType, column)` and
> `getSortColumn(paneType)` exist (confirmed). `getSortColumn` returns `sortCriteria[0]?.column ?? null`.

- [ ] **Step 2: Run → FAIL** (`getPaneStore` not exported).

- [ ] **Step 3: Implement** — exactly the filter-store pattern:
```ts
import { createContextStoreRegistry, type GanttContextId } from './create-context-store'
import { useGanttContextId } from '@/components/gantt/context/gantt-context'

const makePaneStore = () => create<PaneStore>((set, get) => ({ /* existing body UNCHANGED */ }))
const registry = createContextStoreRegistry<ReturnType<typeof makePaneStore>>(() => makePaneStore())
export const getPaneStore = (id: GanttContextId) => registry.get(id)
export const destroyPaneStore = (id: GanttContextId) => registry.destroy(id)
/** Compat shim — existing Live imports keep working unchanged. */
export const usePaneStore = getPaneStore('live')
/** For shared/scenario consumers: resolves from <GanttContextProvider>. */
export const usePaneStoreForContext = () => getPaneStore(useGanttContextId())
```
> Keep every other existing export (`SortCriterion`, types, etc.) intact. Do NOT change action logic.

- [ ] **Step 4: Run → PASS** (3 tests). `npx tsc --noEmit` → 0 new errors (28 consumers compile against `usePaneStore`).

- [ ] **Step 5: Run the no-store guard** (pane-store isn't under components/gantt, but pane-store-context.test imports gantt-context — confirm no new violation): `npx vitest run src/components/gantt/source/__tests__/no-store-imports.guard.test.ts` → PASS.

- [ ] **Step 6: Commit**
```bash
git add src/stores/pane-store.ts src/stores/__tests__/pane-store-context.test.tsx
git commit -m "refactor(gantt): pane-store as context factory + live compat shim

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task P2-3: Scenario roster sort via context pane-store (survives suspend)

**Files:**
- Modify: `gantt/src/components/scenario-gantt/scenario-roster-pane.tsx`

> READ the file. Today sort is local: `const [sortColumn, setSortColumn] = useState<string|null>(null)`
> and `const [sortDirection, setSortDirection] = useState<'asc'|'desc'>('asc')` (~lines 128–129),
> toggled in `handleSort` (~160), consumed in the rows `useMemo` (~225–245), `sortChips` (~198–203),
> and passed to the child grid (~726–727). The `scenarioId` (number) is in scope. READ how Live
> `components/panes/roster-pane.tsx` reads sort from `usePaneStore` and mirror that exactly.

- [ ] **Step 1:** Resolve the per-scenario pane-store at the top of the component:
```ts
import { getPaneStore } from '@/stores/pane-store'
// inside component:
const usePaneStore = getPaneStore(scenarioId)
const sortColumn = usePaneStore((s) => s.getSortColumn('scenario-roster'))
const sortDirection = usePaneStore((s) => s.getSortDirection('scenario-roster'))
```
  Remove the two local `useState` declarations for `sortColumn`/`sortDirection`.

- [ ] **Step 2:** Rewrite `handleSort` to drive the store (preserve current toggle semantics — click a
  new column → asc; click the active column → toggle asc/desc). Use the store's `setSortColumn`
  (which already toggles direction when the same column is set — verify against pane-store
  `setSortColumn` impl; if it doesn't toggle, replicate the prior toggle logic via `setSortCriteria`):
```ts
const handleSort = useCallback((key: string) => {
  usePaneStore.getState().setSortColumn('scenario-roster', key)
}, [usePaneStore])
```
  Confirm by reading pane-store `setSortColumn` that repeat-click toggles direction; if not, set
  criteria explicitly to match the OLD behavior. Report which you used.

- [ ] **Step 3:** Leave `sortChips`, the rows `useMemo`, and the child grid props referencing
  `sortColumn`/`sortDirection` unchanged (they now read the store-derived values). Ensure the rows
  `useMemo` dependency array still lists `sortColumn, sortDirection`.

- [ ] **Step 4: tsc** `npx tsc --noEmit` → 0 new errors.

- [ ] **Step 5: Commit**
```bash
git add src/components/scenario-gantt/scenario-roster-pane.tsx
git commit -m "feat(gantt): scenario roster sort via context pane-store (persists across suspend)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task P2-4: Version bump + Phase 2 verification gate

**Files:**
- Modify: `gantt/src/version.ts`
- Test: `e2e/tests/gantt/scenario/scenario-sort-persist.spec.ts`

- [ ] **Step 1: Bump** `FRONTEND_VERSION` +1; commit `chore(gantt): bump FRONTEND_VERSION (Phase 2)`.

- [ ] **Step 2: Write the suspend-persistence Playwright test** (Scen-2031). Mirror the
  `scenario-db-source.spec.ts` open flow (login → `/fpqe/gantt/` → scenario → RO → search → select
  `#6` → open). Then: apply a roster sort (click the roster sort control / a sortable column header —
  inspect `scenario-roster-pane`/`scenario-pane-toolbar` for the real testid), assert a
  `pane-sort-chip` shows the chosen column; **suspend** the tab by switching to the Live module
  (`module-nav-live`) and back to the scenario (this unmounts/remounts the pane — see
  `scenario-memory-baseline.spec.ts` for the suspend pattern); assert the `pane-sort-chip` with the
  same column/direction is STILL present (and the first roster row matches the sorted order). This is
  the regression that local `useState` failed.

- [ ] **Step 3: Run the new test** (servers up, `--config=config/playwright.config.ts --project=gantt`):
  `cd e2e && npx playwright test tests/gantt/scenario/scenario-sort-persist.spec.ts --config=config/playwright.config.ts --project=gantt --reporter=list` → PASS. Paste output.

- [ ] **Step 4: Regression gate (paste receipts):**
  - `cd gantt && npx vitest run` → new tests pass; only the known pre-existing react-resolution suites fail.
  - `npm run check:ui` (root) → 0 hard violations.
  - `cd e2e && npx playwright test tests/gantt/scenario/scenario-db-source.spec.ts --config=config/playwright.config.ts --project=gantt --reporter=list -g "460"` and `-g "live-backed \(6\)"` → render still PASS.
  - Live sort regression: `cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt -g "sort" --reporter=list` (existing Live sort specs) → PASS.

- [ ] **Step 5: Commit the test**; paste all PASS/FAIL summaries into the completion message (§No-Illusion).

---

## Phase 3 — Shared filter dialog + sort dialog + condition strip (detailed for 3A; 3B–3E outlined)

**Design (locked after investigation):**
- The `FilterDialog` is mounted in the toolbar — **outside** `GanttSourceProvider`/`GanttContextProvider`
  (`RosterView` = `<GanttSubToolbar/>` + `<AppLayout/>`). So it must be **`contextId`-prop-driven**, not
  provider-based.
- **Apply strategy stays at call sites** (no `GanttPaneSource` change): Live passes
  `onApply={applyGanttFilters}`; scenario passes `onApply={() => {}}` (its panes re-filter reactively from
  the context store). 
- **Filter options stay from `reference-store`** for BOTH contexts (airline-wide superset; Live already
  offers options for unloaded data). No per-scenario options aggregation needed.
- **Scenario filters persist** per-scenario (mirrors Live; localStorage key `gantt-filter-v2-<id>` from Phase 1).

**Sub-phases (each: both views green + tested before next):**
- **3A** ✅ DONE (commit `7c24173f`): `FilterDialog` is `contextId`-driven (default `'live'`); `resolveFilterStore` helper; options still from reference-store; Live byte-for-byte unchanged (1 unit test, tsc 0, Live filter e2e failures all pre-existing).
- **3B**: Scenario ROSTER pane consumes the shared `FilterDialog` (opened via condition-strip `onFilterClick`)
  + reads `getFilterStore(scenarioId).crew` (full CrewFilter: division/base/rank/fleet/crewId) for client-side
  filtering; remove the inline crew popover; chips from the shared store. Gate: scenario 6 crew filters by
  rank+base+division+fleet+crewId; chips show + remove works.
- **3C**: Scenario FLIGHT + PAIRING panes consume the shared dialog (read `getFilterStore(scenarioId).flight`
  /`.pairing`; flight gains Flight No.+Status; pairing gains full filter UI). Gate: scenario flight filters by
  fltNum+status; pairing filter UI present + filters.
- **3D**: Wire scenario condition-strip `onSortClick` → shared `SortDialog` → `getPaneStore(scenarioId)
  .setSortCriteria('scenario-roster', …)`; multi-key sort + chips. Gate: scenario multi-key sort works + persists.
- **3E**: Cleanup (remove dead `ScenarioCrewFilter`/inline popovers if now unused, per §Stale-Test/§Surgical),
  full filter-parity Playwright on scenario 6/460, Live filter/sort regression, `check:ui`, version bump.

> 3B–3E are expanded into full TDD task lists (writing-plans) when reached. 3A is detailed now.

### Task 3A: Make FilterDialog contextId-driven (Live-preserving)

**Files:**
- Modify: `gantt/src/components/layout/filter-dialog.tsx`
- Test: `gantt/src/components/layout/__tests__/filter-dialog-context.test.tsx`

> READ `filter-dialog.tsx` first. Today: `const filterStore = useFilterStore()` (line 43, whole-state
> hook). Props: `{ open, onClose, onApply?, initialTab? }`. `handleApply` writes
> `filterStore.setCrewFilter/setPairingFilter/setFlightFilter(local…)` then `onApply?.()`. Options come
> from `useReferenceStore()` — KEEP that unchanged (works for both contexts).

- [ ] **Step 1: Failing test** `filter-dialog-context.test.tsx` — assert the dialog reads/writes the
  store instance for its `contextId` prop (default `'live'`). Since the dialog is a big component, test at
  the store-resolution level via a tiny render that drives apply. Simplest robust test: render the dialog
  with `contextId={6}`, programmatically set a crew filter through the dialog's apply path, and assert it
  landed in `getFilterStore(6)` and NOT in `getFilterStore('live')`. If full-dialog rendering is too heavy
  in jsdom (it uses MultiSelectDropdown etc.), instead extract and unit-test a small pure helper
  `resolveFilterStore(contextId)` that returns `getFilterStore(contextId)`, and assert
  `resolveFilterStore('live') === getFilterStore('live')` and `resolveFilterStore(6) === getFilterStore(6)`.
  Prefer the helper test if the dialog won't mount cleanly. Document which you used.

```tsx
// filter-dialog-context.test.tsx (helper variant)
import { describe, expect, it } from 'vitest'
import { getFilterStore } from '@/stores/filter-store'
import { resolveFilterStore } from '../filter-dialog'

describe('FilterDialog contextId store resolution', () => {
  it("defaults to the live store and isolates per context", () => {
    expect(resolveFilterStore('live')).toBe(getFilterStore('live'))
    expect(resolveFilterStore(6)).toBe(getFilterStore(6))
    expect(resolveFilterStore(6)).not.toBe(getFilterStore('live'))
  })
})
```

- [ ] **Step 2: Run → FAIL** (`resolveFilterStore`/contextId not present).

- [ ] **Step 3: Implement** in `filter-dialog.tsx`:
  - Import: `import { getFilterStore } from '@/stores/filter-store'` and
    `import type { GanttContextId } from '@/types/gantt-context'`.
  - Add prop `contextId?: GanttContextId` (default `'live'`) to `FilterDialogProps` + destructure with
    default.
  - Export a tiny helper `export const resolveFilterStore = (id: GanttContextId) => getFilterStore(id)`.
  - Replace `const filterStore = useFilterStore()` with
    `const useStore = resolveFilterStore(contextId); const filterStore = useStore()`.
    (Within one mounted dialog `contextId` is stable — Live toolbar = `'live'`, each scenario pane = its
    id — so the resolved hook identity is stable; no rules-of-hooks violation. The codebase already uses
    this `const useX = getXStore(id); useX(sel)` pattern for scenario stores.)
  - Remove the now-unused `useFilterStore` import if nothing else uses it.
  - Everything else (reference-store options, local state, handleApply writing to `filterStore`,
    `onApply?.()`) stays as-is.

- [ ] **Step 4: Run → PASS.** `npx tsc --noEmit` → 0 new errors. Confirm the Live toolbar call site
  (`gantt-sub-toolbar.tsx:245` `<FilterDialog ... onApply={handleFilterApply}/>`) still compiles (it omits
  `contextId` → defaults `'live'` → identical behavior).

- [ ] **Step 5: Live regression (paste receipts):** `cd e2e && npx playwright test
  --config=config/playwright.config.ts --project=gantt tests/filter/ --reporter=list` (or the Live filter
  specs) → PASS. Confirms the Live filter dialog is unchanged.

- [ ] **Step 6: Commit**
```bash
git add gantt/src/components/layout/filter-dialog.tsx gantt/src/components/layout/__tests__/filter-dialog-context.test.tsx
git commit -m "refactor(gantt): FilterDialog driven by contextId (default live)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 1 — DONE (2026-06-15), carry-forward notes for Phase 2

Phase 1 landed (commits `aa2ccb69`..`3e0df515`), zero-behavior-change, both views verified green
(194 unit tests pass; tsc 0; UI gate 0 hard violations; scenario 6/459/460 render through the
mounted provider; the 4 react-resolution suite failures and the create-RO-scenario E2E failures are
pre-existing — confirmed identical on base `63b86c41`). Final integration review: cohesive.

Two things Phase 2 must handle when scenario components start consuming the shared filter store:

1. **`useFilterStoreForContext()` is hook-bound.** It calls `useGanttContextId()`, so it may only be
   invoked at component/hook render time (never inside callbacks/effects directly). Resolve the store
   at render, then use the returned instance in callbacks.
2. **Per-scenario filter persistence.** Scenario instances now persist to `gantt-filter-v2-<id>` and
   hydrate from it on reopen. `destroyFilterStore(id)` clears the registry entry but NOT localStorage.
   Phase 2 must decide: persist scenario filters across reopen (mirror Live) or reset on close — and
   if reset, clear the keyed localStorage entry in the scenario teardown.

## Self-review notes (author)

- **Spec coverage:** Phase 1 implements the spec's "Core architecture: store-context factory" + compat shim (decision 4) + provider mounting. Phases 2–6 map 1:1 to the spec's "Store & data-shape unification", "Component collapse", and "Phases" sections; their detailed tasks are authored when reached.
- **Type consistency:** `GanttContextId = 'live' | number` is defined once in `create-context-store.ts` and re-exported from `gantt-context.tsx`; `getFilterStore`/`destroyFilterStore`/`useFilterStore`/`useFilterStoreForContext` names are used consistently across Tasks 3–5.
- **No placeholders:** every code/test step shows real code; the one verbatim-copy instruction (Task 3 Step 3) is explicit about preserving existing logic to avoid a behavior change this phase.
- **Out-of-scope guard:** Phase 1 deliberately touches only `filter-store` as the pattern proof; other stores convert in their owning phase (2 for sort, later for layout/view) to keep each phase small and green.
