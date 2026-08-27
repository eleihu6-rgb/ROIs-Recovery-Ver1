import Fastify from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../config/index.js', () => ({
  env: {
    LIVE_SCHEMA: 'f8',
  },
}))

const getOrResolvePermissionContext = vi.fn()

vi.mock('../../services/permission/permission-service.js', () => ({
  getOrResolvePermissionContext: (...args: unknown[]) =>
    (getOrResolvePermissionContext as unknown as (...a: unknown[]) => unknown)(...args),
}))

import pbsBidDefinitionRoutes from '../../routes/pbs/bid-definitions.js'

const dictionaryRows = [
  { parent_code: 'DOW', code: 'SAT', name: 'Saturday', code_value: '6', updated_by: 'system', updated_at: '2026-08-01T00:00:00Z' },
  { parent_code: 'DOW', code: 'SUN', name: 'Sunday', code_value: '7', updated_by: 'system', updated_at: '2026-08-01T00:00:00Z' },
  { parent_code: 'PBS_PAIRING_REDEYE_CONFIG', code: 'START_TIME', name: 'Start', code_value: '03:30', updated_by: 'admin', updated_at: '2026-08-02T00:00:00Z' },
  { parent_code: 'PBS_PAIRING_REDEYE_CONFIG', code: 'END_TIME', name: 'End', code_value: '05:30', updated_by: 'admin', updated_at: '2026-08-02T00:00:00Z' },
  { parent_code: 'PBS_PREFER_OFF', code: 'WEEKEND_START_DOW', name: 'Start day', code_value: 'SAT', updated_by: 'admin', updated_at: '2026-08-02T00:00:00Z' },
  { parent_code: 'PBS_PREFER_OFF', code: 'WEEKEND_START_TIME', name: 'Start time', code_value: '00:00', updated_by: 'admin', updated_at: '2026-08-02T00:00:00Z' },
  { parent_code: 'PBS_PREFER_OFF', code: 'WEEKEND_END_DOW', name: 'End day', code_value: 'SUN', updated_by: 'admin', updated_at: '2026-08-02T00:00:00Z' },
  { parent_code: 'PBS_PREFER_OFF', code: 'WEEKEND_END_TIME', name: 'End time', code_value: '24:00', updated_by: 'admin', updated_at: '2026-08-02T00:00:00Z' },
  { parent_code: 'PBS_LINE_CREDIT_WINDOW_CONFIG', code: 'DELTA_HOURS', name: 'Delta', code_value: '5', updated_by: 'admin', updated_at: '2026-08-02T00:00:00Z' },
  { parent_code: 'SYS_PARAM', code: 'PBS_LINE_MINIMUM_BASE_LAYOVER', name: 'Minimum Base Layover', code_value: '013:00', updated_by: 'admin', updated_at: '2026-08-02T00:00:00Z' },
  { parent_code: 'SYS_PARAM', code: 'PBS_TIME_BETWEEN_FLIGHTS_MIN_MINUTES', name: 'Minimum Time Between Flights', code_value: '45', updated_by: 'admin', updated_at: '2026-08-02T00:00:00Z' },
  { parent_code: 'PBS_EFFICIENT_FLYING_CONFIG', code: 'PERCENTILE', name: 'Percentile', code_value: '20', updated_by: 'admin', updated_at: '2026-08-02T00:00:00Z' },
]

interface PermissionMenuFixture {
  menus: string[]
}

const stubPermissionContext = (menus: string[]): PermissionMenuFixture => ({ menus })

const buildApp = async (isAdmin: number, query: ReturnType<typeof vi.fn>, grantedMenus: string[] = []) => {
  getOrResolvePermissionContext.mockReset()
  if (isAdmin !== 1) {
    getOrResolvePermissionContext.mockResolvedValue(stubPermissionContext(grantedMenus))
  }

  const app = Fastify()
  const release = vi.fn()
  app.decorate('db', {} as never)
  app.decorate('redis', {} as never)
  app.decorate('pgPool', { connect: vi.fn(async () => ({ query, release })) } as never)
  app.decorateRequest('authUser', undefined)
  app.addHook('onRequest', async (request) => {
    ;(request as { authUser?: unknown }).authUser = {
      userCode: isAdmin ? 'admin' : 'crew',
      userName: isAdmin ? 'Admin' : 'Crew',
      schema: 'f8',
      isAdmin,
    }
  })
  await app.register(pbsBidDefinitionRoutes, { prefix: '/api/pbs' })
  return { app, release }
}

describe('PBS Bid Definitions routes', () => {
  beforeEach(() => {
    getOrResolvePermissionContext.mockReset()
  })

  it('denies non-admin users without the PBS_BID_DEFINITIONS menu permission before opening a database connection', async () => {
    const query = vi.fn()
    const { app } = await buildApp(0, query, [])
    const response = await app.inject({ method: 'GET', url: '/api/pbs/bid-definitions' })

    expect(response.statusCode).toBe(403)
    expect(response.json().message).toBe('Access denied: missing menu permission')
    expect(query).not.toHaveBeenCalled()
  })

  it('allows non-admin users with the PBS_BID_DEFINITIONS menu permission', async () => {
    const query = vi.fn(async () => ({ rows: dictionaryRows }))
    const { app } = await buildApp(0, query, ['PBS_BID_DEFINITIONS'])
    const response = await app.inject({ method: 'GET', url: '/api/pbs/bid-definitions' })

    expect(response.statusCode).toBe(200)
    expect(getOrResolvePermissionContext).toHaveBeenCalled()
  })

  it('returns the six definitions from dictionary values', async () => {
    const query = vi.fn(async () => ({ rows: dictionaryRows }))
    const { app, release } = await buildApp(1, query)
    const response = await app.inject({ method: 'GET', url: '/api/pbs/bid-definitions' })

    expect(response.statusCode).toBe(200)
    expect(response.json().data.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'redeye', displayValue: '03:30–05:30 local time' }),
      expect.objectContaining({ code: 'weekend', displayValue: 'Saturday 00:00 – Sunday 24:00' }),
      expect.objectContaining({ code: 'credit-window', displayValue: '±5 hours from period credit target' }),
      expect.objectContaining({ code: 'minimum-base-layover', displayValue: '13:00 minimum' }),
      expect.objectContaining({ code: 'efficient-flying-percentile', displayValue: '20%' }),
      expect.objectContaining({ code: 'minimum-time-between-flights', displayValue: '00:45 minimum' }),
    ]))
    expect(release).toHaveBeenCalledOnce()
  })

  it('rejects a zero-length Weekend definition without updating rows', async () => {
    const query = vi.fn(async () => ({ rows: dictionaryRows }))
    const { app } = await buildApp(1, query)
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/pbs/bid-definitions/weekend',
      payload: { startDayCode: 'SAT', startTime: '00:00', endDayCode: 'FRI', endTime: '24:00' },
    })

    expect(response.statusCode).toBe(400)
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('updates Redeye atomically and returns the refreshed definition', async () => {
    const updatedRows = dictionaryRows.map((row) => row.parent_code === 'PBS_PAIRING_REDEYE_CONFIG'
      ? { ...row, code_value: row.code === 'START_TIME' ? '23:00' : '05:00' }
      : row)
    const query = vi.fn(async (statement: string) => {
      if (statement.includes('select parent_code')) {
        return { rows: updatedRows }
      }
      return { rows: [], rowCount: 1 }
    })
    const { app } = await buildApp(1, query)
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/pbs/bid-definitions/redeye',
      payload: { startTime: '23:00', endTime: '05:00' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().data.displayValue).toBe('23:00–05:00 local time · Crosses midnight')
    expect(query.mock.calls.map(([statement]) => statement)).toEqual(expect.arrayContaining(['begin', 'commit']))
  })

  it('normalizes and updates Minimum Base Layover atomically', async () => {
    const updatedRows = dictionaryRows.map((row) => row.code === 'PBS_LINE_MINIMUM_BASE_LAYOVER'
      ? { ...row, code_value: '014:00' }
      : row)
    const query = vi.fn(async (statement: string) => {
      if (statement.includes('select parent_code')) return { rows: updatedRows }
      return { rows: [], rowCount: 1 }
    })
    const { app } = await buildApp(1, query)
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/pbs/bid-definitions/minimum-base-layover',
      payload: { minDuration: '14:00' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().data.displayValue).toBe('14:00 minimum')
    expect(query).toHaveBeenCalledWith(expect.stringContaining('update f8.dictionary'), [
      '014:00', 'admin', 'SYS_PARAM', 'PBS_LINE_MINIMUM_BASE_LAYOVER',
    ])
  })

  it('rejects invalid Minimum Base Layover without opening a database connection', async () => {
    const query = vi.fn()
    const { app } = await buildApp(1, query)
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/pbs/bid-definitions/minimum-base-layover',
      payload: { minDuration: '0:00' },
    })

    expect(response.statusCode).toBe(400)
    expect(query).not.toHaveBeenCalled()
  })

  it('rolls back when the Minimum Base Layover dictionary row is missing', async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement.includes('update f8.dictionary')) return { rows: [], rowCount: 0 }
      return { rows: [], rowCount: 1 }
    })
    const { app } = await buildApp(1, query)
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/pbs/bid-definitions/minimum-base-layover',
      payload: { minDuration: '14:00' },
    })

    expect(response.statusCode).toBe(500)
    expect(query.mock.calls.map(([statement]) => statement)).toEqual(['begin', expect.stringContaining('update f8.dictionary'), 'rollback'])
  })

  it('updates Efficient Flying Percentile atomically and returns the refreshed definition', async () => {
    const updatedRows = dictionaryRows.map((row) => row.parent_code === 'PBS_EFFICIENT_FLYING_CONFIG'
      ? { ...row, code_value: '15' }
      : row)
    const query = vi.fn(async (statement: string) => {
      if (statement.includes('select parent_code')) return { rows: updatedRows }
      return { rows: [], rowCount: 1 }
    })
    const { app } = await buildApp(1, query)
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/pbs/bid-definitions/efficient-flying-percentile',
      payload: { percentile: 15 },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().data).toEqual(expect.objectContaining({
      code: 'efficient-flying-percentile',
      displayValue: '15%',
      value: { available: true, percentile: 15 },
    }))
    expect(query).toHaveBeenCalledWith(expect.stringContaining('update f8.dictionary'), [
      '15', 'admin', 'PBS_EFFICIENT_FLYING_CONFIG', 'PERCENTILE',
    ])
  })

  it.each([{ percentile: 0 }, { percentile: 51 }, { percentile: 20.5 }, { percentile: '20' }, {}])(
    'rejects invalid Efficient Flying Percentile payload %# before opening a database connection',
    async (payload) => {
      const query = vi.fn()
      const { app } = await buildApp(1, query)
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/pbs/bid-definitions/efficient-flying-percentile',
        payload,
      })

      expect(response.statusCode).toBe(400)
      expect(query).not.toHaveBeenCalled()
    },
  )

  it('rolls back when the Efficient Flying Percentile dictionary row is missing', async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement.includes('update f8.dictionary')) return { rows: [], rowCount: 0 }
      return { rows: [], rowCount: 1 }
    })
    const { app } = await buildApp(1, query)
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/pbs/bid-definitions/efficient-flying-percentile',
      payload: { percentile: 15 },
    })

    expect(response.statusCode).toBe(500)
    expect(query.mock.calls.map(([statement]) => statement)).toEqual([
      'begin', expect.stringContaining('update f8.dictionary'), 'rollback',
    ])
  })

  it('updates Minimum Time Between Flights as integer minutes', async () => {
    const updatedRows = dictionaryRows.map((row) => row.code === 'PBS_TIME_BETWEEN_FLIGHTS_MIN_MINUTES'
      ? { ...row, code_value: '60' }
      : row)
    const query = vi.fn(async (statement: string) => {
      if (statement.includes('select parent_code')) return { rows: updatedRows }
      return { rows: [], rowCount: 1 }
    })
    const { app } = await buildApp(1, query)
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/pbs/bid-definitions/minimum-time-between-flights',
      payload: { minimumMinutes: 60 },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().data).toEqual(expect.objectContaining({
      code: 'minimum-time-between-flights',
      displayValue: '01:00 minimum',
      value: { available: true, minimumMinutes: 60 },
    }))
    expect(query).toHaveBeenCalledWith(expect.stringContaining('update f8.dictionary'), [
      '60', 'admin', 'SYS_PARAM', 'PBS_TIME_BETWEEN_FLIGHTS_MIN_MINUTES',
    ])
  })

  it.each([{ minimumMinutes: 0 }, { minimumMinutes: 60_000 }, { minimumMinutes: 45.5 }, { minimumMinutes: '45' }, {}])(
    'rejects invalid Minimum Time Between Flights payload %# before opening a database connection',
    async (payload) => {
      const query = vi.fn()
      const { app } = await buildApp(1, query)
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/pbs/bid-definitions/minimum-time-between-flights',
        payload,
      })

      expect(response.statusCode).toBe(400)
      expect(query).not.toHaveBeenCalled()
    },
  )

  it('returns 409 and rolls back when the Minimum Time Between Flights dictionary row is not unique', async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement.includes('update f8.dictionary')) return { rows: [], rowCount: 2 }
      return { rows: [], rowCount: 1 }
    })
    const { app } = await buildApp(1, query)
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/pbs/bid-definitions/minimum-time-between-flights',
      payload: { minimumMinutes: 60 },
    })

    expect(response.statusCode).toBe(409)
    expect(query.mock.calls.map(([statement]) => statement)).toEqual([
      'begin', expect.stringContaining('update f8.dictionary'), 'rollback',
    ])
  })
})
