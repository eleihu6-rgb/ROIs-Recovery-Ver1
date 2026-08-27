import { describe, it, expect, vi, beforeEach } from 'vitest'
import { assignmentService } from '../../../services/base/assignment-service.js'

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

const createFastify = () => {
  const db: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  }
  return { db, redis: {} as any, log: { info: vi.fn() } as any } as any
}

describe('assignmentService', () => {
  let fastify: ReturnType<typeof createFastify>

  beforeEach(() => {
    vi.clearAllMocks()
    fastify = createFastify()
  })

  // ── Assignment ──

  describe('list', () => {
    it('should return all assignments', async () => {
      const items = [{ id: 1, code: 'ASG1' }]
      fastify.db.from.mockResolvedValue(items)

      const result = await assignmentService.list(fastify)

      expect(result).toEqual(items)
    })
  })

  describe('getById', () => {
    it('should return assignment when found', async () => {
      const item = { id: 1, code: 'ASG1' }
      fastify.db.where.mockResolvedValue([item])

      const result = await assignmentService.getById(fastify, 1)

      expect(result).toEqual(item)
    })

    it('should return null when not found', async () => {
      fastify.db.where.mockResolvedValue([])

      const result = await assignmentService.getById(fastify, 999)

      expect(result).toBeNull()
    })
  })

  describe('create', () => {
    it('should insert and invalidate list cache', async () => {
      const created = { id: 2, code: 'ASG2' }
      fastify.db.returning.mockResolvedValue([created])

      const result = await assignmentService.create(fastify, { code: 'ASG2' } as any, 'admin')

      expect(result).toEqual(created)
      expect(invalidate).toHaveBeenCalledWith(fastify.redis, 'assignment:list')
    })
  })

  describe('update', () => {
    it('should update and invalidate caches', async () => {
      const updated = { id: 1, code: 'ASG1-updated' }
      fastify.db.returning.mockResolvedValue([updated])

      const result = await assignmentService.update(fastify, 1, { code: 'ASG1-updated' } as any, 'admin')

      expect(result).toEqual(updated)
      expect(invalidate).toHaveBeenCalledWith(fastify.redis, 'assignment:list', 'assignment:1')
    })
  })

  describe('remove', () => {
    it('should delete and invalidate caches', async () => {
      fastify.db.where.mockResolvedValue(undefined)

      await assignmentService.remove(fastify, 1)

      expect(fastify.db.delete).toHaveBeenCalled()
      expect(invalidate).toHaveBeenCalledWith(fastify.redis, 'assignment:list', 'assignment:1')
    })
  })

  // ── Assignment Group ──

  describe('listGroups', () => {
    it('should return all groups', async () => {
      const groups = [{ id: 1, name: 'G1' }]
      fastify.db.from.mockResolvedValue(groups)

      const result = await assignmentService.listGroups(fastify)

      expect(result).toEqual(groups)
    })
  })

  describe('createGroup', () => {
    it('should insert group and invalidate group list cache', async () => {
      const created = { id: 2, name: 'G2' }
      fastify.db.returning.mockResolvedValue([created])

      const result = await assignmentService.createGroup(fastify, { name: 'G2' } as any, 'admin')

      expect(result).toEqual(created)
      expect(invalidate).toHaveBeenCalledWith(fastify.redis, 'assignment:group:list')
    })
  })

  describe('removeGroup', () => {
    it('should delete mappings and group, then invalidate caches', async () => {
      fastify.db.where.mockResolvedValue(undefined)

      await assignmentService.removeGroup(fastify, 1)

      // delete is called twice: once for mappings, once for group
      expect(fastify.db.delete).toHaveBeenCalledTimes(2)
      expect(invalidatePattern).toHaveBeenCalledWith(fastify.redis, 'assignment:group:*')
      expect(invalidate).toHaveBeenCalledWith(fastify.redis, 'assignment:map:list')
    })
  })

  // ── Assignment Group Map ──

  describe('listGroupMaps', () => {
    it('should return all group maps', async () => {
      const maps = [{ id: 1, assignmentGroupId: 1, assignmentId: 2 }]
      fastify.db.from.mockResolvedValue(maps)

      const result = await assignmentService.listGroupMaps(fastify)

      expect(result).toEqual(maps)
    })
  })

  describe('createGroupMap', () => {
    it('should insert map and invalidate map pattern cache', async () => {
      const created = { id: 3, assignmentGroupId: 1, assignmentId: 5 }
      fastify.db.returning.mockResolvedValue([created])

      const result = await assignmentService.createGroupMap(fastify, { assignmentGroupId: 1, assignmentId: 5 } as any, 'admin')

      expect(result).toEqual(created)
      expect(invalidatePattern).toHaveBeenCalledWith(fastify.redis, 'assignment:map:*')
    })
  })

  describe('removeGroupMap', () => {
    it('should delete map and invalidate map pattern cache', async () => {
      fastify.db.where.mockResolvedValue(undefined)

      await assignmentService.removeGroupMap(fastify, 3)

      expect(fastify.db.delete).toHaveBeenCalled()
      expect(invalidatePattern).toHaveBeenCalledWith(fastify.redis, 'assignment:map:*')
    })
  })
})
