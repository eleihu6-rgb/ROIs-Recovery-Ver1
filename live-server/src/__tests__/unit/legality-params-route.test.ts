// live-server/src/__tests__/unit/legality-params-route.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../config/index.js', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
  },
}))

// Validation logic extracted from the PATCH route handler for unit testing
const validateParamJson = (paramJson: unknown): string | null => {
  if (!paramJson || typeof paramJson !== 'object') return 'paramJson is required'
  const p = paramJson as { tables?: unknown }
  if (!Array.isArray(p.tables)) return 'paramJson.tables must be an array'
  for (const t of p.tables as Array<unknown>) {
    const table = t as { header?: unknown; rows?: unknown }
    if (!Array.isArray(table.header) || !Array.isArray(table.rows)) {
      return 'each table must have header[] and rows[]'
    }
  }
  return null
}

describe('PATCH /api/legality/rule/:ruleId/params — validation', () => {
  it('rejects missing paramJson', () => {
    expect(validateParamJson(undefined)).toBe('paramJson is required')
  })
  it('rejects non-object paramJson', () => {
    expect(validateParamJson('string')).toBe('paramJson is required')
  })
  it('rejects paramJson with non-array tables', () => {
    expect(validateParamJson({ tables: 'not-array' })).toBe('paramJson.tables must be an array')
  })
  it('rejects table missing header', () => {
    expect(validateParamJson({ tables: [{ rows: [] }] })).toBe('each table must have header[] and rows[]')
  })
  it('rejects table missing rows', () => {
    expect(validateParamJson({ tables: [{ header: [] }] })).toBe('each table must have header[] and rows[]')
  })
  it('accepts valid paramJson', () => {
    expect(validateParamJson({ tables: [{ header: ['BASE', 'RANK'], rows: [['*', '*']] }] })).toBeNull()
  })
  it('accepts empty tables array', () => {
    expect(validateParamJson({ tables: [] })).toBeNull()
  })
})
