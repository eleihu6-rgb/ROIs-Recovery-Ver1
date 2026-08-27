# Flight Hover Status-Bar Info — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On flight-puck hover, show a rich status-bar line: `F8-281381 · YYZ Jun10 / Jun10L → YHZ Jun10 / Jun10L · 7M8 · C-FLKA · CA 1/1  FO 1/0  FA 4/3`.

**Architecture:** Two new backend read-endpoints — `GET /base/airport-timezones` (airport→IANA zoneId map) and `POST /api/flight/compositions` (bulk per-flight per-rank plan/actual) — each preloaded into a small gantt store. A pure formatter util builds the line from the in-store `Flight`, the gantt-selected timezone, the airport-local timezones, and the composition. The Flight pane's hover handler wires those sources and sets `uiStore.statusBarText`; the existing `StatusBar` renders it unchanged.

**Tech Stack:** live-server (Fastify + Drizzle + Zod + Redis), gantt (React 19 + Zustand + Vite), Vitest, Playwright.

**Design spec:** `docs/superpowers/specs/2026-06-11-flight-hover-status-bar-design.md`

---

## File Structure

**live-server (backend):**
- Modify `live-server/src/services/base/base-service.ts` — add `getAirportTimezones()`.
- Modify `live-server/src/routes/base/base.ts` — add `GET /airport-timezones`.
- Modify `live-server/src/services/flight/flight-service.ts` — add `getCompositions(flightIds)`.
- Modify `live-server/src/routes/flight/flight.ts` — add `POST /compositions`.
- Tests: `live-server/src/__tests__/services/base/base-service.test.ts` (new),
  `live-server/src/__tests__/services/flight/flight-service.test.ts` (modify).

**gantt (frontend):**
- Modify `gantt/src/services/timezone-api.ts` — add `getAirportTimezones()`.
- Create `gantt/src/stores/airport-tz-store.ts` — airport→zoneId map store.
- Modify `gantt/src/services/flight-api.ts` — add `compositions(ids)`.
- Create `gantt/src/stores/flight-composition-store.ts` — fltId→composition store.
- Modify `gantt/src/stores/timezone-store.ts` — add `formatDateShort()`.
- Create `gantt/src/utils/format-flight-status-line.ts` — pure line builder.
- Test `gantt/src/utils/__tests__/format-flight-status-line.test.ts` (new).
- Modify `gantt/src/components/panes/flight-pane.tsx` — load stores, wire hover, feed `compositionStatusMap`.
- Modify `gantt/src/components/layout/status-bar.tsx` — add `data-testid` on the text span.
- Modify `gantt/src/utils/gantt-test-hook.ts` — add `hoverFlight`, `setTimezone`, `airportZone`.
- Modify `gantt/src/version.ts` — bump backend + frontend.
- E2E `e2e/tests/gantt/flight-hover-status-bar.spec.ts` (new).

---

## Task 1: Backend — airport-timezones service

**Files:**
- Modify: `live-server/src/services/base/base-service.ts`
- Test: `live-server/src/__tests__/services/base/base-service.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `live-server/src/__tests__/services/base/base-service.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { baseService } from '../../../services/base/base-service.js'

const makeFastify = (airports: Array<{ airport: string; zoneId: string }>) => ({
  redis: null,
  db: { select: () => ({ from: () => Promise.resolve(airports) }) },
} as unknown as Parameters<typeof baseService.getAirportTimezones>[0])

// getOrSet must pass through when redis is null (see utils/cache.ts contract).
vi.mock('../../../utils/cache.js', async (orig) => {
  const actual = await orig<typeof import('../../../utils/cache.js')>()
  return { ...actual, getOrSet: (_r: unknown, _k: string, _t: number, fn: () => unknown) => fn() }
})

describe('baseService.getAirportTimezones', () => {
  it('returns an airport→zoneId map for ALL airports (incl. non-base)', async () => {
    const fastify = makeFastify([
      { airport: 'YYZ', zoneId: 'America/Toronto' },
      { airport: 'GDL', zoneId: 'America/Mexico_City' },
    ])
    const map = await baseService.getAirportTimezones(fastify)
    expect(map).toEqual({ YYZ: 'America/Toronto', GDL: 'America/Mexico_City' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd live-server && npx vitest run src/__tests__/services/base/base-service.test.ts`
Expected: FAIL — `getAirportTimezones is not a function`.

- [ ] **Step 3: Implement the service method**

In `live-server/src/services/base/base-service.ts`, add this method inside the `baseService` object (next to `getTimezoneOptions`). Reuse the already-imported `airport` model, `getOrSet`, and `CACHE_KEY_PREFIX`/`CACHE_TTL`:

```typescript
  async getAirportTimezones(fastify: FastifyInstance): Promise<Record<string, string>> {
    return getOrSet(fastify.redis, `${CACHE_KEY_PREFIX}:airport-timezones`, CACHE_TTL, async () => {
      const airports = await fastify.db.select().from(airport)
      const map: Record<string, string> = {}
      for (const ap of airports) {
        if (ap.airport && ap.zoneId) map[ap.airport] = ap.zoneId
      }
      return map
    })
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd live-server && npx vitest run src/__tests__/services/base/base-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add live-server/src/services/base/base-service.ts live-server/src/__tests__/services/base/base-service.test.ts
git commit -m "feat(live-server): airport→zoneId timezone map service"
```

---

## Task 2: Backend — airport-timezones route

**Files:**
- Modify: `live-server/src/routes/base/base.ts`

- [ ] **Step 1: Add the route**

In `live-server/src/routes/base/base.ts`, directly after the existing `/timezone-options` handler, add:

```typescript
  fastify.get('/airport-timezones', async (_request, reply) => {
    const data = await baseService.getAirportTimezones(fastify)
    return success(reply, data)
  })
```

- [ ] **Step 2: Type-check**

Run: `cd live-server && npx tsc --noEmit`
Expected: no new errors from `base.ts`.

- [ ] **Step 3: Commit**

```bash
git add live-server/src/routes/base/base.ts
git commit -m "feat(live-server): GET /base/airport-timezones route"
```

---

## Task 3: Backend — bulk compositions service

**Files:**
- Modify: `live-server/src/services/flight/flight-service.ts`
- Test: `live-server/src/__tests__/services/flight/flight-service.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `live-server/src/__tests__/services/flight/flight-service.test.ts` a new describe block. Mock the two grouped queries by stubbing `fastify.db` the way the existing tests in this file do (match their existing mock helper; if none, use the inline builder below):

```typescript
import { describe, it, expect, vi } from 'vitest'
import { flightService } from '../../../services/flight/flight-service.js'

vi.mock('../../../utils/cache.js', async (orig) => {
  const actual = await orig<typeof import('../../../utils/cache.js')>()
  return { ...actual, getOrSet: (_r: unknown, _k: string, _t: number, fn: () => unknown) => fn() }
})

describe('flightService.getCompositions', () => {
  it('returns per-flight per-rank plan/actual for the id set', async () => {
    // First select() call = plan rows; second = actual rows. Sequence the mock.
    const planRows = [
      { fltId: 1, actingRank: 'CA', plan: 1 },
      { fltId: 1, actingRank: 'FO', plan: 1 },
      { fltId: 1, actingRank: 'FA', plan: 4 },
    ]
    const actualRows = [
      { fltId: 1, actingRank: 'CA', actual: 1 },
      { fltId: 1, actingRank: 'FA', actual: 3 },
    ]
    let call = 0
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            groupBy: () => Promise.resolve(call++ === 0 ? planRows : actualRows),
          }),
        }),
      }),
    }
    const fastify = { redis: null, db } as unknown as Parameters<typeof flightService.getCompositions>[0]

    const map = await flightService.getCompositions(fastify, [1])
    expect(map[1]).toEqual({
      CA: { plan: 1, actual: 1 },
      FO: { plan: 1, actual: 0 },
      PU: { plan: 0, actual: 0 },
      FA: { plan: 4, actual: 3 },
    })
  })

  it('returns an empty object for an empty id set without querying', async () => {
    const db = { select: () => { throw new Error('should not query') } }
    const fastify = { redis: null, db } as unknown as Parameters<typeof flightService.getCompositions>[0]
    const map = await flightService.getCompositions(fastify, [])
    expect(map).toEqual({})
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd live-server && npx vitest run src/__tests__/services/flight/flight-service.test.ts -t getCompositions`
Expected: FAIL — `getCompositions is not a function`.

- [ ] **Step 3: Implement the service method**

In `live-server/src/services/flight/flight-service.ts`, add this method inside the `flightService` object (after `getCrewList`). It reuses the already-imported `flightComposition`, `rosterFlight`, `getOrSet`, `notDeleted`, `CACHE_PREFIX`, `CACHE_TTL`, and Drizzle helpers `sql`, `inArray`, `eq`, `and`. Add `inArray` to the existing `drizzle-orm` import if missing.

```typescript
  async getCompositions(
    fastify: FastifyInstance,
    flightIds: number[],
  ): Promise<Record<number, Record<'CA' | 'FO' | 'PU' | 'FA', { plan: number; actual: number }>>> {
    if (flightIds.length === 0) return {}
    const ids = [...new Set(flightIds)].sort((a, b) => a - b)
    const cacheKey = `${CACHE_PREFIX}:compositions:${ids.join(',')}`
    return getOrSet(fastify.redis, cacheKey, CACHE_TTL, async () => {
      const planRows = await fastify.db
        .select({
          fltId: flightComposition.fltId,
          actingRank: flightComposition.actingRank,
          plan: sql<number>`sum(${flightComposition.plan})`,
        })
        .from(flightComposition)
        .where(inArray(flightComposition.fltId, ids))
        .groupBy(flightComposition.fltId, flightComposition.actingRank)

      const actualRows = await fastify.db
        .select({
          fltId: rosterFlight.fltId,
          actingRank: rosterFlight.flightActingRank,
          actual: sql<number>`count(*)`,
        })
        .from(rosterFlight)
        .where(and(inArray(rosterFlight.fltId, ids), notDeleted(rosterFlight.isDeleted)))
        .groupBy(rosterFlight.fltId, rosterFlight.flightActingRank)

      const result: Record<number, Record<'CA' | 'FO' | 'PU' | 'FA', { plan: number; actual: number }>> = {}
      const ensure = (id: number) => {
        if (!result[id]) {
          result[id] = {
            CA: { plan: 0, actual: 0 },
            FO: { plan: 0, actual: 0 },
            PU: { plan: 0, actual: 0 },
            FA: { plan: 0, actual: 0 },
          }
        }
        return result[id]
      }

      for (const r of planRows) {
        if (r.fltId == null || !r.actingRank) continue
        const entry = ensure(Number(r.fltId))
        if (entry[r.actingRank as 'CA' | 'FO' | 'PU' | 'FA']) {
          entry[r.actingRank as 'CA' | 'FO' | 'PU' | 'FA'].plan = Number(r.plan) || 0
        }
      }
      for (const r of actualRows) {
        if (r.fltId == null || !r.actingRank) continue
        const entry = ensure(Number(r.fltId))
        if (entry[r.actingRank as 'CA' | 'FO' | 'PU' | 'FA']) {
          entry[r.actingRank as 'CA' | 'FO' | 'PU' | 'FA'].actual = Number(r.actual) || 0
        }
      }
      return result
    })
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd live-server && npx vitest run src/__tests__/services/flight/flight-service.test.ts -t getCompositions`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add live-server/src/services/flight/flight-service.ts live-server/src/__tests__/services/flight/flight-service.test.ts
git commit -m "feat(live-server): bulk per-flight composition (plan/actual) service"
```

---

## Task 4: Backend — bulk compositions route

**Files:**
- Modify: `live-server/src/routes/flight/flight.ts`

- [ ] **Step 1: Add the route**

In `live-server/src/routes/flight/flight.ts`, add a handler (place it near `navi-counts`). `z`, `success`, `fail`, `error`, `flightService` are already imported:

```typescript
  // POST /api/flight/compositions — bulk per-flight composition (plan/actual)
  fastify.post('/compositions', async (request, reply) => {
    const schema = z.object({
      flightIds: z.array(z.number().int().positive()).max(1000),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }
    try {
      const result = await flightService.getCompositions(fastify, parsed.data.flightIds)
      return success(reply, result)
    } catch (err) {
      fastify.log.error({ err }, 'flightService.getCompositions failed')
      return error(reply, 500, (err as Error).message)
    }
  })
```

- [ ] **Step 2: Type-check**

Run: `cd live-server && npx tsc --noEmit`
Expected: no new errors from `flight.ts`.

- [ ] **Step 3: Commit**

```bash
git add live-server/src/routes/flight/flight.ts
git commit -m "feat(live-server): POST /api/flight/compositions route"
```

---

## Task 5: Frontend — date formatter + types

**Files:**
- Modify: `gantt/src/stores/timezone-store.ts`
- Modify: `gantt/src/types/flight.ts`

- [ ] **Step 1: Add `formatDateShort` to timezone-store**

In `gantt/src/stores/timezone-store.ts`, near the existing `formatTime`/`getLocalDateFormatter`, add a cached short-date formatter. It must produce e.g. `Jun10` (month short + 2-digit day, no space):

```typescript
// Short calendar date (e.g. "Jun10") in a display timezone, IANA DST-aware.
const shortDateFormatterByZone = new Map<string, Intl.DateTimeFormat>()
const getShortDateFormatter = (zoneId: string): Intl.DateTimeFormat => {
  let f = shortDateFormatterByZone.get(zoneId)
  if (f === undefined) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: zoneId, month: 'short', day: '2-digit' })
    shortDateFormatterByZone.set(zoneId, f)
  }
  return f
}

const shortDateCache = new Map<string, string>()
const SHORT_DATE_CACHE_LIMIT = 200_000
/** Format a UTC timestamp as a short calendar date (e.g. "Jun10") in zoneId. */
export function formatDateShort(utcTimestamp: string, zoneId: string): string {
  const key = `${zoneId}|${utcTimestamp}`
  let v = shortDateCache.get(key)
  if (v === undefined) {
    if (shortDateCache.size >= SHORT_DATE_CACHE_LIMIT) shortDateCache.clear()
    v = getShortDateFormatter(zoneId).format(toUtcDate(utcTimestamp)).replace(/\s+/g, '')
    shortDateCache.set(key, v)
  }
  return v
}
```

Note: `toUtcDate` is the same private helper `formatTime` already uses in this file — reuse it. If it is not in module scope where you add this, place the new code below its definition.

- [ ] **Step 2: Confirm `FlightComposition` type exists**

`gantt/src/types/flight.ts` already exports `FlightComposition` (`{ CA: {plan,actual}; FO; PU; FA }`). No change needed — just verify it's exported. If a `FlightCompositionsResponse` is useful, add:

```typescript
/** Response of POST /api/flight/compositions: fltId → per-rank plan/actual. */
export type FlightCompositionsResponse = Record<number, FlightComposition>
```

- [ ] **Step 3: Type-check**

Run: `cd gantt && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add gantt/src/stores/timezone-store.ts gantt/src/types/flight.ts
git commit -m "feat(gantt): formatDateShort helper + compositions response type"
```

---

## Task 6: Frontend — pure status-line formatter (TDD)

**Files:**
- Create: `gantt/src/utils/format-flight-status-line.ts`
- Test: `gantt/src/utils/__tests__/format-flight-status-line.test.ts`

- [ ] **Step 1: Write the failing test**

Create `gantt/src/utils/__tests__/format-flight-status-line.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { formatFlightStatusLine } from '../format-flight-status-line'
import type { Flight, FlightComposition } from '@/types'

const baseFlight: Flight = {
  id: 1, airline: 'F8', fltDt: '2026-06-10', fltNum: '281381',
  depArp: 'YYZ', arvArp: 'YHZ',
  schDepDtUtc: '2026-06-10T17:00:00Z', schArvDtUtc: '2026-06-10T19:10:00Z',
  actDepDtUtc: '', actArvDtUtc: '', actDepArp: '', actArvArp: '',
  flightFlag: '', blkMin: 130, fleet: '7M8', register: 'C-FLKA',
  fltType: 'J', fltSts: null, isDeleted: 0, isCancelled: false,
}
const comp: FlightComposition = {
  CA: { plan: 1, actual: 1 }, FO: { plan: 1, actual: 0 },
  PU: { plan: 0, actual: 0 }, FA: { plan: 4, actual: 3 },
}

describe('formatFlightStatusLine', () => {
  it('renders all fields in order with L-suffixed local dates (UTC gantt tz)', () => {
    const line = formatFlightStatusLine({
      flight: baseFlight, ganttZoneId: 'UTC',
      depLocalZoneId: 'America/Toronto', arvLocalZoneId: 'America/Halifax',
      composition: comp,
    })
    // gantt tz = UTC → Jun10; Toronto/Halifax local of 17:00Z/19:10Z is still Jun10.
    expect(line).toBe('F8-281381 · YYZ Jun10 / Jun10L → YHZ Jun10 / Jun10L · 7M8 · C-FLKA · CA 1/1  FO 1/0  FA 4/3')
  })

  it('always shows both dates even when equal', () => {
    const line = formatFlightStatusLine({ flight: baseFlight, ganttZoneId: 'UTC' })
    expect(line).toContain('YYZ Jun10 / Jun10L')
  })

  it('hides ranks with plan=0 and actual=0', () => {
    const line = formatFlightStatusLine({ flight: baseFlight, ganttZoneId: 'UTC', composition: comp })
    expect(line).toContain('CA 1/1  FO 1/0  FA 4/3')
    expect(line).not.toContain('PU')
  })

  it('omits the composition segment when no composition given', () => {
    const line = formatFlightStatusLine({ flight: baseFlight, ganttZoneId: 'UTC' })
    expect(line).not.toMatch(/CA |FO |FA /)
  })

  it('falls back to gantt tz when a local zone is missing (local date == gantt date)', () => {
    const line = formatFlightStatusLine({ flight: baseFlight, ganttZoneId: 'UTC' })
    // both halves of the dep segment identical
    expect(line).toContain('YYZ Jun10 / Jun10L')
  })

  it('renders bare flt number when airline missing', () => {
    const line = formatFlightStatusLine({ flight: { ...baseFlight, airline: '' }, ganttZoneId: 'UTC' })
    expect(line.startsWith('281381 ·')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gantt && npx vitest run src/utils/__tests__/format-flight-status-line.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the formatter**

Create `gantt/src/utils/format-flight-status-line.ts`:

```typescript
import { formatDateShort } from '@/stores/timezone-store'
import type { Flight, FlightComposition } from '@/types'

const RANKS: Array<keyof FlightComposition> = ['CA', 'FO', 'PU', 'FA']

export interface FlightStatusLineArgs {
  flight: Flight
  /** Currently selected gantt timezone (IANA zoneId). */
  ganttZoneId: string
  /** Departure airport's own local timezone; falls back to ganttZoneId. */
  depLocalZoneId?: string
  /** Arrival airport's own local timezone; falls back to ganttZoneId. */
  arvLocalZoneId?: string
  /** Per-rank plan/actual; omit to hide the composition segment. */
  composition?: FlightComposition
}

/**
 * Build the bottom-left status-bar line for a hovered flight.
 * Format: `F8-281381 · YYZ Jun10 / Jun10L → YHZ Jun10 / Jun10L · 7M8 · C-FLKA · CA 1/1  FO 1/0  FA 4/3`
 * For each airport, two dates: gantt-selected tz, then airport-local tz suffixed `L` (always both).
 */
export const formatFlightStatusLine = (args: FlightStatusLineArgs): string => {
  const { flight, ganttZoneId, depLocalZoneId, arvLocalZoneId, composition } = args

  const fltLabel = flight.airline ? `${flight.airline}-${flight.fltNum}` : flight.fltNum

  const depGantt = formatDateShort(flight.schDepDtUtc, ganttZoneId)
  const depLocal = formatDateShort(flight.schDepDtUtc, depLocalZoneId || ganttZoneId)
  const arvGantt = formatDateShort(flight.schArvDtUtc, ganttZoneId)
  const arvLocal = formatDateShort(flight.schArvDtUtc, arvLocalZoneId || ganttZoneId)

  const depSeg = `${flight.depArp} ${depGantt} / ${depLocal}L`
  const arvSeg = `${flight.arvArp} ${arvGantt} / ${arvLocal}L`
  const route = `${depSeg} → ${arvSeg}`

  const parts: string[] = [fltLabel, route, flight.fleet]
  if (flight.register) parts.push(flight.register)

  if (composition) {
    const compSeg = RANKS
      .filter((r) => composition[r].plan > 0 || composition[r].actual > 0)
      .map((r) => `${r} ${composition[r].plan}/${composition[r].actual}`)
      .join('  ')
    if (compSeg) parts.push(compSeg)
  }

  return parts.join(' · ')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gantt && npx vitest run src/utils/__tests__/format-flight-status-line.test.ts`
Expected: PASS (all 6).

- [ ] **Step 5: Commit**

```bash
git add gantt/src/utils/format-flight-status-line.ts gantt/src/utils/__tests__/format-flight-status-line.test.ts
git commit -m "feat(gantt): pure flight status-line formatter + unit tests"
```

---

## Task 7: Frontend — airport-tz API + store

**Files:**
- Modify: `gantt/src/services/timezone-api.ts`
- Create: `gantt/src/stores/airport-tz-store.ts`

- [ ] **Step 1: Add API method**

In `gantt/src/services/timezone-api.ts`, add to the `timezoneApi` object:

```typescript
  /** Airport→IANA zoneId map for ALL airports (incl. non-base). */
  async getAirportTimezones(): Promise<Record<string, string>> {
    return api.get('/api/base/airport-timezones') as Promise<Record<string, string>>
  },
```

- [ ] **Step 2: Create the store**

Create `gantt/src/stores/airport-tz-store.ts`:

```typescript
import { create } from 'zustand'
import { timezoneApi } from '@/services/timezone-api'

interface AirportTzStore {
  map: Record<string, string>
  loaded: boolean
  /** IANA zoneId for an airport code, or undefined if unknown. */
  zoneIdFor: (airport: string) => string | undefined
  /** Fetch the map once; no-op if already loaded or in flight. */
  load: () => Promise<void>
}

let inFlight: Promise<void> | null = null

export const useAirportTzStore = create<AirportTzStore>((set, get) => ({
  map: {},
  loaded: false,
  zoneIdFor: (airport) => get().map[airport],
  load: async () => {
    if (get().loaded || inFlight) return inFlight ?? undefined
    inFlight = (async () => {
      try {
        const map = await timezoneApi.getAirportTimezones()
        set({ map, loaded: true })
      } catch {
        // 401/offline: leave map empty; local date falls back to gantt tz.
      } finally {
        inFlight = null
      }
    })()
    return inFlight
  },
}))
```

- [ ] **Step 3: Type-check**

Run: `cd gantt && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add gantt/src/services/timezone-api.ts gantt/src/stores/airport-tz-store.ts
git commit -m "feat(gantt): airport-timezone map api + store"
```

---

## Task 8: Frontend — composition API + store

**Files:**
- Modify: `gantt/src/services/flight-api.ts`
- Create: `gantt/src/stores/flight-composition-store.ts`

- [ ] **Step 1: Add API method**

In `gantt/src/services/flight-api.ts`, add to `flightApi` (and extend the `import type` line with `FlightCompositionsResponse`):

```typescript
  /** Bulk per-flight composition (plan/actual) for the given flight ids. */
  async compositions(flightIds: number[]): Promise<FlightCompositionsResponse> {
    return api.post('/api/flight/compositions', { flightIds }) as Promise<FlightCompositionsResponse>
  },
```

- [ ] **Step 2: Create the store**

Create `gantt/src/stores/flight-composition-store.ts`:

```typescript
import { create } from 'zustand'
import { flightApi } from '@/services/flight-api'
import type { FlightComposition } from '@/types'

interface FlightCompositionStore {
  byId: Record<number, FlightComposition>
  /** Fetch compositions for ids not already loaded; merges into byId. */
  loadFor: (flightIds: number[]) => Promise<void>
  clear: () => void
}

export const useFlightCompositionStore = create<FlightCompositionStore>((set, get) => ({
  byId: {},
  loadFor: async (flightIds) => {
    const have = get().byId
    const missing = [...new Set(flightIds)].filter((id) => have[id] === undefined)
    if (missing.length === 0) return
    try {
      const res = await flightApi.compositions(missing)
      set((s) => ({ byId: { ...s.byId, ...res } }))
    } catch {
      // Composition segment is simply omitted on failure.
    }
  },
  clear: () => set({ byId: {} }),
}))
```

- [ ] **Step 3: Type-check**

Run: `cd gantt && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add gantt/src/services/flight-api.ts gantt/src/stores/flight-composition-store.ts
git commit -m "feat(gantt): bulk flight-composition api + store"
```

---

## Task 9: Frontend — wire hover in the Flight pane

**Files:**
- Modify: `gantt/src/components/panes/flight-pane.tsx`

- [ ] **Step 1: Add imports**

At the top of `gantt/src/components/panes/flight-pane.tsx`, add:

```typescript
import { useEffect } from 'react'
import { useTimezoneStore } from '@/stores/timezone-store'
import { useAirportTzStore } from '@/stores/airport-tz-store'
import { useFlightCompositionStore } from '@/stores/flight-composition-store'
import { formatFlightStatusLine } from '@/utils/format-flight-status-line'
import type { Flight } from '@/types'
```

(Merge `useEffect` into the existing `react` import; merge `Flight` into the existing `@/types/flight` import if present.)

- [ ] **Step 2: Build a flightById map + load the two stores**

Inside the `FlightPane` component body (near where `reorderedFlightRows` is computed), add:

```typescript
  const ganttZoneId = useTimezoneStore((s) => s.timezone)
  const zoneIdFor = useAirportTzStore((s) => s.zoneIdFor)
  const loadAirportTz = useAirportTzStore((s) => s.load)
  const compositionById = useFlightCompositionStore((s) => s.byId)
  const loadCompositions = useFlightCompositionStore((s) => s.loadFor)

  // Flat flightId → Flight lookup for hover/status-line + composition loading.
  const flightById = useMemo(() => {
    const m = new Map<number, Flight>()
    for (const row of reorderedFlightRows) {
      for (const f of row.flights) m.set(f.id, f)
    }
    return m
  }, [reorderedFlightRows])

  // Load airport timezones once, and compositions whenever the flight set changes.
  useEffect(() => { void loadAirportTz() }, [loadAirportTz])
  useEffect(() => {
    const ids = [...flightById.keys()]
    if (ids.length > 0) void loadCompositions(ids)
  }, [flightById, loadCompositions])
```

- [ ] **Step 3: Replace the hover status text**

Replace the body of `onItemHover` (`flight-pane.tsx:370-377`) — the line `setStatusBarText(\`Flight  |  Reg: ${hit.rowId}  |  ID: ${hit.itemId}\`)` — with the rich formatter:

```typescript
    onItemHover: (hit, clientX, clientY) => {
      setHoveredTask(hit?.itemId ?? null, clientX, clientY)
      if (hit?.itemId) {
        const flight = flightById.get(hit.itemId)
        if (flight) {
          setStatusBarText(formatFlightStatusLine({
            flight,
            ganttZoneId,
            depLocalZoneId: zoneIdFor(flight.depArp),
            arvLocalZoneId: zoneIdFor(flight.arvArp),
            composition: compositionById[flight.id],
          }))
        } else {
          setStatusBarText('')
        }
      } else {
        setStatusBarText('')
      }
    },
```

Add `flightById`, `ganttZoneId`, `zoneIdFor`, `compositionById` to the `useMemo` dependency array of `interactionCallbacks` (currently ends `setStatusBarText, scroll, zoomIn, zoomOut, crossPaneDrag])`).

- [ ] **Step 4: Feed `compositionStatusMap` (bonus — puck coloring)**

Replace the empty stub at `flight-pane.tsx:91` (`const compositionStatusMap = useMemo(() => new Map<number, FlightCompositionStatus>(), [])`) with a derived map:

```typescript
  const compositionStatusMap = useMemo(() => {
    const m = new Map<number, FlightCompositionStatus>()
    for (const [id, c] of Object.entries(compositionById)) {
      const ranks = [c.CA, c.FO, c.PU, c.FA]
      const isFull = ranks.every((r) => r.actual >= r.plan)
      const isPartial = ranks.some((r) => r.actual < r.plan && r.plan > 0)
      m.set(Number(id), isFull ? 'full' : isPartial ? 'partial' : 'cancelled')
    }
    return m
  }, [compositionById])
```

Ensure `compositionById` is declared before this `useMemo` (move the store reads from Step 2 above this line if needed). Keep `FlightCompositionStatus` import (already present).

- [ ] **Step 5: Type-check + lint**

Run: `cd gantt && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add gantt/src/components/panes/flight-pane.tsx
git commit -m "feat(gantt): rich flight hover status line + composition puck coloring"
```

---

## Task 10: Frontend — status-bar testid + test hooks

**Files:**
- Modify: `gantt/src/components/layout/status-bar.tsx`
- Modify: `gantt/src/utils/gantt-test-hook.ts`

- [ ] **Step 1: Add a testid to the status text span**

In `gantt/src/components/layout/status-bar.tsx`, on the left section (lines 119-127), add a stable testid to the wrapper so e2e can read it. Change the wrapping `<div className="flex items-center gap-3">` (line 119) to:

```tsx
        <div className="flex items-center gap-3" data-testid="status-bar-text">
```

- [ ] **Step 2: Add test hooks**

In `gantt/src/utils/gantt-test-hook.ts`, add three methods to the `window.__ganttTest` object and its type. Find the object literal that implements the hook and add (importing the stores/util at the top of the file as the file already imports other stores):

```typescript
  // Hover a flight by id: builds the real status line from live stores and sets it.
  hoverFlight: (fltId: number): void => {
    const flights = useFlightStore.getState().items.flatMap((it) => it.flights)
    const flight = flights.find((f) => f.id === fltId)
    if (!flight) return
    const { timezone } = useTimezoneStore.getState()
    const zoneIdFor = useAirportTzStore.getState().zoneIdFor
    const composition = useFlightCompositionStore.getState().byId[fltId]
    useUiStore.getState().setStatusBarText(formatFlightStatusLine({
      flight, ganttZoneId: timezone,
      depLocalZoneId: zoneIdFor(flight.depArp),
      arvLocalZoneId: zoneIdFor(flight.arvArp),
      composition,
    }))
  },
  // Set the gantt-selected timezone (drives date #1 in the status line).
  setTimezone: (zoneId: string, airport: string): void => {
    useTimezoneStore.getState().setTimezone(zoneId, airport)
  },
  // The airport's own IANA zoneId (date #2 source), or undefined.
  airportZone: (airport: string): string | undefined =>
    useAirportTzStore.getState().zoneIdFor(airport),
```

Add the matching signatures to the `GanttTestHook` interface:

```typescript
  hoverFlight: (fltId: number) => void
  setTimezone: (zoneId: string, airport: string) => void
  airportZone: (airport: string) => string | undefined
```

And add the imports at the top of the file (match existing style):

```typescript
import { useAirportTzStore } from '@/stores/airport-tz-store'
import { useFlightCompositionStore } from '@/stores/flight-composition-store'
import { formatFlightStatusLine } from '@/utils/format-flight-status-line'
```

(`useFlightStore`, `useTimezoneStore`, `useUiStore` are likely already imported; add any that are missing.)

- [ ] **Step 3: Type-check**

Run: `cd gantt && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add gantt/src/components/layout/status-bar.tsx gantt/src/utils/gantt-test-hook.ts
git commit -m "test(gantt): status-bar testid + hoverFlight/setTimezone/airportZone hooks"
```

---

## Task 11: E2E — Playwright coverage

**Files:**
- Create: `e2e/tests/gantt/flight-hover-status-bar.spec.ts`

- [ ] **Step 1: Write the e2e test**

Create `e2e/tests/gantt/flight-hover-status-bar.spec.ts`. It exercises the real data pipeline (stores populated from real APIs → real formatter → real uiStore → StatusBar DOM) and proves the two dates compute from independent timezones:

```typescript
/**
 * Flight hover status bar — bottom-left line shows rich flight info for any loaded flight.
 * Per §No-Illusion: asserts the exact composed line (flight number, both dates with L on the
 * airport-local one, fleet, reg, composition), and proves date #1 follows the gantt timezone
 * while date #2 (L) follows the airport's own zone by switching the gantt tz to the dep
 * airport's zone and asserting date #1 then equals the previously-captured L date.
 */
import { test, expect, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, addFlightPane } from '../../utils/gantt-hook'

const hookCall = <T>(page: Page, fn: (api: Record<string, (...a: unknown[]) => unknown>) => T): Promise<T> =>
  page.evaluate(fn as unknown as string)

test.describe('Flight hover status bar', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.expectRosterPaneVisible()
    await addFlightPane(page)
  })

  test('shows the rich flight line and recomputes date #1 on timezone switch', async ({ page }) => {
    // Wait until flights are loaded into the gantt store.
    await expect.poll(async () =>
      page.evaluate(() => (window.__ganttTest as { flights: () => unknown[] }).flights().length),
      { timeout: 30_000, message: 'no flights loaded' },
    ).toBeGreaterThan(0)

    // Wait until airport timezones + compositions have loaded for the first flight.
    const fltId = await page.evaluate(() =>
      (window.__ganttTest as { flights: () => Array<{ id: number }> }).flights()[0].id)
    const depArp = await page.evaluate((id) =>
      (window.__ganttTest as { flights: () => Array<{ id: number; depArp: string }> })
        .flights().find((f) => f.id === id)!.depArp, fltId)

    await expect.poll(() =>
      page.evaluate((arp) => (window.__ganttTest as { airportZone: (a: string) => string | undefined }).airportZone(arp), depArp),
      { timeout: 30_000, message: 'airport timezones never loaded' },
    ).toBeTruthy()

    // Hover the flight (real store-driven path) and read the status bar DOM.
    await page.evaluate((id) => (window.__ganttTest as { hoverFlight: (n: number) => void }).hoverFlight(id), fltId)
    const bar = page.getByTestId('status-bar-text')
    await expect(bar).toContainText(' · ')
    const line1 = (await bar.textContent()) ?? ''

    // Structure: "<airline>-<num> · <DEP> <d1> / <d2>L → <ARV> <d3> / <d4>L · <fleet> · ..."
    expect(line1).toMatch(/^[A-Z0-9]{0,3}-?\d+ · [A-Z]{3} \w{3}\d{2} \/ \w{3}\d{2}L → [A-Z]{3} \w{3}\d{2} \/ \w{3}\d{2}L · /)
    // Composition segment present (at least one rank plan/actual).
    expect(line1).toMatch(/(CA|FO|PU|FA) \d+\/\d+/)

    // Capture the dep segment's date #1 (gantt tz) and date #2 (L, airport local).
    const depMatch = line1.match(new RegExp(`${depArp} (\\w{3}\\d{2}) \\/ (\\w{3}\\d{2})L`))!
    const depGantt1 = depMatch[1]
    const depLocal = depMatch[2]

    // Switch the gantt timezone to the dep airport's OWN zone, then re-hover.
    const depZone = await page.evaluate((arp) =>
      (window.__ganttTest as { airportZone: (a: string) => string | undefined }).airportZone(arp), depArp)
    await page.evaluate(([z, a]) =>
      (window.__ganttTest as { setTimezone: (z: string, a: string) => void }).setTimezone(z as string, a as string),
      [depZone, depArp])
    await page.evaluate((id) => (window.__ganttTest as { hoverFlight: (n: number) => void }).hoverFlight(id), fltId)

    const line2 = (await bar.textContent()) ?? ''
    const depMatch2 = line2.match(new RegExp(`${depArp} (\\w{3}\\d{2}) \\/ (\\w{3}\\d{2})L`))!
    const depGantt2 = depMatch2[1]
    const depLocal2 = depMatch2[2]

    // date #1 now equals airport-local (gantt tz == dep airport zone); date #2 (L) is invariant.
    expect(depGantt2).toBe(depLocal)
    expect(depLocal2).toBe(depLocal)
    // Sanity: the original gantt date and local may have matched under the seed range, but the
    // L value must never change when only the gantt tz changes.
    expect(depLocal2).toBe(depGantt2 === depGantt1 ? depLocal : depLocal)
  })
})
```

- [ ] **Step 2: Run the e2e test**

Run: `cd e2e && npx playwright test tests/gantt/flight-hover-status-bar.spec.ts --reporter=list`
Expected: PASS. (If pbs-server :3002 is down, append `--no-deps` per project e2e notes.)

- [ ] **Step 3: Paste the PASS receipt into the completion message** (per §No-Illusion).

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/gantt/flight-hover-status-bar.spec.ts
git commit -m "test(e2e): flight hover status bar — full line + timezone-independent dates"
```

---

## Task 12: Version bump

**Files:**
- Modify: `gantt/src/version.ts`

- [ ] **Step 1: Bump both counters**

Frontend (gantt) + backend (live-server) both changed → bump both. In `gantt/src/version.ts`:
- `BACKEND_VERSION = 78` → `79`
- `FRONTEND_VERSION = 158` → `159`

- [ ] **Step 2: Commit**

```bash
git add gantt/src/version.ts
git commit -m "chore: bump version B79/F159 (flight hover status bar)"
```

---

## Final Verification

- [ ] `cd live-server && npx vitest run src/__tests__/services/base/base-service.test.ts src/__tests__/services/flight/flight-service.test.ts` → PASS
- [ ] `cd gantt && npx vitest run src/utils/__tests__/format-flight-status-line.test.ts` → PASS
- [ ] `cd gantt && npx tsc --noEmit` → no new errors
- [ ] `cd e2e && npx playwright test tests/gantt/flight-hover-status-bar.spec.ts --reporter=list` → PASS
- [ ] Status bar shows `F8-<num> · <DEP> <date> / <date>L → <ARV> <date> / <date>L · <fleet> · <reg> · CA n/n …` on hover, in the gantt-selected timezone, with stable airport-local `L` dates.
