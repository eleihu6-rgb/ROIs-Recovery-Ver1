import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flightService } from '../../../services/flight/flight-service.js'

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

const mockFlight = {
  id: 1,
  fltNum: 'CA101',
  fltDt: '2026-03-01',
  depArp: 'PEK',
  arvArp: 'PVG',
  isDeleted: 0,
}

/**
 * Create a chainable mock db where every method returns `this` so any
 * chain like select().from().where().orderBy().limit().offset() works.
 * Terminal awaits resolve via the `then` property.
 */
const createChainableDb = () => {
  const chain: any = {}
  const methods = [
    'select', 'selectDistinct', 'from', 'where', 'limit', 'orderBy', 'offset',
    'insert', 'values', 'update', 'set', 'delete', '$dynamic',
  ]
  for (const m of methods) {
    chain[m] = vi.fn(() => chain)
  }
  chain.returning = vi.fn().mockResolvedValue([])
  chain.transaction = vi.fn()
  // Make the chain thenable so `await db.select().from()...` resolves
  chain.then = vi.fn((resolve: any) => resolve([]))
  return chain
}

const createFastify = () => {
  const db = createChainableDb()
  return { db, redis: {} as any, log: { info: vi.fn() } as any } as any
}

describe('flightService', () => {
  let fastify: ReturnType<typeof createFastify>

  beforeEach(() => {
    vi.clearAllMocks()
    fastify = createFastify()
  })

  // ---------- list ----------

  describe('list', () => {
    it('should return all flights for date range', async () => {
      fastify.db.then.mockImplementation((resolve: any) => resolve([mockFlight]))

      const result = await flightService.list(fastify, {
        startDate: '2026-03-01',
        endDate: '2026-03-31',
      })

      expect(result.items).toEqual([mockFlight])
      expect(result.total).toBe(1)
    })

    it('should apply optional filters', async () => {
      fastify.db.then.mockImplementation((resolve: any) => resolve([]))

      const result = await flightService.list(fastify, {
        startDate: '2026-03-01',
        endDate: '2026-03-31',
        depArp: 'PEK',
        arvArp: 'PVG',
        fltNum: 'CA',
      })

      expect(result.items).toEqual([])
      expect(result.total).toBe(0)
    })
  })

  // ---------- listGrouped ----------

  describe('listGrouped', () => {
    // toFlightApi needs real Date fields, so this fixture is fuller than mockFlight.
    const flightRow = {
      id: 1, airline: 'CA', fltDt: '2026-03-01', fltNum: 'CA101', depArp: 'PEK', arvArp: 'PVG',
      schDepDtUtc: new Date('2026-03-01T02:00:00Z'), schArvDtUtc: new Date('2026-03-01T04:00:00Z'),
      actDepDtUtc: null, actArvDtUtc: null, actDepArp: '', actArvArp: '',
      flightFlag: '', blkMin: 120, fleet: '320', register: 'B-001', fltType: 'J', fltSts: 'OK', isDeleted: 0,
    }

    it('grouped mode (default) bin-packs flights into FlightItems', async () => {
      fastify.db.then.mockImplementation((resolve: any) => resolve([flightRow]))

      const result: any = await flightService.listGrouped(fastify, {
        startDate: '2026-03-01', endDate: '2026-03-31', page: 1, pageSize: 20,
      })

      // FlightItem shape: registration + flights[] (grouped), NOT flat rows.
      expect(result.items[0]).toHaveProperty('flights')
      expect(result.items[0].registration).toBe('B-001')
      expect(result.items[0].flights[0]).toMatchObject({ id: 1, fltNum: 'CA101' })
      expect(result.total).toBe(1)
      expect(result.flightTotal).toBe(1)
      // Default mode does NOT carry the grouping='none' marker.
      expect(result.grouping).toBeUndefined()
    })

    it('grouped mode: flightTotal counts legs; total counts RegNo rows after bin-pack split', async () => {
      // Two overlapping legs on the same register → two FlightItems (B-001 + B-001#2).
      const overlapping = [
        {
          ...flightRow,
          id: 1,
          schDepDtUtc: new Date('2026-03-01T02:00:00Z'),
          schArvDtUtc: new Date('2026-03-01T06:00:00Z'),
        },
        {
          ...flightRow,
          id: 2,
          fltNum: 'CA102',
          schDepDtUtc: new Date('2026-03-01T03:00:00Z'),
          schArvDtUtc: new Date('2026-03-01T07:00:00Z'),
        },
      ]
      fastify.db.then.mockImplementation((resolve: any) => resolve(overlapping))

      const result: any = await flightService.listGrouped(fastify, {
        startDate: '2026-03-01', endDate: '2026-03-31', page: 1, pageSize: 0,
      })

      expect(result.flightTotal).toBe(2)
      expect(result.total).toBe(2)
      expect(result.total).toBe(result.items.length)
      expect(result.items.map((i: { registration: string }) => i.registration).sort())
        .toEqual(['B-001', 'B-001#2'])
    })

    it('summary mode (grouping=none) returns flat SQL-paginated rows with total + grouping flag', async () => {
      let thenCallCount = 0
      fastify.db.then.mockImplementation((resolve: any) => {
        thenCallCount++
        if (thenCallCount === 1) return resolve([flightRow, { ...flightRow, id: 2 }]) // paginated rows
        if (thenCallCount === 2) return resolve([{ count: 2 }]) // count(*)
        return resolve([])
      })

      const result: any = await flightService.listGrouped(fastify, {
        startDate: '2026-03-01', endDate: '2026-03-31', page: 1, pageSize: 20, grouping: 'none',
      })

      expect(result.grouping).toBe('none')
      expect(result.total).toBe(2)
      expect(result.flightTotal).toBe(2)
      expect(result.items).toHaveLength(2)
      // Flat FlightApi rows, NOT grouped FlightItems.
      expect(result.items[0]).not.toHaveProperty('flights')
      expect(result.items[0]).toMatchObject({ id: 1, fltNum: 'CA101' })
      // Windowing happens in SQL (limit/offset), not in memory.
      expect(fastify.db.limit).toHaveBeenCalledWith(20)
      expect(fastify.db.offset).toHaveBeenCalledWith(0)
    })
  })

  // ---------- getById ----------

  describe('getById', () => {
    it('should return flight with compositions when found', async () => {
      const compositions = [{ id: 10, fltId: 1, rankCode: 'CPT' }]

      let thenCallCount = 0
      fastify.db.then.mockImplementation((resolve: any) => {
        thenCallCount++
        if (thenCallCount === 1) return resolve([mockFlight])    // flight row
        if (thenCallCount === 2) return resolve(compositions)     // compositions
        return resolve([])
      })

      const result = await flightService.getById(fastify, 1)

      expect(result).toEqual({ ...mockFlight, compositions })
    })

    it('should return null when flight not found', async () => {
      fastify.db.then.mockImplementation((resolve: any) => resolve([]))

      const result = await flightService.getById(fastify, 999)

      expect(result).toBeNull()
    })
  })

  // ---------- create ----------

  describe('create', () => {
    it('should insert flight and invalidate list cache', async () => {
      const created = { ...mockFlight, id: 2 }
      fastify.db.returning.mockResolvedValue([created])

      const result = await flightService.create(fastify, mockFlight as any, 'admin')

      expect(result).toEqual(created)
      expect(fastify.db.insert).toHaveBeenCalled()
      expect(invalidatePattern).toHaveBeenCalledWith(fastify.redis, 'flight:*')
    })
  })

  // ---------- update ----------

  describe('update', () => {
    it('should update flight and invalidate caches', async () => {
      const updated = { ...mockFlight, fltNum: 'CA102' }
      fastify.db.returning.mockResolvedValue([updated])

      const result = await flightService.update(fastify, 1, { fltNum: 'CA102' } as any, 'admin')

      expect(result).toEqual(updated)
      expect(invalidate).toHaveBeenCalledWith(fastify.redis, 'flight:1')
      expect(invalidatePattern).toHaveBeenCalledWith(fastify.redis, 'flight:list:*')
    })
  })

  // ---------- remove ----------

  describe('remove', () => {
    it('should soft-delete flight (set isDeleted = 1) and invalidate caches', async () => {
      const removed = { ...mockFlight, isDeleted: 1 }
      fastify.db.returning.mockResolvedValue([removed])

      const result = await flightService.remove(fastify, 1, 'admin')

      expect(result).toEqual(removed)
      expect(fastify.db.update).toHaveBeenCalled()
      expect(invalidate).toHaveBeenCalledWith(fastify.redis, 'flight:1')
      expect(invalidatePattern).toHaveBeenCalledWith(fastify.redis, 'flight:list:*')
    })
  })

  // ---------- getPairingIds ----------

  describe('getPairingIds', () => {
    it('returns distinct pairing ids (sorted, nulls dropped) of pairings whose segments use the flight', async () => {
      fastify.db.then.mockImplementation((resolve: any) =>
        resolve([{ pairingId: 30 }, { pairingId: 10 }, { pairingId: null }]),
      )

      const result = await flightService.getPairingIds(fastify, 1)

      expect(result).toEqual({ pairingIds: [10, 30] })
      expect(fastify.db.selectDistinct).toHaveBeenCalled()
    })

    it('returns an empty list when no pairing uses the flight (ground task)', async () => {
      fastify.db.then.mockImplementation((resolve: any) => resolve([]))

      const result = await flightService.getPairingIds(fastify, 999)

      expect(result).toEqual({ pairingIds: [] })
    })
  })

  // ---------- batchImport ----------

  describe('batchImport', () => {
    it('should import flights in a transaction and invalidate list cache', async () => {
      const flights = [mockFlight, { ...mockFlight, id: 2, fltNum: 'CA102' }] as any[]
      const inserted = flights.map((f, i) => ({ ...f, id: i + 10 }))

      fastify.db.transaction.mockImplementation(async (fn: any) => {
        const tx = {
          insert: vi.fn().mockReturnThis(),
          values: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue(inserted),
        }
        return fn(tx)
      })

      const result = await flightService.batchImport(fastify, flights, 'admin')

      expect(result).toEqual(inserted)
      expect(invalidatePattern).toHaveBeenCalledWith(fastify.redis, 'flight:*')
    })
  })
})

vi.mock('../../../services/base/rank-service.js', () => ({
  rankService: {
    list: vi.fn(async () => [
      { rank: 'CA', isActingRank: 1, displayOrder: 1 },
      { rank: 'FO', isActingRank: 1, displayOrder: 2 },
      { rank: 'PU', isActingRank: 1, displayOrder: 3 },
      { rank: 'FA', isActingRank: 1, displayOrder: 4 },
      { rank: 'IFD', isActingRank: 1, displayOrder: 5 },
    ]),
  },
}))

describe('flightService.getCompositions', () => {
  // plan via select().groupBy(); actual via execute() (flt resolve + DHD filter).
  const makeFastify = (planRows: unknown[], actualRows: unknown[]) => {
    const chain: any = {
      select: () => chain,
      from: () => chain,
      where: () => chain,
      groupBy: () => Promise.resolve(planRows),
      execute: vi.fn().mockResolvedValue({ rows: actualRows }),
    }
    return { db: chain, redis: {} as any, log: { error: vi.fn() } as any } as any
  }

  it('returns per-flight per-rank plan/actual for the id set', async () => {
    const planRows = [
      { fltId: 1, actingRank: 'CA', plan: 1 },
      { fltId: 1, actingRank: 'FO', plan: 1 },
      { fltId: 1, actingRank: 'FA', plan: 4 },
    ]
    const actualRows = [
      { fltId: 1, actingRank: 'CA', actual: 1 },
      { fltId: 1, actingRank: 'FA', actual: 3 },
    ]
    const fastify = makeFastify(planRows, actualRows)
    const map = await flightService.getCompositions(fastify, [1])
    expect(map[1]).toEqual({
      CA: { plan: 1, actual: 1 },
      FO: { plan: 1, actual: 0 },
      PU: { plan: 0, actual: 0 },
      FA: { plan: 4, actual: 3 },
      IFD: { plan: 0, actual: 0 },
    })
  })

  it('returns an empty object for an empty id set without querying', async () => {
    const fastify = { db: { select: () => { throw new Error('should not query') } }, redis: {} as any } as any
    const map = await flightService.getCompositions(fastify, [])
    expect(map).toEqual({})
  })
})

describe('flightService.getCrewList', () => {
  it('includes FLY crew resolved via pairing_segment.flt_id and excludes DHD on this flight', async () => {
    const assignmentRows = [
      {
        seqOrder: 1,
        crewId: 'C100',
        crewName: 'A Pilot',
        crewRank: 'CA',
        actingRank: 'CA',
        label: '',
        source: 'SYSTEM',
        mbhMinutes: 60,
        segAssignment: 'FLY',
      },
      {
        seqOrder: 2,
        crewId: 'C200',
        crewName: 'B Deadhead',
        crewRank: 'FO',
        actingRank: 'FO',
        label: '',
        source: 'SYSTEM',
        mbhMinutes: 60,
        segAssignment: 'DHD',
      },
    ]
    const compositionRows = [{ division: 'P', actingRank: 'CA', plan: 1 }]
    let selectCall = 0
    const chain: any = {}
    for (const m of ['select', 'selectDistinct', 'selectDistinctOn', 'from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'groupBy', 'limit']) {
      chain[m] = vi.fn(() => chain)
    }
    chain.then = vi.fn((resolve: (v: unknown) => unknown) => {
      selectCall++
      if (selectCall === 1) return resolve(assignmentRows)
      if (selectCall === 2) return resolve(compositionRows)
      if (selectCall === 3) return resolve([]) // operating pairing ids
      if (selectCall === 4) return resolve([{ fltDt: '2026-03-01', schDepDtUtc: new Date('2026-03-01T08:00:00.000Z') }])
      return resolve([{ crewId: 'C100', base: 'YEG' }]) // crew_base as-of
    })
    const fastify = { db: chain, redis: {} as any, log: { error: vi.fn() } as any } as any

    const { isDeadheadSegAssignment } = await import('../../../services/flight/flight-service.js')
    expect(isDeadheadSegAssignment('DHD')).toBe(true)
    expect(isDeadheadSegAssignment('dh')).toBe(true)
    expect(isDeadheadSegAssignment('FLY')).toBe(false)

    const result = await flightService.getCrewList(fastify, 999)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].crewId).toBe('C100')
    expect(result.items[0].base).toBe('YEG')
    expect(result.composition.CA.actual).toBe(1)
    expect(result.composition.FO.actual).toBe(0)
  })

  it('fills plan from aggregated pairing_composition when flight_composition lacks the rank', async () => {
    const assignmentRows: unknown[] = []
    const compositionRows: unknown[] = []
    const operatingPairings = [{ pairingId: 10 }, { pairingId: 20 }]
    const pairingPlans = [
      { actingRank: 'CA', plan: 1 },
      { actingRank: 'FO', plan: 1 },
      { actingRank: 'FA', plan: 3 },
      { actingRank: 'IFD', plan: 1 },
    ]
    let selectCall = 0
    const chain: any = {}
    for (const m of ['select', 'selectDistinct', 'selectDistinctOn', 'from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'groupBy', 'limit']) {
      chain[m] = vi.fn(() => chain)
    }
    chain.then = vi.fn((resolve: (v: unknown) => unknown) => {
      selectCall++
      if (selectCall === 1) return resolve(assignmentRows)
      if (selectCall === 2) return resolve(compositionRows)
      if (selectCall === 3) return resolve(operatingPairings)
      return resolve(pairingPlans)
    })
    const fastify = { db: chain, redis: {} as any, log: { error: vi.fn() } as any } as any

    const result = await flightService.getCrewList(fastify, 77370)
    expect(result.composition.CA.plan).toBe(1)
    expect(result.composition.FO.plan).toBe(1)
    expect(result.composition.FA.plan).toBe(3)
    expect(result.composition.IFD.plan).toBe(1)
  })

  it('prefers flight_composition plan over pairing aggregate for the same rank', async () => {
    const assignmentRows: unknown[] = []
    const compositionRows = [{ division: 'C', actingRank: 'FA', plan: 2 }]
    const operatingPairings = [{ pairingId: 10 }]
    const pairingPlans = [{ actingRank: 'FA', plan: 9 }]
    let selectCall = 0
    const chain: any = {}
    for (const m of ['select', 'selectDistinct', 'selectDistinctOn', 'from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'groupBy', 'limit']) {
      chain[m] = vi.fn(() => chain)
    }
    chain.then = vi.fn((resolve: (v: unknown) => unknown) => {
      selectCall++
      if (selectCall === 1) return resolve(assignmentRows)
      if (selectCall === 2) return resolve(compositionRows)
      if (selectCall === 3) return resolve(operatingPairings)
      return resolve(pairingPlans)
    })
    const fastify = { db: chain, redis: {} as any, log: { error: vi.fn() } as any } as any

    const result = await flightService.getCrewList(fastify, 1)
    expect(result.composition.FA.plan).toBe(2)
  })

  it('resolves crew base as of flight date (latest covering eff_dt)', async () => {
    const assignmentRows = [
      {
        seqOrder: 1,
        crewId: '386',
        crewName: 'Lundy Colleen',
        crewRank: 'FO',
        actingRank: 'FO',
        label: '',
        source: 'SYSTEM',
        mbhMinutes: 60,
        segAssignment: 'FLY',
      },
      {
        seqOrder: 2,
        crewId: '1012',
        crewName: 'Ardigo Mario',
        crewRank: 'CA',
        actingRank: 'CA',
        label: '',
        source: 'MANUAL',
        mbhMinutes: 60,
        segAssignment: 'FLY',
      },
    ]
    const compositionRows: unknown[] = []
    const flightRow = [{ fltDt: '2026-09-07', schDepDtUtc: new Date('2026-09-07T09:40:00.000Z') }]
    const baseRows = [
      { crewId: '386', base: 'YYZ' },
      // 1012 has no covering crew_base → null
    ]
    let selectCall = 0
    const chain: any = {}
    for (const m of ['select', 'selectDistinct', 'selectDistinctOn', 'from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'groupBy', 'limit']) {
      chain[m] = vi.fn(() => chain)
    }
    chain.then = vi.fn((resolve: (v: unknown) => unknown) => {
      selectCall++
      if (selectCall === 1) return resolve(assignmentRows)
      if (selectCall === 2) return resolve(compositionRows)
      if (selectCall === 3) return resolve([]) // operating pairings
      if (selectCall === 4) return resolve(flightRow)
      return resolve(baseRows)
    })
    const fastify = { db: chain, redis: {} as any, log: { error: vi.fn() } as any } as any

    const result = await flightService.getCrewList(fastify, 77370)
    expect(result.items.find((i) => i.crewId === '386')?.base).toBe('YYZ')
    expect(result.items.find((i) => i.crewId === '1012')?.base).toBeNull()
  })
})
