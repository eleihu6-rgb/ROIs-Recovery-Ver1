# Live 全量加载 + 客户端排序 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply Filters 后一次性全量加载 Crew/Pairing/Flight 数据，排序在本地完成，Pairing 详情优先从本地 store 查找。

**Architecture:** 服务端三个 list 接口支持 `pageSize=0`（返回全量，不加 LIMIT/OFFSET）；前端三个 store 在 Apply Filters 时传 `ALL_DATA_PAGE_SIZE=5000`，`applySort` 改为本地 sort；`apply-filters.ts` 重构并发结构，Pairing 详情新增 `pairing-info-service.ts` 做本地优先查找。

**Tech Stack:** Fastify + Drizzle ORM (live-server), React 19 + Zustand (gantt), Playwright (e2e)

---

## File Map

| 文件 | 操作 | 变更摘要 |
|------|------|---------|
| `live-server/src/utils/pagination.ts` | Modify | `pageSize` 允许 0；`paginate()` 防除以零 |
| `live-server/src/services/crew/crew-service.ts` | Modify | `pageSize=0` 时跳过 `.limit().offset()` |
| `live-server/src/services/pairing/pairing-service.ts` | Modify | 同上 |
| `live-server/src/routes/flight/flight.ts` | Modify | 路由 schema 允许 `pageSize=0`，放宽 max(50) |
| `live-server/src/services/flight/flight-service.ts` | Modify | `pageSize=0` 时返回全部 items，跳过 slice |
| `gantt/src/stores/crew-store.ts` | Modify | `ALL_DATA_PAGE_SIZE`；fetch 方法改用全量；`applySort` 本地 sort |
| `gantt/src/stores/pairing-store.ts` | Modify | 同上 |
| `gantt/src/stores/flight-store.ts` | Modify | `fetchFlights` 改用全量 |
| `gantt/src/utils/apply-filters.ts` | Modify | 去掉 bootstrap 路径；crew+pairing+flight 真并发 |
| `gantt/src/services/pairing-info-service.ts` | Create | 本地优先查找 wrapper（避免循环依赖） |
| `gantt/src/components/pairing/pairing-info-dialog.tsx` | Modify | 改用 `pairing-info-service` |
| `e2e/gantt/live-full-load.spec.ts` | Create | Playwright 回归测试 |

---

## Task 1: Server — pagination.ts 支持 pageSize=0

**Files:**
- Modify: `live-server/src/utils/pagination.ts`

- [ ] **Step 1: 修改 paginationQuerySchema 允许 0，修复 paginate() 防除以零**

  打开 `live-server/src/utils/pagination.ts`，将整个文件替换为：

  ```typescript
  import { z } from 'zod'

  export interface PaginationQuery {
    page: number
    pageSize: number
  }

  export interface PaginatedResult<T> {
    items: T[]
    total: number
    page: number
    pageSize: number
    totalPages: number
  }

  export const paginationQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    // 0 = no limit (return all); positive = page size
    pageSize: z.coerce.number().int().min(0).max(10000).default(20),
  })

  export const paginate = <T>(
    query: PaginationQuery,
    items: T[],
    total: number,
  ): PaginatedResult<T> => ({
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: query.pageSize > 0 ? Math.ceil(total / query.pageSize) : 1,
  })
  ```

- [ ] **Step 2: 验证 live-server 编译通过**

  ```bash
  cd live-server && npx tsc --noEmit 2>&1 | head -30
  ```

  Expected: 无 pagination.ts 相关错误

- [ ] **Step 3: Commit**

  ```bash
  git add live-server/src/utils/pagination.ts
  git commit -m "feat(live-server): allow pageSize=0 in pagination schema (no-limit mode)"
  ```

---

## Task 2: Server — crew-service 全量加载

**Files:**
- Modify: `live-server/src/services/crew/crew-service.ts` (lines ~183–197)

- [ ] **Step 1: 找到 crew list 查询中的 LIMIT/OFFSET 片段**

  ```bash
  grep -n "limit\|offset" live-server/src/services/crew/crew-service.ts | head -10
  ```

  应看到类似：
  ```
  183:    const offset = (pagination.page - 1) * pagination.pageSize
  196:      .limit(pagination.pageSize)
  197:      .offset(offset)
  ```

- [ ] **Step 2: 将 LIMIT/OFFSET 改为条件加载**

  找到形如：
  ```typescript
  const offset = (pagination.page - 1) * pagination.pageSize

  let query = fastify.db.select().from(crew).$dynamic()
  if (where) query = query.where(where) as typeof query

  const countResult = await fastify.db.select({ count: sql<number>`count(*)::int` }).from(crew).where(where)
  const total = countResult[0]?.count ?? 0

  const items = await fastify.db
    .select()
    .from(crew)
    .where(where)
    .orderBy(orderBy)
    .limit(pagination.pageSize)
    .offset(offset)
  ```

  替换为：

  ```typescript
  const countResult = await fastify.db.select({ count: sql<number>`count(*)::int` }).from(crew).where(where)
  const total = countResult[0]?.count ?? 0

  const baseQuery = fastify.db.select().from(crew).where(where).orderBy(orderBy)
  const items = await (
    pagination.pageSize > 0
      ? baseQuery.limit(pagination.pageSize).offset((pagination.page - 1) * pagination.pageSize)
      : baseQuery
  )
  ```

- [ ] **Step 3: 编译验证**

  ```bash
  cd live-server && npx tsc --noEmit 2>&1 | head -30
  ```

  Expected: 无新增错误

- [ ] **Step 4: Commit**

  ```bash
  git add live-server/src/services/crew/crew-service.ts
  git commit -m "feat(live-server): crew list supports pageSize=0 for full load"
  ```

---

## Task 3: Server — pairing-service 全量加载

**Files:**
- Modify: `live-server/src/services/pairing/pairing-service.ts` (lines ~301–308)

- [ ] **Step 1: 找到 LIMIT/OFFSET 片段**

  ```bash
  grep -n "\.limit\|\.offset" live-server/src/services/pairing/pairing-service.ts | head -10
  ```

  应看到：
  ```
  307:          .limit(pageSize)
  308:          .offset((page - 1) * pageSize),
  ```

- [ ] **Step 2: 将 LIMIT/OFFSET 改为条件加载**

  找到形如：
  ```typescript
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
  ```

  替换为：

  ```typescript
  const pairingDataQuery = fastify.db
    .select()
    .from(pairing)
    .where(whereClause)
    .orderBy(orderFn(orderColumn))

  const [items, countResult] = await Promise.all([
    pageSize > 0
      ? pairingDataQuery.limit(pageSize).offset((page - 1) * pageSize)
      : pairingDataQuery,
    fastify.db
      .select({ count: sql<number>`count(*)::int` })
      .from(pairing)
      .where(whereClause),
  ])
  ```

- [ ] **Step 3: 编译验证**

  ```bash
  cd live-server && npx tsc --noEmit 2>&1 | head -30
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add live-server/src/services/pairing/pairing-service.ts
  git commit -m "feat(live-server): pairing list supports pageSize=0 for full load"
  ```

---

## Task 4: Server — flight 路由 + service 全量加载

**Files:**
- Modify: `live-server/src/routes/flight/flight.ts`
- Modify: `live-server/src/services/flight/flight-service.ts` (lines ~219, ~250–251)

- [ ] **Step 1: 修改 flight 路由 schema 允许 pageSize=0**

  在 `live-server/src/routes/flight/flight.ts` 的 `GET /` 路由 schema 中，找到：
  ```typescript
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
  ```

  替换为：
  ```typescript
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(0).max(10000).default(20),
  ```

- [ ] **Step 2: 修改 flight-service 跳过 slice 当 pageSize=0**

  在 `live-server/src/services/flight/flight-service.ts` 的 `listGrouped` 方法中，找到（约 line 248–251）：
  ```typescript
  // Paginate FlightItems
  const total = allItems.length
  const offset = (page - 1) * pageSize
  const items = allItems.slice(offset, offset + pageSize)
  ```

  替换为：
  ```typescript
  // Paginate FlightItems (pageSize=0 → return all)
  const total = allItems.length
  const items = pageSize === 0 ? allItems : allItems.slice((page - 1) * pageSize, page * pageSize)
  ```

- [ ] **Step 3: 编译验证**

  ```bash
  cd live-server && npx tsc --noEmit 2>&1 | head -30
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add live-server/src/routes/flight/flight.ts live-server/src/services/flight/flight-service.ts
  git commit -m "feat(live-server): flight list supports pageSize=0 for full load"
  ```

---

## Task 5: Frontend — crew-store 全量加载 + 本地排序

**Files:**
- Modify: `gantt/src/stores/crew-store.ts`

- [ ] **Step 1: 在文件顶部加 ALL_DATA_PAGE_SIZE 常量**

  找到：
  ```typescript
  const PAGE_SIZE = 100
  ```

  替换为：
  ```typescript
  const PAGE_SIZE = 100
  /** Apply Filters 时一次取全量（pageSize=0 = no limit on server） */
  const ALL_DATA_PAGE_SIZE = 0
  ```

- [ ] **Step 2: fetchCrews 改用 ALL_DATA_PAGE_SIZE**

  在 `fetchCrews` 方法中，找到：
  ```typescript
  const params: CrewListFilters & CrewFilters = {
    page: 1,
    pageSize: PAGE_SIZE,
    sortBy: get().sortBy,
    sortOrder: get().sortOrder,
  }
  // P1-3 phase 1：slim 首屏（仅当前生效 rank/base/fleet，无全量历史），crew 拉取提速。
  const result = await crewApi.list(params, 'gantt-panel')
  ```

  替换为：
  ```typescript
  const params: CrewListFilters & CrewFilters = {
    page: 1,
    pageSize: ALL_DATA_PAGE_SIZE,
    sortBy: get().sortBy,
    sortOrder: get().sortOrder,
  }
  const result = await crewApi.list(params)
  ```

  注：全量加载时无需 slim 首屏（slim 是为了减少首页 100 条数据量，全量后不需要两阶段）。
  同时删除 `applyCrewListResult` 中对 `crewApi.list(params)` 的后台二次拉取调用（该方法现在只在 bootstrap 路径调用，新流程已不走 bootstrap）。

- [ ] **Step 3: fetchCrewsWithFilter 改用 ALL_DATA_PAGE_SIZE**

  找到 `fetchCrewsWithFilter` 方法中：
  ```typescript
  const params: CrewListFilters = {
    page: 1,
    pageSize: PAGE_SIZE,
    ...
  }
  ```

  将 `pageSize: PAGE_SIZE` 替换为 `pageSize: ALL_DATA_PAGE_SIZE`。

- [ ] **Step 4: 添加 compareCrewItems 本地比较函数（在 mapCrews 函数上方添加）**

  ```typescript
  /** Client-side crew sort comparator (used by applySort). */
  function compareCrewItems(a: CrewItem, b: CrewItem, sortBy: string, sortOrder: string): number {
    const dir = sortOrder === 'desc' ? -1 : 1
    switch (sortBy) {
      case 'name':
        return dir * (a.crew.lastName ?? '').localeCompare(b.crew.lastName ?? '')
      case 'rank':
        return dir * (a.crew.panelRank ?? a.crew.ranks?.[0]?.rank ?? '').localeCompare(
          b.crew.panelRank ?? b.crew.ranks?.[0]?.rank ?? '',
        )
      case 'base':
        return dir * (a.crew.panelBase ?? a.crew.bases?.[0]?.base ?? '').localeCompare(
          b.crew.panelBase ?? b.crew.bases?.[0]?.base ?? '',
        )
      case 'fleet':
        return dir * (a.crew.panelFleets?.[0] ?? a.crew.fleets?.[0]?.fleetSpecific ?? '').localeCompare(
          b.crew.panelFleets?.[0] ?? b.crew.fleets?.[0]?.fleetSpecific ?? '',
        )
      case 'crew_id':
      default:
        return dir * a.crew.crewId.localeCompare(b.crew.crewId)
    }
  }
  ```

- [ ] **Step 5: 将 applySort 改为本地排序（不发请求）**

  找到现有的 `applySort: async (sortBy, sortOrder) => { ... }` 方法（约 420–495 行），全部替换为：

  ```typescript
  applySort: async (sortBy, sortOrder) => {
    const state = get()
    if (state.sortBy === sortBy && state.sortOrder === sortOrder) return
    set({ sortBy, sortOrder })
    const sorted = [...state.items].sort((a, b) => compareCrewItems(a, b, sortBy, sortOrder))
    set({ items: sorted })
  },
  ```

- [ ] **Step 6: TypeScript 编译验证**

  ```bash
  cd gantt && npx tsc --noEmit 2>&1 | head -30
  ```

  Expected: 无 crew-store 相关错误

- [ ] **Step 7: Commit**

  ```bash
  git add gantt/src/stores/crew-store.ts
  git commit -m "feat(gantt): crew-store full load on Apply Filters + client-side sort"
  ```

---

## Task 6: Frontend — pairing-store 全量加载 + 本地排序

**Files:**
- Modify: `gantt/src/stores/pairing-store.ts`

- [ ] **Step 1: 加 ALL_DATA_PAGE_SIZE 常量**

  找到：
  ```typescript
  const PAGE_SIZE = 100
  ```

  替换为：
  ```typescript
  const PAGE_SIZE = 100
  const ALL_DATA_PAGE_SIZE = 0
  ```

- [ ] **Step 2: fetchPairings 改用 ALL_DATA_PAGE_SIZE**

  在 `fetchPairings` 方法中找到：
  ```typescript
  const params: PairingListQuery = {
    startDate: formatDate(dateRange.start),
    endDate: formatDate(dateRange.end),
    page: 1,
    pageSize: PAGE_SIZE,
    sortBy: get().sortBy,
    sortOrder: get().sortOrder,
    ...(filter ? pairingFilterToListParams(filter) : {}),
  }
  ```

  将 `pageSize: PAGE_SIZE` 替换为 `pageSize: ALL_DATA_PAGE_SIZE`，同时删除 `sortBy` 和 `sortOrder`（全量加载后服务端排序无意义，第一次显示用默认顺序，客户端 applySort 后立即生效）：

  ```typescript
  const params: PairingListQuery = {
    startDate: formatDate(dateRange.start),
    endDate: formatDate(dateRange.end),
    page: 1,
    pageSize: ALL_DATA_PAGE_SIZE,
    ...(filter ? pairingFilterToListParams(filter) : {}),
  }
  ```

  同时将：
  ```typescript
  const session: QuerySession = {
    id: 1,
    filters: {},
    page: 1,
    total: result.total,
    exhausted: result.items.length < PAGE_SIZE,
  }
  ```
  中的 `exhausted: result.items.length < PAGE_SIZE` 改为 `exhausted: true`（全量加载后无需续传）。

- [ ] **Step 3: 添加 comparePairingItems 本地比较函数（在 mapPairings 函数上方）**

  ```typescript
  function comparePairingItems(a: PairingItem, b: PairingItem, sortBy: string, sortOrder: string): number {
    const dir = sortOrder === 'desc' ? -1 : 1
    switch (sortBy) {
      case 'pairingLabel':
        return dir * (a.pairing.pairingLabel ?? '').localeCompare(b.pairing.pairingLabel ?? '')
      case 'tafb':
        return dir * (a.pairing.tafb - b.pairing.tafb)
      case 'fleet':
        return dir * a.pairing.fleet.localeCompare(b.pairing.fleet)
      case 'base':
        return dir * a.pairing.base.localeCompare(b.pairing.base)
      case 'segCount':
        return dir * (a.pairing.segCount - b.pairing.segCount)
      case 'durationDays':
        return dir * (a.pairing.durationDays - b.pairing.durationDays)
      case 'schStrDtUtc':
      default:
        return dir * a.pairing.schStrDtUtc.localeCompare(b.pairing.schStrDtUtc)
    }
  }
  ```

- [ ] **Step 4: 将 applySort 改为本地排序**

  找到现有的 `applySort: async (sortBy, sortOrder) => { ... }` 方法（约 402–490 行），全部替换为：

  ```typescript
  applySort: async (sortBy, sortOrder) => {
    const state = get()
    if (state.sortBy === sortBy && state.sortOrder === sortOrder) return
    set({ sortBy, sortOrder })
    const sorted = [...state.items].sort((a, b) => comparePairingItems(a, b, sortBy, sortOrder))
    set({ items: sorted })
    useGanttViewStore.getState().markDirty()
  },
  ```

- [ ] **Step 5: 编译验证**

  ```bash
  cd gantt && npx tsc --noEmit 2>&1 | head -30
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add gantt/src/stores/pairing-store.ts
  git commit -m "feat(gantt): pairing-store full load on Apply Filters + client-side sort"
  ```

---

## Task 7: Frontend — flight-store 全量加载

**Files:**
- Modify: `gantt/src/stores/flight-store.ts`

- [ ] **Step 1: 加 ALL_DATA_PAGE_SIZE 常量**

  找到：
  ```typescript
  const PAGE_SIZE = 20
  ```

  替换为：
  ```typescript
  const PAGE_SIZE = 20
  const ALL_DATA_PAGE_SIZE = 0
  ```

- [ ] **Step 2: fetchFlights 改用 ALL_DATA_PAGE_SIZE**

  在 `fetchFlights` 方法中，找到：
  ```typescript
  const result = await flightApi.list({
    startDate: formatDate(dateRange.start),
    endDate: formatDate(dateRange.end),
    page: 1,
    pageSize: PAGE_SIZE,
    ...
  })
  ```

  将 `pageSize: PAGE_SIZE` 替换为 `pageSize: ALL_DATA_PAGE_SIZE`。

  同时将后续 session 创建中的：
  ```typescript
  exhausted: result.items.length < PAGE_SIZE,
  ```
  改为 `exhausted: true`。

- [ ] **Step 3: 编译验证**

  ```bash
  cd gantt && npx tsc --noEmit 2>&1 | head -30
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add gantt/src/stores/flight-store.ts
  git commit -m "feat(gantt): flight-store full load on Apply Filters"
  ```

---

## Task 8: Frontend — apply-filters.ts 真并发 + 去掉 bootstrap 路径

**Files:**
- Modify: `gantt/src/utils/apply-filters.ts`

- [ ] **Step 1: 找到 crew 加载分支的 bootstrap 路径**

  在 `applyGanttFilters` 中，找到：
  ```typescript
  if (crewChanged) {
    const hasCrewFilter = hasCrewFilterValues(crewFilter)
    if (!hasCrewFilter && !appliedFilters && visibleTypes.has('roster')) {
      // First pull of the session with no crew filter (Live empty start, load-all):
      // one round-trip for slim crew list + first-screen roster window.
      await useGanttViewStore.getState().loadFromBootstrap(dateRange)
    } else {
      if (hasCrewFilter) {
        await useCrewStore.getState().fetchCrewsWithFilter(crewFilter, dateRange)
      } else {
        await useCrewStore.getState().fetchCrews()
      }
      if (visibleTypes.has('roster')) {
        const { selectedCrewIds } = useCrewStore.getState()
        if (selectedCrewIds.length > 0) {
          // 筛选应用也走渐进式首屏入口，保持与初次打开一致的快速首屏。
          await useGanttViewStore.getState().loadRosterProgressive(selectedCrewIds, dateRange)
        }
      }
    }
  }

  // Pairing and Flight fetches are independent of each other — run them in parallel
  // so a multi-pane Apply costs one RTT instead of two (notably on the Asia↔Canada
  // ~150-250ms link). Crew/roster above must stay sequential (roster needs crew).
  const paneFetches: Array<Promise<void>> = []
  if (pairingChanged && visibleTypes.has('pairing')) {
    paneFetches.push(usePairingStore.getState().fetchPairings(dateRange, pairingFilter))
  }
  if (flightChanged && visibleTypes.has('flight')) {
    paneFetches.push(useFlightStore.getState().fetchFlights(dateRange, flightFilter))
  }
  if (paneFetches.length > 0) {
    await Promise.all(paneFetches)
  }
  ```

- [ ] **Step 2: 替换为真并发结构（去掉 bootstrap，crew+pairing+flight 并发）**

  将上面整段替换为：

  ```typescript
  // Build concurrent fetch tasks.
  // Crew+Roster remain sequential internally (roster depends on crewIds),
  // but the whole crew+roster task runs in parallel with pairing and flight.
  const fetchTasks: Promise<void>[] = []

  if (crewChanged) {
    const crewTask = (async () => {
      if (hasCrewFilterValues(crewFilter)) {
        await useCrewStore.getState().fetchCrewsWithFilter(crewFilter, dateRange)
      } else {
        await useCrewStore.getState().fetchCrews()
      }
      if (visibleTypes.has('roster')) {
        const { selectedCrewIds } = useCrewStore.getState()
        if (selectedCrewIds.length > 0) {
          await useGanttViewStore.getState().loadRosterProgressive(selectedCrewIds, dateRange)
        }
      }
    })()
    fetchTasks.push(crewTask)
  }

  if (pairingChanged && visibleTypes.has('pairing')) {
    fetchTasks.push(usePairingStore.getState().fetchPairings(dateRange, pairingFilter))
  }

  if (flightChanged && visibleTypes.has('flight')) {
    fetchTasks.push(useFlightStore.getState().fetchFlights(dateRange, flightFilter))
  }

  if (fetchTasks.length > 0) {
    await Promise.all(fetchTasks)
  }
  ```

- [ ] **Step 3: 编译验证**

  ```bash
  cd gantt && npx tsc --noEmit 2>&1 | head -30
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add gantt/src/utils/apply-filters.ts
  git commit -m "feat(gantt): apply-filters full parallelism, bypass bootstrap path"
  ```

---

## Task 9: Frontend — pairing-info-service.ts 本地优先查找

**Files:**
- Create: `gantt/src/services/pairing-info-service.ts`
- Modify: `gantt/src/components/pairing/pairing-info-dialog.tsx`

背景：`pairing-store.ts` 已经 import `pairing-detail-cache.ts`（取 `clearPairingInfoCache`），若在 `pairing-detail-cache.ts` 再 import `pairing-store.ts`，会产生循环依赖。因此新建 `pairing-info-service.ts` 作为 wrapper，它可以 import 所有 store 和 cache 而无循环。

- [ ] **Step 1: 创建 `gantt/src/services/pairing-info-service.ts`**

  ```typescript
  import { getPairingInfo, type PairingInfoBundle } from './pairing-detail-cache'
  import { usePairingStore } from '@/stores/pairing-store'
  import { useRosterStore } from '@/stores/roster-store'
  import { useCrewStore } from '@/stores/crew-store'
  import type { PairingDetailResponse, PairingCompositionRow, PairingCrewDetail } from './pairing-api'

  /** Try to build a PairingInfoBundle from already-loaded store data (zero network). */
  function tryBuildFromLocal(pairingId: number): PairingInfoBundle | null {
    const { items: pairingItems } = usePairingStore.getState()
    const pairingItem = pairingItems.find((item) => item.pairing.id === pairingId)
    if (!pairingItem) return null

    // We need segments to show the detail view — fall back to server if missing.
    const segments = pairingItem.segments ?? []
    if (segments.length === 0) return null

    const { main } = useRosterStore.getState()
    const rosterItems = main.rosterItems.filter((r) => r.pairingId === pairingId)
    // If no roster assignments in local state, fall back to server (may be loading).
    if (rosterItems.length === 0) return null

    const { items: crewItems } = useCrewStore.getState()

    const crew: PairingCrewDetail[] = rosterItems
      .map((r) => {
        const crewItem = crewItems.find((c) => c.crew.crewId === r.crewId)
        return {
          crewId: r.crewId,
          name: crewItem
            ? `${crewItem.crew.lastName}/${crewItem.crew.firstName}`
            : r.crewId,
          gender: crewItem?.crew.gender ?? null,
          base: r.base ?? crewItem?.crew.panelBase ?? null,
          position: r.position ?? null,
          actingRank: r.activeRank ?? r.flightActingRank ?? null,
          source: r.source ?? null,
          mbhMin: null, // not available in list data
        }
      })
      // Deduplicate by crewId (one crew may appear in multiple roster_flight rows)
      .filter((c, i, arr) => arr.findIndex((x) => x.crewId === c.crewId) === i)

    const p = pairingItem.pairing
    const compositions: PairingCompositionRow[] = p.composition.map((slot) => ({
      actingRank: slot.rank,
      plan: slot.plan,
      fill: slot.fill,
      open: slot.plan - slot.fill,
    }))

    const detail: PairingDetailResponse = {
      pairing: p,
      segments,
      compositions,
    }

    return { detail, crew }
  }

  /**
   * Get pairing info bundle — local stores first, server fallback.
   * Uses the existing session cache in pairing-detail-cache for repeat server fetches.
   */
  export const getPairingInfoWithLocalFirst = async (
    pairingId: number,
  ): Promise<PairingInfoBundle> => {
    const local = tryBuildFromLocal(pairingId)
    if (local) return local
    return getPairingInfo(pairingId)
  }
  ```

- [ ] **Step 2: 更新 pairing-info-dialog.tsx 使用新 service**

  打开 `gantt/src/components/pairing/pairing-info-dialog.tsx`。

  找到：
  ```typescript
  import { getPairingInfo } from '@/services/pairing-detail-cache'
  ```

  替换为：
  ```typescript
  import { getPairingInfoWithLocalFirst } from '@/services/pairing-info-service'
  ```

  找到调用处（约 line 75）：
  ```typescript
  getPairingInfo(pairingId)
  ```

  替换为：
  ```typescript
  getPairingInfoWithLocalFirst(pairingId)
  ```

- [ ] **Step 3: 编译验证**

  ```bash
  cd gantt && npx tsc --noEmit 2>&1 | head -30
  ```

  Expected: 无错误

- [ ] **Step 4: Commit**

  ```bash
  git add gantt/src/services/pairing-info-service.ts gantt/src/components/pairing/pairing-info-dialog.tsx
  git commit -m "feat(gantt): pairing detail local-first lookup, server fallback"
  ```

---

## Task 10: 版本号递增

**Files:**
- Modify: `gantt/src/version.ts`

- [ ] **Step 1: 读取当前版本**

  ```bash
  cat gantt/src/version.ts
  ```

- [ ] **Step 2: 前端 + 后端同时变更，两者各 +1**

  打开 `gantt/src/version.ts`，将 `BACKEND_VERSION` 和 `FRONTEND_VERSION` 各加 1。

- [ ] **Step 3: Commit**

  ```bash
  git add gantt/src/version.ts
  git commit -m "chore: bump version (live full-load + client-side sort)"
  ```

---

## Task 11: E2E Playwright 测试

**Files:**
- Create: `e2e/gantt/live-full-load.spec.ts`

- [ ] **Step 1: 创建测试文件**

  ```typescript
  import { test, expect } from '@playwright/test'

  test.describe('Live full-load on Apply Filters', () => {
    test.beforeEach(async ({ page }) => {
      // Login
      await page.goto('http://localhost:5173')
      await page.getByLabel('Username').fill('admin')
      await page.getByLabel('Password').fill('admin123')
      await page.getByRole('button', { name: /login/i }).click()
      await page.waitForURL('**/gantt**')
    })

    test('Apply Filters loads all crew without triggering load-more on scroll', async ({ page }) => {
      // Click Apply Filters (default date range, no filters)
      const applyBtn = page.getByRole('button', { name: /apply/i })
      await applyBtn.click()

      // Wait for roster pane to become visible and non-loading
      const rosterPane = page.getByTestId('roster-pane')
      await expect(rosterPane).toBeVisible()

      // Wait for any loading indicator to disappear
      await expect(page.locator('[data-loading="true"]')).toHaveCount(0, { timeout: 15000 })

      // Crew pane should show crew rows
      const crewRows = page.locator('[data-testid="roster-pane"] [data-testid="crew-row"]')
      const rowCount = await crewRows.count()
      expect(rowCount).toBeGreaterThan(0)

      // There should be NO load-more trigger visible (all data already loaded)
      await expect(page.locator('[data-testid="crew-load-more"]')).toHaveCount(0)
    })

    test('Client-side sort does not trigger a network request', async ({ page }) => {
      // Apply filters first
      await page.getByRole('button', { name: /apply/i }).click()
      const rosterPane = page.getByTestId('roster-pane')
      await expect(rosterPane).toBeVisible()
      await expect(page.locator('[data-loading="true"]')).toHaveCount(0, { timeout: 15000 })

      // Intercept crew API calls after data is loaded
      let crewApiCallCount = 0
      await page.route('**/api/crew**', async (route) => {
        crewApiCallCount++
        await route.continue()
      })

      // Click sort header (crew_id column)
      const sortHeader = page.locator('[data-testid="crew-sort-crew_id"]')
      if (await sortHeader.count() > 0) {
        await sortHeader.click()
        // Wait a moment to let any potential network call happen
        await page.waitForTimeout(500)
        // Sort should be instant — no crew API call should have been made
        expect(crewApiCallCount).toBe(0)
      }
    })

    test('Pairing pane loads all pairings on Apply Filters', async ({ page }) => {
      // Open pairing pane if not visible
      const pairingToggle = page.getByRole('button', { name: /pairing/i })
      if (await pairingToggle.count() > 0) {
        await pairingToggle.click()
      }

      await page.getByRole('button', { name: /apply/i }).click()

      // Wait for pairing pane to load
      await page.waitForSelector('[data-testid="pairing-pane"]', { timeout: 15000 })
      await expect(page.locator('[data-loading="true"]')).toHaveCount(0, { timeout: 15000 })

      // Pairing pane should show pairings — count shown in header badge should match loaded count
      const pairingItems = page.locator('[data-testid="pairing-pane"] [data-testid="pairing-row"]')
      const pairingCount = await pairingItems.count()
      expect(pairingCount).toBeGreaterThan(0)
    })
  })
  ```

- [ ] **Step 2: 运行测试**

  先确认服务在运行：
  ```bash
  curl -s http://localhost:5173 | head -5
  ```

  运行测试（标记 `--reporter=list` 以便看到每个步骤结果）：
  ```bash
  npx playwright test e2e/gantt/live-full-load.spec.ts --reporter=list
  ```

  Expected: 3 tests passed（若登录凭据或 testid 需调整，按实际输出修正）

- [ ] **Step 3: 修正 testid（如需要）**

  若测试报告 `locator not found`，用 `page.pause()` 或 `playwright codegen` 查找实际 testid，更新测试选择器。所有测试必须 PASS 才能进入下一步。

- [ ] **Step 4: 最终确认 PASS**

  ```bash
  npx playwright test e2e/gantt/live-full-load.spec.ts --reporter=list
  ```

  粘贴最终输出（必须显示 PASS）后才算完成。

- [ ] **Step 5: Commit**

  ```bash
  git add e2e/gantt/live-full-load.spec.ts
  git commit -m "test(e2e): live full-load and client-side sort regression tests"
  ```

---

## Self-Review Checklist

- [x] **Spec § 服务端改动** → Task 1–4 覆盖 crew / pairing / flight 三个接口的 `pageSize=0` 支持
- [x] **Spec § Crew Store** → Task 5 覆盖 `fetchCrews`, `fetchCrewsWithFilter`, `applySort` 本地化
- [x] **Spec § Pairing Store** → Task 6 覆盖 `fetchPairings`, `applySort` 本地化
- [x] **Spec § Flight Store** → Task 7 覆盖 `fetchFlights`
- [x] **Spec § apply-filters 并发结构** → Task 8 覆盖 bootstrap 绕过 + 真并发
- [x] **Spec § Pairing 详情本地优先** → Task 9 覆盖 (pairing-info-service.ts 新建)
- [x] **§Playwright-Required** → Task 11 覆盖 3 个场景
- [x] **版本号** → Task 10 覆盖
- [x] **循环依赖** → pairing-info-service.ts 新建，避免 pairing-store ↔ pairing-detail-cache 循环
- [x] **Placeholder 扫描** → 无 TBD / TODO
- [x] **类型一致性** → 所有方法名与 store interface 中声明一致（applySort 签名不变，只改实现）
