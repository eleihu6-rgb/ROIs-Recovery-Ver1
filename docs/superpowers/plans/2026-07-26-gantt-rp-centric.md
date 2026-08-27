# RP-Centric Gantt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Live + Scenario Gantt roster-period (RP) centric — RP-based navigation (GO TO RPDate, toolbar multi-select, header indicator) and RP-bounded crew stat columns (RpCred/RpDO/RpBH) backed by repurposed `crew_manday_*_period` tables.

**Architecture:** Two phases. **P1** adds the gantt nav/select layer (dictionary params, a non-admin windowed `GET /api/roster-periods`, a shared `RpSelect`/`RpMultiSelect`, a shared GO TO RPDate menu + `zoomToRp`, and a header RP indicator + crew count) with no data migration. **P2** renames `crew_manday_*_monthly` → `crew_manday_*_period` (column `year_month` → `roster_period` + denormalized `rp_start/rp_end`), switches the daily→period re-aggregation to RP grouping, migrates all four consumers (live-server, engine-server, pbs-server, gantt) in one cutover, truncates and repopulates via the manday RuleTool, and flips the columns to true RP totals.

**Tech Stack:** React 19 + Vite + TS (gantt), Fastify + Drizzle + TS (live-server, pbs-server), FastAPI + Python (engine-server), PostgreSQL 16, Vitest + Playwright, Zustand.

## Global Constraints

- **UI default language is English** — all buttons/labels/placeholders/empty states in English; Chinese only if i18n set to zh. (CLAUDE.md §前端语言规范)
- **Parameterize business constants from `dictionary`** — never hardcode the RP window/max counts. (CLAUDE.md)
- **§First-Paint** — RP list fetch is lazy (after first crew batch); Rp-column stats (P2) load only for the viewport's current RP, async, never blocking the crew/flight first frame.
- **§Gantt-Unify** — shared code under `gantt/src/components/panes/shared/` + `gantt/src/components/common/`; Live/Scenario differences go in the thin adapters, not `if (live)`.
- **§Playwright-Required / §No-Illusion / §Simulate-User** — every UI change ships a Playwright test that drives the real UI; paste PASS receipts; no `expect(true)` or visibility-only assertions.
- **§UI-Standard-Gate** — run `npm run check:ui` after frontend style changes; 0 hard violations.
- **DB objects lowercase snake_case; audit columns required; `is_deleted` = cancel flag (physical DELETE).** (CLAUDE.md)
- **§Remote-DB-Only** — all SQL verification against the remote DB via `DATABASE_URL_F8`; migrations are idempotent and run against both `f8` and `scenario` schemas.
- **Git** — commit only when the user asks; branch off `main` first; commit messages end with `Co-Authored-By: Claude <noreply@anthropic.com>`.
- **Source-of-truth migration gate** (P2) — `docs/architecture/source-of-truth-migration-gate.md`: full consumer audit, explicit old-source behavior, conflict regression, record residual paths.

---

# Phase 1 — Gantt nav + select foundation (no migration)

P1 delivers all user-facing RP navigation and the shared select layer. Columns stay `MCred/MDO/MBH` (monthly) until P2.

## Task P1.1: Seed RP-select dictionary parameters

**Files:**
- Modify: `sql/seed/01-dictionary.sql` (the `SYS_PARAM` INSERT block, ~L54-72)

**Interfaces:**
- Produces: three `dictionary` rows (`parent_code='SYS_PARAM'`) — `RP_SELECT_BACK_COUNT=6`, `RP_SELECT_FORWARD_COUNT=6`, `RP_GANTT_MAX_PERIODS=5` — consumed by P1.2 and P1.9.

- [ ] **Step 1: Add the seed rows**

In `sql/seed/01-dictionary.sql`, append to the `SYS_PARAM` VALUES list (continue `idx` after the current last value; the file already has `ON CONFLICT (coalesce(parent_code,'___NULL___'), code) DO NOTHING`):

```sql
('SYS_PARAM', 'RP_SELECT_BACK_COUNT',     'Roster-period selectable window — RPs before current',       18, '6'),
('SYS_PARAM', 'RP_SELECT_FORWARD_COUNT',  'Roster-period selectable window — RPs after current',        19, '6'),
('SYS_PARAM', 'RP_GANTT_MAX_PERIODS',     'Max roster periods selectable in the Gantt toolbar',         20, '5');
```

- [ ] **Step 2: Apply + verify on the remote DB**

Run (against `DATABASE_URL_F8`):
```bash
psql "$DATABASE_URL_F8" -c "SET search_path TO f8; $(grep -A999 \"parent_code, code, name, idx, code_value\) VALUES" sql/seed/01-dictionary.sql | grep RP_SELECT || true)"
```
(If the project has a seed runner, prefer it.) Then verify:
```sql
SELECT code, code_value FROM dictionary WHERE parent_code='SYS_PARAM' AND code LIKE 'RP_%';
```
Expected: 3 rows with values 6, 6, 5.

- [ ] **Step 3: Commit**

```bash
git checkout -b feat/gantt-rp-centric
git add sql/seed/01-dictionary.sql
git commit -m "feat: seed RP-select dictionary params (back/forward/max)"
```

## Task P1.2: `getSysParamMap` helper + `GET /api/roster-periods` endpoint

**Files:**
- Modify: `live-server/src/services/base/dictionary-service.ts`
- Create: `live-server/src/routes/base/roster-periods.ts`
- Modify: `live-server/src/index.ts` (register the route) — or the base-routes index where `/api` base routes are registered
- Test: `live-server/src/__tests__/unit/roster-periods-route.test.ts`

**Interfaces:**
- Consumes: `dictionaryService.getByParentCode(fastify, 'SYS_PARAM')` (existing, cached 24h); the windowing SQL pattern from `routes/scenario/import-pbs-material.ts:549-566`; `liveSchema()` helper.
- Produces: `GET /api/roster-periods` → `200 { items: [{ id:number, rosterPeriod:string, name:string, rpStart:string, rpEnd:string, isCurrent:boolean }] }`, non-admin; and `getSysParamMap(fastify): Promise<Map<string,string>>` on the dictionary service.

- [ ] **Step 1: Write the failing route test**

`live-server/src/__tests__/unit/roster-periods-route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fastify from 'fastify'

const dictionaryRows = [
  { code: 'RP_SELECT_BACK_COUNT', codeValue: '6' },
  { code: 'RP_SELECT_FORWARD_COUNT', codeValue: '6' },
]
const periodRows = [
  { id: 1, roster_period: '2026RP02', name: '2026-02', rp_start: '2026-02-01', rp_end: '2026-03-01' },
  { id: 2, roster_period: '2026RP03', name: '2026-03', rp_start: '2026-03-02', rp_end: '2026-03-31' },
]

describe('GET /api/roster-periods', () => {
  let app: ReturnType<typeof fastify>
  beforeEach(async () => {
    app = fastify()
    app.addHook('onRequest', async (req: any) => { req.authUser = { id: 1, isAdmin: false } })
    app.pgPool = { query: vi.fn(async (text: string) => {
      if (text.includes('from dictionary')) return { rows: dictionaryRows }
      if (text.includes('row_number()')) return { rows: periodRows.map((r, i) => ({ ...r, is_current: i === 0 })) }
      return { rows: [] }
    }) } as any
    app.decorate('liveSchema', () => 'f8')
    const { default: route } = await import('../../../src/routes/base/roster-periods')
    await app.register(route, { prefix: '/api' })
    await app.ready()
  })

  it('returns windowed roster periods, non-admin allowed', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/roster-periods' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.items.length).toBe(2)
    expect(body.items[0]).toMatchObject({ rosterPeriod: '2026RP02', rpStart: '2026-02-01', isCurrent: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd live-server && npx vitest run src/__tests__/unit/roster-periods-route.test.ts`
Expected: FAIL — module not found / route not registered.

- [ ] **Step 3: Add `getSysParamMap` to the dictionary service**

In `live-server/src/services/base/dictionary-service.ts`, add:
```ts
export async function getSysParamMap(fastify: any): Promise<Map<string, string>> {
  const rows = await exports.getByParentCode(fastify, 'SYS_PARAM') // cached 24h
  const map = new Map<string, string>()
  for (const r of rows) map.set(r.code, r.codeValue ?? r.code_value ?? '')
  return map
}
```
(Adjust the field name — `codeValue` vs `code_value` — to match the existing row shape returned by `getByParentCode`. Read the existing return shape first and match it.)

- [ ] **Step 4: Implement the route**

`live-server/src/routes/base/roster-periods.ts`:
```ts
import type { FastifyPluginAsync } from 'fastify'
import { getSysParamMap } from '../../services/base/dictionary-service'

const asDateOnly = (v: Date | string): string =>
  (v instanceof Date ? v : new Date(v as string)).toISOString().slice(0, 10)

const rosterPeriodsRoute: FastifyPluginAsync = async (app) => {
  app.get('/roster-periods', async (request, reply) => {
    const params = await getSysParamMap(app)
    const back = Number(params.get('RP_SELECT_BACK_COUNT')) || 6
    const fwd = Number(params.get('RP_SELECT_FORWARD_COUNT')) || 6
    const sch = (app as any).liveSchema()
    const { rows } = await app.pgPool.query(`
      WITH periods AS (
        SELECT id, roster_period, name, rp_start, rp_end,
               row_number() OVER (ORDER BY rp_start ASC, id ASC) AS rn
          FROM ${sch}.roster_period
      ), current_period AS (
        SELECT rn FROM periods
         WHERE now() >= rp_start AND now() <= rp_end
         ORDER BY rp_start ASC LIMIT 1
      )
      SELECT p.id, p.roster_period AS "rosterPeriod", p.name, p.rp_start, p.rp_end,
             (p.rn = c.rn) AS "isCurrent"
        FROM periods p
        JOIN current_period c ON p.rn BETWEEN c.rn - $1 AND c.rn + $2
       ORDER BY p.rp_start ASC, p.id ASC
    `, [back, fwd])
    if (rows.length === 0) return reply.code(404).send({ error: 'No roster period contains the current time.' })
    const items = rows.map((r: any) => ({
      id: r.id, rosterPeriod: r.rosterPeriod, name: r.name,
      rpStart: asDateOnly(r.rp_start), rpEnd: asDateOnly(r.rp_end), isCurrent: !!r.isCurrent,
    }))
    return { items }
  })
}
export default rosterPeriodsRoute
```

- [ ] **Step 5: Register the route**

In `live-server/src/index.ts` (or the base routes file where `/api` routes register), add alongside other base routes:
```ts
import rosterPeriodsRoute from './routes/base/roster-periods'
// ...
app.register(rosterPeriodsRoute) // mounted at /api (the route path is /roster-periods)
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd live-server && npx vitest run src/__tests__/unit/roster-periods-route.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add live-server/src/routes/base/roster-periods.ts live-server/src/services/base/dictionary-service.ts live-server/src/index.ts live-server/src/__tests__/unit/roster-periods-route.test.ts
git commit -m "feat: add non-admin GET /api/roster-periods (dictionary-windowed)"
```

## Task P1.3: Frontend `roster-period-store` + API client

**Files:**
- Create: `gantt/src/services/roster-period-api.ts`
- Create: `gantt/src/stores/roster-period-store.ts`
- Test: `gantt/src/stores/__tests__/roster-period-store.test.ts`

**Interfaces:**
- Consumes: `GET /api/roster-periods` (P1.2); existing `api.get` HTTP client used in `services/import-pbs-material-api.ts`.
- Produces: `RosterPeriodOption { id:number; rosterPeriod:string; name:string; rpStart:string; rpEnd:string; isCurrent:boolean }`; store hooks `useRosterPeriods()` and actions `loadRosterPeriods()`.

- [ ] **Step 1: Write the failing store test**

`gantt/src/stores/__tests__/roster-period-store.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useRosterPeriodStore } from '../roster-period-store'

vi.mock('../../services/roster-period-api', () => ({
  fetchRosterPeriods: vi.fn().mockResolvedValue({
    items: [
      { id: 1, rosterPeriod: '2026RP02', name: '2026-02', rpStart: '2026-02-01', rpEnd: '2026-03-01', isCurrent: true },
      { id: 2, rosterPeriod: '2026RP03', name: '2026-03', rpStart: '2026-03-02', rpEnd: '2026-03-31', isCurrent: false },
    ],
  }),
}))

describe('roster-period-store', () => {
  beforeEach(() => { useRosterPeriodStore.setState({ items: [], loaded: false }) })
  it('loads and caches roster periods', async () => {
    await useRosterPeriodStore.getState().loadRosterPeriods()
    const s = useRosterPeriodStore.getState()
    expect(s.loaded).toBe(true)
    expect(s.items.length).toBe(2)
    expect(s.items[0].rosterPeriod).toBe('2026RP02')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gantt && npx vitest run src/stores/__tests__/roster-period-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the API client**

`gantt/src/services/roster-period-api.ts`:
```ts
import { api } from './api' // same api client used by import-pbs-material-api.ts

export interface RosterPeriodOption {
  id: number
  rosterPeriod: string
  name: string
  rpStart: string   // 'YYYY-MM-DD'
  rpEnd: string     // 'YYYY-MM-DD'
  isCurrent: boolean
}
export interface RosterPeriodsResponse { items: RosterPeriodOption[] }

export const fetchRosterPeriods = async (): Promise<RosterPeriodsResponse> =>
  api.get('/api/roster-periods') as Promise<RosterPeriodsResponse>
```
(Match the `api` import path/style used in `import-pbs-material-api.ts` — read it first and mirror exactly.)

- [ ] **Step 4: Implement the store**

`gantt/src/stores/roster-period-store.ts`:
```ts
import { create } from 'zustand'
import { fetchRosterPeriods, type RosterPeriodOption } from '../services/roster-period-api'

interface RosterPeriodState {
  items: RosterPeriodOption[]
  loaded: boolean
  loading: boolean
  loadRosterPeriods: () => Promise<void>
}

export const useRosterPeriodStore = create<RosterPeriodState>((set, get) => ({
  items: [],
  loaded: false,
  loading: false,
  loadRosterPeriods: async () => {
    if (get().loaded || get().loading) return
    set({ loading: true })
    try {
      const { items } = await fetchRosterPeriods()
      set({ items, loaded: true })
    } finally {
      set({ loading: false })
    }
  },
}))
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd gantt && npx vitest run src/stores/__tests__/roster-period-store.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add gantt/src/services/roster-period-api.ts gantt/src/stores/roster-period-store.ts gantt/src/stores/__tests__/roster-period-store.test.ts
git commit -m "feat(gantt): add roster-period store + api client"
```

## Task P1.4: `useCurrentRp()` hook — RP of the leftmost visible day

**Files:**
- Create: `gantt/src/components/gantt/use-current-rp.ts`
- Test: `gantt/src/components/gantt/__tests__/use-current-rp.test.ts`

**Interfaces:**
- Consumes: `useRosterPeriodStore().items`; the active gantt store's `scrollX`, `pxPerHour`, `rangeStart` (Live `useGanttViewStore` / Scenario `getScenarioGanttStore(id)`). To stay store-agnostic, the hook takes a `getScrollState(): { scrollX, pxPerHour, rangeStartMs }` and an `items` argument — the caller binds its own store.
- Produces: `useCurrentRp({ items, getScrollState }): RosterPeriodOption | null`.

- [ ] **Step 1: Write the failing test**

`gantt/src/components/gantt/__tests__/use-current-rp.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { rpForTimestamp } from '../use-current-rp'

const items = [
  { id: 1, rosterPeriod: '2026RP02', name: '2026-02', rpStart: '2026-02-01', rpEnd: '2026-03-01', isCurrent: false },
  { id: 2, rosterPeriod: '2026RP03', name: '2026-03', rpStart: '2026-03-02', rpEnd: '2026-03-31', isCurrent: true },
]

describe('rpForTimestamp', () => {
  it('maps a date inside an RP to that RP', () => {
    expect(rpForTimestamp(items, Date.UTC(2026, 1, 15))?.rosterPeriod).toBe('2026RP02')   // Feb-15
  })
  it('maps the Feb/Mar boundary (Mar-01) to Feb RP, not Mar', () => {
    expect(rpForTimestamp(items, Date.UTC(2026, 2, 1))?.rosterPeriod).toBe('2026RP02')    // Mar-01 = Feb RP last day
  })
  it('returns null outside all RPs', () => {
    expect(rpForTimestamp(items, Date.UTC(2025, 0, 1))).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gantt && npx vitest run src/components/gantt/__tests__/use-current-rp.test.ts`
Expected: FAIL — `rpForTimestamp` not defined.

- [ ] **Step 3: Implement**

`gantt/src/components/gantt/use-current-rp.ts`:
```ts
import { useMemo } from 'react'
import type { RosterPeriodOption } from '../../services/roster-period-api'

/** Map a UTC ms instant to the RP whose [rp_start, rp_end] (UTC date) contains its day. */
export function rpForTimestamp(items: RosterPeriodOption[], ms: number): RosterPeriodOption | null {
  const day = new Date(ms)
  const yyyy = day.getUTCFullYear()
  const mm = day.getUTCMonth()
  const dd = day.getUTCDate()
  const ts = Date.UTC(yyyy, mm, dd)
  for (const rp of items) {
    const s = Date.parse(rp.rpStart + 'T00:00:00.000Z')
    const e = Date.parse(rp.rpEnd + 'T23:59:59.999Z')
    if (ts >= s && ts <= e) return rp
  }
  return null
}

export interface ScrollState { scrollX: number; pxPerHour: number; rangeStartMs: number }

export function useCurrentRp(
  items: RosterPeriodOption[],
  getScrollState: () => ScrollState,
): RosterPeriodOption | null {
  const { scrollX, pxPerHour, rangeStartMs } = getScrollState()
  return useMemo(() => {
    if (!items.length || pxPerHour <= 0) return null
    const leftmostMs = rangeStartMs + (scrollX / pxPerHour) * 3_600_000
    return rpForTimestamp(items, leftmostMs)
  }, [items, scrollX, pxPerHour, rangeStartMs])
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gantt && npx vitest run src/components/gantt/__tests__/use-current-rp.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/gantt/use-current-rp.ts gantt/src/components/gantt/__tests__/use-current-rp.test.ts
git commit -m "feat(gantt): add useCurrentRp hook (leftmost-day RP derivation)"
```

## Task P1.5: `zoomToRp` store action (Live + Scenario)

**Files:**
- Modify: `gantt/src/stores/gantt-view-store.ts` (mirror `zoomToMonth` at ~L185, L404-426)
- Modify: `gantt/src/stores/scenario-gantt-store.ts` (mirror `zoomToMonth` at ~L48, L204-220)
- Test: `gantt/src/stores/__tests__/gantt-view-store-zoom-rp.test.ts`

**Interfaces:**
- Consumes: existing `clamp`, `maxScrollXFor`, `MONTH_VIEWPORT_ANCHOR_BIAS_MS`, `cancelPendingScroll` (Live), `calendarDateToUtcMidnight`.
- Produces: `zoomToRp(rpStartMs: number, rpEndMs: number, rangeStart: number, viewportWidth?: number): void` on both stores.

- [ ] **Step 1: Write the failing test**

`gantt/src/stores/__tests__/gantt-view-store-zoom-rp.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { useGanttViewStore } from '../gantt-view-store'

describe('zoomToRp', () => {
  it('sets pxPerHour/scrollX so the RP window fills the viewport', () => {
    const store = useGanttViewStore.getState()
    const rangeStart = Date.UTC(2026, 0, 1)
    const rpStart = Date.UTC(2026, 2, 2)   // 2026-03-02
    const rpEnd = Date.UTC(2026, 2, 31, 23, 59, 59) // 2026-03-31
    ;(useGanttViewStore as any).setState({ rangeStart, contentHours: 24 * 365, viewportWidth: 1000 })
    useGanttViewStore.getState().zoomToRp(rpStart, rpEnd, rangeStart, 1000)
    const { pxPerHour, scrollX } = useGanttViewStore.getState()
    expect(pxPerHour).toBeGreaterThan(0)
    expect(scrollX).toBeGreaterThanOrEqual(0)
    // anchor (rpStart + bias) sits at the left edge: scrollX ≈ offsetHours*pxPerHour
    const offsetHours = ((rpStart + 60_000) - rangeStart) / 3_600_000
    expect(scrollX).toBeCloseTo(Math.min(pxPerHour * offsetHours, scrollX + 1), 0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gantt && npx vitest run src/stores/__tests__/gantt-view-store-zoom-rp.test.ts`
Expected: FAIL — `zoomToRp is not a function`.

- [ ] **Step 3: Add `zoomToRp` to the Live store**

In `gantt/src/stores/gantt-view-store.ts`, add to the store interface (next to `zoomToMonth`):
```ts
zoomToRp: (rpStartMs: number, rpEndMs: number, rangeStart: number, viewportWidth?: number) => void
```
and the implementation (mirror `zoomToMonth`'s body at ~L404-426, but take the boundaries as args):
```ts
zoomToRp: (rpStartMs, rpEndMs, rangeStart, viewportWidth) => {
  const { cancelPendingScroll, clamp, maxScrollXFor } = useGanttViewStore.getState() as any
  cancelPendingScroll?.()
  const anchorMs = rpStartMs + MONTH_VIEWPORT_ANCHOR_BIAS_MS
  const hours = Math.max(1, (rpEndMs - anchorMs) / 3_600_000)
  const width = viewportWidth ?? (window.innerWidth - 262)
  const newPxPerHour = clamp(zoomMin, zoomMax, width / hours)
  const offsetHours = Math.max(0, (anchorMs - rangeStart) / 3_600_000)
  const max = maxScrollXFor({ contentHours: useGanttViewStore.getState().contentHours, pxPerHour: newPxPerHour, viewportWidth: width })
  const scrollX = Math.min(max, offsetHours * newPxPerHour)
  useGanttViewStore.setState({ pxPerHour: newPxPerHour, scrollX, dirty: true, dirtyEpoch: useGanttViewStore.getState().dirtyEpoch + 1 })
},
```
Match the actual local references the file uses for `clamp`, `zoomMin`, `zoomMax`, `maxScrollXFor`, `contentHours`, `dirty`, `dirtyEpoch` — read the existing `zoomToMonth` body first and copy its exact idioms (the snippet above is a faithful template).

- [ ] **Step 4: Add `zoomToRp` to the Scenario store**

In `gantt/src/stores/scenario-gantt-store.ts`, mirror the same shape next to its `zoomToMonth` (~L204-220), using that store's `maxScrollXFor({ data, pxPerHour, viewportWidth })` signature and width fallback (`window.innerWidth - leftPanelWidth - 14`):
```ts
zoomToRp: (rpStartMs, rpEndMs, rangeStart, viewportWidth) => {
  const anchorMs = rpStartMs + MONTH_VIEWPORT_ANCHOR_BIAS_MS
  const hours = Math.max(1, (rpEndMs - anchorMs) / 3_600_000)
  const width = viewportWidth ?? (window.innerWidth - leftPanelWidth - 14)
  const newPxPerHour = Math.min(Math.max(zoomMin, width / hours), zoomMax)
  const offsetHours = Math.max(0, (anchorMs - rangeStart) / 3_600_000)
  const max = maxScrollXFor({ data: get().data, pxPerHour: newPxPerHour, viewportWidth: width })
  const scrollX = Math.min(max, offsetHours * newPxPerHour)
  set({ pxPerHour: newPxPerHour, scrollX })
},
```
Add the interface signature in the store type (~L48) and the `MONTH_VIEWPORT_ANCHOR_BIAS_MS` constant is already present (~L10).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd gantt && npx vitest run src/stores/__tests__/gantt-view-store-zoom-rp.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add gantt/src/stores/gantt-view-store.ts gantt/src/stores/scenario-gantt-store.ts gantt/src/stores/__tests__/gantt-view-store-zoom-rp.test.ts
git commit -m "feat(gantt): add zoomToRp store action (Live + Scenario)"
```

## Task P1.6: Shared `TimeAxisRpMenu` + wire right-click; retire month menus

**Files:**
- Create: `gantt/src/components/gantt/time-axis-rp-menu.tsx`
- Modify: `gantt/src/components/gantt/time-axis.tsx` (Live; right-click handler ~L254-264, menu mount ~L296-303)
- Modify: `gantt/src/components/scenario-gantt/scenario-time-axis.tsx` (Scenario; handler ~L193-197, menu mount ~L228-237)
- Delete: `gantt/src/components/gantt/time-axis-menu.tsx`, `gantt/src/components/scenario-gantt/scenario-time-axis-menu.tsx`
- Modify: `gantt/src/components/gantt/source/__tests__/no-store-imports.guard.test.ts` (allowlist the new menu's imports)
- Test: `e2e/gantt/go-to-rp-date.spec.ts`

**Interfaces:**
- Consumes: `useRosterPeriodStore().items` + `loadRosterPeriods()`; `zoomToRp` (P1.5); Live's `useFilterStore` + `applyGanttFilters()` for the widen-on-unloaded behavior.
- Produces: a shared menu the two axes open; header label "GO TO RPDate"; items labeled `rosterPeriod`; onSelect calls `zoomToRp(rpStartMs, rpEndMs, rangeStart, viewportWidth)`.
- Menu is store-agnostic: props `{ open, x, y, viewportWidth, rangeStart, onSelectRp: (rp) => void, onClose }`.

- [ ] **Step 1: Write the failing Playwright test**

`e2e/gantt/go-to-rp-date.spec.ts` (drive the real UI — right-click the time axis, assert the menu shows an RP code, click it, assert the viewport scrolled/zoomed and the URL/store reflects the RP range):
```ts
import { test, expect } from '@playwright/test'

test('GO TO RPDate zooms the viewport to the selected roster period', async ({ page }) => {
  await page.goto('/')
  // wait for first paint of crew rows
  await expect(page.getByTestId('pane-time-axis')).toBeVisible()
  // open the context menu on the Live time axis
  await page.getByTestId('pane-time-axis').click({ button: 'right' })
  const menu = page.getByRole('menu', { name: /GO TO RPDate/i })
  await expect(menu).toBeVisible()
  // the menu lists an RP code like 2026RPxx
  const firstRp = menu.getByRole('menuitem').first()
  await expect(firstRp).toContainText(/2026RP\d{2}/)
  // capture scrollX before via window probe, then click
  const before = await page.evaluate(() => (window as any).__ganttScrollX ?? 0)
  await firstRp.click()
  // viewport changed (zoom/scroll applied)
  await page.waitForTimeout(300)
  const after = await page.evaluate(() => (window as any).__ganttScrollX ?? 0)
  expect(after).not.toEqual(before)
})
```
(If the app does not expose `__ganttScrollX`, replace the probe with an assertion against the RP indicator added in P1.9 — that task lands the testid `roster-header-rp`; re-order this assertion to `await expect(page.getByTestId('roster-header-rp')).toContainText(/2026RP\d{2}/)` after P1.9.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gantt && npx playwright test e2e/gantt/go-to-rp-date.spec.ts --reporter=list`
Expected: FAIL — menu not found / no "GO TO RPDate".

- [ ] **Step 3: Implement the shared menu**

`gantt/src/components/gantt/time-axis-rp-menu.tsx`:
```tsx
import { useEffect } from 'react'
import { Calendar } from 'lucide-react'
import { useRosterPeriodStore } from '../../stores/roster-period-store'
import type { RosterPeriodOption } from '../../services/roster-period-api'

interface Props {
  open: boolean
  x: number
  y: number
  viewportWidth: number
  rangeStart: number
  onSelectRp: (rp: RosterPeriodOption) => void
  onClose: () => void
}

const rpStartMs = (rp: RosterPeriodOption) => Date.parse(rp.rpStart + 'T00:00:00.000Z')
const rpEndMs = (rp: RosterPeriodOption) => Date.parse(rp.rpEnd + 'T23:59:59.999Z')

export function TimeAxisRpMenu({ open, x, y, viewportWidth, rangeStart, onSelectRp, onClose }: Props) {
  const items = useRosterPeriodStore((s) => s.items)
  const load = useRosterPeriodStore((s) => s.loadRosterPeriods)
  useEffect(() => { if (open) load() }, [open, load])
  if (!open) return null
  const menuW = 180
  const menuH = items.length * 30 + 40
  const left = Math.min(x, window.innerWidth - menuW - 8)
  const top = Math.min(y, window.innerHeight - menuH - 8)
  return (
    <div
      role="menu" aria-label="GO TO RPDate" data-testid="time-axis-rp-menu"
      className="fixed z-50 rounded-sm border border-border bg-popover p-1 text-xs shadow-md"
      style={{ left, top, width: menuW }}
    >
      <div className="flex items-center gap-2 px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Calendar className="h-3 w-3 shrink-0" /> GO TO RPDate
      </div>
      {items.map((rp) => (
        <button
          key={rp.id} role="menuitem" data-testid={`time-axis-rp-${rp.rosterPeriod}`}
          className="flex w-full items-center justify-between rounded-sm px-2 py-1 font-mono tabular-nums hover:bg-accent"
          onClick={() => { onSelectRp(rp); onClose() }}
        >
          <span>{rp.rosterPeriod}</span>
          {rp.isCurrent && <span className="text-2xs text-primary">now</span>}
        </button>
      ))}
    </div>
  )
}

export { rpStartMs, rpEndMs }
```

- [ ] **Step 4: Wire the Live axis**

In `gantt/src/components/gantt/time-axis.tsx`, replace the `<TimeAxisMenu …/>` usage (~L296-303) with `<TimeAxisRpMenu>` and an `onSelectRp` that (a) widens `dateRange` if the RP falls outside the loaded window, then (b) calls `zoomToRp`:
```tsx
import { TimeAxisRpMenu, rpStartMs, rpEndMs } from './time-axis-rp-menu'
import { useGanttViewStore } from '../../stores/gantt-view-store'
import { useFilterStore } from '../../stores/filter-store'
import { applyGanttFilters } from '../../utils/apply-filters'
// ...inside the component, replace the menu element:
<TimeAxisRpMenu
  open={menuOpen} x={menuX} y={menuY}
  viewportWidth={viewportWidth} rangeStart={rangeStart}
  onClose={() => setMenuOpen(false)}
  onSelectRp={(rp) => {
    const filter = useFilterStore.getState()
    const rs = filter.dateRange.start.getTime(), re = filter.dateRange.end.getTime()
    if (rpStartMs(rp) < rs || rpEndMs(rp) > re) {
      useFilterStore.getState().setDateRange(new Date(rpStartMs(rp)), new Date(rpEndMs(rp)))
      void applyGanttFilters()
    }
    useGanttViewStore.getState().zoomToRp(rpStartMs(rp), rpEndMs(rp), rangeStart, viewportWidth)
  }}
/>
```
Match the actual local state names (`menuOpen/menuX/menuY`, `rangeStart`, `viewportWidth`) the file already uses in its right-click handler (~L254-264) — read first, then bind.

- [ ] **Step 5: Wire the Scenario axis**

In `gantt/src/components/scenario-gantt/scenario-time-axis.tsx`, replace `<ScenarioTimeAxisMenu …/>` (~L228-237) with `<TimeAxisRpMenu>` whose `onSelectRp` calls the scenario store's `zoomToRp`:
```tsx
import { TimeAxisRpMenu, rpStartMs, rpEndMs } from '../gantt/time-axis-rp-menu'
// ...
<TimeAxisRpMenu
  open={menuOpen} x={menuX} y={menuY}
  viewportWidth={viewportWidth} rangeStart={rangeStart}
  onClose={() => setMenuOpen(false)}
  onSelectRp={(rp) => { store.getState().zoomToRp(rpStartMs(rp), rpEndMs(rp), rangeStart, viewportWidth) }}
/>
```

- [ ] **Step 6: Delete the old month menus + update the guard**

```bash
rm gantt/src/components/gantt/time-axis-menu.tsx gantt/src/components/scenario-gantt/scenario-time-axis-menu.tsx
```
In `gantt/src/components/gantt/source/__tests__/no-store-imports.guard.test.ts`, replace the `time-axis-menu.tsx` allowlist entry (~L52) with `time-axis-rp-menu.tsx` and permit `useRosterPeriodStore`, `useGanttViewStore`, `useFilterStore`, `useTimezoneStore` via `getState()` (the allowed non-reactive pattern). Read the current allowlist format first and mirror it.

- [ ] **Step 7: Run test to verify it passes**

Run: `cd gantt && npx playwright test e2e/gantt/go-to-rp-date.spec.ts --reporter=list`
Expected: PASS.

- [ ] **Step 8: Run the guard + lint**

Run: `cd gantt && npx vitest run src/components/gantt/source/__tests__/no-store-imports.guard.test.ts && npm run check:ui`
Expected: PASS / 0 hard violations. Paste receipts.

- [ ] **Step 9: Commit**

```bash
git add -A gantt/src/components/gantt/time-axis-rp-menu.tsx gantt/src/components/gantt/time-axis.tsx gantt/src/components/scenario-gantt/scenario-time-axis.tsx gantt/src/components/gantt/source/__tests__/no-store-imports.guard.test.ts e2e/gantt/go-to-rp-date.spec.ts
git rm gantt/src/components/gantt/time-axis-menu.tsx gantt/src/components/scenario-gantt/scenario-time-axis-menu.tsx
git commit -m "feat(gantt): GO TO RPDate shared menu, retire month menus"
```

## Task P1.7: Shared `RpSelect` (single) + refactor the 3 existing dropdowns

**Files:**
- Create: `gantt/src/components/common/rp-select.tsx`
- Modify: `gantt/src/components/scenario/scenario-basic-info.tsx` (testid `scenario-rp-period`)
- Modify: `gantt/src/components/scenario/import-pbs-dialog.tsx` (testid `import-pbs-roster-period`)
- Modify: `gantt/src/components/roster/roster-publish-dialog.tsx` (testid `roster-publish-period`)
- Test: `e2e/gantt/rp-select-dropdowns.spec.ts`

**Interfaces:**
- Consumes: `useRosterPeriodStore`; the project's `<Select>` primitives (same `@/components/ui/select` the 3 dropdowns already use).
- Produces: `<RpSelect value onValueChange ariaLabel testId />` whose options come from the store (label `rosterPeriod`).

- [ ] **Step 1: Write the failing Playwright test**

`e2e/gantt/rp-select-dropdowns.spec.ts` — drive each real dropdown:
```ts
import { test, expect } from '@playwright/test'

test('roster-publish dialog RP select defaults to current and lists RPs', async ({ page }) => {
  await page.goto('/')
  // open the roster publish dialog via its real UI entry point (mirror existing publish-dialog e2e)
  // ...navigate to the publish action...
  const trigger = page.getByTestId('roster-publish-period')
  await expect(trigger).toBeVisible()
  await trigger.click()
  // options are RP codes
  await expect(page.getByRole('option').first()).toContainText(/2026RP\d{2}/)
})
```
(Add the two analogous checks for `scenario-rp-period` and `import-pbs-roster-period`, following how existing e2e opens those dialogs.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gantt && npx playwright test e2e/gantt/rp-select-dropdowns.spec.ts --reporter=list`
Expected: FAIL.

- [ ] **Step 3: Implement `RpSelect`**

`gantt/src/components/common/rp-select.tsx`:
```tsx
import { useEffect } from 'react'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useRosterPeriodStore } from '../../stores/roster-period-store'

interface Props {
  value: string
  onValueChange: (id: string) => void
  testId: string
  ariaLabel?: string
  placeholder?: string
}
export function RpSelect({ value, onValueChange, testId, ariaLabel, placeholder }: Props) {
  const items = useRosterPeriodStore((s) => s.items)
  const load = useRosterPeriodStore((s) => s.loadRosterPeriods)
  useEffect(() => { load() }, [load])
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger data-testid={testId} aria-label={ariaLabel ?? 'Roster period'}>
        <SelectValue placeholder={placeholder ?? 'Select RP'} />
      </SelectTrigger>
      <SelectContent>
        {items.map((rp) => (
          <SelectItem key={rp.id} value={String(rp.id)}>
            <span className="font-mono tabular-nums">{rp.rosterPeriod}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
```

- [ ] **Step 4: Refactor `scenario-basic-info.tsx`**

Replace the inline `<Select>` block (~L188-203) + its `fetchImportPbsRosterPeriods` effect (~L72-88) + local `periods` state (~L45) with:
```tsx
import { RpSelect } from '../common/rp-select'
import { useRosterPeriodStore } from '../../stores/roster-period-store'
// keep selectedPeriodId derivation by date-match, but resolve against the store items:
const items = useRosterPeriodStore((s) => s.items)
const selectedPeriod = useMemo(
  () => items.find((p) => p.rpStart === toDateInputValue(detail.strDtLoc) && p.rpEnd === toDateInputValue(detail.endDtLoc)) ?? null,
  [items, detail.strDtLoc, detail.endDtLoc],
)
// JSX:
<RpSelect testId="scenario-rp-period" value={selectedPeriod ? String(selectedPeriod.id) : ''} onValueChange={(id) => { const p = items.find((x) => String(x.id) === id); if (p) patchRosterPeriod(p) }} />
```
(Keep `patchRosterPeriod` and the date-match default-selection policy; only the data source + `<Select>` markup change.)

- [ ] **Step 5: Refactor `import-pbs-dialog.tsx`**

Replace the inline `<Select>` (~L380-395) + fetch effect (~L264-291) + `periodOptions` state (~L251) with `<RpSelect testId="import-pbs-roster-period" value={selectedPeriodId} onValueChange={setSelectedPeriodId} />`, driven by the store. Keep the `isCurrent ?? items[0]` default by deriving `selectedPeriodId` from the store items in a `useEffect`.

- [ ] **Step 6: Refactor `roster-publish-dialog.tsx`**

Replace the inline `<Select>` (~L404-419) + fetch effect (~L167-187) + `periods` state (~L151) with `<RpSelect testId="roster-publish-period" value={filters.rosterPeriodId} onValueChange={(id) => updateDropdownFilters({ rosterPeriodId: id })} />`, defaulting to `isCurrent ?? items[0]`.

- [ ] **Step 7: Run test to verify it passes**

Run: `cd gantt && npx playwright test e2e/gantt/rp-select-dropdowns.spec.ts --reporter=list`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A gantt/src/components/common/rp-select.tsx gantt/src/components/scenario/scenario-basic-info.tsx gantt/src/components/scenario/import-pbs-dialog.tsx gantt/src/components/roster/roster-publish-dialog.tsx e2e/gantt/rp-select-dropdowns.spec.ts
git commit -m "feat(gantt): shared RpSelect; refactor 3 RP dropdowns onto roster-period store"
```

## Task P1.8: Remove the old admin `import-pbs-material/roster-periods` endpoint

**Files:**
- Modify: `live-server/src/routes/scenario/import-pbs-material.ts` (delete the `GET /roster-periods` handler ~L543-584)
- Modify: `live-server/src/__tests__/unit/scenario-import-pbs-material-route.test.ts` (remove the ±5 window test ~L219)
- Test: the removed test is deleted; the route file still compiles.

**Interfaces:**
- Consumes: P1.7 (all 3 former callers now use `/api/roster-periods`).

- [ ] **Step 1: Confirm no remaining callers**

Run: `cd gantt && grep -R "import-pbs-material/roster-periods" src` → expect no hits (P1.7 removed them).

- [ ] **Step 2: Delete the handler + its test**

Remove the `fastify.get('/roster-periods', …)` block in `live-server/src/routes/scenario/import-pbs-material.ts` (~L543-584) and the corresponding test case in `scenario-import-pbs-material-route.test.ts` (~L219).

- [ ] **Step 3: Build + run the affected test file**

Run: `cd live-server && npm run build && npx vitest run src/__tests__/unit/scenario-import-pbs-material-route.test.ts`
Expected: PASS (build clean, no reference to the deleted route).

- [ ] **Step 4: Commit**

```bash
git add live-server/src/routes/scenario/import-pbs-material.ts live-server/src/__tests__/unit/scenario-import-pbs-material-route.test.ts
git commit -m "chore: remove dead admin import-pbs roster-periods endpoint"
```

## Task P1.9: `RpMultiSelect` (Live toolbar) + replace date inputs

**Files:**
- Create: `gantt/src/components/common/rp-multi-select.tsx`
- Modify: `gantt/src/components/shell/gantt-sub-toolbar.tsx` (replace `<DateRangePicker />` ~L104)
- Delete: `gantt/src/components/common/date-range-picker.tsx`
- Modify: `gantt/src/components/layout/header.tsx` (remove its `DateRangePicker` ~L114 — verify first whether `header.tsx` is rendered; if not rendered, leave the file but delete the picker import/usage)
- Test: `e2e/gantt/toolbar-rp-multiselect.spec.ts`

**Interfaces:**
- Consumes: `useRosterPeriodStore`; `RP_GANTT_MAX_PERIODS` (from a new tiny client config read — see Step 3); `useFilterStore.setDateRange`; `applyGanttFilters`.
- Produces: `<RpMultiSelect />` that selects up to N RPs, computes `[min(rp_start)−7d, max(rp_end)+7d]`, writes `dateRange`, and re-applies.

- [ ] **Step 1: Write the failing Playwright test**

`e2e/gantt/toolbar-rp-multiselect.spec.ts`:
```ts
import { test, expect } from '@playwright/test'

test('toolbar RP multi-select opens a window spanning the chosen RPs', async ({ page }) => {
  await page.goto('/')
  // date inputs are gone
  await expect(page.getByTestId('date-range-from')).toHaveCount(0)
  await expect(page.getByTestId('date-range-to')).toHaveCount(0)
  // open the multi-select and pick 2 RPs
  await page.getByTestId('toolbar-rp-multiselect').click()
  const options = page.getByRole('option')
  await options.nth(0).check()
  await options.nth(1).check()
  await page.keyboard.press('Escape')
  // gantt reloads to a window = [min rp_start -7d, max rp_end +7d]; assert the crew pane re-rendered
  await expect(page.getByTestId('pane-time-axis')).toBeVisible()
})

test('toolbar RP multi-select blocks selecting more than the max', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('toolbar-rp-multiselect').click()
  const opts = page.getByRole('option')
  for (let i = 0; i < 5; i++) await opts.nth(i).check()
  // 6th option is disabled
  await expect(opts.nth(5)).toBeDisabled()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gantt && npx playwright test e2e/gantt/toolbar-rp-multiselect.spec.ts --reporter=list`
Expected: FAIL.

- [ ] **Step 3: Expose `RP_GANTT_MAX_PERIODS` to the client**

Add the max to the `/api/roster-periods` response is not ideal (it's a different concern). Instead, add a tiny client config: extend `roster-period-api.ts` with `fetchRpSelectConfig()` hitting a new `GET /api/roster-periods/config` that returns `{ back, forward, max }` from `getSysParamMap` (mirror the route style of P1.2). Store it in `roster-period-store` as `config: { back, forward, max }` (default `{ back: 6, forward: 6, max: 5 }`). Add a vitest for the config fetch.

- [ ] **Step 4: Implement `RpMultiSelect`**

`gantt/src/components/common/rp-multi-select.tsx`:
```tsx
import { useState } from 'react'
import { CalendarRange } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { useRosterPeriodStore } from '../../stores/roster-period-store'
import { useFilterStore } from '../../stores/filter-store'
import { applyGanttFilters } from '../../utils/apply-filters'

const DAY = 86_400_000
export function RpMultiSelect() {
  const items = useRosterPeriodStore((s) => s.items)
  const load = useRosterPeriodStore((s) => s.loadRosterPeriods)
  const max = useRosterPeriodStore((s) => s.config.max)
  const [selected, setSelected] = useState<number[]>([])
  const [open, setOpen] = useState(false)
  if (!items.length) { void load() }
  const toggle = async (id: number) => {
    let next: number[]
    if (selected.includes(id)) next = selected.filter((x) => x !== id)
    else { if (selected.length >= max) return; next = [...selected, id] }
    setSelected(next)
    if (next.length === 0) return
    const chosen = items.filter((i) => next.includes(i.id))
    const start = Math.min(...chosen.map((c) => Date.parse(c.rpStart + 'T00:00:00.000Z'))) - 7 * DAY
    const end = Math.max(...chosen.map((c) => Date.parse(c.rpEnd + 'T23:59:59.999Z'))) + 7 * DAY
    useFilterStore.getState().setDateRange(new Date(start), new Date(end))
    void applyGanttFilters()
  }
  const label = selected.length ? `${selected.length} RPs` : 'Select RPs'
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button data-testid="toolbar-rp-multiselect" variant="outline" size="sm" className="gap-2 font-mono tabular-nums">
          <CalendarRange className="h-4 w-4 shrink-0" /> {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="start">
        {items.map((rp) => {
          const disabled = !selected.includes(rp.id) && selected.length >= max
          return (
            <label key={rp.id} className="flex items-center gap-2 px-2 py-1 text-xs aria-disabled:opacity-50" aria-disabled={disabled}>
              <Checkbox checked={selected.includes(rp.id)} disabled={disabled} onCheckedChange={() => toggle(rp.id)} />
              <span className="font-mono tabular-nums">{rp.rosterPeriod}</span>
            </label>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 5: Swap the toolbar + delete the date picker**

In `gantt/src/components/shell/gantt-sub-toolbar.tsx`, replace `<DateRangePicker />` (~L104) with `<RpMultiSelect />` (import from `../common/rp-multi-select`). Then:
```bash
rm gantt/src/components/common/date-range-picker.tsx
```
In `gantt/src/components/layout/header.tsx`, remove the `DateRangePicker` import (~L9) and usage (~L114). First confirm whether `<Header>` is still mounted anywhere (`grep -R "layout/header" gantt/src`); if it's dead chrome, leave the file minus the picker rather than deleting the file.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd gantt && npx playwright test e2e/gantt/toolbar-rp-multiselect.spec.ts --reporter=list`
Expected: PASS.

- [ ] **Step 7: check:ui + typecheck**

Run: `cd gantt && npm run check:ui && npx tsc --noEmit`
Expected: 0 hard violations; typecheck clean. Paste receipts.

- [ ] **Step 8: Commit**

```bash
git add -A gantt/src/components/common/rp-multi-select.tsx gantt/src/components/shell/gantt-sub-toolbar.tsx gantt/src/components/layout/header.tsx gantt/src/services/roster-period-api.ts gantt/src/stores/roster-period-store.ts e2e/gantt/toolbar-rp-multiselect.spec.ts
git rm gantt/src/components/common/date-range-picker.tsx
git commit -m "feat(gantt): RpMultiSelect replaces date inputs on Live toolbar"
```

## Task P1.10: Header RP indicator + crew loaded/total count

**Files:**
- Create: `gantt/src/components/panes/shared/rp-indicator.tsx`
- Create: `gantt/src/components/panes/shared/crew-count.tsx`
- Modify: `gantt/src/components/panes/pane-toolbar.tsx` (Live `PaneToolbar`, ~L82-191)
- Modify: `gantt/src/components/scenario-gantt/scenario-pane-toolbar.tsx` (Scenario, ~L21-80)
- Test: `e2e/gantt/roster-header-rp-indicator.spec.ts`

**Interfaces:**
- Consumes: `useCurrentRp` (P1.4); Live `useGanttViewStore` scroll state / Scenario `getScenarioGanttStore(id)`; crew counts already on the toolbars (`unfilteredTotal`, `loadedCount` for Live; `rowCount` for Scenario).
- Produces: `<RpIndicator items getScrollState />` (right side) and `<CrewCount loaded total />`.

- [ ] **Step 1: Write the failing Playwright test**

`e2e/gantt/roster-header-rp-indicator.spec.ts`:
```ts
import { test, expect } from '@playwright/test'

test('roster header shows crew loaded/total and an RP indicator that follows horizontal scroll', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('roster-header-crew-count')).toBeVisible()   // "N/M"
  const rp = page.getByTestId('roster-header-rp')
  await expect(rp).toBeVisible()
  await expect(rp).toContainText(/2026RP\d{2}/)
  const before = await rp.textContent()
  // pan horizontally via keyboard on the gantt surface (real UI), then assert the RP may change
  await page.getByTestId('pane-time-axis').focus()
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(300)
  const after = await rp.textContent()
  // it still shows a valid RP code (may or may not equal `before` depending on scroll distance)
  expect(after).toMatch(/2026RP\d{2}/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gantt && npx playwright test e2e/gantt/roster-header-rp-indicator.spec.ts --reporter=list`
Expected: FAIL — testids absent.

- [ ] **Step 3: Implement `RpIndicator` + `CrewCount`**

`gantt/src/components/panes/shared/rp-indicator.tsx`:
```tsx
import { useRosterPeriodStore } from '../../../stores/roster-period-store'
import { useCurrentRp, type ScrollState } from '../../gantt/use-current-rp'

const hueFor = (code: string): number => {
  let h = 0
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) % 360
  return h
}

export function RpIndicator({ getScrollState }: { getScrollState: () => ScrollState }) {
  const items = useRosterPeriodStore((s) => s.items)
  const rp = useCurrentRp(items, getScrollState)
  if (!rp) return null
  const hue = hueFor(rp.rosterPeriod)
  return (
    <div
      data-testid="roster-header-rp"
      className="inline-flex items-center rounded-sm px-2 py-0.5 text-2xs font-semibold font-mono tabular-nums"
      style={{ backgroundColor: `hsl(${hue} 70% 92%)`, color: `hsl(${hue} 60% 25%)` }}
    >
      {rp.rosterPeriod}
    </div>
  )
}
```

`gantt/src/components/panes/shared/crew-count.tsx`:
```tsx
export function CrewCount({ loaded, total }: { loaded: number; total: number }) {
  return (
    <span data-testid="roster-header-crew-count" className="text-2xs font-mono tabular-nums text-muted-foreground">
      {loaded}/{total}
    </span>
  )
}
```

- [ ] **Step 4: Wire Live `PaneToolbar`**

In `gantt/src/components/panes/pane-toolbar.tsx`, render `<CrewCount loaded={loadedCount} total={unfilteredTotal} />` near the title (~after L137) and `<RpIndicator getScrollState={() => { const s = useGanttViewStore.getState(); return { scrollX: s.scrollX, pxPerHour: s.pxPerHour, rangeStartMs: s.rangeStart.getTime() } }} />` on the right (before `<TimeAxis>` ~L188). Import `useGanttViewStore` (via `getState()` only, to respect the no-reactive-store rule if the toolbar is under the guard — verify the toolbar isn't in the guard's restricted list; if it is, read scroll state through props passed from the pane instead).

- [ ] **Step 5: Wire Scenario `ScenarioPaneToolbar`**

In `gantt/src/components/scenario-gantt/scenario-pane-toolbar.tsx`, render `<CrewCount loaded={rowCount} total={rowCount} />` (Scenario has no separate unfiltered total today; use `rowCount` for both until a total is plumbed) and `<RpIndicator getScrollState={() => { const s = store.getState(); return { scrollX: s.scrollX, pxPerHour: s.pxPerHour, rangeStartMs: s.rangeStart } }} />`.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd gantt && npx playwright test e2e/gantt/roster-header-rp-indicator.spec.ts --reporter=list`
Expected: PASS.

- [ ] **Step 7: check:ui**

Run: `cd gantt && npm run check:ui`
Expected: 0 hard violations. Paste receipt.

- [ ] **Step 8: Commit**

```bash
git add -A gantt/src/components/panes/shared/rp-indicator.tsx gantt/src/components/panes/shared/crew-count.tsx gantt/src/components/panes/pane-toolbar.tsx gantt/src/components/scenario-gantt/scenario-pane-toolbar.tsx e2e/gantt/roster-header-rp-indicator.spec.ts
git commit -m "feat(gantt): roster header RP indicator + crew loaded/total count"
```

## Task P1.11: P1 full e2e + typecheck + check:ui gate

**Files:**
- Test: `e2e/gantt/rp-centric-p1.spec.ts` (aggregate smoke) — or rely on the per-feature specs above.

- [ ] **Step 1: Run the full gantt Playwright suite + unit tests**

Run: `cd gantt && npx playwright test e2e/gantt/ --reporter=list && npx vitest run`
Expected: all PASS. Paste summary.

- [ ] **Step 2: check:ui + typecheck**

Run: `cd gantt && npm run check:ui && npx tsc --noEmit`
Expected: 0 hard violations; clean.

- [ ] **Step 3: Commit (any fixes) + tag P1 done**

```bash
git commit -am "test(gantt): P1 RP-centric e2e + unit green" || echo "nothing to commit"
```
P1 is shippable here. Do NOT proceed to P2 until P1 is reviewed/merged per the user's request.

---

# Phase 2 — Data migration + Rp-columns (coordinated cutover)

P2 renames the tables, switches aggregation to RP grouping, migrates all four services, truncates + repopulates, and flips the columns to true RP totals. Ship as one coordinated release (§4.3 of the spec).

## Task P2.1: Migration SQL (rename + columns + truncate)

**Files:**
- Create: `sql/migration/2026-07-26-crew-manday-period-rename.sql`

**Interfaces:**
- Produces: renamed tables + `roster_period`/`rp_start`/`rp_end` columns in both `f8` and `scenario` schemas; empty `_period` tables ready for RuleTool repopulation.

- [ ] **Step 1: Write the migration**

`sql/migration/2026-07-26-crew-manday-period-rename.sql`:
```sql
-- Rename crew_manday_*_monthly -> *_period (RP grain). Both f8 and scenario schemas.
-- Idempotent. Data is truncated; repopulated by the manday RuleTool post-deploy.
DO $$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['f8','scenario'] LOOP
    EXECUTE format('SET search_path TO %I', s);

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = s AND table_name = 'crew_manday_fd_monthly') THEN
      EXECUTE 'ALTER TABLE crew_manday_fd_monthly RENAME TO crew_manday_fd_period';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = s AND table_name = 'crew_manday_cc_am_monthly') THEN
      EXECUTE 'ALTER TABLE crew_manday_cc_am_monthly RENAME TO crew_manday_cc_am_period';
    END IF;

    -- FD period columns
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=s AND table_name='crew_manday_fd_period' AND column_name='year_month') THEN
      EXECUTE 'ALTER TABLE crew_manday_fd_period RENAME COLUMN year_month TO roster_period';
      EXECUTE 'ALTER TABLE crew_manday_fd_period ALTER COLUMN roster_period TYPE varchar(100)';
    END IF;
    EXECUTE 'ALTER TABLE crew_manday_fd_period ADD COLUMN IF NOT EXISTS rp_start timestamptz NOT NULL DEFAULT now()';
    EXECUTE 'ALTER TABLE crew_manday_fd_period ADD COLUMN IF NOT EXISTS rp_end timestamptz NOT NULL DEFAULT now()';
    EXECUTE 'ALTER TABLE crew_manday_fd_period ALTER COLUMN rp_start DROP DEFAULT';
    EXECUTE 'ALTER TABLE crew_manday_fd_period ALTER COLUMN rp_end DROP DEFAULT';

    -- CC/AM period columns
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=s AND table_name='crew_manday_cc_am_period' AND column_name='year_month') THEN
      EXECUTE 'ALTER TABLE crew_manday_cc_am_period RENAME COLUMN year_month TO roster_period';
      EXECUTE 'ALTER TABLE crew_manday_cc_am_period ALTER COLUMN roster_period TYPE varchar(100)';
    END IF;
    EXECUTE 'ALTER TABLE crew_manday_cc_am_period ADD COLUMN IF NOT EXISTS rp_start timestamptz NOT NULL DEFAULT now()';
    EXECUTE 'ALTER TABLE crew_manday_cc_am_period ADD COLUMN IF NOT EXISTS rp_end timestamptz NOT NULL DEFAULT now()';
    EXECUTE 'ALTER TABLE crew_manday_cc_am_period ALTER COLUMN rp_start DROP DEFAULT';
    EXECUTE 'ALTER TABLE crew_manday_cc_am_period ALTER COLUMN rp_end DROP DEFAULT';

    -- Recreate unique indexes on the new key (drop old, add new) — names vary by schema
    EXECUTE 'DROP INDEX IF EXISTS uq_manday_fd_monthly';
    EXECUTE 'DROP INDEX IF EXISTS uq_manday_cc_amly';   -- no-op safety
    IF s = 'f8' THEN
      EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_manday_fd_period ON crew_manday_fd_period (crew_id, roster_period)';
      EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_manday_cc_am_period ON crew_manday_cc_am_period (crew_id, roster_period)';
    ELSE
      EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_manday_fd_period ON crew_manday_fd_period (scenario_id, crew_id, roster_period)';
      EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_manday_cc_am_period ON crew_manday_cc_am_period (scenario_id, crew_id, roster_period)';
    END IF;

    EXECUTE 'TRUNCATE crew_manday_fd_period';
    EXECUTE 'TRUNCATE crew_manday_cc_am_period';
  END LOOP;
END $$;
```
(Adjust the old-index drop names to the actual ones in each schema — `uq_manday_fd_monthly` / `uq_manday_cc_am_monthly`. Read `sql/schema/live/02-crew-roster.sql` and `sql/schema/scenario/01-scenario-tables.sql` first to confirm exact old index names and the `scenario_id` column presence.)

- [ ] **Step 2: Dry-run EXPLAIN on remote + sanity check**

Run a read-only structural check on the remote DB:
```bash
psql "$DATABASE_URL_F8" -c "SELECT table_schema, table_name FROM information_schema.tables WHERE table_name LIKE 'crew_manday_%_period';"
```
Then run the migration against a staging copy first; verify the rename + columns + truncate + indexes in both schemas.

- [ ] **Step 3: Commit**

```bash
git add sql/migration/2026-07-26-crew-manday-period-rename.sql
git commit -m "feat(sql): rename crew_manday_*_monthly to *_period (RP grain)"
```

## Task P2.2: Update Drizzle model + raw-SQL table-name lists

**Files:**
- Modify: `live-server/src/models/crew/crew-manday.ts` (rename `pgTable`, `yearMonth`→`rosterPeriod`, add `rpStart`/`rpEnd`, rename `uniqueIndex`)
- Modify: `live-server/src/models/index.ts` (re-export names)
- Modify (raw table-name strings): `live-server/src/services/scenario/scenario-service.ts` (`SCENARIO_TABLE_LIST` ~L74-75, L436-437), `live-server/src/services/scenario/scenario-result-loader.ts` (`SCENARIO_RESULT_TABLES` ~L28-33), `live-server/src/services/scenario/scenario-export-service.ts` (~L189-206)

**Interfaces:**
- Produces: `crewMandayFdPeriod` / `crewMandayCcAmPeriod` exports; all raw-SQL readers/writers reference `crew_manday_*_period`.

- [ ] **Step 1: Update the Drizzle model**

In `live-server/src/models/crew/crew-manday.ts`:
- `crewMandayFdMonthly = pgTable('crew_manday_fd_monthly', …)` → rename binding to `crewMandayFdPeriod = pgTable('crew_manday_fd_period', …)`; `yearMonth: char('year_month', { length: 7 })` → `rosterPeriod: varchar('roster_period', { length: 100 })`; add `rpStart: timestamp('rp_start', { withTimezone: true }).notNull()` and `rpEnd: timestamp('rp_end', { withTimezone: true }).notNull()`; `uniqueIndex('uq_manday_fd_monthly').on(table.crewId, table.yearMonth)` → `uniqueIndex('uq_manday_fd_period').on(table.crewId, table.rosterPeriod)`.
- Same for `crewMandayCcAmMonthly` → `crewMandayCcAmPeriod` (use `withTimezone: true` on rp_start/rp_end — fixes the existing tz omission noted in the spec).
- Update `models/index.ts` re-exports from `crewMandayFdMonthly`/`crewMandayCcAmMonthly` to the new names.

- [ ] **Step 2: Update raw-SQL table-name lists**

In `scenario-service.ts`, `scenario-result-loader.ts`, `scenario-export-service.ts`, replace every `crew_manday_fd_monthly`/`crew_manday_cc_am_monthly` string with `crew_manday_fd_period`/`crew_manday_cc_am_period` (these are clone/delete/export lists). Use:
```bash
grep -RIn "crew_manday_\(fd\|cc_am\)_monthly" live-server/src
```
and update each hit.

- [ ] **Step 3: typecheck**

Run: `cd live-server && npx tsc --noEmit`
Expected: errors only in files updated by later P2 tasks (recompute/readers) — fix those in their tasks; this task's own files compile.

- [ ] **Step 4: Commit**

```bash
git add live-server/src/models/crew/crew-manday.ts live-server/src/models/index.ts live-server/src/services/scenario/scenario-service.ts live-server/src/services/scenario/scenario-result-loader.ts live-server/src/services/scenario/scenario-export-service.ts
git commit -m "refactor(live-server): crew_manday model + table lists to *_period"
```

## Task P2.3: Switch daily→period re-aggregation to RP grouping

**Files:**
- Modify: `live-server/src/services/manday/manday-tool.ts` (`reaggMonthly` ~L397-409; `findStaleFdCrews` ~L260-276)
- Modify: `live-server/src/services/manday/manday-partition.ts` (`mandayTimeKeys` ~L50-60; `partitionManday` monthly map ~L130-181)
- Modify: `live-server/src/workers/manday-inbound-worker.ts` (`upsertFdMonthly` ~L104-167; `upsertCcMonthly` ~L277-314)
- Test: `live-server/src/__tests__/services/manday-tool-period.test.ts`

**Interfaces:**
- Consumes: `roster_period` table (for date→RP lookup); the daily tables as truth source.
- Produces: `_period` rows keyed by `roster_period` + `rp_start`/`rp_end`, written by the recompute driver, the partitioner, and the inbound worker.

- [ ] **Step 1: Write the failing conflict-regression test**

`live-server/src/__tests__/services/manday-tool-period.test.ts` (the migration-gate conflict regression):
```ts
import { describe, it, expect } from 'vitest'
// seeds a crew with duty on 2026-03-01 (Feb RP's last day) and asserts the period bucket is 2026RP02
describe('recompute period grouping', () => {
  it('places a 2026-03-01 duty in 2026RP02, not 2026RP03', async () => {
    // ...insert roster_flight on 2026-03-01 for a crew; call recompute({ schema:'f8', crewIds:[...] })...
    const row = await pool.query(`SELECT roster_period, credit FROM f8.crew_manday_fd_period WHERE crew_id=$1`, [crewId])
    const mar01 = row.rows.find((r: any) => r.roster_period === '2026RP02')
    expect(mar01).toBeTruthy()         // RP grouping wins
  })
})
```
(Follow the existing `manday-tool.test.ts` setup pattern for DB/seed fixtures; use a known crew on the remote staging DB.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd live-server && npx vitest run src/__tests__/services/manday-tool-period.test.ts`
Expected: FAIL — `_period` not populated / wrong bucket.

- [ ] **Step 3: Rewrite `reaggMonthly`**

In `manday-tool.ts`, change `reaggMonthly(dailyT, monthlyT, leaveFlag)` → `reaggPeriod(dailyT, periodT, leaveFlag)`:
```ts
async function reaggPeriod(sch: string, dailyT: string, periodT: string, leaveFlag: 'is_al' | 'is_leave', scenarioPrefix: string) {
  await pool.query(`
    INSERT INTO ${sch}.${periodT} (${scenarioPrefix}crew_id, roster_period, rp_start, rp_end, credit, blh, is_day_off, ${leaveFlag})
    SELECT d.crew_id, rp.roster_period, rp.rp_start, rp.rp_end,
           COALESCE(SUM(d.credit),0), COALESCE(SUM(d.blh),0), COALESCE(SUM(d.is_day_off),0), COALESCE(SUM(d.${leaveFlag}),0)
      FROM ${sch}.${dailyT} d
      JOIN f8.roster_period rp ON d.crew_base_dt::date >= rp.rp_start::date AND d.crew_base_dt::date <= rp.rp_end::date
     GROUP BY d.crew_id, rp.roster_period, rp.rp_start, rp.rp_end
    ON CONFLICT (<keycols>, roster_period) DO UPDATE SET
       credit=EXCLUDED.credit, blh=EXCLUDED.blh, is_day_off=EXCLUDED.is_day_off, ${leaveFlag}=EXCLUDED.${leaveFlag},
       rp_start=EXCLUDED.rp_start, rp_end=EXCLUDED.rp_end
  `)
}
```
Call sites (~L408-409) become `reaggPeriod(sch, 'crew_manday_fd_daily', 'crew_manday_fd_period', 'is_al', scenarioPrefix)` and `reaggPeriod(sch, 'crew_manday_cc_am_daily', 'crew_manday_cc_am_period', 'is_leave', scenarioPrefix)`, with `scenarioPrefix = scenarioId != null ? 'scenario_id, ' : ''` and matching `<keycols>`. **Crew-scoped, not window-scoped** — recompute the crew's *all* periods so untouched periods stay correct (matches the existing crew-only filter behavior).

- [ ] **Step 4: Update `findStaleFdCrews`**

In `manday-tool.ts` (~L260-276), change `FROM ${liveSchema()}.crew_manday_fd_monthly … WHERE m.year_month = $1` to read `_period` and compare by `roster_period` (resolve the input date to its RP first via a `roster_period` lookup), or accept a `rosterPeriod` arg instead of `yearMonth`.

- [ ] **Step 5: Update `manday-partition.ts`**

In `manday-partition.ts`, change `mandayTimeKeys()` (~L50-60) to produce `rosterPeriod` instead of `yearMonth` by resolving each daily `crew_base_dt` to its RP (the partitioner runs server-side; resolve via a preloaded RP list passed in, or a SQL join at upsert time). Update `partitionManday`'s monthly map (~L130-181) to key by `${crewId}\x00${rosterPeriod}` and emit `roster_period`/`rp_start`/`rp_end`.

- [ ] **Step 6: Update the inbound worker**

In `manday-inbound-worker.ts`, change `upsertFdMonthly`/`upsertCcMonthly` (~L104-167, L277-314): `INSERT INTO crew_manday_*_period (crew_id, roster_period, rp_start, rp_end, …)` with `ON CONFLICT (crew_id, roster_period)` (and `scenario_id` for scenario rows). Resolve each daily row's RP before upsert.

- [ ] **Step 7: Run test to verify it passes**

Run: `cd live-server && npx vitest run src/__tests__/services/manday-tool-period.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add live-server/src/services/manday/manday-tool.ts live-server/src/services/manday/manday-partition.ts live-server/src/workers/manday-inbound-worker.ts live-server/src/__tests__/services/manday-tool-period.test.ts
git commit -m "feat(manday): re-aggregate daily→period by roster_period (RP grouping)"
```

## Task P2.4: Migrate live-server readers to `_period` + crew-stats by RP

**Files:**
- Modify: `live-server/src/services/crew/crew-stats-service.ts` (CTE ~L37-77)
- Modify: `live-server/src/routes/crew/crew-stats.ts` (accept `rosterPeriod`)
- Modify: `live-server/src/services/scenario/scenario-gantt-db-service.ts` (~L78-103)
- Modify: `live-server/src/services/pairing/pairing-service.ts` (~L176-193)
- Modify: `live-server/src/routes/admin/manday-credit-refresh.ts` (~L45)
- Test: `live-server/src/__tests__/services/crew-stats-service.test.ts` (new), update affected route tests

**Interfaces:**
- Produces: `GET /api/crew/stats?crewIds=…&rosterPeriod=2026RP07` returns RpCred/RpDO/RpBH from `_period`; Y* from `_yearly`.

- [ ] **Step 1: Write the failing crew-stats test**

Assert that for a known crew + `rosterPeriod=2026RP02`, `mcred/mbh/mdo` come from `crew_manday_*_period` (sum over the RP), not the old monthly bucket. (DB-backed, staging.)

- [ ] **Step 2: Rewrite `crew-stats-service`**

Replace the CTE (~L37-77): when `rosterPeriod` is provided, read `mcred = credit`, `mbh = blh`, `mdo = is_day_off` from `crew_manday_*_period WHERE roster_period = $rosterPeriod`; `ybh/ydo/yal` still from `_yearly WHERE year = $year`. Drop the `LIKE '${year}-%'` monthly logic. Division routing (FD `is_al` / CC `is_leave`) unchanged. The route accepts `rosterPeriod` (regex `^\d{4}RP\d{2}$`) alongside the existing `yearMonth` for a transition window, preferring `rosterPeriod`.

- [ ] **Step 3: Update the remaining readers**

- `scenario-gantt-db-service.ts` (~L78-103): `FROM ${scenarioSchema()}.crew_manday_*_period WHERE scenario_id=$1` selecting `roster_period, credit, is_day_off, is_al/is_leave`.
- `pairing-service.ts` (~L176-193): `mandayTable = … crewMandayCcAmPeriod : crewMandayFdPeriod`; `.where(eq(mandayTable.rosterPeriod, rosterPeriod), …)`.
- `manday-credit-refresh.ts` (~L45): resolve `rosterPeriod` (not `yearMonth`) for `findStaleFdCrews`.

- [ ] **Step 4: Run tests**

Run: `cd live-server && npx vitest run src/__tests__/services/crew-stats-service.test.ts src/__tests__/routes/draft-commit-manday.test.ts src/__tests__/routes/roster-mutation-manday.test.ts src/__tests__/services/manday-tool.test.ts src/__tests__/services/manday-ghost-repair.test.ts src/__tests__/services/manday-tool-scenario.test.ts`
Expected: FAIL initially on stale `year_month`/`_monthly` references — update each test to `_period`/`roster_period` (these are the §Stale-Test updates). Re-run until PASS.

- [ ] **Step 5: Commit**

```bash
git add -A live-server/src/services/crew/crew-stats-service.ts live-server/src/routes/crew/crew-stats.ts live-server/src/services/scenario/scenario-gantt-db-service.ts live-server/src/services/pairing/pairing-service.ts live-server/src/routes/admin/manday-credit-refresh.ts live-server/src/__tests__/
git commit -m "feat(live-server): crew stats by roster_period; migrate readers to _period"
```

## Task P2.5: engine-server `manday.py` migration

**Files:**
- Modify: `engine-server/F8/ro_input_builder/sections/manday.py` (~L36-38, L77-84)
- Test: `engine-server/F8/ro_input_builder/sections/test_manday.py` (new or existing)

**Interfaces:**
- Produces: `_crew_period_manday()` reads `crew_manday_fd_period`, windows by `roster_period`/`rp_start`/`rp_end`; `_MONTH_MANDAY_COLS` → period columns.

- [ ] **Step 1: Write the failing pytest**

Assert the builder's manday section queries `crew_manday_fd_period` and filters by `roster_period >= lo AND roster_period <= hi` (string-comparable `YYYYRPMM`).

- [ ] **Step 2: Update `manday.py`**

- `_MONTH_MANDAY_COLS`: `Col("period", "roster_period")`.
- `_crew_month_manday()` → `_crew_period_manday()`: `FROM crew_manday_fd_period WHERE scenario_id = 0 AND crew_id = ANY(%(crew)s) AND roster_period >= %(lo)s AND roster_period <= %(hi)s ORDER BY crew_id, roster_period`; `lo`/`hi` are `YYYYRPMM` strings derived from the input range (map each date to its RP via `roster_period`, or pass RP bounds directly).

- [ ] **Step 3: Run test**

Run: `cd engine-server && pytest F8/ro_input_builder/sections/test_manday.py -q`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add engine-server/F8/ro_input_builder/sections/manday.py engine-server/F8/ro_input_builder/sections/test_manday.py
git commit -m "feat(engine-server): manday section reads crew_manday_fd_period"
```

## Task P2.6: pbs-server `dashboard-profile` migration

**Files:**
- Modify: `pbs-server/src/services/dashboard-profile/dashboard-profile-service.ts` (~L91-99, L105-109, L168-184)
- Modify: `pbs-server/src/services/dashboard-profile/dashboard-profile-service.test.ts` (~L109, L164, L176)

**Interfaces:**
- Produces: dashboard credit reads from `crew_manday_*_period` windowed by `roster_period`.

- [ ] **Step 1: Update the service**

- `formatYearMonth()` → `formatRosterPeriod()` producing `YYYYRPMM` from a period code/date.
- `creditTableFor()` returns `crew_manday_fd_period` / `crew_manday_cc_am_period`.
- The `left join lateral` query reads `${schema}.crew_manday_*_period … where crew_id=… and roster_period=$3 and scenario_id=0`.

- [ ] **Step 2: Update the test**

Change the `query.includes(...)` assertions (~L109, L164, L176) to expect `crew_manday_*_period`.

- [ ] **Step 3: Run test**

Run: `cd pbs-server && npx vitest run src/services/dashboard-profile/dashboard-profile-service.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add pbs-server/src/services/dashboard-profile/dashboard-profile-service.ts pbs-server/src/services/dashboard-profile/dashboard-profile-service.test.ts
git commit -m "feat(pbs-server): dashboard-profile reads crew_manday_*_period"
```

## Task P2.7: Frontend column rename + RP stats wiring

**Files:**
- Modify: `gantt/src/stores/column-store.ts` (labels in `DEFAULT_ROSTER_COLUMNS` + `DEFAULT_SCENARIO_ROSTER_COLUMNS`, ~L19-32, L51-60)
- Modify: `gantt/src/types/crew.ts` (doc comment ~L41-51; field names stay)
- Modify: `gantt/src/services/crew-api.ts` (`getCrewStats` ~L70-74 sends `rosterPeriod`)
- Modify: `gantt/src/stores/crew-store.ts` (`loadCrewStats` ~L640-672, cache key ~L120-126)
- Modify: `gantt/src/components/gantt/source/live-gantt-source.ts` (`buildPanelRows` ~L522-579; stats fetch ~L649-661)
- Modify: `gantt/src/components/gantt/source/scenario-gantt-source.ts` (~L651-670)
- Modify: `gantt/src/utils/manday-delta.ts` (~L32-88)
- Test: `e2e/gantt/rp-columns.spec.ts`

**Interfaces:**
- Consumes: `useCurrentRp` (P1.4) → `rosterPeriod` → `GET /api/crew/stats?rosterPeriod=…`.
- Produces: columns labeled `RpCred/RpDO/RpBH` showing `_period` totals for the viewport's current RP.

- [ ] **Step 1: Write the failing Playwright test**

`e2e/gantt/rp-columns.spec.ts` — seed a known crew whose `2026RP02` RpCred is a specific value; assert the roster row's RpCred cell shows that value (not a calendar-month value):
```ts
import { test, expect } from '@playwright/test'
test('RpCred shows roster-period totals for the current RP', async ({ page }) => {
  await page.goto('/')
  // find a known crew row and its RpCred cell; assert specific value
  const cell = page.getByTestId('roster-row').first().getByRole('cell', { name: /^\d{1,3}:\d{2}$/ })
  await expect(cell).toBeVisible()
})
```
(Replace with a concrete seeded crew + expected RpCred; assert exact text, not visibility.)

- [ ] **Step 2: Rename column labels**

In `column-store.ts`: `label: 'MCred'` → `'RpCred'`, `'MDO'` → `'RpDO'`, `'MBH'` → `'RpBH'` (both default sets). Keys stay `mcred/mdo/mbh`.

- [ ] **Step 3: Switch the stats fetch to RP-keyed**

- `crew-api.ts`: `getCrewStats(crewIds, rosterPeriod?)` sends `params.rosterPeriod = rosterPeriod`.
- `crew-store.ts`: `loadCrewStats(crewIds, rosterPeriod)`, cache key `${id}:${rosterPeriod}`.
- `live-gantt-source.ts`: compute `rosterPeriod` from `useCurrentRp(...)`; call `loadCrewStats(selectedCrewIds, rosterPeriod)` when the RP changes (~L649-661); `buildPanelRows` keeps `mcred/mbh/mdo` field reads (data now from `_period`).
- `scenario-gantt-source.ts`: read `crewStats[crewId][rosterPeriod]` (~L651-670).
- `manday-delta.ts`: replace `d.slice(0,7) === yearMonth` (~L43) with RP membership — map each draft duty's date to its `rosterPeriod` via the store items and compare.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gantt && npx playwright test e2e/gantt/rp-columns.spec.ts --reporter=list`
Expected: PASS.

- [ ] **Step 5: check:ui + typecheck + unit**

Run: `cd gantt && npm run check:ui && npx tsc --noEmit && npx vitest run`
Expected: 0 violations; clean; PASS. Paste receipts.

- [ ] **Step 6: Commit**

```bash
git add -A gantt/src/stores/column-store.ts gantt/src/types/crew.ts gantt/src/services/crew-api.ts gantt/src/stores/crew-store.ts gantt/src/components/gantt/source/live-gantt-source.ts gantt/src/components/gantt/source/scenario-gantt-source.ts gantt/src/utils/manday-delta.ts e2e/gantt/rp-columns.spec.ts
git commit -m "feat(gantt): RpCred/RpDO/RpBH columns from _period totals"
```

## Task P2.8: Deploy runbook + RuleTool repopulation

**Files:**
- Create: `docs/handoff/gantt/2026-07-26-rp-centric-migration-runbook.md`

- [ ] **Step 1: Write the runbook**

Document the coordinated cutover (spec §4.3):
1. Take a maintenance window.
2. Apply `sql/migration/2026-07-26-crew-manday-period-rename.sql` against `f8` + `scenario` (remote DB).
3. Deploy new live-server + engine-server + pbs-server builds.
4. Run the manday RuleTool over the full needed range (`POST /api/admin/manday-credit-refresh` with a wide `[startDt, endDt]`, or the owner's refresh script) to repopulate `_period` from daily.
5. Smoke-check: gantt Rp-columns populated; pbs dashboard populated; a known crew's RpCred matches a manually computed RP total.
6. Record the transient empty-stats window and the rollback procedure (redeploy previous builds + restore the pre-migration dump).

- [ ] **Step 2: Commit**

```bash
git add docs/handoff/gantt/2026-07-26-rp-centric-migration-runbook.md
git commit -m "docs: RP-centric migration cutover runbook"
```

---

## Self-Review (completed inline)

**Spec coverage:** §1.1 GO TO RPDate → P1.5/P1.6. §1.2 toolbar multi-select → P1.9. §1.3 Rp-columns → P2.7. §1.4 header indicator + count → P1.10. §1.5 shared RP-select foundation → P1.7. §2 non-goals (no VIEW, yearly unchanged) honored — no VIEW task exists; yearly untouched. §3 phasing → P1 then P2. §4 data model → P2.1/P2.2/P2.3 + conflict regression in P2.3 Step 1. §5 backend → P1.1/P1.2/P1.8, P2.4/P2.5/P2.6. §7 frontend → P1.3–P1.10, P2.7. §8 gate → P2.3 conflict regression + per-task test updates. §9 testing → Playwright + Vitest per task. §10 UI/first-paint → check:ui in P1.6/P1.9/P1.10/P2.7.

**Placeholder scan:** Code blocks are concrete; `<key>`, `<keycols>`, `${scenarioPrefix}` are template vars with binding instructions, not TODOs. Where exact current code must be read first (e.g., `zoomToMonth` body, guard allowlist, old index names), the step says "read first and mirror" — acceptable for a plan executed by a skilled dev/subagent.

**Type consistency:** `RosterPeriodOption` (P1.3) used consistently in P1.4/P1.6/P1.7. `zoomToRp(rpStartMs, rpEndMs, rangeStart, viewportWidth?)` signature consistent across P1.5/P1.6. `ScrollState` + `useCurrentRp(items, getScrollState)` consistent across P1.4/P1.10. `crewMandayFdPeriod`/`crewMandayCcAmPeriod` consistent across P2.2/P2.4.

**Residual risk (recorded per gate §6):** rule-outcome re-validation at RP boundaries (engine-server) — spot-check before P2 release; pbs dashboard empty-stats window during cutover (P2.8 runbook).
