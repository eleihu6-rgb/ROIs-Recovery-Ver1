import { describe, expect, it } from 'vitest'
import { mapPgError, isPgError } from './pg-error.js'

const pgErr = (code: string, extras: Record<string, unknown> = {}): unknown => ({
  ...extras,
  code,
  message: `pg says ${code}`,
})

describe('mapPgError', () => {
  describe('domain errors (CostLibraryError shape)', () => {
    it('preserves declared statusCode and message', () => {
      const err = Object.assign(new Error('Cost record not found'), { statusCode: 404 })
      const out = mapPgError(err)
      expect(out.status).toBe(404)
      expect(out.category).toBe('not_found')
      expect(out.message).toBe('Cost record not found')
      expect(out.sqlState).toBeUndefined()
    })

    it('maps 409 to conflict', () => {
      const err = Object.assign(new Error('version mismatch'), { statusCode: 409 })
      const out = mapPgError(err)
      expect(out.status).toBe(409)
      expect(out.category).toBe('conflict')
    })
  })

  describe('PostgreSQL SQLSTATE codes', () => {
    it('maps 23503 (FK violation) to 409 conflict with table-specific hint', () => {
      const out = mapPgError(pgErr('23503', { table: 'cost_set_member' }))
      expect(out.status).toBe(409)
      expect(out.category).toBe('conflict')
      expect(out.message).toMatch(/referenced/i)
      expect(out.hint).toMatch(/cost_set_member/)
      expect(out.sqlState).toBe('23503')
    })

    it('maps 23503 without table to a generic "Remove the references" hint', () => {
      const out = mapPgError(pgErr('23503'))
      expect(out.hint).toMatch(/Remove the references/)
    })

    it('maps 23505 (unique) to 409 with name-collision hint', () => {
      const out = mapPgError(pgErr('23505'))
      expect(out.status).toBe(409)
      expect(out.category).toBe('conflict')
      expect(out.hint).toMatch(/different name/i)
    })

    it('maps 23502 (not null) to 400 validation and includes column', () => {
      const out = mapPgError(pgErr('23502', { column: 'unit_price' }))
      expect(out.status).toBe(400)
      expect(out.category).toBe('validation')
      expect(out.message).toMatch(/unit_price.*required/i)
    })

    it('maps 23514 (check constraint) to 400 with range hint', () => {
      const out = mapPgError(pgErr('23514'))
      expect(out.status).toBe(400)
      expect(out.message).toMatch(/constraint/i)
      expect(out.hint).toMatch(/range/i)
    })

    it('maps 22P02 (bad text representation) to 400', () => {
      const out = mapPgError(pgErr('22P02'))
      expect(out.status).toBe(400)
      expect(out.category).toBe('validation')
      expect(out.message).toMatch(/not in the expected format/i)
    })

    it('maps 22001 (string too long) to 400', () => {
      const out = mapPgError(pgErr('22001'))
      expect(out.status).toBe(400)
      expect(out.message).toMatch(/longer than the column allows/i)
    })

    it('maps 40001 (serialization failure) to 503 unavailable', () => {
      const out = mapPgError(pgErr('40001'))
      expect(out.status).toBe(503)
      expect(out.category).toBe('unavailable')
      expect(out.hint).toMatch(/newer version/i)
    })

    it('maps 40P01 (deadlock) to 503', () => {
      const out = mapPgError(pgErr('40P01'))
      expect(out.status).toBe(503)
      expect(out.message).toMatch(/deadlock/i)
    })

    it('maps 42P01 (undefined table) to 500 internal with admin hint', () => {
      const out = mapPgError(pgErr('42P01'))
      expect(out.status).toBe(500)
      expect(out.category).toBe('internal')
      expect(out.hint).toMatch(/administrator/i)
    })

    it('maps 55P03 (object not in prerequisite state) to 409', () => {
      const out = mapPgError(pgErr('55P03'))
      expect(out.status).toBe(409)
      expect(out.message).toMatch(/not accepting writes/i)
    })

    it('maps 57014 (query cancelled) to 503', () => {
      const out = mapPgError(pgErr('57014'))
      expect(out.status).toBe(503)
      expect(out.message).toMatch(/cancelled/i)
      expect(out.hint).toMatch(/timeout/i)
    })

    it('maps unknown SQLSTATE to 500 with category=internal', () => {
      const out = mapPgError(pgErr('XX999'))
      expect(out.status).toBe(500)
      expect(out.category).toBe('internal')
      expect(out.sqlState).toBe('XX999')
    })
  })

  describe('network / driver errors', () => {
    it('maps ECONNREFUSED to 503 with DATABASE_URL hint', () => {
      const out = mapPgError({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:5432' })
      expect(out.status).toBe(503)
      expect(out.category).toBe('unavailable')
      expect(out.hint).toMatch(/DATABASE_URL/)
    })

    it('maps ETIMEDOUT to 503', () => {
      const out = mapPgError({ code: 'ETIMEDOUT', message: 'connect ETIMEDOUT' })
      expect(out.status).toBe(503)
    })

    it('maps pool-exhausted text to 503', () => {
      const out = mapPgError({ code: 'POOL', message: 'Connection pool is full' })
      expect(out.status).toBe(503)
      expect(out.message).toMatch(/Lost connection/i)
    })
  })

  describe('fallback', () => {
    it('returns 500 internal for plain Error()', () => {
      const out = mapPgError(new Error('boom'))
      expect(out.status).toBe(500)
      expect(out.category).toBe('internal')
      expect(out.message).not.toBe('boom')
      expect(out.message).toMatch(/unexpected/i)
      expect(out.hint).toMatch(/administrator/i)
    })

    it('returns 500 internal for null / undefined', () => {
      expect(mapPgError(null).status).toBe(500)
      expect(mapPgError(undefined).status).toBe(500)
      expect(mapPgError('a string').status).toBe(500)
    })

    it('never leaks the raw error message into message/hint', () => {
      const out = mapPgError(new Error('SECRET: db password=foo schema=cost_set'))
      expect(JSON.stringify(out)).not.toMatch(/SECRET/)
      expect(JSON.stringify(out)).not.toMatch(/foo/)
      expect(JSON.stringify(out)).not.toMatch(/cost_set/)
    })
  })
})

describe('isPgError', () => {
  it('returns true for objects with valid SQLSTATE', () => {
    expect(isPgError({ code: '23503', message: 'fk' })).toBe(true)
    expect(isPgError({ code: '22P02' })).toBe(true)
  })
  it('returns false when no SQLSTATE', () => {
    expect(isPgError(new Error('boom'))).toBe(false)
    expect(isPgError({ code: 'ECONNREFUSED' })).toBe(false)
    expect(isPgError(null)).toBe(false)
  })
  it('matches a specific code when supplied', () => {
    expect(isPgError({ code: '23503' }, '23503')).toBe(true)
    expect(isPgError({ code: '23503' }, '23505')).toBe(false)
  })
})
