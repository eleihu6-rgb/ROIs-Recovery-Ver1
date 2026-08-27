import { describe, it, expect } from 'vitest'
import { paginate, paginationQuerySchema } from '../../utils/pagination.js'

describe('pagination utils', () => {
  // ---------- paginate ----------

  describe('paginate', () => {
    it('should calculate totalPages correctly', () => {
      const result = paginate({ page: 1, pageSize: 10 }, ['a', 'b', 'c'], 25)

      expect(result).toEqual({
        items: ['a', 'b', 'c'],
        total: 25,
        page: 1,
        pageSize: 10,
        totalPages: 3,
      })
    })

    it('should return 0 totalPages for empty result', () => {
      const result = paginate({ page: 1, pageSize: 10 }, [], 0)

      expect(result).toEqual({
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      })
    })

    it('should return 1 totalPage when all items fit in one page', () => {
      const items = [{ id: 1 }, { id: 2 }]
      const result = paginate({ page: 1, pageSize: 20 }, items, 2)

      expect(result.totalPages).toBe(1)
    })

    it('should preserve page and pageSize from query', () => {
      const result = paginate({ page: 3, pageSize: 50 }, [], 200)

      expect(result.page).toBe(3)
      expect(result.pageSize).toBe(50)
      expect(result.totalPages).toBe(4)
    })
  })

  // ---------- paginationQuerySchema ----------

  describe('paginationQuerySchema', () => {
    it('should parse valid input', () => {
      const result = paginationQuerySchema.parse({ page: '2', pageSize: '50' })
      expect(result).toEqual({ page: 2, pageSize: 50 })
    })

    it('should apply defaults', () => {
      const result = paginationQuerySchema.parse({})
      expect(result).toEqual({ page: 1, pageSize: 20 })
    })

    it('should reject non-positive page', () => {
      expect(() => paginationQuerySchema.parse({ page: '0' })).toThrow()
      expect(() => paginationQuerySchema.parse({ page: '-1' })).toThrow()
    })

    it('should reject pageSize out of range', () => {
      expect(() => paginationQuerySchema.parse({ pageSize: '0' })).toThrow()
      expect(() => paginationQuerySchema.parse({ pageSize: '501' })).toThrow()
    })

    it('should coerce string numbers', () => {
      const result = paginationQuerySchema.parse({ page: '10', pageSize: '100' })
      expect(result.page).toBe(10)
      expect(result.pageSize).toBe(100)
    })
  })
})
