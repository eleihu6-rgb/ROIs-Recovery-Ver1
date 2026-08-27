# Live Toolbar RP Multi-Select Optimization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Live Gantt toolbar RP multi-select so users can load older roster periods incrementally, see date ranges (raw per-option, merged ±7d in the trigger), stay within a 6-RP span with contiguous auto-fill, and get a performance hint.

**Architecture:** Extend `GET /api/roster-periods` with `before`/`limit` paging plus `maxSpan`/`loadMoreCount`/`hasMore`; the shared `useRosterPeriodStore` gains a `loadOlderRosterPeriods()` that prepends history. A pure `applyMaxSpan` util enforces the 6-RP span (contiguous-window rebuild on overflow). The generic `MultiSelectDropdown` gets optional props (option hints, trigger summary, load-more row, tooltip, footer hint, chip-label mode) so existing callers are unaffected.

**Tech Stack:** Fastify + PostgreSQL (live-server), React 19 + Zustand + Vite (gantt), Vitest, Playwright.

## Global Constraints

- UI copy is English only (`Load earlier RPs`, `Max 6 RPs span (performance)`, tooltips).
- No hardcoded business constants — read `RP_GANTT_MAX_PERIODS` (maxSpan, default **6**), `RP_SELECT_LOAD_MORE_COUNT` (loadMoreCount, default **12**), `RP_SELECT_BACK_COUNT`/`RP_SELECT_FORWARD_COUNT` (6/6) from `getSysParamMap`, falling back to defaults when the dictionary is empty.
- Schema identifiers go through `asSafeIdentifier`; `before` validated against `/^\d{4}-\d{2}-\d{2}$/`.
- Style tokens only: `text-2xs`, `font-mono tabular-nums`, `text-muted-foreground`, `border-border` — no magic font-size/color values.
- §Playwright-Required: the UI changes ship with Playwright coverage in Task 6.
- §Surgical: the chip-label change is gated behind `showChipLabels` so filter-dialog/publish/bulk-delete chips keep showing the raw value.
- No `any` in new code.
- Every commit carries the trailer: `Co-Authored-By: Claude <noreply@anthropic.com>`.

## File Structure

| File | Responsibility |
|------|----------------|
| `live-server/src/routes/base/roster-periods.ts` | Two-mode API: windowed list OR `before`/`limit` historical batch; returns `maxSpan`/`loadMoreCount`/`hasMore`. |
| `live-server/src/__tests__/unit/roster-periods-route.test.ts` | Route tests (updated for new fields + paging). |
| `gantt/src/services/roster-period-api.ts` | Response types (`maxSpan`/`loadMoreCount`/`hasMore`) + `fetchOlderRosterPeriods`. |
| `gantt/src/stores/roster-period-store.ts` | Store fields `maxSpan`/`loadMoreCount`/`hasOlder`/`loadingMore` + `loadOlderRosterPeriods()` (prepend, dedupe). |
| `gantt/src/stores/__tests__/roster-period-store.test.ts` | Store unit tests (new). |
| `gantt/src/utils/rp-span.ts` | Pure `applyMaxSpan` span-cap/contiguous-rebuild util. |
| `gantt/src/utils/__tests__/rp-span.test.ts` | `applyMaxSpan` unit tests (new). |
| `gantt/src/components/common/multi-select-dropdown.tsx` | Optional props: option `hint`, trigger `summary`/tooltip, `loadMore*`, footer hint, `showChipLabels`, ordered chips. |
| `gantt/src/components/common/__tests__/multi-select-dropdown.test.tsx` | Dropdown unit tests (add cases). |
| `gantt/src/components/common/rp-multi-select.tsx` | Wire everything: span rule in `handleChange`, option hints, summary, load-more, tooltip/footer hint. |
| `e2e/tests/gantt/toolbar-rp-multiselect.spec.ts` | Playwright: load-more, span rebuild, chip order/labels, summary, hint. |

---

### Task 1: Backend — historical paging + new response fields

**Files:**
- Modify: `live-server/src/routes/base/roster-periods.ts`
- Test: `live-server/src/__tests__/unit/roster-periods-route.test.ts`

**Interfaces:**
- Produces: `GET /api/roster-periods` now responds `{ maxSpan: number, loadMoreCount: number, hasMore: boolean, items: RosterPeriodOption[] }`. Query params: `?before=<YYYY-MM-DD>&limit=<number>`. `before`-mode returns the oldest `limit` (clamped to `loadMoreCount`) RPs with `rp_start < before`, ascending; `hasMore` true when an N+1 probe found more.

- [ ] **Step 1: Write/update the failing tests**

Replace `live-server/src/__tests__/unit/roster-periods-route.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'

vi.mock('../../config/index.js', () => ({ env: { LIVE_SCHEMA: 'f8' } }))
vi.mock('../../config/env.js', () => ({ env: { LIVE_SCHEMA: 'f8' } }))

const { getSysParamMapMock } = vi.hoisted(() => ({ getSysParamMapMock: vi.fn() }))

vi.mock('../../services/base/dictionary-service.js', () => ({
  getSysParamMap: getSysParamMapMock,
}))

const periodRows = [
  { id: 1, roster_period: '2026RP02', name: '2026-02', rp_start: '2026-02-01', rp_end: '2026-03-01', is_current: true },
  { id: 2, roster_period: '2026RP03', name: '2026-03', rp_start: '2026-03-02', rp_end: '2026-03-31', is_current: false },
]

describe('GET /api/roster-periods', () => {
  let app: ReturnType<typeof Fastify>
  let queryMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    // Empty SYS_PARAM map → all defaults apply (back/forward 6, maxSpan 6, loadMore 12).
    getSysParamMapMock.mockResolvedValue(new Map())
    queryMock = vi.fn(async () => ({ rows: periodRows }))
    app = Fastify()
    ;(app as any).pgPool = { connect: vi.fn(async () => ({ query: queryMock, release: vi.fn() })) }
    const { default: rosterPeriodsRoutes } = await import('../../routes/base/roster-periods.js')
    await app.register(rosterPeriodsRoutes, { prefix: '/api/roster-periods' })
    await app.ready()
  })

  it('returns windowed roster periods with maxSpan/loadMoreCount/hasMore', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/roster-periods' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(queryMock.mock.calls[0][0]).toContain('current_date between rp_start::date and rp_end::date')
    expect(body.data.items).toHaveLength(2)
    expect(body.data.items[0]).toMatchObject({
      id: 1, rosterPeriod: '2026RP02', name: '2026-02',
      rpStart: '2026-02-01', rpEnd: '2026-03-01', isCurrent: true,
    })
    expect(body.data.maxSpan, 'maxSpan default 6').toBe(6)
    expect(body.data.loadMoreCount, 'loadMoreCount default 12').toBe(12)
    expect(body.data.hasMore, 'fixture has no RP older than window earliest → false').toBe(false)
    expect(body.data.maxPeriods, 'maxPeriods removed').toBeUndefined()
  })

  it('sizes the window from RP_SELECT_BACK_COUNT / FORWARD_COUNT', async () => {
    getSysParamMapMock.mockResolvedValue(new Map([
      ['RP_SELECT_BACK_COUNT', '2'],
      ['RP_SELECT_FORWARD_COUNT', '3'],
    ]))
    await app.inject({ method: 'GET', url: '/api/roster-periods' })
    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [2, 3])
  })

  it('falls back to 6/6 window, maxSpan 6, loadMore 12 when the params are absent', async () => {
    getSysParamMapMock.mockResolvedValue(new Map())
    const res = await app.inject({ method: 'GET', url: '/api/roster-periods' })
    const body = JSON.parse(res.body)
    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [6, 6])
    expect(body.data.maxSpan).toBe(6)
    expect(body.data.loadMoreCount).toBe(12)
  })

  it('returns body code 404 when no period contains now() (fail keeps HTTP 200)', async () => {
    queryMock.mockResolvedValue({ rows: [] })
    const res = await app.inject({ method: 'GET', url: '/api/roster-periods' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.code).toBe(404)
    expect(body.data).toBeNull()
  })

  it('loads older periods via before+limit using an N+1 hasMore probe', async () => {
    const rows = Array.from({ length: 13 }, (_, i) => ({
      id: 100 + i,
      roster_period: `2025RP${String(i + 1).padStart(2, '0')}`,
      name: `2025-${String(i + 1).padStart(2, '0')}`,
      rp_start: `2025-${String(i + 1).padStart(2, '0')}-01`,
      rp_end: `2025-${String(i + 1).padStart(2, '0')}-28`,
      is_current: false,
    }))
    queryMock.mockResolvedValue({ rows })
    const res = await app.inject({ method: 'GET', url: '/api/roster-periods?before=2026-01-01&limit=12' })
    const body = JSON.parse(res.body)
    expect(body.code).toBe(200)
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('rp_start < $1'),
      ['2026-01-01', 13], // batch 12 + 1 probe
    )
    expect(body.data.items).toHaveLength(12)
    expect(body.data.hasMore).toBe(true)
    expect(body.data.items[0].rosterPeriod).toBe('2025RP01')
    expect(body.data.items[0].isCurrent).toBe(false)
  })

  it('uses RP_SELECT_LOAD_MORE_COUNT as the default limit', async () => {
    getSysParamMapMock.mockResolvedValue(new Map([['RP_SELECT_LOAD_MORE_COUNT', '5']]))
    queryMock.mockResolvedValue({ rows: [] })
    await app.inject({ method: 'GET', url: '/api/roster-periods?before=2026-01-01' })
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('rp_start < $1'),
      ['2026-01-01', 6], // default 5 + 1 probe
    )
  })

  it('rejects a malformed before date with code 400', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/roster-periods?before=01/01/2026' })
    const body = JSON.parse(res.body)
    expect(body.code).toBe(400)
  })
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `cd live-server && npx vitest run src/__tests__/unit/roster-periods-route.test.ts --reporter=list`
Expected: FAIL on `maxSpan`/`loadMoreCount`/`hasMore` assertions (route still returns `maxPeriods`, no `before` handling). The pre-existing window/404 cases still pass.

- [ ] **Step 3: Implement the route**

Replace `live-server/src/routes/base/roster-periods.ts` with:

```ts
import type { FastifyInstance } from 'fastify'
import { env } from '../../config/index.js'
import { success, fail } from '../../utils/response.js'
import { getSysParamMap } from '../../services/base/dictionary-service.js'

// Mirrors the local asSafeIdentifier in import-pbs-material.ts / period-admin.ts.
// (Codebase pattern: schema identifiers are validated at use-site; not yet extracted.)
const asSafeIdentifier = (value: string): string => {
  if (!/^[a-z][a-z0-9_]*$/i.test(value)) {
    throw new Error(`Invalid database schema identifier: ${value}`)
  }
  return value.toLowerCase()
}

const asDateOnly = (value: Date | string): string => {
  const date = value instanceof Date ? value : new Date(value)
  return date.toISOString().slice(0, 10)
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

interface RosterPeriodRow {
  id: string | number
  roster_period: string
  name: string | null
  rp_start: string | Date
  rp_end: string | Date
  is_current?: boolean
}

/**
 * GET /api/roster-periods
 * Non-admin. Two modes:
 * - no query → windowed list around the current RP (back/forward), plus `hasMore`
 *   (whether older RPs exist), `maxSpan` and `loadMoreCount`.
 * - `?before=<YYYY-MM-DD>&limit=N` → the oldest N RPs strictly before `before`
 *   (historical load-more); `hasMore` detected via an N+1 probe.
 * Sizes come from SYS_PARAM RP_SELECT_BACK_COUNT / RP_SELECT_FORWARD_COUNT (6/6),
 * RP_GANTT_MAX_PERIODS (6) and RP_SELECT_LOAD_MORE_COUNT (12).
 */
export default async function rosterPeriodsRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    const params = await getSysParamMap(fastify)
    const back = Number(params.get('RP_SELECT_BACK_COUNT')) || 6
    const forward = Number(params.get('RP_SELECT_FORWARD_COUNT')) || 6
    const maxSpan = Number(params.get('RP_GANTT_MAX_PERIODS')) || 6
    const loadMoreCount = Number(params.get('RP_SELECT_LOAD_MORE_COUNT')) || 12
    const liveSchema = asSafeIdentifier(request.authUser?.schema ?? env.LIVE_SCHEMA)
    const { before, limit } = request.query as { before?: string; limit?: string }
    const client = await fastify.pgPool.connect()
    try {
      let rows: RosterPeriodRow[]
      let hasMore: boolean

      if (before) {
        if (!DATE_ONLY_RE.test(before)) {
          return fail(reply, 400, 'Invalid `before` date (expected YYYY-MM-DD).')
        }
        const parsed = Number(limit)
        const batch = Number.isFinite(parsed) && parsed > 0
          ? Math.min(Math.floor(parsed), loadMoreCount)
          : loadMoreCount
        const result = await client.query<RosterPeriodRow>(`
          select id, roster_period, name, rp_start, rp_end, false as is_current
          from ${liveSchema}.roster_period
          where rp_start < $1::date
          order by rp_start asc, id asc
          limit $2
        `, [before, batch + 1])
        hasMore = result.rows.length > batch
        rows = result.rows.slice(0, batch)
      } else {
        const result = await client.query<RosterPeriodRow>(`
          with periods as (
            select id, roster_period, name, rp_start, rp_end,
                   row_number() over (order by rp_start asc, id asc) as rn
            from ${liveSchema}.roster_period
          ),
          current_period as (
            select rn
            from periods
            -- rp_end is stored at midnight on the inclusive end date. Compare
            -- calendar dates so the current RP remains active for that whole day.
            where current_date between rp_start::date and rp_end::date
            order by rp_start asc
            limit 1
          )
          select p.id, p.roster_period, p.name, p.rp_start, p.rp_end, (p.rn = c.rn) as is_current
          from periods p
          join current_period c on p.rn between c.rn - $1 and c.rn + $2
          order by p.rp_start asc, p.id asc
        `, [back, forward])
        if (result.rows.length === 0) {
          return fail(reply, 404, 'No roster period contains the current time.')
        }
        rows = result.rows
        const check = await client.query<{ has_more: boolean }>(`
          select exists(select 1 from ${liveSchema}.roster_period where rp_start < $1::date) as has_more
        `, [asDateOnly(rows[0].rp_start)])
        hasMore = Boolean(check.rows[0]?.has_more)
      }

      return success(reply, {
        maxSpan,
        loadMoreCount,
        hasMore,
        items: rows.map((row) => ({
          id: Number(row.id),
          rosterPeriod: row.roster_period,
          name: row.name ?? row.roster_period,
          rpStart: asDateOnly(row.rp_start),
          rpEnd: asDateOnly(row.rp_end),
          isCurrent: Boolean(row.is_current),
        })),
      })
    } finally {
      client.release()
    }
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd live-server && npx vitest run src/__tests__/unit/roster-periods-route.test.ts --reporter=list`
Expected: all 7 cases PASS. (If the run complains about env/schema, prefix with `node --env-file=.env node_modules/.bin/vitest` — the route test mocks `config/env.js`, so it should run standalone.)

- [ ] **Step 5: Commit**

```bash
git add live-server/src/routes/base/roster-periods.ts live-server/src/__tests__/unit/roster-periods-route.test.ts
git commit -m "feat(live-server): add historical paging and maxSpan/loadMoreCount/hasMore to roster-periods

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Frontend API + store — `fetchOlderRosterPeriods` and `loadOlderRosterPeriods`

**Files:**
- Modify: `gantt/src/services/roster-period-api.ts`
- Modify: `gantt/src/stores/roster-period-store.ts`
- Create: `gantt/src/stores/__tests__/roster-period-store.test.ts`

**Interfaces:**
- Consumes: Task 1 response shape `{ maxSpan, loadMoreCount, hasMore, items }`.
- Produces:
  - `fetchOlderRosterPeriods(before: string, limit: number): Promise<RosterPeriodsResponse>`
  - Store: `maxSpan: number`, `loadMoreCount: number`, `hasOlder: boolean`, `loadingMore: boolean`, `loadOlderRosterPeriods(): Promise<void>`. Store `items` always ascending by `rpStart`.

- [ ] **Step 1: Write the failing store test**

Create `gantt/src/stores/__tests__/roster-period-store.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RosterPeriodOption } from '@/services/roster-period-api'
import { useRosterPeriodStore } from '../roster-period-store'

const { fetchRosterPeriodsMock, fetchOlderRosterPeriodsMock } = vi.hoisted(() => ({
  fetchRosterPeriodsMock: vi.fn(),
  fetchOlderRosterPeriodsMock: vi.fn(),
}))

vi.mock('@/services/roster-period-api', () => ({
  fetchRosterPeriods: fetchRosterPeriodsMock,
  fetchOlderRosterPeriods: fetchOlderRosterPeriodsMock,
}))

const rp = (id: number, code: string, rpStart: string): RosterPeriodOption => ({
  id, rosterPeriod: code, name: code, rpStart, rpEnd: rpStart, isCurrent: false,
})

describe('useRosterPeriodStore', () => {
  beforeEach(() => {
    useRosterPeriodStore.setState({
      items: [], maxSpan: 6, loadMoreCount: 12, hasOlder: false,
      loaded: false, loading: false, loadingMore: false,
    })
    fetchRosterPeriodsMock.mockReset()
    fetchOlderRosterPeriodsMock.mockReset()
  })

  it('loadRosterPeriods caches maxSpan/loadMoreCount/hasOlder', async () => {
    fetchRosterPeriodsMock.mockResolvedValue({
      items: [rp(8, '2026RP08', '2026-08-01')], maxSpan: 6, loadMoreCount: 12, hasMore: true,
    })
    await useRosterPeriodStore.getState().loadRosterPeriods()
    const s = useRosterPeriodStore.getState()
    expect(s.items).toHaveLength(1)
    expect(s.maxSpan).toBe(6)
    expect(s.loadMoreCount).toBe(12)
    expect(s.hasOlder).toBe(true)
    expect(s.loaded).toBe(true)
  })

  it('loadOlderRosterPeriods prepends older items, dedupes, and tracks hasOlder', async () => {
    useRosterPeriodStore.setState({
      items: [rp(7, '2026RP07', '2026-07-01'), rp(8, '2026RP08', '2026-08-01')],
    })
    fetchOlderRosterPeriodsMock.mockResolvedValue({
      items: [rp(6, '2026RP06', '2026-06-01'), rp(8, '2026RP08', '2026-08-01')],
      maxSpan: 6, loadMoreCount: 12, hasMore: false,
    })
    await useRosterPeriodStore.getState().loadOlderRosterPeriods()
    const s = useRosterPeriodStore.getState()
    expect(fetchOlderRosterPeriodsMock).toHaveBeenCalledWith('2026-07-01', 12)
    expect(s.items.map((i) => i.id)).toEqual([6, 7, 8]) // 8 deduped, still ascending
    expect(s.hasOlder).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gantt && npx vitest run src/stores/__tests__/roster-period-store.test.ts --reporter=list`
Expected: FAIL — `fetchOlderRosterPeriods`/`loadOlderRosterPeriods` don't exist yet (module not found / method undefined).

- [ ] **Step 3: Implement the API + store**

`gantt/src/services/roster-period-api.ts` — replace the response interface and add the fetch:

```ts
export interface RosterPeriodsResponse {
  /** Max RP span (max-min+1) selectable in the toolbar multi-select (RP_GANTT_MAX_PERIODS). */
  maxSpan: number
  /** RPs loaded per "Load earlier RPs" click (RP_SELECT_LOAD_MORE_COUNT). */
  loadMoreCount: number
  /** Whether older (historical) RPs exist beyond the returned batch. */
  hasMore: boolean
  items: RosterPeriodOption[]
}

export const fetchRosterPeriods = async (): Promise<RosterPeriodsResponse> =>
  api.get('/api/roster-periods') as Promise<RosterPeriodsResponse>

/** Fetch the oldest `limit` RPs strictly before `before` (for historical load-more). */
export const fetchOlderRosterPeriods = async (
  before: string,
  limit: number,
): Promise<RosterPeriodsResponse> =>
  api.get(`/api/roster-periods?before=${encodeURIComponent(before)}&limit=${limit}`) as Promise<RosterPeriodsResponse>
```

`gantt/src/stores/roster-period-store.ts` — replace the whole file:

```ts
import { create } from 'zustand'
import { fetchRosterPeriods, fetchOlderRosterPeriods, type RosterPeriodOption } from '../services/roster-period-api'

interface RosterPeriodState {
  items: RosterPeriodOption[]
  /** Max RP span (max-min+1) selectable in the toolbar multi-select (default 6 until loaded). */
  maxSpan: number
  /** RPs loaded per "Load earlier RPs" click (default 12 until loaded). */
  loadMoreCount: number
  /** True while older (historical) RPs remain unloaded. */
  hasOlder: boolean
  loaded: boolean
  loading: boolean
  loadingMore: boolean
  /** Fetch once and cache the windowed roster-period list. */
  loadRosterPeriods: () => Promise<void>
  /** Fetch the next batch of older RPs and prepend them (keeps items ascending). */
  loadOlderRosterPeriods: () => Promise<void>
}

export const useRosterPeriodStore = create<RosterPeriodState>((set, get) => ({
  items: [],
  maxSpan: 6,
  loadMoreCount: 12,
  hasOlder: false,
  loaded: false,
  loading: false,
  loadingMore: false,
  loadRosterPeriods: async () => {
    if (get().loaded || get().loading) return
    set({ loading: true })
    try {
      const { items, maxSpan, loadMoreCount, hasMore } = await fetchRosterPeriods()
      set({
        items,
        maxSpan: maxSpan ?? 6,
        loadMoreCount: loadMoreCount ?? 12,
        hasOlder: hasMore ?? false,
        loaded: true,
      })
    } finally {
      set({ loading: false })
    }
  },
  loadOlderRosterPeriods: async () => {
    const { items, loadMoreCount, loadingMore } = get()
    if (loadingMore || items.length === 0) return
    const earliest = items[0] // items are ascending; [0] is the oldest
    if (!earliest) return
    set({ loadingMore: true })
    try {
      const res = await fetchOlderRosterPeriods(earliest.rpStart, loadMoreCount)
      const known = new Set(get().items.map((rp) => rp.id))
      const fresh = res.items.filter((rp) => !known.has(rp.id))
      set({ items: [...fresh, ...get().items], hasOlder: res.hasMore ?? false })
    } finally {
      set({ loadingMore: false })
    }
  },
}))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gantt && npx vitest run src/stores/__tests__/roster-period-store.test.ts --reporter=list`
Expected: both cases PASS.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/services/roster-period-api.ts gantt/src/stores/roster-period-store.ts gantt/src/stores/__tests__/roster-period-store.test.ts
git commit -m "feat(gantt): load older roster periods incrementally in the roster-period store

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Pure span util — `applyMaxSpan` + unit tests

**Files:**
- Create: `gantt/src/utils/rp-span.ts`
- Create: `gantt/src/utils/__tests__/rp-span.test.ts`
- Modify: `docs/superpowers/specs/2026-08-08-live-rp-multiselect-optimization-design.md` (refine tie-break wording)

**Interfaces:**
- Produces: `applyMaxSpan(nextIds: readonly string[], prevIds: readonly string[], items: readonly RosterPeriodOption[], maxSpan: number): string[]`

**Note (spec refinement):** the spec's "平局取靠新的一端" is refined to "平局取更靠近已有选择的一端" — only observable when both candidate windows tie on overlap (a far-from-selection click), which none of the user-confirmed examples exercise. Update the two spots in the spec (算法 step 5 and the candidate-window bullet) to `平局取更靠近已有选择（prevIds）的一端`.

- [ ] **Step 1: Write the failing tests**

Create `gantt/src/utils/__tests__/rp-span.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { RosterPeriodOption } from '@/services/roster-period-api'
import { applyMaxSpan } from '../rp-span'

// items: 2026RP01..2026RP14 with ids 1..14, ascending by rpStart.
const items: RosterPeriodOption[] = Array.from({ length: 14 }, (_, i) => ({
  id: i + 1,
  rosterPeriod: `2026RP${String(i + 1).padStart(2, '0')}`,
  name: `2026-${String(i + 1).padStart(2, '0')}`,
  rpStart: `2026-${String(i + 1).padStart(2, '0')}-01`,
  rpEnd: `2026-${String(i + 1).padStart(2, '0')}-28`,
  isCurrent: false,
}))

const MAX = 6

describe('applyMaxSpan', () => {
  it('keeps a within-span add unchanged, even with a gap', () => {
    // {01,02,03,04} + 06 → span 6 → unchanged (05 gap stays)
    expect(applyMaxSpan(['1', '2', '3', '4', '6'], ['1', '2', '3', '4'], items, MAX))
      .toEqual(['1', '2', '3', '4', '6'])
  })

  it('sorts a within-span selection ascending regardless of input order', () => {
    expect(applyMaxSpan(['6', '3'], ['3'], items, MAX)).toEqual(['3', '6'])
  })

  it('rebuilds a contiguous 6 window anchored on the clicked oldest RP', () => {
    // {08} + click 01 → {01..06} (user example 1)
    expect(applyMaxSpan(['1', '8'], ['8'], items, MAX)).toEqual(['1', '2', '3', '4', '5', '6'])
  })

  it('rebuilds toward the existing selection: 01 dropped, 05 filled', () => {
    // {01,02,03,04,06} + 07 → {02..07} (user example 3)
    expect(applyMaxSpan(['1', '2', '3', '4', '6', '7'], ['1', '2', '3', '4', '6'], items, MAX))
      .toEqual(['2', '3', '4', '5', '6', '7'])
  })

  it('rebuilds toward the existing selection: 02 dropped, 05 filled', () => {
    // {02,03,04,06,07} + 08 → {03..08} (user example 4)
    expect(applyMaxSpan(['2', '3', '4', '6', '7', '8'], ['2', '3', '4', '6', '7'], items, MAX))
      .toEqual(['3', '4', '5', '6', '7', '8'])
  })

  it('rebuilds a new contiguous window for a click just past the span', () => {
    // {02,03,04,05,06} + 08 → {03..08}
    const prev = ['2', '3', '4', '5', '6']
    expect(applyMaxSpan([...prev, '8'], prev, items, MAX)).toEqual(['3', '4', '5', '6', '7', '8'])
  })

  it('does not rebuild on a pure removal', () => {
    expect(applyMaxSpan(['1', '2', '3'], ['1', '2', '3', '4'], items, MAX)).toEqual(['1', '2', '3'])
  })

  it('picks the window closer to the previous selection on a zero-overlap far click', () => {
    // {02..06} + click 12 → overlap ties at 0 → closer window {07..12}
    const prev = ['2', '3', '4', '5', '6']
    expect(applyMaxSpan([...prev, '12'], prev, items, MAX)).toEqual(['7', '8', '9', '10', '11', '12'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gantt && npx vitest run src/utils/__tests__/rp-span.test.ts --reporter=list`
Expected: FAIL — module `../rp-span` not found.

- [ ] **Step 3: Implement `applyMaxSpan`**

Create `gantt/src/utils/rp-span.ts`:

```ts
import type { RosterPeriodOption } from '@/services/roster-period-api'

/**
 * Keep a multi-RP selection within `maxSpan` consecutive roster periods.
 *
 * - Span (max-min+1) ≤ maxSpan → unchanged, sorted ascending (gaps allowed).
 * - Span > maxSpan on an ADD → rebuild as a contiguous window of `maxSpan` RPs
 *   containing the newly-clicked RP, chosen by maximum overlap with the current
 *   selection; ties prefer the window closer to the previous selection.
 *   A pure removal never rebuilds (span only shrinks).
 */
export function applyMaxSpan(
  nextIds: readonly string[],
  prevIds: readonly string[],
  items: readonly RosterPeriodOption[],
  maxSpan: number,
): string[] {
  const order = new Map(items.map((rp, i) => [String(rp.id), i]))

  const sorted = [...nextIds]
    .map((id) => ({ id, idx: order.get(id) }))
    .filter((x): x is { id: string; idx: number } => x.idx !== undefined)
    .sort((a, b) => a.idx - b.idx)
    .map((x) => x.id)
  if (sorted.length === 0) return sorted

  const minIdx = order.get(sorted[0]) ?? 0
  const maxIdx = order.get(sorted[sorted.length - 1]) ?? 0
  if (maxIdx - minIdx + 1 <= maxSpan) return sorted

  // Only an ADD can push the span past the limit; a removal only shrinks it.
  const added = nextIds.find((id) => !prevIds.includes(id))
  if (added === undefined) return sorted
  const anchor = order.get(added)
  if (anchor === undefined) return sorted

  const windowAt = (lo: number, hi: number): string[] | null => {
    if (lo < 0 || hi >= items.length || hi - lo + 1 !== maxSpan) return null
    const out: string[] = []
    for (let i = lo; i <= hi; i++) out.push(String(items[i].id))
    return out
  }

  const candidates = [
    windowAt(anchor - (maxSpan - 1), anchor),
    windowAt(anchor, anchor + (maxSpan - 1)),
  ].filter((w): w is string[] => w !== null)
  if (candidates.length === 0) return sorted

  const overlap = (win: readonly string[]): number =>
    win.reduce((n, id) => n + (prevIds.includes(id) ? 1 : 0), 0)

  // Distance from the window to the nearest previously-selected RP (tie-break).
  const closeness = (win: readonly string[]): number => {
    let best = Infinity
    for (const id of prevIds) {
      const idx = order.get(id)
      if (idx === undefined) continue
      for (const wid of win) {
        const wIdx = order.get(wid)
        if (wIdx === undefined) continue
        const d = Math.abs(idx - wIdx)
        if (d < best) best = d
      }
    }
    return best === Infinity ? -1 : best
  }

  let best = candidates[0]
  let bestOverlap = overlap(best)
  for (const c of candidates.slice(1)) {
    const o = overlap(c)
    if (o > bestOverlap || (o === bestOverlap && closeness(c) < closeness(best))) {
      best = c
      bestOverlap = o
    }
  }
  return best
}
```

- [ ] **Step 4: Update the spec tie-break wording**

In `docs/superpowers/specs/2026-08-08-live-rp-multiselect-optimization-design.md`, change the algorithm step 5 line `选与 nextIds（含 prev 共同部分）重叠数最多的；平局取靠新（index 大）的一端。` and the candidate-window bullet `平局取靠新的一端。` to `平局取更靠近已有选择（prevIds）的一端。`

- [ ] **Step 5: Run test to verify it passes**

Run: `cd gantt && npx vitest run src/utils/__tests__/rp-span.test.ts --reporter=list`
Expected: all 8 cases PASS.

- [ ] **Step 6: Commit**

```bash
git add gantt/src/utils/rp-span.ts gantt/src/utils/__tests__/rp-span.test.ts docs/superpowers/specs/2026-08-08-live-rp-multiselect-optimization-design.md
git commit -m "feat(gantt): add applyMaxSpan contiguous 6-RP span rule with unit tests

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: `MultiSelectDropdown` — optional hint / summary / load-more / tooltip / footer / chip mode

**Files:**
- Modify: `gantt/src/components/common/multi-select-dropdown.tsx`
- Modify: `gantt/src/components/common/__tests__/multi-select-dropdown.test.tsx`

**Interfaces:**
- Produces (all optional — existing callers unaffected):
  - `SelectOption.hint?: string`
  - Props: `triggerTooltip?`, `summary?`, `summaryTestId?`, `loadMoreAvailable?`, `onLoadMore?`, `loadingMore?`, `loadMoreLabel?`, `loadMoreTestId?`, `footerHint?`, `showChipLabels?`
- Behavior: chips render in `options` order; chip text = `o.label` when `showChipLabels`, else `o.value`; trigger uses `min-h-8` (grows for the summary line); load-more row sits between search and the option list; footer shows the hint.

- [ ] **Step 1: Write the failing tests**

Append to `gantt/src/components/common/__tests__/multi-select-dropdown.test.tsx` (keep the two existing tests):

```ts
  it('renders chips in options order and honors showChipLabels', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <MultiSelectDropdown
          options={[
            { value: '9', label: '2026RP09' },
            { value: '2', label: '2026RP02' },
            { value: '8', label: '2026RP08' },
          ]}
          selected={['8', '2']} // click order 08 then 02
          onChange={vi.fn()}
          testId="rp"
          showChipLabels
        />,
      )
    })
    const trigger = container.querySelector('[data-testid="rp-trigger"]') as HTMLElement
    const text = trigger.textContent ?? ''
    // options order = 02, 08, 09 → chip order 02 before 08
    expect(text.indexOf('2026RP02')).toBeGreaterThanOrEqual(0)
    expect(text.indexOf('2026RP08')).toBeGreaterThan(text.indexOf('2026RP02'))
    expect(text).not.toContain('2026RP09')
  })

  it('keeps raw values in chips when showChipLabels is off', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <MultiSelectDropdown
          options={[{ value: 'P', label: 'Pilot' }, { value: 'C', label: 'Cabin' }]}
          selected={['C']}
          onChange={vi.fn()}
          testId="dv"
        />,
      )
    })
    expect((container.querySelector('[data-testid="dv-trigger"]') as HTMLElement).textContent).toContain('C')
    expect((container.querySelector('[data-testid="dv-trigger"]') as HTMLElement).textContent).not.toContain('Cabin')
  })

  it('renders option hints, trigger summary, footer hint and the load-more row', async () => {
    const onLoadMore = vi.fn()
    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <MultiSelectDropdown
          options={[
            { value: '8', label: '2026RP08', hint: '08-01 ~ 08-31' },
            { value: '9', label: '2026RP09', hint: '09-01 ~ 09-30' },
          ]}
          selected={['8']}
          onChange={vi.fn()}
          testId="rp"
          summary="2026-07-25 ~ 2026-09-07"
          summaryTestId="rp-range"
          loadMoreAvailable
          onLoadMore={onLoadMore}
          loadMoreLabel="Load earlier RPs"
          loadMoreTestId="rp-load-more"
          footerHint="Max 6 RPs span (performance)"
          triggerTooltip="Select up to 6 roster periods (max span, for performance)"
        />,
      )
    })

    const trigger = container.querySelector('[data-testid="rp-trigger"]') as HTMLElement
    expect(trigger.title).toContain('max span')
    expect((container.querySelector('[data-testid="rp-range"]') as HTMLElement).textContent)
      .toBe('2026-07-25 ~ 2026-09-07')

    await act(async () => { trigger.click() })

    expect((container.querySelector('[data-testid="rp-opt-8"]') as HTMLElement).textContent).toContain('08-01 ~ 08-31')
    const loadMore = container.querySelector('[data-testid="rp-load-more"]') as HTMLElement
    expect(loadMore.textContent).toContain('Load earlier RPs')
    await act(async () => { loadMore.click() })
    expect(onLoadMore).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Max 6 RPs span (performance)')
  })
```

- [ ] **Step 2: Run test to verify the new ones fail**

Run: `cd gantt && npx vitest run src/components/common/__tests__/multi-select-dropdown.test.tsx --reporter=list`
Expected: new cases FAIL (`title`, `rp-range`, `rp-load-more`, `rp-opt-8` hint not present; chips not ordered by options).

- [ ] **Step 3: Implement the dropdown changes**

Modify `gantt/src/components/common/multi-select-dropdown.tsx`:

```tsx
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'

export interface SelectOption {
  value: string
  label: string
  /** Optional right-aligned hint on the option row (e.g. a date range). */
  hint?: string
}

interface MultiSelectDropdownProps {
  options: SelectOption[]
  selected: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  /** Optional test id; trigger gets `${testId}-trigger`, options get `${testId}-opt-${value}`. */
  testId?: string
  /** Extra classes for the trigger (e.g. min-width to enlarge the control). */
  triggerClassName?: string
  /** Title tooltip on the trigger. */
  triggerTooltip?: string
  /** Optional line below the selected chips (e.g. the merged loaded date range). */
  summary?: string
  summaryTestId?: string
  /** Show a "Load more" row above the options (for older/historical items). */
  loadMoreAvailable?: boolean
  onLoadMore?: () => void
  loadingMore?: boolean
  loadMoreLabel?: string
  loadMoreTestId?: string
  /** Optional footer hint line (e.g. a selection limit note). */
  footerHint?: string
  /** Render the option label instead of the raw value inside selected chips. */
  showChipLabels?: boolean
}

export const MultiSelectDropdown = ({
  options,
  selected,
  onChange,
  placeholder = 'All',
  testId,
  triggerClassName,
  triggerTooltip,
  summary,
  summaryTestId,
  loadMoreAvailable = false,
  onLoadMore,
  loadingMore = false,
  loadMoreLabel = 'Load more',
  loadMoreTestId,
  footerHint,
  showChipLabels = false,
}: MultiSelectDropdownProps) => {
  const [open, setOpen]     = useState(false)
  const [search, setSearch] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef      = useRef<HTMLDivElement>(null)

  const checkScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    setHasMore(el.scrollHeight > el.clientHeight + 2 && el.scrollTop + el.clientHeight < el.scrollHeight - 4)
  }, [])

  useEffect(() => {
    if (!open) { setSearch(''); setHasMore(false); return }
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const filtered = useMemo(
    () => options.filter((o) =>
      o.label.toLowerCase().includes(search.toLowerCase()) ||
      o.value.toLowerCase().includes(search.toLowerCase()),
    ),
    [options, search],
  )

  useEffect(() => { if (open) setTimeout(checkScroll, 0) }, [open, filtered, checkScroll])

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])
  }

  // Chips render in `options` (chronological) order, not click order.
  const orderedSelected = useMemo(
    () => options.filter((o) => selected.includes(o.value)),
    [options, selected],
  )

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <div
        className={`flex min-h-8 cursor-pointer flex-wrap items-center gap-1 rounded-md bg-background px-2 py-1 transition-colors ${open ? 'border border-blue-500' : 'border border-border'} ${triggerClassName ?? ''}`}
        onClick={() => setOpen((o) => !o)}
        title={triggerTooltip}
        data-testid={testId ? `${testId}-trigger` : undefined}
      >
        {orderedSelected.length === 0 ? (
          <span className="text-xs text-muted-foreground/50">{placeholder}</span>
        ) : (
          orderedSelected.map((o) => (
            <span key={o.value}
              className="inline-flex items-center gap-1 rounded bg-blue-500/15 px-1.5 py-0.5 text-2xs font-semibold text-blue-400">
              {showChipLabels ? o.label : o.value}
              <button
                type="button"
                className="leading-none opacity-70 hover:opacity-100"
                data-testid={testId ? `${testId}-remove-${o.value}` : undefined}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); toggle(o.value) }}
              >
                ✕
              </button>
            </span>
          ))
        )}
        <span className={`ml-auto shrink-0 text-2xs ${open ? 'text-blue-400' : 'text-muted-foreground/50'}`}>
          {open ? '▴' : '▾'}
        </span>
        {orderedSelected.length > 0 && summary && (
          <span className="w-full font-mono text-2xs tabular-nums text-muted-foreground" data-testid={summaryTestId}>
            {summary}
          </span>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-0.5 min-w-full overflow-hidden rounded border border-border bg-card shadow-xl"
          style={{ minWidth: 180 }}>
          {/* Search */}
          <div className="border-b border-border/60 px-2 py-1.5">
            <input
              className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground outline-none"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* Load earlier RPs */}
          {loadMoreAvailable && (
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 border-b border-border/60 px-3 py-1.5 text-2xs text-muted-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onLoadMore}
              disabled={loadingMore}
              data-testid={loadMoreTestId}
            >
              {loadingMore ? 'Loading…' : loadMoreLabel}
            </button>
          )}

          {/* Options */}
          <div className="relative">
            <div ref={listRef} className="max-h-48 overflow-y-auto py-1" onScroll={checkScroll}>
              {filtered.length === 0 ? (
                <div className="px-3 py-1.5 text-xs text-muted-foreground/50">No options</div>
              ) : (
                filtered.map((o) => {
                  const isSel = selected.includes(o.value)
                  return (
                    <button key={o.value} type="button"
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-accent ${isSel ? 'text-blue-400' : 'text-muted-foreground'}`}
                      onClick={() => toggle(o.value)}
                      data-testid={testId ? `${testId}-opt-${o.value}` : undefined}>
                      <div className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded text-3xs text-white ${isSel ? 'border border-blue-500 bg-blue-500' : 'border border-border bg-transparent'}`}>
                        {isSel && '✓'}
                      </div>
                      <span className="shrink-0">{o.label}</span>
                      {o.hint && (
                        <span className="ml-auto font-mono text-2xs tabular-nums text-muted-foreground/60">{o.hint}</span>
                      )}
                    </button>
                  )
                })
              )}
            </div>
            {hasMore && (
              <div
                className="pointer-events-none absolute bottom-0 left-0 right-0 flex items-end justify-end pb-1 pr-2"
                style={{ height: 32, background: 'linear-gradient(to top, var(--card) 40%, transparent)' }}
              >
                <span className="text-3xs font-semibold uppercase tracking-widest text-muted-foreground/45 leading-none">
                  more ↓
                </span>
              </div>
            )}
          </div>

          {/* Footer */}
          {(orderedSelected.length > 0 || footerHint) && (
            <div className="border-t border-border/60">
              {orderedSelected.length > 0 && (
                <div className="flex items-center px-3 py-1.5">
                  <button type="button" className="text-2xs text-muted-foreground/50 transition-colors hover:text-foreground"
                    onClick={() => onChange([])}>
                    Clear all
                  </button>
                  <span className="ml-auto text-2xs text-muted-foreground/50">{orderedSelected.length} selected</span>
                </div>
              )}
              {footerHint && (
                <div className="px-3 py-1.5 text-2xs text-muted-foreground/50">{footerHint}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

Note: the `Clear all`/count footer now uses `orderedSelected.length` (== `selected.length`), and the footer renders whenever a selection OR `footerHint` exists.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd gantt && npx vitest run src/components/common/__tests__/multi-select-dropdown.test.tsx --reporter=list`
Expected: 2 pre-existing + 3 new cases all PASS.

- [ ] **Step 5: Check the UI standard gate**

Run: `npm run check:ui` (from repo root)
Expected: 0 hard violations (this file touched style; gate must stay green).

- [ ] **Step 6: Commit**

```bash
git add gantt/src/components/common/multi-select-dropdown.tsx gantt/src/components/common/__tests__/multi-select-dropdown.test.tsx
git commit -m "feat(gantt): extend MultiSelectDropdown with hints, summary, load-more, tooltip, chip-label mode

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: `RpMultiSelect` — wire span rule, date ranges, load-more, hints

**Files:**
- Modify: `gantt/src/components/common/rp-multi-select.tsx`

**Interfaces:**
- Consumes: `applyMaxSpan` (Task 3), store `maxSpan`/`hasOlder`/`loadingMore`/`loadOlderRosterPeriods` (Task 2), dropdown optional props (Task 4).
- Produces: the full toolbar control behavior.

- [ ] **Step 1: Implement the component**

Replace `gantt/src/components/common/rp-multi-select.tsx`:

```tsx
import { useEffect, useMemo } from 'react'
import { CalendarRange } from 'lucide-react'
import { MultiSelectDropdown } from '@/components/common/multi-select-dropdown'
import { useRosterPeriodStore } from '@/stores/roster-period-store'
import { useFilterStore } from '@/stores/filter-store'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { applyGanttFilters } from '@/utils/apply-filters'
import { applyMaxSpan } from '@/utils/rp-span'
import { calendarDateToUtcMidnight, endOfCalendarDayUtc } from '@/components/gantt/gantt-utils'

const DAY_MS = 86_400_000
const rpStartMs = (rp: { rpStart: string }, timezone: string): number => calendarDateToUtcMidnight(rp.rpStart, timezone).getTime()
const rpEndMs = (rp: { rpEnd: string }, timezone: string): number => endOfCalendarDayUtc(rp.rpEnd, timezone).getTime()

/** 'YYYY-MM-DD' → 'MM-DD' for the per-option hint. */
const shortRange = (start: string, end: string): string => `${start.slice(5)} ~ ${end.slice(5)}`

/** Shift a 'YYYY-MM-DD' string by whole days (UTC) → 'YYYY-MM-DD'. */
const shiftDate = (dateStr: string, days: number): string => {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Live-toolbar RP multi-select. Replaces the free-form date-range picker: the user
 * picks one or more roster periods; the Gantt window becomes
 * [min(rp_start) − 7d, max(rp_end) + 7d] and is re-applied through the existing
 * applyGanttFilters pipeline. Selection span is capped at maxSpan (default 6);
 * a click that would exceed it rebuilds a contiguous window via applyMaxSpan.
 * Older (historical) RPs load incrementally through "Load earlier RPs".
 */
export function RpMultiSelect() {
  const items = useRosterPeriodStore((s) => s.items)
  const maxSpan = useRosterPeriodStore((s) => s.maxSpan)
  const hasOlder = useRosterPeriodStore((s) => s.hasOlder)
  const loadingMore = useRosterPeriodStore((s) => s.loadingMore)
  const load = useRosterPeriodStore((s) => s.loadRosterPeriods)
  const loadOlder = useRosterPeriodStore((s) => s.loadOlderRosterPeriods)
  const timezone = useTimezoneStore((s) => s.timezone)
  const selected = useFilterStore((s) => s.selectedRosterPeriodIds)
  const setSelectedRosterPeriodSelection = useFilterStore((s) => s.setSelectedRosterPeriodSelection)

  useEffect(() => {
    void load()
  }, [load])

  // Default to the RP containing now() so the selection + gantt window match on first load.
  // Sets the range but does not apply — the normal open / Apply flow loads the window.
  useEffect(() => {
    if (selected.length > 0 || items.length === 0) return
    const current = items.find((rp) => rp.isCurrent) ?? items[0]
    if (!current) return
    const rpStart = rpStartMs(current, timezone)
    const rpEnd = rpEndMs(current, timezone)
    setSelectedRosterPeriodSelection([String(current.id)], { startMs: rpStart, endMs: rpEnd })
    useFilterStore.getState().setDateRange(new Date(rpStart - 7 * DAY_MS), new Date(rpEnd + 7 * DAY_MS))
    const store = useGanttViewStore.getState()
    const width = store.viewportWidth || undefined
    store.zoomToRp(rpStart, rpEnd, new Date(rpStart - 7 * DAY_MS), width)
  }, [items, selected.length, setSelectedRosterPeriodSelection, timezone])

  const options = useMemo(
    () => items.map((rp) => ({
      value: String(rp.id),
      label: rp.rosterPeriod,
      hint: shortRange(rp.rpStart, rp.rpEnd),
    })),
    [items],
  )

  // Merged loaded window for the current selection: [min(rp_start)−7d, max(rp_end)+7d].
  const summary = useMemo(() => {
    if (selected.length === 0) return undefined
    const chosen = items.filter((rp) => selected.includes(String(rp.id)))
    if (chosen.length === 0) return undefined
    const start = Math.min(...chosen.map((rp) => rp.rpStart))
    const end = Math.max(...chosen.map((rp) => rp.rpEnd))
    return `${shiftDate(start, -7)} ~ ${shiftDate(end, 7)}`
  }, [items, selected])

  const handleChange = (next: string[]): void => {
    if (next.length === 0) {
      setSelectedRosterPeriodSelection([], null)
      return
    }
    const adjusted = applyMaxSpan(next, selected, items, maxSpan)
    const chosen = items.filter((rp) => adjusted.includes(String(rp.id)))
    if (chosen.length === 0) return
    const selectedStart = Math.min(...chosen.map((rp) => rpStartMs(rp, timezone)))
    const selectedEnd = Math.max(...chosen.map((rp) => rpEndMs(rp, timezone)))
    setSelectedRosterPeriodSelection(adjusted, { startMs: selectedStart, endMs: selectedEnd })
    const start = selectedStart - 7 * DAY_MS
    const end = selectedEnd + 7 * DAY_MS
    useFilterStore.getState().setDateRange(new Date(start), new Date(end))
    void applyGanttFilters().then(() => {
      const store = useGanttViewStore.getState()
      store.zoomToRp(selectedStart, selectedEnd, new Date(start), store.viewportWidth || undefined)
    })
  }

  return (
    <div className="flex items-center">
      <CalendarRange className="mr-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <MultiSelectDropdown
        options={options}
        selected={selected}
        onChange={handleChange}
        placeholder="Select RPs"
        testId="toolbar-rp-multiselect"
        triggerClassName="min-w-[220px]"
        triggerTooltip="Select up to 6 roster periods (max span, for performance)"
        summary={summary}
        summaryTestId="toolbar-rp-multiselect-range"
        loadMoreAvailable={hasOlder}
        onLoadMore={() => void loadOlder()}
        loadingMore={loadingMore}
        loadMoreLabel="Load earlier RPs"
        loadMoreTestId="toolbar-rp-multiselect-load-more"
        footerHint="Max 6 RPs span (performance)"
        showChipLabels
      />
    </div>
  )
}
```

- [ ] **Step 2: Type-check the gantt build**

Run: `cd gantt && npx tsc -b`
Expected: no type errors.

- [ ] **Step 3: Run the gantt unit tests**

Run: `cd gantt && npx vitest run --reporter=list`
Expected: all unit tests pass (the existing RP-control related tests plus the new store/rp-span/dropdown tests).

- [ ] **Step 4: Check the UI standard gate**

Run: `npm run check:ui` (from repo root)
Expected: 0 hard violations.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/common/rp-multi-select.tsx
git commit -m "feat(gantt): wire RP multi-select span rule, date ranges, load-more, performance hint

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: E2E — Playwright coverage for the RP control

**Files:**
- Modify: `e2e/tests/gantt/toolbar-rp-multiselect.spec.ts`

**Interfaces:**
- Consumes: `applyMaxSpan` behavior, dropdown testids `toolbar-rp-multiselect-*`, mock API shape `{ maxSpan, loadMoreCount, hasMore, items }`.

- [ ] **Step 1: Add the mock fixture + new tests**

Append to `e2e/tests/gantt/toolbar-rp-multiselect.spec.ts`. Add these imports at the top (they already exist in the file — add `type Page` only if not present):

```ts
const ok = (data: unknown): { status: number; contentType: string; body: string } => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, data, message: 'ok' }),
})

// Windowed initial batch: 2026RP02..2026RP12, 2027RP01, 2027RP02 (ids 2..14),
// current = 2026RP08 (id 8). Earliest loaded rpStart = 2026-02-01.
const WINDOW: RosterPeriodShape[] = Array.from({ length: 13 }, (_, i) => {
  const n = i + 2 // 2..14
  const year = n <= 12 ? 2026 : 2027
  const month = n <= 12 ? n : n - 12
  const ym = `${year}-${String(month).padStart(2, '0')}`
  return {
    id: n,
    rosterPeriod: `${year}RP${String(month).padStart(2, '0')}`,
    name: `${year}-${String(month).padStart(2, '0')}`,
    rpStart: `${ym}-01`,
    rpEnd: `${ym}-28`,
    isCurrent: n === 8, // 2026RP08
  }
})
// First older batch (12): 2026RP01 (id 1) + 2025RP12..2025RP02 (ids 101..111).
const OLDER_1: RosterPeriodShape[] = [
  { id: 1, rosterPeriod: '2026RP01', name: '2026-01', rpStart: '2026-01-01', rpEnd: '2026-01-28', isCurrent: false },
  ...Array.from({ length: 11 }, (_, i) => {
    const n = 12 - i // 12,11,...,02
    return {
      id: 101 + i,
      rosterPeriod: `2025RP${String(n).padStart(2, '0')}`,
      name: `2025-${String(n).padStart(2, '0')}`,
      rpStart: `2025-${String(n).padStart(2, '0')}-01`,
      rpEnd: `2025-${String(n).padStart(2, '0')}-28`,
      isCurrent: false,
    }
  }),
]
// Final older batch (1): 2025RP01 (id 121).
const OLDER_2: RosterPeriodShape[] = [
  { id: 121, rosterPeriod: '2025RP01', name: '2025-01', rpStart: '2025-01-01', rpEnd: '2025-01-28', isCurrent: false },
]
```

Add a local type at the top of the file:

```ts
type RosterPeriodShape = {
  id: number
  rosterPeriod: string
  name: string
  rpStart: string
  rpEnd: string
  isCurrent: boolean
}
```

Then the new tests (append after the existing two):

```ts
  test('loads 12 older RPs per click and hides Load more when history is exhausted', async ({ page, request }) => {
    await page.route('**/api/roster-periods*', async (route) => {
      const url = route.request().url()
      // First load-more: store passes before = earliest loaded rpStart = WINDOW[0] = 2026-02-01.
      if (url.includes('before=2026-02-01')) {
        await route.fulfill(ok({ maxSpan: 6, loadMoreCount: 12, hasMore: true, items: OLDER_1 }))
      } else if (url.includes('before=2026-01-01')) {
        // Second load-more: earliest is now 2026RP01; store dedupes 2025RP12..02 → only 2025RP01 is new.
        await route.fulfill(ok({ maxSpan: 6, loadMoreCount: 12, hasMore: false, items: OLDER_2 }))
      } else {
        await route.fulfill(ok({ maxSpan: 6, loadMoreCount: 12, hasMore: true, items: WINDOW }))
      }
    })
    await seedGanttAuth(page, request)
    await gotoGantt(page)
    await waitGanttReady(page, 90_000)

    const trigger = page.getByTestId('toolbar-rp-multiselect-trigger')
    await trigger.click()
    const options = page.locator('[data-testid^="toolbar-rp-multiselect-opt-"]')
    const before = await options.count()
    expect(before).toBe(13)

    await page.getByTestId('toolbar-rp-multiselect-load-more').click()
    await expect(options).toHaveCount(before + 12)
    await expect(page.locator('[data-testid^="toolbar-rp-multiselect-opt-"]').filter({ hasText: '2026RP01' })).toBeVisible()

    await page.getByTestId('toolbar-rp-multiselect-load-more').click()
    await expect(options).toHaveCount(before + 13)
    await expect(page.getByTestId('toolbar-rp-multiselect-load-more')).toHaveCount(0)
  })

  test('auto-fills a contiguous 6-RP window when the span would exceed 6', async ({ page, request }) => {
    await page.route('**/api/roster-periods*', (route) =>
      route.fulfill(ok({ maxSpan: 6, loadMoreCount: 12, hasMore: false, items: WINDOW })),
    )
    await seedGanttAuth(page, request)
    await gotoGantt(page)
    await waitGanttReady(page, 90_000)

    const trigger = page.getByTestId('toolbar-rp-multiselect-trigger')
    // Default selection is the current RP (id 8 → chip "2026RP08").
    await expect(page.locator('[data-testid^="toolbar-rp-multiselect-remove-"]')).toHaveCount(1)

    await trigger.click()
    for (const n of [3, 4, 5, 6, 7]) {
      await page.getByTestId(`toolbar-rp-multiselect-opt-${n}`).click()
    }
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-testid^="toolbar-rp-multiselect-remove-"]')).toHaveCount(6)

    // Click 02 → span 02..08 = 7 > 6 → rebuild to the contiguous window {02..07}.
    await trigger.click()
    await page.getByTestId('toolbar-rp-multiselect-opt-2').click()
    await page.keyboard.press('Escape')

    const chipText = (await trigger.textContent()) ?? ''
    for (const n of ['2026RP02', '2026RP03', '2026RP04', '2026RP05', '2026RP06', '2026RP07']) {
      expect(chipText).toContain(n)
    }
    expect(chipText).not.toContain('2026RP08')
    // Chips are in chronological order.
    expect(chipText.indexOf('2026RP02')).toBeLessThan(chipText.indexOf('2026RP07'))
  })

  test('shows the merged ±7d date range and the performance hint', async ({ page, request }) => {
    await page.route('**/api/roster-periods*', (route) =>
      route.fulfill(ok({ maxSpan: 6, loadMoreCount: 12, hasMore: false, items: WINDOW })),
    )
    await seedGanttAuth(page, request)
    await gotoGantt(page)
    await waitGanttReady(page, 90_000)

    // Default current RP08: [2026-08-01−7d, 2026-08-28+7d] = 2026-07-25 ~ 2026-09-04.
    await expect(page.getByTestId('toolbar-rp-multiselect-range')).toHaveText('2026-07-25 ~ 2026-09-04')
    // Chips show the RP code, not the numeric id.
    await expect(page.getByTestId('toolbar-rp-multiselect-trigger')).toContainText('2026RP08')
    // Performance hint in the footer and on the trigger tooltip.
    await page.getByTestId('toolbar-rp-multiselect-trigger').click()
    await expect(page.getByTestId('toolbar-rp-multiselect-trigger')).toHaveAttribute('title', /max span/)
    await expect(page.getByText('Max 6 RPs span (performance)')).toBeVisible()
  })
```

Note: in the load-more test the `before` cursors are the store's earliest loaded `rpStart` at each stage — first `2026-02-01` (WINDOW[0]), then `2026-01-01` (2026RP01) after batch 1. Keep the `WINDOW`/`OLDER_1` fixture dates in sync with those strings, and keep `WINDOW[0].rpStart === '2026-02-01'`.

- [ ] **Step 2: Run the E2E suite for this file**

Run: `cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/toolbar-rp-multiselect.spec.ts --reporter=list`
Expected: 5 tests PASS (2 existing + 3 new). Paste the summary.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/gantt/toolbar-rp-multiselect.spec.ts
git commit -m "test(e2e): cover RP multi-select load-more, span auto-fill, dates, performance hint

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage**
- Req 1 (load-more 12 historical): Task 1 (backend paging) + Task 2 (store) + Task 4 (dropdown row) + Task 5 (wiring) + Task 6 (E2E). ✓
- Req 2 (option raw range + trigger merged ±7d): Task 4 (option `hint`, trigger `summary`) + Task 5 (`shortRange`/`shiftDate`, `summary`) + Task 6 (E2E assertion `2026-07-25 ~ 2026-09-04`). ✓
- Req 3 (6-RP span, contiguous auto-fill, chips sorted): Task 3 (`applyMaxSpan`) + Task 4 (ordered chips) + Task 5 (`handleChange`) + Task 6. ✓
- Req 4 (performance hint): Task 4 (`triggerTooltip` + `footerHint`) + Task 5 (copy) + Task 6 (E2E). ✓
- Config parameters (`RP_GANTT_MAX_PERIODS`=6, `RP_SELECT_LOAD_MORE_COUNT`=12): Task 1. ✓
- Shared-store decision, `maxPeriods`→`maxSpan`, chip code display: Tasks 1/2/4/5. ✓

**2. Placeholder scan:** No TBD/TODO; every code step has concrete code. ✓

**3. Type consistency:** `RosterPeriodsResponse` fields `maxSpan`/`loadMoreCount`/`hasMore` match across route (Task 1), api (Task 2), store (Task 2), dropdown props (Task 4), RpMultiSelect (Task 5), E2E fixture (Task 6). `applyMaxSpan(nextIds, prevIds, items, maxSpan)` signature identical in Task 3 and Task 5. Dropdown prop names (`loadMoreAvailable`, `onLoadMore`, `loadingMore`, `loadMoreLabel`, `loadMoreTestId`, `summary`, `summaryTestId`, `triggerTooltip`, `footerHint`, `showChipLabels`) identical in Task 4 and Task 5. ✓
