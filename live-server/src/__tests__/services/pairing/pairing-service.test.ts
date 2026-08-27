import { describe, it, expect, vi, beforeEach } from 'vitest'
import { pairingService } from '../../../services/pairing/pairing-service.js'

vi.mock('../../../utils/cache.js', () => ({
  getOrSet: vi.fn((_redis, _key, _ttl, fetchFn) => fetchFn()),
  invalidate: vi.fn(),
  invalidatePattern: vi.fn(),
}))

vi.mock('../../../utils/audit.js', () => ({
  auditCreate: vi.fn((u: string) => ({ createdBy: u, createdAt: new Date(), updatedBy: u, updatedAt: new Date() })),
  auditUpdate: vi.fn((u: string) => ({ updatedBy: u, updatedAt: new Date() })),
}))

vi.mock('../../../services/pairing/pairing-tafb-service.js', () => ({
  refreshPairingTafb: vi.fn(),
}))

import { invalidate, invalidatePattern } from '../../../utils/cache.js'
import { refreshPairingTafb } from '../../../services/pairing/pairing-tafb-service.js'

const mockPairing = {
  id: 1,
  pairingLabel: 'P001',
  schStrDtUtc: new Date('2026-03-01T00:00:00Z'),
  isDeleted: 0,
}

const createChainableDb = () => {
  const chain: any = {}
  const methods = [
    'select', 'selectDistinctOn', 'from', 'innerJoin', 'leftJoin', 'where', 'limit', 'orderBy', 'offset', 'groupBy',
    'insert', 'values', 'update', 'set', 'delete', '$dynamic',
  ]
  for (const m of methods) {
    chain[m] = vi.fn(() => chain)
  }
  chain.returning = vi.fn().mockResolvedValue([])
  chain.transaction = vi.fn(async (fn: (tx: typeof chain) => unknown) => fn(chain))
  chain.then = vi.fn((resolve: any) => resolve([]))
  return chain
}

const createFastify = () => {
  const db = createChainableDb()
  return { db, redis: {} as any, log: { info: vi.fn() } as any } as any
}

describe('pairingService', () => {
  let fastify: ReturnType<typeof createFastify>

  beforeEach(() => {
    vi.clearAllMocks()
    fastify = createFastify()
  })

  // ---------- list ----------

  describe('list', () => {
    it('should return paginated pairing list', async () => {
      let thenCallCount = 0
      fastify.db.then.mockImplementation((resolve: any) => {
        thenCallCount++
        if (thenCallCount === 1) return resolve([mockPairing])
        if (thenCallCount === 2) return resolve([{ count: 1 }])
        return resolve([])
      })

      const result = await pairingService.list(fastify, {
        startDate: '2026-03-01',
        endDate: '2026-03-31',
        page: 1,
        pageSize: 20,
      })

      // The list method enriches items with composition, isFull, and segments
      expect(result.items).toEqual([{
        ...mockPairing,
        composition: [],
        isFull: true,
        segments: [],
      }])
      expect(result.total).toBe(1)
    })

    it('summary view omits the segments array (lighter list rows), keeps composition + isFull', async () => {
      let thenCallCount = 0
      fastify.db.then.mockImplementation((resolve: any) => {
        thenCallCount++
        if (thenCallCount === 1) return resolve([mockPairing]) // items
        if (thenCallCount === 2) return resolve([{ count: 1 }]) // count
        return resolve([]) // compositions only — segments are NOT fetched in summary mode
      })

      const result = await pairingService.list(fastify, {
        startDate: '2026-03-01',
        endDate: '2026-03-31',
        page: 1,
        pageSize: 20,
        view: 'summary',
      })

      expect(result.items).toHaveLength(1)
      // Smaller payload: the segments array is omitted entirely (detail mode includes it).
      expect(result.items[0]).not.toHaveProperty('segments')
      // Coverage info still present.
      expect(result.items[0]).toMatchObject({ ...mockPairing, composition: [], isFull: true })
    })
  })

  // ---------- getById ----------

  describe('getById', () => {
    it('should return pairing with segments and compositions when found', async () => {
    const segments = [{ id: 10, pairingId: 1, dutySeq: 1, segSeq: 1 }]
    const compositions = [{ id: 20, pairingId: 1, isDeleted: 0 }]
      const rosterDutyRefs = [
        { crewId: 'C001', pairingId: 1, dutySeq: 1, dutyRefTz: -300 },
        { crewId: 'C002', pairingId: 1, dutySeq: 1, dutyRefTz: 60 },
      ]

      let thenCallCount = 0
      fastify.db.then.mockImplementation((resolve: any) => {
        thenCallCount++
        if (thenCallCount === 1) return resolve([mockPairing])    // pairing row
        if (thenCallCount === 2) return resolve(segments)          // segments
        if (thenCallCount === 3) return resolve(compositions)      // compositions
        if (thenCallCount === 4) return resolve(rosterDutyRefs)    // crew-specific 7500 refs
        return resolve([])
      })

      const result = await pairingService.getById(fastify, 1)

      expect(result).toEqual({ ...mockPairing, segments, compositions, rosterDutyRefs })
    })

    it('should return null when pairing not found', async () => {
      fastify.db.then.mockImplementation((resolve: any) => resolve([]))

      const result = await pairingService.getById(fastify, 999)

      expect(result).toBeNull()
    })
  })

  describe('listCrewDetail', () => {
    it('returns crew pairing credit summed from per-duty roster credit fallback', async () => {
      let thenCallCount = 0
      fastify.db.then.mockImplementation((resolve: any) => {
        thenCallCount++
        if (thenCallCount === 1) return resolve([{ division: 'P', schStr: new Date('2026-07-01T00:00:00Z') }])
        if (thenCallCount === 2) return resolve([{
          crewId: 'C001',
          base: '',
          position: 'CA',
          actingRank: 'CA',
          source: 'CR',
          firstName: 'Ada',
          lastName: 'Crew',
          gender: null,
        }])
        if (thenCallCount === 3) return resolve([{ crewId: 'C001', base: 'YVR' }])
        if (thenCallCount === 4) return resolve([{ crewId: 'C001', blh: 1234 }])
        if (thenCallCount === 5) return resolve([
          { crewId: 'C001', dutySeq: 1, credit: '240.00' },
          { crewId: 'C001', dutySeq: 2, credit: '180.00' },
        ])
        return resolve([])
      })

      const result = await pairingService.listCrewDetail(fastify, 100)

      expect(result).toEqual([expect.objectContaining({
        crewId: 'C001',
        name: 'Ada Crew',
        base: 'YVR',
        mbhMin: 1234,
        creditMin: 420,
      })])
    })
  })

  // ---------- create ----------

  describe('create', () => {
    it('should insert pairing and invalidate list cache', async () => {
      const created = { ...mockPairing, id: 2 }
      fastify.db.returning.mockResolvedValue([created])

      const result = await pairingService.create(fastify, mockPairing as any, 'admin')

      expect(result).toEqual(created)
      expect(invalidatePattern).toHaveBeenCalledWith(fastify.redis, 'pairing:list:*')
    })
  })

  describe('createFromFlights', () => {
    it('refreshes PBS calendar days after creating the pairing segments', async () => {
      const flight = {
        id: 101,
        fltNum: 'F8101',
        fltDt: '2026-07-11',
        airline: 'F8',
        depArp: 'YYZ',
        arvArp: 'YUL',
        fleet: '7M8',
        flightAssignment: 'FLY',
        schDepDtUtc: new Date('2026-07-11T14:00:00Z'),
        schArvDtUtc: new Date('2026-07-11T16:00:00Z'),
        actDepDtUtc: new Date('2026-07-11T14:00:00Z'),
        actArvDtUtc: new Date('2026-07-11T16:00:00Z'),
      }
      fastify.db.then.mockImplementation((resolve: (value: unknown) => unknown) => resolve([flight]))
      fastify.db.returning
        .mockResolvedValueOnce([{ ...mockPairing, id: 42 }])
        .mockResolvedValueOnce([{ id: 84, pairingId: 42 }])

      await pairingService.createFromFlights(fastify, [flight.id], 'YYZ', 'P', 'admin')

      expect(refreshPairingTafb).toHaveBeenCalledWith(fastify.db, 42, 'admin')
    })
  })

  // ---------- update ----------

  describe('update', () => {
    it('should update pairing and invalidate caches', async () => {
      const updated = { ...mockPairing, pairingLabel: 'P001-v2' }
      fastify.db.returning.mockResolvedValue([updated])

      const result = await pairingService.update(fastify, 1, { pairingLabel: 'P001-v2' } as any, 'admin')

      expect(result).toEqual(updated)
      expect(invalidate).toHaveBeenCalledWith(fastify.redis, 'pairing:1')
      expect(invalidatePattern).toHaveBeenCalledWith(fastify.redis, 'pairing:list:*')
    })

    it('should refresh PBS calendar days when pairing base changes', async () => {
      const updated = { ...mockPairing, base: 'YVR' }
      fastify.db.returning.mockResolvedValue([updated])

      await pairingService.update(fastify, 1, { base: 'YVR' } as any, 'admin')

      expect(refreshPairingTafb).toHaveBeenCalledWith(fastify.db, 1, 'admin')
    })
  })

  // ---------- remove ----------

  describe('remove', () => {
    it('should throw 409 when roster_flight references the pairing', async () => {
      // Mock: select returns a rostered row
      fastify.db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 99 }]),
          }),
        }),
      })

      await expect(pairingService.remove(fastify, 1))
        .rejects.toMatchObject({ statusCode: 409, message: /rostered crew/ })
    })

    it('should hard-delete pairing and invalidate caches when no roster_flight', async () => {
      // Mock: select returns no rostered rows
      fastify.db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      })
      // Mock: transaction executes callback
      fastify.db.transaction = vi.fn().mockImplementation((cb: (tx: unknown) => Promise<void>) =>
        cb({ delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
      )

      await pairingService.remove(fastify, 1)

      expect(fastify.db.transaction).toHaveBeenCalled()
      expect(invalidate).toHaveBeenCalledWith(fastify.redis, 'pairing:1')
      expect(invalidatePattern).toHaveBeenCalledWith(fastify.redis, 'pairing:list:*')
    })
  })

  // ---------- Compositions ----------

  describe('getCompositions', () => {
    it('should return compositions for a pairing', async () => {
      const comps = [{ id: 1, pairingId: 1, isDeleted: 0 }]
      fastify.db.then.mockImplementation((resolve: any) => resolve(comps))

      const result = await pairingService.getCompositions(fastify, 1)

      expect(result).toEqual(comps)
    })
  })

  describe('createComposition', () => {
    it('should insert composition and invalidate related caches', async () => {
      const created = { id: 5, pairingId: 1 }
      fastify.db.returning.mockResolvedValue([created])

      const result = await pairingService.createComposition(fastify, { pairingId: 1 } as any, 'admin')

      expect(result).toEqual(created)
      expect(invalidate).toHaveBeenCalledWith(fastify.redis, 'pairing:comp:1', 'pairing:1')
    })
  })

  // ---------- Memos ----------

  describe('getMemos', () => {
    it('should return memos ordered by timestamp desc', async () => {
      const memos = [{ id: 1, pairingId: 1, tmst: new Date() }]
      fastify.db.then.mockImplementation((resolve: any) => resolve(memos))

      const result = await pairingService.getMemos(fastify, 1)

      expect(result).toEqual(memos)
    })
  })

  describe('deleteMemo', () => {
    it('should hard-delete memo', async () => {
      fastify.db.then.mockImplementation((resolve: any) => resolve(undefined))

      await pairingService.deleteMemo(fastify, 1)

      expect(fastify.db.delete).toHaveBeenCalled()
    })
  })

  // ---------- importFromScenario ----------

  describe('importFromScenario', () => {
    it('should import when scenario is DONE', async () => {
      fastify.db.then.mockImplementation((resolve: any) => resolve([{ id: 10, name: 'SC1', status: 'DONE' }]))

      const result = await pairingService.importFromScenario(fastify, 10, 'admin')

      expect(result).toEqual({ scenarioId: 10, scenarioName: 'SC1', status: 'IMPORTED' })
    })

    it('should throw when scenario not found', async () => {
      fastify.db.then.mockImplementation((resolve: any) => resolve([]))

      await expect(pairingService.importFromScenario(fastify, 999, 'admin')).rejects.toThrow('Scenario not found')
    })

    it('should throw when scenario is not DONE', async () => {
      fastify.db.then.mockImplementation((resolve: any) => resolve([{ id: 10, name: 'SC1', status: 'DRAFT' }]))

      await expect(pairingService.importFromScenario(fastify, 10, 'admin')).rejects.toThrow('Scenario must be in DONE status')
    })
  })

  // ---------- FK / null sentinel ----------

  describe('ground task null sentinel', () => {
    it('remove should use null check for roster_flight, not pairingId === 0', async () => {
      // The service queries rosterFlight where pairingId = id (a real pairing id, not 0).
      // Verify select is called (not skipped) — ensuring no 0-sentinel assumption.
      fastify.db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      })
      fastify.db.transaction = vi.fn().mockImplementation((cb: (tx: unknown) => Promise<void>) =>
        cb({ delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
      )

      await pairingService.remove(fastify, 42)

      // select must have been called to check roster_flight
      expect(fastify.db.select).toHaveBeenCalled()
    })
  })
})
