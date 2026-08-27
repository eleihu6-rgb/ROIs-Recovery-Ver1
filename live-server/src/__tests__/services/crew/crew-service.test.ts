import { describe, it, expect, vi, beforeEach } from 'vitest'
import { crewService } from '../../../services/crew/crew-service.js'

vi.mock('../../../utils/cache.js', () => ({
  getOrSet: vi.fn((_redis, _key, _ttl, fetchFn) => fetchFn()),
  invalidate: vi.fn(),
  invalidatePattern: vi.fn(),
}))

vi.mock('../../../utils/audit.js', () => ({
  auditCreate: vi.fn((u: string) => ({ createdBy: u, createdAt: new Date(), updatedBy: u, updatedAt: new Date() })),
  auditUpdate: vi.fn((u: string) => ({ updatedBy: u, updatedAt: new Date() })),
}))

import { invalidate, invalidatePattern } from '../../../utils/cache.js'

const mockCrew = {
  id: 1,
  crewId: 'C001',
  firstName: 'John',
  lastName: 'Doe',
  division: 'P',
  gender: 'M',
  status: 0,
}

const createChainableDb = () => {
  const chain: any = {}
  const methods = [
    'select', 'from', 'where', 'limit', 'orderBy', 'offset',
    'insert', 'values', 'update', 'set', 'delete', '$dynamic',
  ]
  for (const m of methods) {
    chain[m] = vi.fn(() => chain)
  }
  chain.returning = vi.fn().mockResolvedValue([])
  chain.transaction = vi.fn()
  chain.then = vi.fn((resolve: any) => resolve([]))
  return chain
}

const createFastify = () => {
  const db = createChainableDb()
  return { db, redis: {} as any, log: { info: vi.fn() } as any } as any
}

describe('crewService', () => {
  let fastify: ReturnType<typeof createFastify>

  beforeEach(() => {
    vi.clearAllMocks()
    fastify = createFastify()
  })

  // ---------- list ----------

  describe('list', () => {
    it('should return paginated crew list', async () => {
      // crew list does: count query (select...from...where -> await), items query (select...from...where...orderBy...limit...offset -> await)
      // Then batch queries for rank/fleet quals
      let thenCallCount = 0
      fastify.db.then.mockImplementation((resolve: any) => {
        thenCallCount++
        if (thenCallCount === 1) return resolve([{ count: 1 }])    // count query
        if (thenCallCount === 2) return resolve([mockCrew])          // items query
        return resolve([])
      })

      const result = await crewService.list(fastify, {}, { page: 1, pageSize: 10 })

      expect(result.items).toEqual([{
        ...mockCrew,
        quals: {
          division: 'P',
          rank: '',
          fleetQuals: [],
          airportQuals: [],
        },
        // P1-3: 当前生效值（full 模式也附带，slim 模式首屏即可用）
        panelRank: null,
        panelBase: null,
        panelFleets: [],
        // full 模式（非 slim）附带历史数组
        ranks: [],
        bases: [],
        fleets: [],
      }])
      expect(result.total).toBe(1)
      expect(result.page).toBe(1)
      expect(result.totalPages).toBe(1)
    })

    it('slim mode returns current panel values but omits history arrays', async () => {
      let thenCallCount = 0
      fastify.db.then.mockImplementation((resolve: any) => {
        thenCallCount++
        if (thenCallCount === 1) return resolve([{ count: 1 }]) // count
        if (thenCallCount === 2) return resolve([mockCrew])     // items
        return resolve([])                                       // current rank/fleet/base
      })

      const result = await crewService.list(fastify, {}, { page: 1, pageSize: 10 }, { slim: true })

      const item = result.items[0] as Record<string, unknown>
      // 首屏当前值在场（供左面板立即显示）
      expect(item).toHaveProperty('panelRank', null)
      expect(item).toHaveProperty('panelBase', null)
      expect(item).toHaveProperty('panelFleets', [])
      // slim 模式不附带历史数组（首屏后由前端后台补拉），证明确实跳过了 3 个历史查询
      expect(item).not.toHaveProperty('ranks')
      expect(item).not.toHaveProperty('bases')
      expect(item).not.toHaveProperty('fleets')
    })

    it('should apply division filter', async () => {
      let thenCallCount = 0
      fastify.db.then.mockImplementation((resolve: any) => {
        thenCallCount++
        if (thenCallCount === 1) return resolve([{ count: 0 }])
        if (thenCallCount === 2) return resolve([])
        return resolve([])
      })

      const result = await crewService.list(
        fastify,
        { division: 'P' },
        { page: 1, pageSize: 20 },
      )

      expect(result.items).toEqual([])
      expect(fastify.db.where).toHaveBeenCalled()
    })

    it('should apply search filter', async () => {
      let thenCallCount = 0
      fastify.db.then.mockImplementation((resolve: any) => {
        thenCallCount++
        if (thenCallCount === 1) return resolve([{ count: 1 }])
        if (thenCallCount === 2) return resolve([mockCrew])
        return resolve([])
      })

      const result = await crewService.list(
        fastify,
        { search: 'John' },
        { page: 1, pageSize: 20 },
      )

      expect(result.total).toBe(1)
    })
  })

  // ---------- getById ----------

  describe('getById', () => {
    it('should return crew when found', async () => {
      fastify.db.then.mockImplementation((resolve: any) => resolve([mockCrew]))

      const result = await crewService.getById(fastify, 1)

      expect(result).toEqual(mockCrew)
    })

    it('should return null when not found', async () => {
      fastify.db.then.mockImplementation((resolve: any) => resolve([]))

      const result = await crewService.getById(fastify, 999)

      expect(result).toBeNull()
    })
  })

  // ---------- getDetail ----------

  describe('getDetail', () => {
    it('should return crew with current effective sub-records', async () => {
      const rankRow = { crewId: 'C001', rank: 'CPT' }
      const baseRow = { crewId: 'C001', base: 'PEK' }
      const fleetRow = { crewId: 'C001', fleetSpecific: '737' }
      const statusRow = { crewId: 'C001', status: 'ACTIVE' }
      const teamRow = { crewId: 'C001', team: 'T1' }

      let thenCallCount = 0
      fastify.db.then.mockImplementation((resolve: any) => {
        thenCallCount++
        if (thenCallCount === 1) return resolve([mockCrew])        // crew lookup
        if (thenCallCount === 2) return resolve([rankRow])          // rank
        if (thenCallCount === 3) return resolve([baseRow])          // base
        if (thenCallCount === 4) return resolve([fleetRow])         // fleet
        if (thenCallCount === 5) return resolve([statusRow])        // status
        if (thenCallCount === 6) return resolve([teamRow])          // team
        return resolve([])
      })

      const result = await crewService.getDetail(fastify, 1)

      expect(result).toMatchObject({
        ...mockCrew,
        currentRank: rankRow,
        currentBase: baseRow,
        currentFleet: fleetRow,
        currentStatus: statusRow,
        currentTeam: teamRow,
      })
    })

    it('should return null when crew not found', async () => {
      fastify.db.then.mockImplementation((resolve: any) => resolve([]))

      const result = await crewService.getDetail(fastify, 999)

      expect(result).toBeNull()
    })

    it('should return null sub-records when none are effective', async () => {
      let thenCallCount = 0
      fastify.db.then.mockImplementation((resolve: any) => {
        thenCallCount++
        if (thenCallCount === 1) return resolve([mockCrew])
        return resolve([])
      })

      const result = await crewService.getDetail(fastify, 1)

      expect(result).toMatchObject({
        currentRank: null,
        currentBase: null,
        currentFleet: null,
        currentStatus: null,
        currentTeam: null,
      })
    })
  })

  // ---------- create ----------

  describe('create', () => {
    it('should insert crew and invalidate list cache', async () => {
      const created = { ...mockCrew, id: 2 }
      fastify.db.returning.mockResolvedValue([created])

      const result = await crewService.create(fastify, mockCrew as any, 'admin')

      expect(result).toEqual(created)
      expect(fastify.db.insert).toHaveBeenCalled()
      expect(invalidatePattern).toHaveBeenCalledWith(fastify.redis, 'crew:list:*')
    })
  })

  // ---------- update ----------

  describe('update', () => {
    it('should update crew and invalidate item + list caches', async () => {
      const updated = { ...mockCrew, firstName: 'Jane' }
      fastify.db.returning.mockResolvedValue([updated])

      const result = await crewService.update(fastify, 1, { firstName: 'Jane' } as any, 'admin')

      expect(result).toEqual(updated)
      expect(invalidate).toHaveBeenCalledWith(fastify.redis, 'crew:1', 'crew:detail:1')
      expect(invalidatePattern).toHaveBeenCalledWith(fastify.redis, 'crew:list:*')
    })

    it('should return null when crew not found', async () => {
      fastify.db.returning.mockResolvedValue([])

      const result = await crewService.update(fastify, 999, { firstName: 'X' } as any, 'admin')

      expect(result).toBeNull()
      expect(invalidate).not.toHaveBeenCalled()
    })
  })

  // ---------- remove ----------

  describe('remove', () => {
    it('should soft-delete crew (set status = -1) and invalidate caches', async () => {
      const removed = { ...mockCrew, status: -1 }
      fastify.db.returning.mockResolvedValue([removed])

      const result = await crewService.remove(fastify, 1, 'admin')

      expect(result).toEqual(removed)
      expect(fastify.db.update).toHaveBeenCalled()
      expect(invalidate).toHaveBeenCalledWith(fastify.redis, 'crew:1', 'crew:detail:1')
      expect(invalidatePattern).toHaveBeenCalledWith(fastify.redis, 'crew:list:*')
    })

    it('should return null when crew not found for removal', async () => {
      fastify.db.returning.mockResolvedValue([])

      const result = await crewService.remove(fastify, 999, 'admin')

      expect(result).toBeNull()
    })
  })

  // ---------- KPI Adjust ----------

  describe('listKpiAdjust', () => {
    it('should return kpi adjustments for crew', async () => {
      const kpis = [{ id: 1, crewId: 'C001', adjustDate: '2026-01-01' }]
      fastify.db.then.mockImplementation((resolve: any) => resolve(kpis))

      const result = await crewService.listKpiAdjust(fastify, 'C001')

      expect(result).toEqual(kpis)
    })
  })

  describe('createKpiAdjust', () => {
    it('should insert kpi adjust record', async () => {
      const created = { id: 2, crewId: 'C001' }
      fastify.db.returning.mockResolvedValue([created])

      const result = await crewService.createKpiAdjust(fastify, { crewId: 'C001' } as any, 'admin')

      expect(result).toEqual(created)
    })
  })

  describe('removeKpiAdjust', () => {
    it('should hard-delete kpi adjust record', async () => {
      const removed = { id: 1, crewId: 'C001' }
      fastify.db.returning.mockResolvedValue([removed])

      const result = await crewService.removeKpiAdjust(fastify, 1)

      expect(result).toEqual(removed)
      expect(fastify.db.delete).toHaveBeenCalled()
    })

    it('should return null when not found', async () => {
      fastify.db.returning.mockResolvedValue([])

      const result = await crewService.removeKpiAdjust(fastify, 999)

      expect(result).toBeNull()
    })
  })
})
