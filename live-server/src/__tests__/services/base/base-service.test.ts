import { describe, it, expect, vi, beforeEach } from 'vitest'
import { baseService } from '../../../services/base/base-service.js'

vi.mock('../../../utils/cache.js', () => ({
  getOrSet: vi.fn((_redis, _key, _ttl, fetchFn) => fetchFn()),
  invalidate: vi.fn(),
  invalidatePattern: vi.fn(),
}))

const createFastify = (airports: Array<{ airport: string; zoneId: string }>) => {
  const db: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockResolvedValue(airports),
  }
  return { db, redis: {} as any, log: { info: vi.fn() } as any } as any
}

describe('baseService.getAirportTimezones', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns an airport→zoneId map for ALL airports (incl. non-base)', async () => {
    const fastify = createFastify([
      { airport: 'YYZ', zoneId: 'America/Toronto' },
      { airport: 'GDL', zoneId: 'America/Mexico_City' },
    ])
    const map = await baseService.getAirportTimezones(fastify)
    expect(map).toEqual({ YYZ: 'America/Toronto', GDL: 'America/Mexico_City' })
  })

  it('skips rows missing an airport code or zoneId', async () => {
    const fastify = createFastify([
      { airport: 'YYZ', zoneId: 'America/Toronto' },
      { airport: '', zoneId: 'X' },
      { airport: 'NIL', zoneId: '' },
    ] as Array<{ airport: string; zoneId: string }>)
    const map = await baseService.getAirportTimezones(fastify)
    expect(map).toEqual({ YYZ: 'America/Toronto' })
  })
})
