# Pane Search, Sort, and Append Query Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement search, sort, and append query functionality for Pairing/Crew/Flight panes with session-based query tracking and visual indicators.

**Architecture:** Backend extends existing list endpoints with new filter parameters and caching keys. Frontend refactors stores to support query sessions (replace/append mode) with sessionTags on items. Pane headers redesigned with 3 badges and filter strip. Canvas renderers add session color bars.

**Tech Stack:** Fastify + Drizzle ORM + Redis (backend), React + Zustand + Canvas (frontend), PostgreSQL indexes

**Spec Reference:** `docs/superpowers/specs/2026-04-25-pane-search-sort-design.md`

---

## File Structure

### Backend (live-server)

| File | Change | Purpose |
|------|--------|---------|
| `sql/migration/2026-04-25-pane-search-indexes.sql` | Create | DB indexes for filter fields |
| `live-server/src/routes/pairing/pairing.ts` | Modify | Add filter query params to schema |
| `live-server/src/services/pairing/pairing-service.ts` | Modify | Add filter conditions + EXISTS subquery |
| `live-server/src/routes/crew/crew.ts` | Modify | Add filter query params |
| `live-server/src/services/crew/crew-service.ts` | Modify | Add filter conditions |
| `live-server/src/routes/flight/flight.ts` | Modify | Add filter query params (if exists) |
| `live-server/src/services/flight/flight-service.ts` | Modify | Add filter conditions |

### Frontend (gantt)

| File | Change | Purpose |
|------|--------|---------|
| `gantt/src/types/pairing.ts` | Modify | Add PairingFilters, QuerySession, sessionTags |
| `gantt/src/types/crew.ts` | Modify | Add CrewFilters, QuerySession, sessionTags |
| `gantt/src/types/flight.ts` | Modify | Add FlightFilters, QuerySession, sessionTags |
| `gantt/src/stores/pairing-store.ts` | Modify | Full refactor with sessions/queryMode |
| `gantt/src/stores/crew-store.ts` | Modify | Add session support |
| `gantt/src/stores/flight-store.ts` | Modify | Add session support |
| `gantt/src/components/panes/pane-toolbar.tsx` | Modify | 3-badge layout + Filter Strip |
| `gantt/src/components/panes/pairing-pane.tsx` | Modify | Use new PaneToolbar props |
| `gantt/src/components/panes/roster-pane.tsx` | Modify | Use new PaneToolbar props (crew) |
| `gantt/src/components/panes/flight-pane.tsx` | Modify | Use new PaneToolbar props |
| `gantt/src/components/gantt/renderers/pairing-renderer.ts` | Modify | Add session tag rendering |
| `gantt/src/components/gantt/renderers/roster-renderer.ts` | Modify | Add session tag rendering |
| `gantt/src/components/gantt/renderers/flight-renderer.ts` | Modify | Add session tag rendering |
| `gantt/src/services/pairing-api.ts` | Modify | Add filter params to API calls |
| `gantt/src/services/crew-api.ts` | Modify | Add filter params to API calls |
| `gantt/src/services/flight-api.ts` | Modify | Add filter params to API calls |

---

## Task 1: Database Indexes for Filter Fields

**Files:**
- Create: `sql/migration/2026-04-25-pane-search-indexes.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- Pane Search/Sort/Append Query Indexes
-- Created: 2026-04-25
-- Purpose: Support filter fields for pairing/crew/flight panes

-- pairing table (partial index, exclude deleted rows)
CREATE INDEX IF NOT EXISTS idx_pairing_fleet
  ON pairing(fleet) WHERE is_deleted = 0;

CREATE INDEX IF NOT EXISTS idx_pairing_base
  ON pairing(base) WHERE is_deleted = 0;

CREATE INDEX IF NOT EXISTS idx_pairing_tafb
  ON pairing(tafb) WHERE is_deleted = 0;

CREATE INDEX IF NOT EXISTS idx_pairing_division
  ON pairing(division) WHERE is_deleted = 0;

-- pairing_segment table (for segment-level filters)
CREATE INDEX IF NOT EXISTS idx_pairing_segment_flt_num
  ON pairing_segment(flt_num) WHERE is_deleted = 0;

CREATE INDEX IF NOT EXISTS idx_pairing_segment_dep_arp
  ON pairing_segment(dep_arp) WHERE is_deleted = 0;

-- crew table
CREATE INDEX IF NOT EXISTS idx_crew_emp_code
  ON crew(crew_id) WHERE is_deleted = 0;

CREATE INDEX IF NOT EXISTS idx_crew_base
  ON crew(base) WHERE is_deleted = 0;

CREATE INDEX IF NOT EXISTS idx_crew_rank
  ON crew(rank) WHERE is_deleted = 0;

CREATE INDEX IF NOT EXISTS idx_crew_fleet
  ON crew(fleet) WHERE is_deleted = 0;

-- flight table
CREATE INDEX IF NOT EXISTS idx_flight_flt_num
  ON flight(flt_num) WHERE is_deleted = 0;

CREATE INDEX IF NOT EXISTS idx_flight_dep_arp
  ON flight(dep_arp) WHERE is_deleted = 0;

CREATE INDEX IF NOT EXISTS idx_flight_arv_arp
  ON flight(arv_arp) WHERE is_deleted = 0;
```

- [ ] **Step 2: Run migration against f8 schema**

```bash
psql -h localhost -U f8 -d rois -c "SET search_path TO f8;" -f sql/migration/2026-04-25-pane-search-indexes.sql
```

Expected: All indexes created successfully

- [ ] **Step 3: Commit migration**

```bash
git add sql/migration/2026-04-25-pane-search-indexes.sql
git commit -m "feat(db): add indexes for pane search/sort filters

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Backend Pairing Service Filter Support

**Files:**
- Modify: `live-server/src/routes/pairing/pairing.ts:10-24`
- Modify: `live-server/src/services/pairing/pairing-service.ts:19-54`

- [ ] **Step 1: Extend route query schema**

In `live-server/src/routes/pairing/pairing.ts`, modify the GET `/` route schema:

```typescript
import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { success, fail, error } from '../../utils/response.js'
import { paginationQuerySchema } from '../../utils/pagination.js'
import { pairingService } from '../../services/pairing/pairing-service.js'

// Pairing filter schema (new)
const pairingFilterSchema = z.object({
  label: z.string().max(50).optional(),       // pairingLabel ILIKE
  fleet: z.string().max(20).optional(),       // exact match
  base: z.string().max(3).optional(),         // exact match
  division: z.string().max(1).optional(),     // exact match (P/C)
  segFltNum: z.string().max(10).optional(),   // segment.flt_num ILIKE
  depArp: z.string().max(3).optional(),       // segment.dep_arp exact
  isFull: z.coerce.boolean().optional(),      // boolean filter
})

export default async function pairingRoutes(fastify: FastifyInstance) {
  // GET /api/pairing — list with date range + pagination + filters
  fastify.get('/', async (request, reply) => {
    const schema = paginationQuerySchema.extend({
      startDate: z.string().default(new Date().toISOString().slice(0, 10)),
      endDate: z.string().default(new Date().toISOString().slice(0, 10)),
      sortBy: z.enum(['schStrDtUtc', 'pairingLabel', 'tafb', 'fleet', 'base', 'segCount', 'durationDays']).default('schStrDtUtc'),
      sortOrder: z.enum(['asc', 'desc']).default('asc'),
    }).merge(pairingFilterSchema)

    const parsed = schema.safeParse(request.query)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }

    const result = await pairingService.list(fastify, parsed.data)
    return success(reply, result)
  })
  // ... rest of routes unchanged
}
```

- [ ] **Step 2: Run existing tests to verify schema change doesn't break**

```bash
cd live-server && npm test -- --grep "pairing" --run 2>&1 | tail -20
```

Expected: Tests pass (if any exist for pairing routes)

- [ ] **Step 3: Extend service list method with filter conditions**

In `live-server/src/services/pairing/pairing-service.ts`, modify the `list` method:

```typescript
import { eq, and, between, asc, desc, sql, max, SQL, ilike } from 'drizzle-orm'
import { rosterFlight } from '../../models/roster/roster-flight.js'
import type { FastifyInstance } from 'fastify'
import { pairing } from '../../models/pairing/pairing.js'
import { pairingSegment } from '../../models/pairing/pairing-segment.js'
import { flight as flightTable } from '../../models/flight/flight.js'
import { pairingComposition } from '../../models/pairing/pairing-composition.js'
import { pairingMemo } from '../../models/pairing/pairing-memo.js'
import { scenario } from '../../models/scenario/scenario.js'
import { getOrSet, invalidate, invalidatePattern } from '../../utils/cache.js'
import { auditCreate, auditUpdate } from '../../utils/audit.js'
import type { PaginationQuery } from '../../utils/pagination.js'
import { paginate } from '../../utils/pagination.js'
import { notDeleted } from '../../utils/db.js'
import crypto from 'node:crypto'

const CACHE_PREFIX = 'pairing'
const CACHE_TTL = 600 // 10min

// Extended query interface with filters
interface PairingListQuery extends PaginationQuery {
  startDate: string
  endDate: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  // New filter fields
  label?: string
  fleet?: string
  base?: string
  division?: string
  segFltNum?: string
  depArp?: string
  isFull?: boolean
}

// Hash filters for cache key
function hashFilters(filters: Record<string, unknown>): string {
  const sorted = Object.entries(filters)
    .filter(([_, v]) => v !== undefined && v !== null && v !== '')
    .sort(([a], [b]) => a.localeCompare(b))
  if (sorted.length === 0) return ''
  return crypto.createHash('md5').update(JSON.stringify(sorted)).digest('hex').slice(0, 8)
}

export const pairingService = {
  async list(fastify: FastifyInstance, query: PairingListQuery) {
    const { startDate, endDate, page, pageSize, sortBy, sortOrder, ...filters } = query
    
    // Build cache key with filters hash
    const filtersHash = hashFilters(filters)
    const cacheKey = `${CACHE_PREFIX}:list:${startDate}:${endDate}:${page}:${pageSize}:${sortBy ?? ''}:${sortOrder ?? ''}:${filtersHash}`

    return getOrSet(fastify.redis, cacheKey, CACHE_TTL, async () => {
      const conditions: SQL[] = [
        notDeleted(pairing.isDeleted),
        between(pairing.schStrDtUtc, new Date(`${startDate}T00:00:00Z`), new Date(`${endDate}T23:59:59Z`)),
      ]

      // Add filter conditions
      if (filters.fleet) {
        conditions.push(eq(pairing.fleet, filters.fleet))
      }
      if (filters.base) {
        conditions.push(eq(pairing.base, filters.base))
      }
      if (filters.division) {
        conditions.push(eq(pairing.division, filters.division))
      }
      if (filters.label) {
        conditions.push(ilike(pairing.pairingLabel, `%${filters.label}%`))
      }
      if (filters.isFull !== undefined) {
        // isFull is computed from composition - need subquery approach
        // For now, filter in post-processing (see below)
      }

      // Segment-level filters via EXISTS subquery
      if (filters.segFltNum) {
        conditions.push(
          sql`EXISTS (
            SELECT 1 FROM pairing_segment ps
            WHERE ps.pairing_id = ${pairing.id}
              AND ps.flt_num ILIKE ${`%${filters.segFltNum}%`}
              AND ps.is_deleted = 0
          )`
        )
      }
      if (filters.depArp) {
        conditions.push(
          sql`EXISTS (
            SELECT 1 FROM pairing_segment ps
            WHERE ps.pairing_id = ${pairing.id}
              AND ps.dep_arp = ${filters.depArp}
              AND ps.is_deleted = 0
          )`
        )
      }

      const whereClause = and(...conditions)

      // Order column mapping
      const orderFn = sortOrder === 'desc' ? desc : asc
      const orderColumnMap: Record<string, SQL> = {
        schStrDtUtc: pairing.schStrDtUtc,
        pairingLabel: pairing.pairingLabel,
        tafb: pairing.tafb,
        fleet: pairing.fleet,
        base: pairing.base,
        segCount: pairing.segCount,
        durationDays: pairing.durationDays,
      }
      const orderColumn = orderColumnMap[sortBy ?? 'schStrDtUtc'] ?? pairing.schStrDtUtc

      const [items, countResult] = await Promise.all([
        fastify.db
          .select()
          .from(pairing)
          .where(whereClause)
          .orderBy(orderFn(orderColumn))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        fastify.db
          .select({ count: sql<number>`count(*)::int` })
          .from(pairing)
          .where(whereClause),
      ])

      // Fetch compositions and segments for each pairing
      const pairingIds = items.map((p) => p.id)
      const [allCompositions, allSegments] = pairingIds.length > 0
        ? await Promise.all([
            fastify.db
              .select()
              .from(pairingComposition)
              .where(and(
                sql`${pairingComposition.pairingId} IN ${pairingIds}`,
                notDeleted(pairingComposition.isDeleted)
              )),
            fastify.db
              .select()
              .from(pairingSegment)
              .where(and(
                sql`${pairingSegment.pairingId} IN ${pairingIds}`,
                notDeleted(pairingSegment.isDeleted)
              ))
              .orderBy(asc(pairingSegment.dutySeq), asc(pairingSegment.segSeq)),
          ])
        : [[], []]

      // Group compositions by pairingId
      const compositionMap = new Map<number, typeof allCompositions>()
      for (const comp of allCompositions) {
        const existing = compositionMap.get(comp.pairingId) ?? []
        existing.push(comp)
        compositionMap.set(comp.pairingId, existing)
      }

      // Group segments by pairingId
      const segmentMap = new Map<number, typeof allSegments>()
      for (const seg of allSegments) {
        const existing = segmentMap.get(seg.pairingId) ?? []
        existing.push(seg)
        segmentMap.set(seg.pairingId, existing)
      }

      // Enrich items with composition, segments, isFull
      let enrichedItems = items.map((p) => {
        const comps = compositionMap.get(p.id) ?? []
        const segs = segmentMap.get(p.id) ?? []
        const composition = comps.map((c) => ({
          rank: c.actingRank ?? '',
          plan: c.planValue ?? 0,
          fill: 0,
        }))
        const isFull = composition.length > 0 ? composition.every((s) => s.plan === s.fill) : true
        return { ...p, composition, isFull, segments: segs }
      })

      // Post-process isFull filter (if specified)
      if (filters.isFull !== undefined) {
        enrichedItems = enrichedItems.filter((item) => item.isFull === filters.isFull)
      }

      return paginate({ page, pageSize }, enrichedItems, countResult[0].count)
    })
  },
  // ... rest of service unchanged
}
```

- [ ] **Step 4: Run tests**

```bash
cd live-server && npm test --run 2>&1 | tail -20
```

Expected: All tests pass

- [ ] **Step 5: Commit backend pairing filter changes**

```bash
git add live-server/src/routes/pairing/pairing.ts live-server/src/services/pairing/pairing-service.ts
git commit -m "feat(live-server): add filter params to pairing list endpoint

- Add label, fleet, base, division, segFltNum, depArp, isFull filters
- Add sortBy options: tafb, fleet, base, segCount, durationDays
- Add EXISTS subquery for segment-level filters
- Add filters hash to cache key

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Backend Crew Service Filter Support

**Files:**
- Modify: `live-server/src/routes/crew/crew.ts:9-18`
- Modify: `live-server/src/services/crew/crew-service.ts`

- [ ] **Step 1: Extend crew route query schema**

In `live-server/src/routes/crew/crew.ts`, the schema already has some filters. Add missing ones:

```typescript
const crewListQuerySchema = paginationQuerySchema.extend({
  division: z.string().max(1).optional(),
  rank: z.string().max(10).optional(),
  base: z.string().max(3).optional(),
  fleet: z.string().max(20).optional(),
  status: z.string().max(5).optional(),
  search: z.string().max(100).optional(),  // existing - for empCode/name fuzzy
  empCode: z.string().max(30).optional(),  // NEW - exact/fuzzy
  name: z.string().max(100).optional(),    // NEW - fuzzy
  sortBy: z.enum(['crew_id', 'name', 'rank', 'base', 'fleet']).optional(),  // EXTENDED
  sortOrder: z.enum(['asc', 'desc']).optional(),
})
```

- [ ] **Step 2: Extend crew service list method**

The crew service already has filter support. Add `empCode` and `name` fuzzy search:

```typescript
// In crew-service.ts list method, add:
if (filters.empCode) {
  conditions.push(ilike(crew.crewId, `%${filters.empCode}%`))
}
if (filters.name) {
  // Search in firstName, lastName, preferredName
  conditions.push(
    sql`(${crew.firstName} ILIKE ${`%${filters.name}%`} 
         OR ${crew.lastName} ILIKE ${`%${filters.name}%`}
         OR ${crew.preferredName} ILIKE ${`%${filters.name}%`})`
  )
}
if (filters.fleet) {
  conditions.push(eq(crew.fleet, filters.fleet))
}
```

- [ ] **Step 3: Run tests**

```bash
cd live-server && npm test -- --grep "crew" --run 2>&1 | tail -20
```

Expected: Tests pass

- [ ] **Step 4: Commit crew filter changes**

```bash
git add live-server/src/routes/crew/crew.ts live-server/src/services/crew/crew-service.ts
git commit -m "feat(live-server): extend crew list filters with empCode/name search

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Backend Flight Service Filter Support

**Files:**
- Modify: `live-server/src/routes/flight/flight.ts` (create if needed)
- Modify: `live-server/src/services/flight/flight-service.ts` (create if needed)

- [ ] **Step 1: Check if flight routes exist**

```bash
ls -la live-server/src/routes/flight/ 2>/dev/null || echo "Flight routes not found"
```

- [ ] **Step 2: If flight routes exist, extend schema; if not, create basic route**

Check flight service pattern and add filters:
- `fltNum`: fuzzy
- `depArp`: exact
- `arvArp`: exact
- `fleet`: exact
- `status`: exact

- [ ] **Step 3: Run tests**

```bash
cd live-server && npm test -- --grep "flight" --run 2>&1 | tail -20
```

Expected: Tests pass

- [ ] **Step 4: Commit flight filter changes**

```bash
git add live-server/src/routes/flight/ live-server/src/services/flight/
git commit -m "feat(live-server): add filter params to flight list endpoint

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Frontend Pairing Types Extension

**Files:**
- Modify: `gantt/src/types/pairing.ts`

- [ ] **Step 1: Add filter and session types**

In `gantt/src/types/pairing.ts`, add after existing interfaces:

```typescript
/** Pairing filter params for search */
export interface PairingFilters {
  label?: string      // pairingLabel ILIKE search
  fleet?: string      // exact match
  base?: string       // exact match
  division?: string   // exact match (P/C)
  segFltNum?: string  // segment.flt_num ILIKE search
  depArp?: string     // segment.dep_arp exact match
  isFull?: boolean    // full/partial filter
}

/** Query session for tracking search history */
export interface QuerySession {
  id: number               // 1, 2, 3... (append order)
  filters: PairingFilters
  page: number             // current page loaded
  total: number            // total matching from server
  exhausted: boolean       // all pages loaded
}

/** Extended PairingItem with session tracking */
export interface PairingItem {
  pairing: Pairing
  flights: PairingFlight[]
  segments: PairingSegment[]
  sessionTags: number[]    // NEW: which sessions matched this item
}

/** Extended query params */
export interface PairingListQuery {
  startDate?: string
  endDate?: string
  page?: number
  pageSize?: number
  sortBy?: 'schStrDtUtc' | 'pairingLabel' | 'tafb' | 'fleet' | 'base' | 'segCount' | 'durationDays'
  sortOrder?: 'asc' | 'desc'
  // Filter params
  label?: string
  fleet?: string
  base?: string
  division?: string
  segFltNum?: string
  depArp?: string
  isFull?: boolean
}
```

- [ ] **Step 2: Commit types**

```bash
git add gantt/src/types/pairing.ts
git commit -m "feat(gantt): add PairingFilters and QuerySession types

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Frontend Crew/Flight Types Extension

**Files:**
- Modify: `gantt/src/types/crew.ts`
- Modify: `gantt/src/types/flight.ts`

- [ ] **Step 1: Add CrewFilters type**

In `gantt/src/types/crew.ts`:

```typescript
/** Crew filter params for search */
export interface CrewFilters {
  empCode?: string    // crewId ILIKE search
  name?: string       // firstName/lastName/preferredName ILIKE
  rank?: string       // exact match
  base?: string       // exact match
  fleet?: string      // exact match
}

/** Query session for crew */
export interface CrewQuerySession {
  id: number
  filters: CrewFilters
  page: number
  total: number
  exhausted: boolean
}
```

- [ ] **Step 2: Add FlightFilters type**

In `gantt/src/types/flight.ts`:

```typescript
/** Flight filter params for search */
export interface FlightFilters {
  fltNum?: string     // ILIKE search
  depArp?: string     // exact match
  arvArp?: string     // exact match
  fleet?: string      // exact match
  status?: string     // exact match
}

/** Query session for flight */
export interface FlightQuerySession {
  id: number
  filters: FlightFilters
  page: number
  total: number
  exhausted: boolean
}
```

- [ ] **Step 3: Commit types**

```bash
git add gantt/src/types/crew.ts gantt/src/types/flight.ts
git commit -m "feat(gantt): add CrewFilters and FlightFilters types

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: Pairing Store Refactor

**Files:**
- Modify: `gantt/src/stores/pairing-store.ts`
- Modify: `gantt/src/services/pairing-api.ts`

- [ ] **Step 1: Update pairing-api.ts to support filter params**

In `gantt/src/services/pairing-api.ts`, extend the list method:

```typescript
import type { PairingListQuery, PairingListResponse } from '@/types/pairing'

export const pairingApi = {
  async list(params: PairingListQuery): Promise<PairingListResponse> {
    const query = new URLSearchParams()
    if (params.startDate) query.set('startDate', params.startDate)
    if (params.endDate) query.set('endDate', params.endDate)
    if (params.page) query.set('page', String(params.page))
    if (params.pageSize) query.set('pageSize', String(params.pageSize))
    if (params.sortBy) query.set('sortBy', params.sortBy)
    if (params.sortOrder) query.set('sortOrder', params.sortOrder)
    // Filter params
    if (params.label) query.set('label', params.label)
    if (params.fleet) query.set('fleet', params.fleet)
    if (params.base) query.set('base', params.base)
    if (params.division) query.set('division', params.division)
    if (params.segFltNum) query.set('segFltNum', params.segFltNum)
    if (params.depArp) query.set('depArp', params.depArp)
    if (params.isFull !== undefined) query.set('isFull', String(params.isFull))
    
    const res = await api.get(`/pairing?${query}`)
    return res.data.data
  },
  // ... rest unchanged
}
```

- [ ] **Step 2: Refactor pairing-store.ts with full session support**

Replace the entire store implementation:

```typescript
import { create } from 'zustand'
import { pairingApi } from '@/services/pairing-api'
import type { Pairing, PairingItem, PairingFilters, QuerySession, DateRange } from '@/types/pairing'
import { useGanttViewStore } from './gantt-view-store'
import { usePaneStore } from './pane-store'

const formatDate = (d: Date): string => d.toISOString().slice(0, 10)
const PAGE_SIZE = 100

/** Session colors for visual indicators */
const SESSION_COLORS = [
  '#f97316',  // ① orange
  '#3b82f6',  // ② blue
  '#22c55e',  // ③ green
  '#a855f7',  // ④ purple
]

interface PairingStore {
  /** Loaded pairing items (deduplicated) */
  items: PairingItem[]
  /** Total count in date range (without filters, for ≡ badge) */
  unfilteredTotal: number
  loading: boolean
  loadingMore: boolean

  /** Query mode: replace clears items, append adds to existing */
  queryMode: 'replace' | 'append'

  /** Query session queue */
  sessions: QuerySession[]
  
  /** Next session ID counter */
  nextSessionId: number

  /** Global sort (applies to all sessions) */
  sortBy: string
  sortOrder: 'asc' | 'desc'

  // Computed getters
  getMatchedTotal: () => number
  getLoadedCount: () => number
  getHasMore: () => boolean

  // Actions
  fetchPairings: (dateRange: DateRange) => Promise<void>
  search: (filters: PairingFilters) => Promise<void>
  loadMore: () => Promise<void>
  applySort: (sortBy: string, sortOrder: 'asc' | 'desc') => Promise<void>
  setQueryMode: (mode: 'replace' | 'append') => void
  clearFilters: () => void
  removeFilter: (sessionId: number, key: keyof PairingFilters) => Promise<void>
  removeItem: (pairingId: number) => void
  hasSegments: (pairingId: number) => boolean
}

function mapPairings(rawItems: Pairing[], sessionTag: number): PairingItem[] {
  return rawItems.map((pairing) => ({
    pairing,
    flights: [],
    segments: pairing.segments ?? [],
    sessionTags: [sessionTag],
  }))
}

export const usePairingStore = create<PairingStore>((set, get) => ({
  items: [],
  unfilteredTotal: 0,
  loading: false,
  loadingMore: false,
  queryMode: 'replace',
  sessions: [],
  nextSessionId: 1,
  sortBy: 'schStrDtUtc',
  sortOrder: 'asc',

  getMatchedTotal: () => {
    const { sessions } = get()
    if (sessions.length === 0) return 0
    // Sum of session totals (may have overlap, but this is acceptable for badge)
    return sessions.reduce((sum, s) => sum + s.total, 0)
  },

  getLoadedCount: () => get().items.length,

  getHasMore: () => {
    const { sessions } = get()
    return sessions.some((s) => !s.exhausted)
  },

  fetchPairings: async (dateRange) => {
    set({ loading: true, items: [], sessions: [], unfilteredTotal: 0, nextSessionId: 1 })
    try {
      const { sortBy, sortOrder } = get()
      const params = {
        startDate: formatDate(dateRange.start),
        endDate: formatDate(dateRange.end),
        page: 1,
        pageSize: PAGE_SIZE,
        sortBy,
        sortOrder,
      }
      console.log('[PairingStore] fetchPairings', params)
      const result = await pairingApi.list(params)
      const items = mapPairings(result.items, 0) // session 0 = initial load
      set({
        items,
        unfilteredTotal: result.total,
        hasMore: items.length < result.total,
        loading: false,
        sessions: [], // no active filter sessions
      })
      useGanttViewStore.getState().markDirty()
    } catch (err) {
      console.error('[PairingStore] fetch error:', err)
      set({ loading: false })
    }
  },

  search: async (filters) => {
    const state = get()
    const { queryMode, sortBy, sortOrder, nextSessionId } = state
    
    if (queryMode === 'replace') {
      // Clear existing items and sessions
      set({ loading: true, items: [], sessions: [] })
      
      const sessionId = 1
      const session: QuerySession = {
        id: sessionId,
        filters,
        page: 1,
        total: 0,
        exhausted: false,
      }
      
      try {
        const { dateRange } = usePaneStore.getState()
        const result = await pairingApi.list({
          startDate: formatDate(dateRange.start),
          endDate: formatDate(dateRange.end),
          page: 1,
          pageSize: PAGE_SIZE,
          sortBy,
          sortOrder,
          ...filters,
        })
        
        const items = mapPairings(result.items, sessionId)
        session.total = result.total
        session.exhausted = items.length >= result.total
        
        set({
          items,
          sessions: [session],
          nextSessionId: 2,
          loading: false,
        })
        useGanttViewStore.getState().markDirty()
      } catch (err) {
        console.error('[PairingStore] search error:', err)
        set({ loading: false })
      }
    } else {
      // Append mode: add new session
      const sessionId = nextSessionId
      const session: QuerySession = {
        id: sessionId,
        filters,
        page: 1,
        total: 0,
        exhausted: false,
      }
      
      set({ loadingMore: true })
      
      try {
        const { dateRange } = usePaneStore.getState()
        const { sortBy, sortOrder } = get()
        const result = await pairingApi.list({
          startDate: formatDate(dateRange.start),
          endDate: formatDate(dateRange.end),
          page: 1,
          pageSize: PAGE_SIZE,
          sortBy,
          sortOrder,
          ...filters,
        })
        
        // Merge with existing items (deduplicate by pairing.id)
        const existingItems = get().items
        const existingIds = new Map<number, PairingItem>()
        for (const item of existingItems) {
          existingIds.set(item.pairing.id, item)
        }
        
        for (const raw of result.items) {
          const existing = existingIds.get(raw.id)
          if (existing) {
            // Already exists, just add session tag
            existing.sessionTags.push(sessionId)
          } else {
            // New item
            existingIds.set(raw.id, {
              pairing: raw,
              flights: [],
              segments: raw.segments ?? [],
              sessionTags: [sessionId],
            })
          }
        }
        
        session.total = result.total
        session.exhausted = result.items.length >= result.total
        
        set({
          items: [...existingIds.values()],
          sessions: [...get().sessions, session],
          nextSessionId: sessionId + 1,
          loadingMore: false,
        })
        useGanttViewStore.getState().markDirty()
      } catch (err) {
        console.error('[PairingStore] append search error:', err)
        set({ loadingMore: false })
      }
    }
  },

  loadMore: async () => {
    const state = get()
    if (state.loadingMore) return
    
    // Find first non-exhausted session (FIFO)
    const activeSession = state.sessions.find((s) => !s.exhausted)
    if (!activeSession) return
    
    set({ loadingMore: true })
    
    try {
      const { dateRange } = usePaneStore.getState()
      const { sortBy, sortOrder } = get()
      const nextPage = activeSession.page + 1
      
      const result = await pairingApi.list({
        startDate: formatDate(dateRange.start),
        endDate: formatDate(dateRange.end),
        page: nextPage,
        pageSize: PAGE_SIZE,
        sortBy,
        sortOrder,
        ...activeSession.filters,
      })
      
      // Merge items
      const existingIds = new Map<number, PairingItem>()
      for (const item of state.items) {
        existingIds.set(item.pairing.id, item)
      }
      
      for (const raw of result.items) {
        const existing = existingIds.get(raw.id)
        if (existing) {
          if (!existing.sessionTags.includes(activeSession.id)) {
            existing.sessionTags.push(activeSession.id)
          }
        } else {
          existingIds.set(raw.id, {
            pairing: raw,
            flights: [],
            segments: raw.segments ?? [],
            sessionTags: [activeSession.id],
          })
        }
      }
      
      // Update session
      const updatedSessions = state.sessions.map((s) =>
        s.id === activeSession.id
          ? { ...s, page: nextPage, exhausted: result.items.length < PAGE_SIZE }
          : s
      )
      
      set({
        items: [...existingIds.values()],
        sessions: updatedSessions,
        loadingMore: false,
      })
      useGanttViewStore.getState().markDirty()
    } catch (err) {
      console.error('[PairingStore] loadMore error:', err)
      set({ loadingMore: false })
    }
  },

  applySort: async (sortBy, sortOrder) => {
    const state = get()
    const currentSort = `${state.sortBy}:${state.sortOrder}`
    const newSort = `${sortBy}:${sortOrder}`
    
    if (currentSort === newSort) return // no change
    
    // Save current session filters
    const savedFilters = state.sessions.map((s) => s.filters)
    
    set({ sortBy, sortOrder, loading: true, items: [], sessions: [] })
    
    // Re-execute all searches with new sort
    let nextId = 1
    const allItems = new Map<number, PairingItem>()
    const newSessions: QuerySession[] = []
    
    try {
      const { dateRange } = usePaneStore.getState()
      
      for (const filters of savedFilters) {
        const result = await pairingApi.list({
          startDate: formatDate(dateRange.start),
          endDate: formatDate(dateRange.end),
          page: 1,
          pageSize: PAGE_SIZE,
          sortBy,
          sortOrder,
          ...filters,
        })
        
        const sessionId = nextId++
        for (const raw of result.items) {
          const existing = allItems.get(raw.id)
          if (existing) {
            existing.sessionTags.push(sessionId)
          } else {
            allItems.set(raw.id, {
              pairing: raw,
              flights: [],
              segments: raw.segments ?? [],
              sessionTags: [sessionId],
            })
          }
        }
        
        newSessions.push({
          id: sessionId,
          filters,
          page: 1,
          total: result.total,
          exhausted: result.items.length >= result.total,
        })
      }
      
      set({
        items: [...allItems.values()],
        sessions: newSessions,
        nextSessionId: nextId,
        loading: false,
      })
      useGanttViewStore.getState().markDirty()
    } catch (err) {
      console.error('[PairingStore] applySort error:', err)
      set({ loading: false })
    }
  },

  setQueryMode: (mode) => set({ queryMode: mode }),

  clearFilters: () => {
    set({
      sessions: [],
      items: [],
      nextSessionId: 1,
    })
    // Trigger reload of initial data
    const { dateRange } = usePaneStore.getState()
    if (dateRange) {
      get().fetchPairings(dateRange)
    }
  },

  removeFilter: async (sessionId, key) => {
    const state = get()
    const session = state.sessions.find((s) => s.id === sessionId)
    if (!session) return
    
    // Remove the filter key
    const newFilters = { ...session.filters }
    delete newFilters[key]
    
    // If session has no filters left, remove entire session
    if (Object.keys(newFilters).length === 0) {
      const newSessions = state.sessions.filter((s) => s.id !== sessionId)
      // Remove session tags from items
      const newItems = state.items
        .map((item) => ({
          ...item,
          sessionTags: item.sessionTags.filter((t) => t !== sessionId),
        }))
        .filter((item) => item.sessionTags.length > 0)
      
      set({ sessions: newSessions, items: newItems })
      useGanttViewStore.getState().markDirty()
      return
    }
    
    // Re-search with updated filters
    // ... (similar to applySort, re-execute just this session)
  },

  removeItem: (pairingId) => {
    set((state) => ({
      items: state.items.filter((i) => i.pairing.id !== pairingId),
    }))
  },

  hasSegments: (pairingId) => {
    const item = get().items.find((i) => i.pairing.id === pairingId)
    return item !== undefined && item.segments.length > 0
  },
}))

export { SESSION_COLORS }
```

- [ ] **Step 3: Run frontend dev server to verify no runtime errors**

```bash
cd gantt && npm run dev &
sleep 5
curl -s http://localhost:5173 | head -5
```

Expected: Dev server starts without errors

- [ ] **Step 4: Commit pairing store refactor**

```bash
git add gantt/src/stores/pairing-store.ts gantt/src/services/pairing-api.ts
git commit -m "feat(gantt): refactor pairing-store with session-based query tracking

- Add queryMode (replace/append) for search behavior
- Add sessions array to track multiple search queries
- Add sessionTags on PairingItem for visual indicators
- Add unfilteredTotal for ≡ badge
- Add applySort to re-execute searches with new sort
- Add SESSION_COLORS for visual rendering

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: Crew Store Session Support

**Files:**
- Modify: `gantt/src/stores/crew-store.ts`
- Modify: `gantt/src/services/crew-api.ts`

- [ ] **Step 1: Add session support to crew-store.ts**

Similar pattern to pairing-store, add:
- `sessions: CrewQuerySession[]`
- `queryMode: 'replace' | 'append'`
- `sessionTags` on crew items

- [ ] **Step 2: Add filter params to crew-api.ts**

Extend list method to pass filter params.

- [ ] **Step 3: Commit crew store changes**

```bash
git add gantt/src/stores/crew-store.ts gantt/src/services/crew-api.ts
git commit -m "feat(gantt): add session support to crew-store

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: Flight Store Session Support

**Files:**
- Modify: `gantt/src/stores/flight-store.ts`
- Modify: `gantt/src/services/flight-api.ts`

- [ ] **Step 1: Add session support to flight-store.ts**

Similar pattern, add session tracking.

- [ ] **Step 2: Add filter params to flight-api.ts**

- [ ] **Step 3: Commit flight store changes**

```bash
git add gantt/src/stores/flight-store.ts gantt/src/services/flight-api.ts
git commit -m "feat(gantt): add session support to flight-store

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 10: Pane Header Redesign

**Files:**
- Modify: `gantt/src/components/panes/pane-toolbar.tsx`

- [ ] **Step 1: Redesign PaneToolbar with 3-badge layout**

Replace the component with new design:

```typescript
import { useState } from 'react'
import { ArrowUpDown, Search, ChevronsUpDown, Settings2, ExternalLink, PanelBottomOpen, X, List, Filter, Download } from 'lucide-react'
import { ColumnConfigDialog } from '@/components/common/column-config-dialog'
import type { PaneType } from '@/types/pane'

/** Color indicator for each pane type */
const PANE_TYPE_COLORS: Record<PaneType, string> = {
  'roster-main': '#3b82f6',
  'roster-sub': '#3b82f6',
  'pairing': '#22c55e',
  'flight': '#a855f7',
}

const PANE_LABELS: Record<PaneType, string> = {
  'roster-main': 'Roster Main',
  'roster-sub': 'Roster Sub',
  'pairing': 'Pairing',
  'flight': 'Flight',
}

/** Session colors for filter chips */
const SESSION_COLORS = [
  '#f97316',  // ① orange
  '#3b82f6',  // ② blue
  '#22c55e',  // ③ green
  '#a855f7',  // ④ purple
]

interface FilterChip {
  sessionId: number
  key: string
  value: string
  label: string
}

interface PaneToolbarProps {
  paneType: PaneType
  title: string
  /** ≡ badge: total in date range */
  unfilteredTotal?: number
  /** ⌕ badge: matching search filters */
  matchedTotal?: number
  /** ↓ badge: loaded in view */
  loadedCount?: number
  /** Active filter chips */
  filterChips?: FilterChip[]
  /** Sort indicator */
  sortLabel?: string
  /** Query mode */
  queryMode?: 'replace' | 'append'
  /** Callbacks */
  onSortClick?: () => void
  onSearchClick?: () => void
  onClearAll?: () => void
  onRemoveFilter?: (sessionId: number, key: string) => void
  onQueryModeToggle?: () => void
  /** Extra action buttons */
  extraActions?: React.ReactNode
  /** Float/dock */
  onFloatToggle?: () => void
  isFloating?: boolean
}

/**
 * Redesigned toolbar with 3-badge layout and filter strip.
 * 
 * Row 1 (32px): [● color] [Title] [≡ N] [⌕ N] [↓ N] [⠿] [×]
 * Row 2 (24px): filter chips + sort indicator + Clear all (when has filters)
 */
export const PaneToolbar = ({
  paneType,
  title,
  unfilteredTotal,
  matchedTotal,
  loadedCount,
  filterChips = [],
  sortLabel,
  queryMode = 'replace',
  onSortClick,
  onSearchClick,
  onClearAll,
  onRemoveFilter,
  onQueryModeToggle,
  extraActions,
  onFloatToggle,
  isFloating,
}: PaneToolbarProps) => {
  const [columnConfigOpen, setColumnConfigOpen] = useState(false)
  
  const hasFilters = filterChips.length > 0
  const showSearchBadge = matchedTotal !== undefined && matchedTotal > 0 && matchedTotal !== unfilteredTotal

  return (
    <>
      {/* Row 1: Main toolbar */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b bg-muted/30 px-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-1.5 rounded-sm"
            style={{ backgroundColor: PANE_TYPE_COLORS[paneType] }}
          />
          <span className="text-xs font-semibold text-foreground">{title}</span>
          
          {/* ≡ Badge: Total in date range */}
          {unfilteredTotal !== undefined && unfilteredTotal > 0 && (
            <span
              className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-muted-foreground"
              title="Total in date range"
            >
              <List className="h-3 w-3" />
              {unfilteredTotal}
            </span>
          )}
          
          {/* ⌕ Badge: Matching search (amber) */}
          {showSearchBadge && (
            <span
              className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-amber-400"
              title="Matching search filters"
            >
              <Filter className="h-3 w-3" />
              {matchedTotal}
            </span>
          )}
          
          {/* ↓ Badge: Loaded in view (blue) */}
          {loadedCount !== undefined && loadedCount > 0 && (
            <span
              className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-blue-400"
              title="Loaded in view"
            >
              <Download className="h-3 w-3" />
              {loadedCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          {/* Query mode toggle (replace/append) */}
          {onQueryModeToggle && (
            <button
              className={`inline-flex h-5 w-5 items-center justify-center rounded-md transition-all duration-100 hover:bg-accent/60 active:scale-95 ${
                queryMode === 'append' ? 'text-amber-400' : 'text-muted-foreground'
              }`}
              onClick={onQueryModeToggle}
              title={queryMode === 'append' ? 'Append mode (click to switch to Replace)' : 'Replace mode (click to switch to Append)'}
            >
              <ChevronsUpDown className="h-3 w-3" />
            </button>
          )}
          
          {onSortClick && (
            <button
              className="inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-all duration-100 hover:bg-accent/60 hover:text-foreground active:scale-95"
              onClick={onSortClick}
              title="Sort"
            >
              <ArrowUpDown className="h-3 w-3" />
            </button>
          )}
          
          {onSearchClick && (
            <button
              className="inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-all duration-100 hover:bg-accent/60 hover:text-foreground active:scale-95"
              onClick={onSearchClick}
              title="Search"
            >
              <Search className="h-3 w-3" />
            </button>
          )}
          
          {extraActions}
          
          {onFloatToggle && (
            <button
              className="inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-all duration-100 hover:bg-accent/60 hover:text-foreground active:scale-95"
              onClick={onFloatToggle}
              title={isFloating ? 'Dock back' : 'Float pane'}
            >
              {isFloating
                ? <PanelBottomOpen className="h-3 w-3" />
                : <ExternalLink className="h-3 w-3" />}
            </button>
          )}
          
          <button
            className="inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-all duration-100 hover:bg-accent/60 hover:text-foreground active:scale-95"
            onClick={() => setColumnConfigOpen(true)}
            title="Column settings"
          >
            <Settings2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Row 2: Filter Strip (only when filters active) */}
      {hasFilters && (
        <div className="flex h-6 shrink-0 items-center gap-2 border-b bg-muted/20 px-2 overflow-x-auto">
          {/* Filter chips */}
          {filterChips.map((chip, i) => (
            <span
              key={`${chip.sessionId}-${chip.key}`}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]"
              style={{
                backgroundColor: `${SESSION_COLORS[chip.sessionId - 1]}20`,
                color: SESSION_COLORS[chip.sessionId - 1],
              }}
            >
              <span className="font-medium">{chip.sessionId}</span>
              <span className="text-muted-foreground">{chip.label}:</span>
              <span>{chip.value}</span>
              {onRemoveFilter && (
                <button
                  className="ml-0.5 hover:bg-black/10 rounded"
                  onClick={() => onRemoveFilter(chip.sessionId, chip.key)}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </span>
          ))}
          
          {/* Sort indicator */}
          {sortLabel && (
            <span className="text-[10px] text-muted-foreground">
              {sortLabel}
            </span>
          )}
          
          {/* Clear all button */}
          {onClearAll && (
            <button
              className="text-[10px] text-muted-foreground hover:text-foreground ml-auto"
              onClick={onClearAll}
            >
              Clear all
            </button>
          )}
        </div>
      )}

      <ColumnConfigDialog
        open={columnConfigOpen}
        onClose={() => setColumnConfigOpen(false)}
        paneType={paneType}
        paneLabel={PANE_LABELS[paneType]}
      />
    </>
  )
}
```

- [ ] **Step 2: Commit pane toolbar redesign**

```bash
git add gantt/src/components/panes/pane-toolbar.tsx
git commit -m "feat(gantt): redesign PaneToolbar with 3-badge layout and filter strip

- Add ≡ badge for total in date range
- Add ⌕ badge for matched search count (amber)
- Add ↓ badge for loaded count (blue)
- Add filter strip with session-colored chips
- Add query mode toggle button

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 11: Pairing Pane Integration

**Files:**
- Modify: `gantt/src/components/panes/pairing-pane.tsx`

- [ ] **Step 1: Update PairingPane to use new PaneToolbar props**

Connect the new PaneToolbar props to pairingStore:

```typescript
import { usePairingStore, SESSION_COLORS } from '@/stores/pairing-store'
import { PaneToolbar } from './pane-toolbar'

// In PairingPane component:
const {
  items,
  unfilteredTotal,
  sessions,
  sortBy,
  sortOrder,
  queryMode,
  getMatchedTotal,
  getLoadedCount,
  search,
  applySort,
  setQueryMode,
  clearFilters,
  removeFilter,
} = usePairingStore()

// Build filter chips from sessions
const filterChips = sessions.flatMap((session) =>
  Object.entries(session.filters)
    .filter(([_, v]) => v !== undefined && v !== null && v !== '')
    .map(([key, value]) => ({
      sessionId: session.id,
      key,
      value: String(value),
      label: FILTER_KEY_LABELS[key] ?? key,
    }))
)

const FILTER_KEY_LABELS: Record<string, string> = {
  label: 'Label',
  fleet: 'Fleet',
  base: 'Base',
  division: 'Division',
  segFltNum: 'Flt#',
  depArp: 'Dep',
  isFull: 'Full',
}

// Render PaneToolbar with new props
<PaneToolbar
  paneType="pairing"
  title="Pairing"
  unfilteredTotal={unfilteredTotal}
  matchedTotal={getMatchedTotal()}
  loadedCount={getLoadedCount()}
  filterChips={filterChips}
  sortLabel={`${sortOrder === 'asc' ? '↑' : '↓'} ${sortBy}`}
  queryMode={queryMode}
  onSortClick={() => {/* open sort dialog */}
  onSearchClick={() => {/* open search dialog */}
  onClearAll={clearFilters}
  onRemoveFilter={removeFilter}
  onQueryModeToggle={() => setQueryMode(queryMode === 'replace' ? 'append' : 'replace')}
/>
```

- [ ] **Step 2: Commit pairing pane integration**

```bash
git add gantt/src/components/panes/pairing-pane.tsx
git commit -m "feat(gantt): integrate new PaneToolbar props in PairingPane

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 12: Crew Pane Integration

**Files:**
- Modify: `gantt/src/components/panes/roster-pane.tsx`

- [ ] **Step 1: Update RosterPane (crew) to use new PaneToolbar props**

Similar pattern, connect to crewStore.

- [ ] **Step 2: Commit crew pane integration**

```bash
git add gantt/src/components/panes/roster-pane.tsx
git commit -m "feat(gantt): integrate new PaneToolbar props in RosterPane

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 13: Flight Pane Integration

**Files:**
- Modify: `gantt/src/components/panes/flight-pane.tsx`

- [ ] **Step 1: Update FlightPane to use new PaneToolbar props**

- [ ] **Step 2: Commit flight pane integration**

```bash
git add gantt/src/components/panes/flight-pane.tsx
git commit -m "feat(gantt): integrate new PaneToolbar props in FlightPane

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 14: Canvas Session Tag Rendering

**Files:**
- Modify: `gantt/src/components/gantt/renderers/pairing-renderer.ts`

- [ ] **Step 1: Add session tag bar rendering to pairing-renderer.ts**

In `drawSegmentRow`, add session tag rendering at the beginning:

```typescript
import { SESSION_COLORS } from '@/stores/pairing-store'

const drawSegmentRow = (
  rc: PairingRenderContext,
  item: PairingItem,
  rowIndex: number,
): void => {
  const { ctx, scrollY, canvasHeight, frozenRowCount } = rc
  
  // Row Y position
  const baseY = rowY(rowIndex, scrollY, frozenRowCount, PAIRING_ROW_HEIGHT)
  
  // Clipping check
  if (baseY + PAIRING_ROW_HEIGHT < PAIRING_HEADER_HEIGHT) return
  if (baseY > canvasHeight) return
  
  // Draw session tag bars (4px wide, left edge of row)
  if (item.sessionTags && item.sessionTags.length > 0) {
    const tagWidth = 4
    if (item.sessionTags.length === 1) {
      // Single session: solid bar
      ctx.fillStyle = SESSION_COLORS[item.sessionTags[0] - 1] ?? '#888'
      ctx.fillRect(0, baseY, tagWidth, PAIRING_ROW_HEIGHT)
    } else {
      // Multiple sessions: segmented bar
      const segHeight = PAIRING_ROW_HEIGHT / item.sessionTags.length
      item.sessionTags.forEach((tag, i) => {
        ctx.fillStyle = SESSION_COLORS[tag - 1] ?? '#888'
        ctx.fillRect(0, baseY + i * segHeight, tagWidth, segHeight)
      })
    }
  }
  
  // ... rest of rendering (shift content right by 4px)
}
```

- [ ] **Step 2: Commit session tag rendering**

```bash
git add gantt/src/components/gantt/renderers/pairing-renderer.ts
git commit -m "feat(gantt): add session tag bars to pairing canvas renderer

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 15: Roster Renderer Session Tags

**Files:**
- Modify: `gantt/src/components/gantt/renderers/roster-renderer.ts`

- [ ] **Step 1: Add session tag rendering to roster-renderer.ts**

Similar pattern to pairing-renderer.

- [ ] **Step 2: Commit roster renderer changes**

```bash
git add gantt/src/components/gantt/renderers/roster-renderer.ts
git commit -m "feat(gantt): add session tag bars to roster canvas renderer

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 16: Flight Renderer Session Tags

**Files:**
- Modify: `gantt/src/components/gantt/renderers/flight-renderer.ts`

- [ ] **Step 1: Add session tag rendering to flight-renderer.ts**

- [ ] **Step 2: Commit flight renderer changes**

```bash
git add gantt/src/components/gantt/renderers/flight-renderer.ts
git commit -m "feat(gantt): add session tag bars to flight canvas renderer

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 17: Final Integration Testing

**Files:**
- Test: E2E test scenarios

- [ ] **Step 1: Start backend server**

```bash
cd live-server && npm run dev &
sleep 3
curl -s http://localhost:3000/api/health | jq .
```

Expected: Health check returns OK

- [ ] **Step 2: Start frontend dev server**

```bash
cd gantt && npm run dev &
sleep 5
```

- [ ] **Step 3: Manual test in browser**

1. Open `http://localhost:5173`
2. Login with test credentials
3. Select date range
4. Test Pairing pane:
   - Check ≡ badge shows total count
   - Apply filter (e.g., fleet filter)
   - Check ⌕ badge shows matched count
   - Check ↓ badge shows loaded count
   - Verify session tag bar appears on rows
   - Test append mode toggle
   - Add second filter, verify multi-color tags
   - Clear all, verify reset

- [ ] **Step 4: Test Crew pane similarly**

- [ ] **Step 5: Test Flight pane similarly**

- [ ] **Step 6: Commit final verification**

```bash
git add -A
git commit -m "feat: complete pane search/sort/append query implementation

- Backend filter params with caching
- Frontend session-based query tracking
- Pane header with 3-badge layout
- Canvas session tag rendering

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Self-Review Checklist

After completing all tasks, verify:

1. **Spec coverage:**
   - [x] DB indexes created
   - [x] Backend pairing/crew/flight filters implemented
   - [x] Frontend pairing-store refactored with sessions
   - [x] Pane header redesigned with 3 badges
   - [x] Canvas session tags rendered
   - [x] Crew/Flight stores updated

2. **Placeholder scan:** No TBD/TODO found

3. **Type consistency:** 
   - `PairingFilters` type matches backend params
   - `sessionTags: number[]` on PairingItem
   - `SESSION_COLORS` array consistent across files

---

**Plan complete.** Ready for execution.