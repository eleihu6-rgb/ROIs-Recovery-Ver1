import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'

vi.mock('../../config/index.js', () => ({
  env: { LIVE_SCHEMA: 'f8' },
}))

const getOrResolvePermissionContext = vi.fn()

vi.mock('../../services/permission/permission-service.js', () => ({
  getOrResolvePermissionContext: (...args: unknown[]) =>
    (getOrResolvePermissionContext as unknown as (...a: unknown[]) => unknown)(...args),
}))

import pbsBusinessTimeAdminRoutes from './pbs-business-time.js'

interface PermissionMenuFixture {
  menus: string[]
}

const stubPermissionContext = (menus: string[]): PermissionMenuFixture => ({ menus })

const build = async (
  query: ReturnType<typeof vi.fn>,
  isAdmin: number | null = 1,
  grantedMenus: string[] = [],
) => {
  getOrResolvePermissionContext.mockReset()
  if (isAdmin !== 1) {
    getOrResolvePermissionContext.mockResolvedValue(stubPermissionContext(grantedMenus))
  }

  const app = Fastify()
  const release = vi.fn()
  app.decorate('db', {} as never)
  app.decorate('redis', {} as never)
  app.decorate('pgPool', {
    connect: vi.fn(async () => ({ query, release })),
  } as never)
  app.decorateRequest('authUser', undefined)
  app.addHook('onRequest', async (request) => {
    if (isAdmin === null) return
    ;(request as { authUser?: unknown }).authUser = {
      userCode: 'lei',
      userName: 'Lei',
      schema: 'f8',
      isAdmin,
    }
  })
  await app.register(pbsBusinessTimeAdminRoutes, { prefix: '/api/admin' })
  return { app, release }
}

const dictionaryQuery = (values: Map<string, string>) => vi.fn(async (sql: string, params?: unknown[]) => {
  if (sql.includes('select code, code_value')) {
    return { rows: Array.from(values.entries()).map(([code, code_value]) => ({ code, code_value })) }
  }
  if (sql.includes('update f8.dictionary')) {
    const [value, , , code] = params as [string, string, string, string]
    values.set(code, value)
    return { rows: [], rowCount: 1 }
  }
  return { rows: [], rowCount: 1 }
})

describe('PBS Business Time admin routes', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.useRealTimers())

  it('returns system time when no override is configured', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-07-01T01:00:00.000Z'))
    const query = dictionaryQuery(new Map([
      ['PBS_BUSINESS_TIME_MODE', 'ROLLING'],
      ['PBS_BUSINESS_TIME_ANCHOR', ''],
      ['PBS_BUSINESS_TIME_ANCHOR_REAL', ''],
    ]))
    const { app, release } = await build(query)

    const response = await app.inject({ method: 'GET', url: '/api/admin/pbs-business-time' })

    expect(response.statusCode).toBe(200)
    expect(response.json().data).toMatchObject({
      mode: 'ROLLING',
      source: 'system',
      realNow: '2026-07-01T01:00:00.000Z',
      businessNow: '2026-07-01T01:00:00.000Z',
      warnings: [],
    })
    expect(release).toHaveBeenCalled()
  })

  it('keeps an empty mode compatible with a valid rolling override', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-07-01T01:10:00.000Z'))
    const query = dictionaryQuery(new Map([
      ['PBS_BUSINESS_TIME_MODE', ''],
      ['PBS_BUSINESS_TIME_ANCHOR', '2026-07-03T00:00:00.000Z'],
      ['PBS_BUSINESS_TIME_ANCHOR_REAL', '2026-07-01T01:00:00.000Z'],
    ]))
    const { app } = await build(query)

    const response = await app.inject({ method: 'GET', url: '/api/admin/pbs-business-time' })

    expect(response.statusCode).toBe(200)
    expect(response.json().data).toMatchObject({
      mode: 'ROLLING',
      source: 'override',
      businessNow: '2026-07-03T00:10:00.000Z',
      warnings: [],
    })
  })

  it('falls back to system time and warns for incomplete config', async () => {
    const query = dictionaryQuery(new Map([
      ['PBS_BUSINESS_TIME_MODE', 'ROLLING'],
      ['PBS_BUSINESS_TIME_ANCHOR', '2026-07-03T00:00:00.000Z'],
      ['PBS_BUSINESS_TIME_ANCHOR_REAL', ''],
    ]))
    const { app } = await build(query)

    const response = await app.inject({ method: 'GET', url: '/api/admin/pbs-business-time' })

    expect(response.statusCode).toBe(200)
    expect(response.json().data.source).toBe('system')
    expect(response.json().data.warnings).toContain('PBS business time override is incomplete.')
  })

  it('sets and clears the Shanghai business time override', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-07-01T01:00:00.000Z'))
    const values = new Map<string, string>()
    const { app } = await build(dictionaryQuery(values))

    const setResponse = await app.inject({
      method: 'PUT',
      url: '/api/admin/pbs-business-time',
      payload: { action: 'SET', businessTimeLocal: '2026-07-03T08:00' },
    })
    expect(setResponse.statusCode).toBe(200)
    expect(values.get('PBS_BUSINESS_TIME_ANCHOR')).toBe('2026-07-03T00:00:00.000Z')
    expect(values.get('PBS_BUSINESS_TIME_ANCHOR_REAL')).toBe('2026-07-01T01:00:00.000Z')
    expect(setResponse.json().data.source).toBe('override')

    const clearResponse = await app.inject({
      method: 'PUT',
      url: '/api/admin/pbs-business-time',
      payload: { action: 'CLEAR' },
    })
    expect(clearResponse.statusCode).toBe(200)
    expect(values.get('PBS_BUSINESS_TIME_ANCHOR')).toBe('')
    expect(values.get('PBS_BUSINESS_TIME_ANCHOR_REAL')).toBe('')
    expect(clearResponse.json().data.source).toBe('system')
  })

  it('rejects invalid dates, users without the PBS_BUSINESS_TIME menu permission, and missing auth', async () => {
    const query = dictionaryQuery(new Map())
    const { app: adminApp } = await build(query)
    const invalid = await adminApp.inject({
      method: 'PUT',
      url: '/api/admin/pbs-business-time',
      payload: { action: 'SET', businessTimeLocal: '2026-02-30T08:00' },
    })
    expect(invalid.statusCode).toBe(400)
    expect(invalid.json().message).toBe('Invalid PBS business time value')

    const { app: nonAdminApp } = await build(query, 0, [])
    expect((await nonAdminApp.inject({ method: 'GET', url: '/api/admin/pbs-business-time' })).statusCode).toBe(403)
    expect((await nonAdminApp.inject({ method: 'PUT', url: '/api/admin/pbs-business-time', payload: { action: 'CLEAR' } })).statusCode).toBe(403)
    expect((await nonAdminApp.inject({ method: 'GET', url: '/api/admin/pbs-business-time' })).json().message).toBe('Access denied: missing menu permission')

    const { app: unexpectedAdminValueApp } = await build(query, 2, [])
    expect((await unexpectedAdminValueApp.inject({ method: 'GET', url: '/api/admin/pbs-business-time' })).statusCode).toBe(403)

    const { app: missingAuthApp } = await build(query, null, [])
    expect((await missingAuthApp.inject({ method: 'GET', url: '/api/admin/pbs-business-time' })).statusCode).toBe(401)
  })

  it('allows non-admin users that have the PBS_BUSINESS_TIME menu permission', async () => {
    const query = dictionaryQuery(new Map([
      ['PBS_BUSINESS_TIME_MODE', 'ROLLING'],
      ['PBS_BUSINESS_TIME_ANCHOR', ''],
      ['PBS_BUSINESS_TIME_ANCHOR_REAL', ''],
    ]))
    const { app } = await build(query, 0, ['PBS_BUSINESS_TIME'])

    const response = await app.inject({ method: 'GET', url: '/api/admin/pbs-business-time' })

    expect(response.statusCode).toBe(200)
    expect(getOrResolvePermissionContext).toHaveBeenCalled()
  })
})
