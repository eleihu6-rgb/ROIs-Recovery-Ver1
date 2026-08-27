import { describe, it, expect, vi, beforeEach } from 'vitest'
import { dictionaryService } from '../../../services/base/dictionary-service.js'

vi.mock('../../../utils/cache.js', () => ({
  getOrSet: vi.fn((_redis, _key, _ttl, fetchFn) => fetchFn()),
  invalidate: vi.fn(),
  invalidatePattern: vi.fn(),
}))

vi.mock('../../../utils/audit.js', () => ({
  auditCreate: vi.fn((u: string) => ({ createdBy: u, createdAt: new Date(), updatedBy: u, updatedAt: new Date() })),
  auditUpdate: vi.fn((u: string) => ({ updatedBy: u, updatedAt: new Date() })),
}))

import { invalidatePattern } from '../../../utils/cache.js'

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

describe('dictionaryService', () => {
  let fastify: ReturnType<typeof createFastify>

  beforeEach(() => {
    vi.clearAllMocks()
    fastify = createFastify()
  })

  describe('list', () => {
    it('should return all dictionary entries', async () => {
      const items = [{ id: 1, code: 'RANK', name: 'Rank' }]
      fastify.db.from.mockResolvedValue(items)

      const result = await dictionaryService.list(fastify)

      expect(result).toEqual(items)
    })
  })

  describe('getById', () => {
    it('should return entry when found', async () => {
      const entry = { id: 1, code: 'RANK' }
      fastify.db.where.mockResolvedValue([entry])

      const result = await dictionaryService.getById(fastify, 1)

      expect(result).toEqual(entry)
    })

    it('should return null when not found', async () => {
      fastify.db.where.mockResolvedValue([])

      const result = await dictionaryService.getById(fastify, 999)

      expect(result).toBeNull()
    })
  })

  describe('getByParentCode', () => {
    it('should return entries for given parent code', async () => {
      const entries = [
        { id: 2, parentCode: 'RANK', code: 'CPT' },
        { id: 3, parentCode: 'RANK', code: 'FO' },
      ]
      fastify.db.where.mockResolvedValue(entries)

      const result = await dictionaryService.getByParentCode(fastify, 'RANK')

      expect(result).toEqual(entries)
    })
  })

  describe('getTree', () => {
    it('should build tree from flat list', async () => {
      const all = [
        { id: 1, parentCode: null, code: 'ROOT', name: 'Root', idx: 0, codeValue: null },
        { id: 2, parentCode: 'ROOT', code: 'CHILD', name: 'Child', idx: 1, codeValue: 'v1' },
      ]
      fastify.db.from.mockResolvedValue(all)

      const result = await dictionaryService.getTree(fastify)

      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('ROOT')
      expect(result[0].children).toHaveLength(1)
      expect(result[0].children[0].code).toBe('CHILD')
    })

    it('should return empty array for empty db', async () => {
      fastify.db.from.mockResolvedValue([])

      const result = await dictionaryService.getTree(fastify)

      expect(result).toEqual([])
    })
  })

  describe('create', () => {
    it('should insert and invalidate pattern cache', async () => {
      const created = { id: 4, code: 'NEW' }
      fastify.db.returning.mockResolvedValue([created])

      const result = await dictionaryService.create(fastify, { code: 'NEW' } as any, 'admin')

      expect(result).toEqual(created)
      expect(invalidatePattern).toHaveBeenCalledWith(fastify.redis, 'dictionary:*')
    })
  })

  describe('update', () => {
    it('should update and invalidate pattern cache', async () => {
      const updated = { id: 1, code: 'RANK', name: 'Updated' }
      fastify.db.returning.mockResolvedValue([updated])

      const result = await dictionaryService.update(fastify, 1, { name: 'Updated' } as any, 'admin')

      expect(result).toEqual(updated)
      expect(invalidatePattern).toHaveBeenCalledWith(fastify.redis, 'dictionary:*')
    })
  })

  describe('remove', () => {
    it('should delete and invalidate pattern cache', async () => {
      fastify.db.where.mockResolvedValue(undefined)

      await dictionaryService.remove(fastify, 1)

      expect(fastify.db.delete).toHaveBeenCalled()
      expect(invalidatePattern).toHaveBeenCalledWith(fastify.redis, 'dictionary:*')
    })
  })
})
