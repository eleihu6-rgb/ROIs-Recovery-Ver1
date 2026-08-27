# Flight Navi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A table-style Flight Navi dialog over the Gantt's flights, with filters and one-click navigation to the pairings/crew/detail of any flight.

**Architecture:** Frontend (gantt) + one read-only backend endpoint. The dialog pages the flight list for the Gantt date range and fetches per-flight pairing/crew counts from a batched `GET /api/flight/navi-counts` (two GROUP BY aggregates — not N+1), then reuses the existing `findPairingsByFlight` / `findCrewToTop` helpers to float pairings/crew to the top of their panes. Opened from a Navi button in the Flight pane's condition strip.

> **NOTE (implementation deviation):** counts were planned client-side but that is unworkable — the pairing list omits `flights[]`/`segments[]` and the roster pane view has `fltId = null`, so the browser has no flight→pairing/crew linkage. See the design spec's "Scope & architecture" decision-change note. The batch endpoint still honours the original anti-N+1 intent.

**Tech Stack:** React 19, Zustand, `@rois/ui` (AppDialog), Vitest (filter unit tests), Playwright (e2e).

---

## File structure

- Create `gantt/src/components/flight-navi/flight-navi-filters.ts` — pure filter predicates + fizz parser (no React).
- Create `gantt/src/components/flight-navi/flight-navi-filters.test.ts` — Vitest for the predicates.
- Create `gantt/src/components/flight-navi/use-flight-navi-data.ts` — hook: fetch flights for range + compute counts.
- Create `gantt/src/components/flight-navi/flight-navi-filter-bar.tsx` — filter controls row.
- Create `gantt/src/components/flight-navi/flight-navi-table.tsx` — the grid + navi cells.
- Create `gantt/src/components/flight-navi/flight-navi-dialog.tsx` — AppDialog shell composing the above.
- Modify `gantt/src/stores/ui-store.ts` — add `flightNaviOpen` / `openFlightNavi` / `closeFlightNavi`.
- Modify `gantt/src/utils/bring-matches-to-top.ts` — add `bringPairingIdsToTop(ids: number[])` and `bringFlightCrewToTop(flightId)`.
- Modify `gantt/src/components/panes/pane-condition-strip.tsx` — add optional `onNaviClick` Navi button.
- Modify `gantt/src/components/panes/flight-pane.tsx` — pass `onNaviClick`.
- Modify `gantt/src/App.tsx` (or wherever dialogs mount) — mount `<FlightNaviDialog />`.
- Modify `gantt/src/version.ts` — `FRONTEND_VERSION` +1.
- Create `e2e/tests/gantt/flight-navi.spec.ts` — e2e coverage.

---

### Task 1: Filter predicates + fizz parser (pure, TDD)

**Files:**
- Create: `gantt/src/components/flight-navi/flight-navi-filters.ts`
- Test: `gantt/src/components/flight-navi/flight-navi-filters.test.ts`

Types/interface:
```ts
import type { Flight } from '@/types'

export interface NaviRow {
  flight: Flight
  pairingCount: number
  crewCount: number
}

export interface FizzParsed {
  fltNum?: string
  dep?: string
  arr?: string
}

export interface NaviFilters {
  dateStart?: string      // 'YYYY-MM-DD'
  dateEnd?: string
  register?: string       // exact
  coverage?: 'all' | 'covered' | 'uncovered'
  dep?: string            // airport contains
  arr?: string
  minBlockHours?: number
  toggles: { dhd: boolean; rc: boolean; pc: boolean; cnl: boolean }
  fizz?: string
}
```

- [ ] **Step 1: Write failing tests** covering: `parseFizz`, `isDeadhead`, `matchesFizz`, `applyNaviFilters`.

```ts
import { describe, it, expect } from 'vitest'
import { parseFizz, isDeadhead, applyNaviFilters, type NaviRow } from './flight-navi-filters'
import type { Flight } from '@/types'

const f = (over: Partial<Flight>): Flight => ({
  id: 1, airline: 'F8', fltDt: '2026-06-12', fltNum: '924', depArp: 'BKK', arvArp: 'HKT',
  schDepDtUtc: '2026-06-12T00:30:00Z', schArvDtUtc: '2026-06-12T02:00:00Z',
  actDepDtUtc: '', actArvDtUtc: '', actDepArp: 'BKK', actArvArp: 'HKT',
  flightFlag: 'A', blkMin: 90, fleet: '350', register: 'HSTHX', fltType: 'PAX',
  fltSts: null, isDeleted: 0, isCancelled: false, ...over,
})
const row = (fl: Flight, pc = 0, cc = 0): NaviRow => ({ flight: fl, pairingCount: pc, crewCount: cc })

describe('parseFizz', () => {
  it('YVR- → departures from YVR', () => expect(parseFizz('YVR-')).toEqual({ dep: 'YVR' }))
  it('-YVR → arrivals into YVR', () => expect(parseFizz('-YVR')).toEqual({ arr: 'YVR' }))
  it('BKK-HKT → dep+arr', () => expect(parseFizz('BKK-HKT')).toEqual({ dep: 'BKK', arr: 'HKT' }))
  it('924 → flight number', () => expect(parseFizz('924')).toEqual({ fltNum: '924' }))
})

describe('isDeadhead', () => {
  it('non-home carrier is deadhead', () => expect(isDeadhead(f({ airline: 'AC' }), 'F8')).toBe(true))
  it('home carrier is operating', () => expect(isDeadhead(f({ airline: 'F8' }), 'F8')).toBe(false))
})

describe('applyNaviFilters', () => {
  const base = { toggles: { dhd: false, rc: false, pc: false, cnl: false } } as const
  it('DEP filter narrows', () => {
    const rows = [row(f({ depArp: 'BKK' })), row(f({ id: 2, depArp: 'CNX' }))]
    expect(applyNaviFilters(rows, { ...base, dep: 'BKK' }, 'F8').map(r => r.flight.id)).toEqual([1])
  })
  it('R/C keeps only crew-covered', () => {
    const rows = [row(f({}), 0, 2), row(f({ id: 2 }), 0, 0)]
    expect(applyNaviFilters(rows, { ...base, toggles: { ...base.toggles, rc: true } }, 'F8').map(r => r.flight.id)).toEqual([1])
  })
  it('P/C keeps only pairing-covered', () => {
    const rows = [row(f({}), 1, 0), row(f({ id: 2 }), 0, 0)]
    expect(applyNaviFilters(rows, { ...base, toggles: { ...base.toggles, pc: true } }, 'F8').map(r => r.flight.id)).toEqual([1])
  })
  it('CNL keeps only cancelled', () => {
    const rows = [row(f({ isCancelled: true })), row(f({ id: 2 }))]
    expect(applyNaviFilters(rows, { ...base, toggles: { ...base.toggles, cnl: true } }, 'F8').map(r => r.flight.id)).toEqual([1])
  })
  it('DHD keeps only deadhead', () => {
    const rows = [row(f({ airline: 'AC' })), row(f({ id: 2, airline: 'F8' }))]
    expect(applyNaviFilters(rows, { ...base, toggles: { ...base.toggles, dhd: true } }, 'F8').map(r => r.flight.id)).toEqual([1])
  })
  it('fizz BKK-HKT matches dep+arr', () => {
    const rows = [row(f({})), row(f({ id: 2, arvArp: 'CNX' }))]
    expect(applyNaviFilters(rows, { ...base, fizz: 'BKK-HKT' }, 'F8').map(r => r.flight.id)).toEqual([1])
  })
})
```

- [ ] **Step 2: Run, expect FAIL.** `cd gantt && npx vitest run src/components/flight-navi/flight-navi-filters.test.ts`
- [ ] **Step 3: Implement** `flight-navi-filters.ts`:

```ts
import type { Flight } from '@/types'

export interface NaviRow { flight: Flight; pairingCount: number; crewCount: number }
export interface FizzParsed { fltNum?: string; dep?: string; arr?: string }
export interface NaviFilters {
  dateStart?: string; dateEnd?: string; register?: string
  coverage?: 'all' | 'covered' | 'uncovered'
  dep?: string; arr?: string; minBlockHours?: number
  toggles: { dhd: boolean; rc: boolean; pc: boolean; cnl: boolean }
  fizz?: string
}

const up = (s: string | null | undefined): string => (s ?? '').trim().toUpperCase()

export const isDeadhead = (flight: Flight, homeAirline: string): boolean =>
  up(flight.airline) !== up(homeAirline)

export const parseFizz = (raw: string): FizzParsed => {
  const t = raw.trim().toUpperCase()
  if (t === '') return {}
  if (t.includes('-')) {
    const [dep, arr] = t.split('-', 2)
    const out: FizzParsed = {}
    if (dep) out.dep = dep
    if (arr) out.arr = arr
    return out
  }
  return { fltNum: t }
}

export const applyNaviFilters = (rows: NaviRow[], filters: NaviFilters, homeAirline: string): NaviRow[] => {
  const fizz = parseFizz(filters.fizz ?? '')
  return rows.filter(({ flight, pairingCount, crewCount }) => {
    if (filters.dateStart && flight.fltDt < filters.dateStart) return false
    if (filters.dateEnd && flight.fltDt > filters.dateEnd) return false
    if (filters.register && up(flight.register) !== up(filters.register)) return false
    if (filters.dep && !up(flight.depArp).includes(up(filters.dep))) return false
    if (filters.arr && !up(flight.arvArp).includes(up(filters.arr))) return false
    if (filters.minBlockHours != null && flight.blkMin / 60 < filters.minBlockHours) return false
    if (filters.coverage === 'covered' && crewCount <= 0) return false
    if (filters.coverage === 'uncovered' && crewCount > 0) return false
    const { dhd, rc, pc, cnl } = filters.toggles
    if (dhd && !isDeadhead(flight, homeAirline)) return false
    if (rc && crewCount <= 0) return false
    if (pc && pairingCount <= 0) return false
    if (cnl && !flight.isCancelled) return false
    if (fizz.fltNum && !up(flight.fltNum).includes(fizz.fltNum)) return false
    if (fizz.dep && up(flight.depArp) !== fizz.dep) return false
    if (fizz.arr && up(flight.arvArp) !== fizz.arr) return false
    return true
  })
}
```

- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(gantt): flight navi filter predicates`.

---

### Task 2: ui-store flight-navi open state

**Files:** Modify `gantt/src/stores/ui-store.ts`

- [ ] Add to interface (near flightDetail): `flightNaviOpen: boolean; openFlightNavi: () => void; closeFlightNavi: () => void`.
- [ ] Add initial `flightNaviOpen: false,` and actions `openFlightNavi: () => set({ flightNaviOpen: true }), closeFlightNavi: () => set({ flightNaviOpen: false }),`.
- [ ] Commit `feat(gantt): flight navi ui-store state`.

---

### Task 3: bring-matches-to-top helpers

**Files:** Modify `gantt/src/utils/bring-matches-to-top.ts`

- [ ] Add `bringPairingIdsToTop(ids: number[])` (loaded-pairing variant of `bringPairingIdToTop`):

```ts
export const bringPairingIdsToTop = (pairingIds: number[]): void => {
  const ids = [...new Set(pairingIds)].filter((n) => Number.isFinite(n))
  if (ids.length === 0) return
  usePaneStore.getState().addFoundCrewIds('pairing', ids.map((n) => String(n)))
  scrollPaneToTop((pid) => useLayoutStore.getState().panes.get(pid)?.type === 'pairing', 'main')
  useGanttViewStore.getState().markDirty()
}
```

- [ ] Add `bringFlightCrewToTop(flightId)` reading loaded roster crew:

```ts
export const bringFlightCrewToTop = async (flightId: number): Promise<void> => {
  const main = useRosterStore.getState().main.rosterItems
  const crewIds = [...new Set(main.filter((r) => r.fltId === flightId).map((r) => r.crewId))]
  if (crewIds.length === 0) { notify.info('No loaded crew on this flight'); return }
  await bringCrewIdsToTop(crewIds, 'main')
}
```

- [ ] Commit `feat(gantt): bring-to-top helpers for flight navi`.

---

### Task 4: data hook (fetch flights + counts)

**Files:** Create `gantt/src/components/flight-navi/use-flight-navi-data.ts`

- [ ] Implement hook returning `{ rows: NaviRow[]; loading: boolean; homeAirline: string }`. On open, `flightApi.list({ startDate, endDate, page:1, pageSize:5000 })` for the filter-store date range; flatten `items[].flights` to `Flight[]`. Compute counts:

```ts
const pairings = usePairingStore.getState().items
const main = useRosterStore.getState().main.rosterItems
const pairingCount = (id: number) => pairings.filter((p) => p.flights.some((f) => f.fltId === id)).length
const crewCount = (id: number) => new Set(main.filter((r) => r.fltId === id).map((r) => r.crewId)).size
```

Home airline: read from config — use `useSessionStore`/dictionary if present; fallback to the most common `airline` among loaded flights. (Pure frontend; see Task 7 note.)

- [ ] Commit `feat(gantt): flight navi data hook`.

---

### Task 5: filter bar + table + dialog (UI)

**Files:** Create `flight-navi-filter-bar.tsx`, `flight-navi-table.tsx`, `flight-navi-dialog.tsx`; mount dialog in `App.tsx`.

- [ ] **Filter bar**: date range (defaults from filter-store), FLT Reg `<select>` (distinct registers), Coverage `<select>` (All/Covered/Uncovered), toggle buttons DHD/R/C/P/C/CNL, DEP/ARR text inputs, FLTH number input, and the fizz input (top-right, with ✕ clear). All controlled, lifting a `NaviFilters` object. Follow CSS standard (text-xs, font-mono tabular-nums for numeric, gap-1.5, AppDialog tokens). `data-testid`s: `flight-navi-fizz`, `flight-navi-dep`, `flight-navi-arr`, `flight-navi-reg`, `flight-navi-toggle-rc`, `-pc`, `-dhd`, `-cnl`.
- [ ] **Table**: columns STS, Carrier, Date, Dow, Flight No., DEP, STD, ATD, ARR, STA, ATA, A/C, SubFleet, Registration, Assignment, PTNs, Roster, COF, Composition. Time cells via existing time formatting util (UTC HH:mm). Numeric/time/ID cols use `font-mono tabular-nums`. PTNs/Roster cells are buttons (clickable, show count); COF cell is a button. Row `data-testid={`flight-navi-row-${flight.id}`}`. PTNs cell `data-testid={`navi-ptns-${id}`}`, Roster `navi-roster-${id}`, COF `navi-cof-${id}`. SubFleet/Assignment/Composition render best-effort (`flightFlag` for Assignment, `—` for SubFleet/Composition; see Task 7).
- [ ] **Dialog**: `AppDialog` `open={flightNaviOpen}` `onOpenChange` → `closeFlightNavi`, `icon={<Navigation className="h-4 w-4" />}`, `title="Flight Navi"`, `className="sm:max-w-[1200px]"`, `data-testid="flight-navi-dialog"`. Body: filter bar + scrollable table + a count line ("N flights"). Wire navi cell handlers:
  - PTNs → `bringPairingIdsToTop(pairings.filter(...).map(id))`
  - Roster → `bringFlightCrewToTop(flight.id)`
  - COF → `useUiStore.getState().openFlightDetail(flight.id)`
  Window stays open after each.
- [ ] Mount `<FlightNaviDialog />` alongside other dialogs in `App.tsx`.
- [ ] Commit `feat(gantt): flight navi dialog, filter bar, table`.

---

### Task 6: Navi button entry point

**Files:** Modify `pane-condition-strip.tsx`, `flight-pane.tsx`

- [ ] Add optional `onNaviClick?: () => void` to `PaneConditionStripProps`; render a `<button data-testid="flight-navi-button" title="Flight Navi">` with `<Navigation className="h-3 w-3" />` in the action cluster (before the Filter button) when present.
- [ ] In `flight-pane.tsx`, pass `onNaviClick={() => useUiStore.getState().openFlightNavi()}`.
- [ ] Commit `feat(gantt): flight navi entry button on flight pane`.

---

### Task 7: home-airline param + display-field notes

- [ ] Home airline must not be hardcoded (project rule). Source order: (1) a dictionary/session value if available; (2) fallback to the modal-most `airline` of loaded flights. Implement in the data hook; document the fallback inline.
- [ ] SubFleet / Composition columns: the flight list response does not carry `subFleet` or composition; render `—` and leave a `// TODO(navi): needs backend field` comment. Assignment renders `flightFlag`. (Populating these fully is a deferred backend follow-up, out of this frontend-only scope.)
- [ ] No commit (folded into Tasks 4/5).

---

### Task 8: version bump

**Files:** Modify `gantt/src/version.ts`

- [ ] `FRONTEND_VERSION` 150 → 151.
- [ ] Commit `chore: bump FRONTEND_VERSION for flight navi`.

---

### Task 9: e2e (Playwright)

**Files:** Create `e2e/tests/gantt/flight-navi.spec.ts`

- [ ] beforeEach: `seedGanttAuth`, goto dashboard, ensure flight pane toggled on, open Navi via `flight-navi-button`. Assert dialog visible and at least one flight row present (`toContainText` a known flight number, e.g. read first row).
- [ ] Test DEP filter: type an airport → only matching rows remain (assert a present flight + a now-absent one).
- [ ] Test fizz: `BKK-` shows departures from BKK; `-HKT` shows arrivals into HKT; `924` shows the flight-number match. Assert counts/rows.
- [ ] Test FLT Reg select narrows to one registration.
- [ ] Test R/C and P/C toggles reduce the row set (assert row count drops, covered flight still present).
- [ ] Test navi: click a PTNs cell with count>0 → pairing pane reorders (target pairing at top — assert via `window.__ganttTest` or visible pairing label); click Roster cell → roster pane reorders; click COF → `flight-detail-dialog` opens (assert visible).
- [ ] Run: `cd e2e && npx playwright test tests/gantt/flight-navi.spec.ts --reporter=list` (use `--no-deps` if pbs-server down). Paste PASS receipt.
- [ ] Commit `test(e2e): flight navi coverage`.

---

## Self-review notes

- Spec coverage: button (T6), default load (T4), filters incl. fizz (T1/T5), PTNs/Roster counts (T4), navi actions (T3/T5), AppDialog window (T5), tests (T1/T9). ✓
- Known limitation surfaced honestly: SubFleet/Composition `—` (T7); counts reflect loaded stores (per decision).
- Type consistency: `NaviRow`/`NaviFilters` defined in T1 and reused in T4/T5; `bringPairingIdsToTop`/`bringFlightCrewToTop` defined in T3 and called in T5.
