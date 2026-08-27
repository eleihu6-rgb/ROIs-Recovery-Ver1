import { describe, it, expect, vi, beforeEach } from 'vitest'
import { airportService } from '../../../services/base/airport-service.js'

// Mock cache utils
vi.mock('../../../utils/cache.js', () => ({
  getOrSet: vi.fn((_redis, _key, _ttl, fetchFn) => fetchFn()),
  invalidate: vi.fn(),
  invalidatePattern: vi.fn(),
}))

vi.mock('../../../utils/audit.js', () => ({
  auditCreate: vi.fn((u: string) => ({ createdBy: u, createdAt: new Date(), updatedBy: u, updatedAt: new Date() })),
  auditUpdate: vi.fn((u: string) => ({ updatedBy: u, updatedAt: new Date() })),
}))

import { invalidate } from '../../../utils/cache.js'

const createFastify = () => {
  const db: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  }
  return { db, redis: {} as any, log: { info: vi.fn() } as any } as any
}

describe('airportService', () => {
  let fastify: ReturnType<typeof createFastify>

  beforeEach(() => {
    vi.clearAllMocks()
    fastify = createFastify()
  })

  describe('list', () => {
    it('should return all airports from db', async () => {
      const airports = [{ id: 1, code: 'PEK' }, { id: 2, code: 'PVG' }]
      // The chain select().from() is awaited, so mock from() to resolve
      fastify.db.from.mockResolvedValue(airports)

      const result = await airportService.list(fastify)

      expect(result).toEqual(airports)
      expect(fastify.db.select).toHaveBeenCalled()
    })
  })

  describe('getById', () => {
    it('should return airport when found', async () => {
      const airport = { id: 1, code: 'PEK', name: 'Beijing' }
      fastify.db.where.mockResolvedValue([airport])

      const result = await airportService.getById(fastify, 1)

      expect(result).toEqual(airport)
    })

    it('should return null when not found', async () => {
      fastify.db.where.mockResolvedValue([])

      const result = await airportService.getById(fastify, 999)

      expect(result).toBeNull()
    })
  })

  describe('create', () => {
    it('should insert and invalidate list cache', async () => {
      const created = { id: 3, code: 'CAN' }
      fastify.db.returning.mockResolvedValue([created])

      const result = await airportService.create(fastify, { code: 'CAN' } as any, 'admin')

      expect(result).toEqual(created)
      expect(fastify.db.insert).toHaveBeenCalled()
      expect(invalidate).toHaveBeenCalledWith(fastify.redis, 'airport:list')
    })
  })

  describe('update', () => {
    it('should update and invalidate both list and item cache', async () => {
      const updated = { id: 1, code: 'PEK', name: 'Beijing Capital' }
      fastify.db.returning.mockResolvedValue([updated])

      const result = await airportService.update(fastify, 1, { name: 'Beijing Capital' } as any, 'admin')

      expect(result).toEqual(updated)
      expect(invalidate).toHaveBeenCalledWith(fastify.redis, 'airport:list', 'airport:1')
    })
  })

  describe('remove', () => {
    it('should delete and invalidate cache', async () => {
      fastify.db.where.mockResolvedValue(undefined)

      await airportService.remove(fastify, 1)

      expect(fastify.db.delete).toHaveBeenCalled()
      expect(invalidate).toHaveBeenCalledWith(fastify.redis, 'airport:list', 'airport:1')
    })
  })
})
