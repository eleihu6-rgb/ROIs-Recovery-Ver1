import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { auditCreate, auditUpdate } from '../../utils/audit.js'

describe('audit utils', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T08:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('auditCreate', () => {
    it('should return all four audit fields', () => {
      const result = auditCreate('admin')

      expect(result).toEqual({
        createdBy: 'admin',
        createdAt: new Date('2026-01-15T08:00:00Z'),
        updatedBy: 'admin',
        updatedAt: new Date('2026-01-15T08:00:00Z'),
      })
    })

    it('should use the provided username for both created and updated', () => {
      const result = auditCreate('john.doe')

      expect(result.createdBy).toBe('john.doe')
      expect(result.updatedBy).toBe('john.doe')
    })
  })

  describe('auditUpdate', () => {
    it('should return only updated fields', () => {
      const result = auditUpdate('editor')

      expect(result).toEqual({
        updatedBy: 'editor',
        updatedAt: new Date('2026-01-15T08:00:00Z'),
      })
    })

    it('should not include created fields', () => {
      const result = auditUpdate('editor')

      expect(result).not.toHaveProperty('createdBy')
      expect(result).not.toHaveProperty('createdAt')
    })
  })
})
