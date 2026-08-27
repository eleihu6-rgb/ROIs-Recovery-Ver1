import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'

vi.mock('../../config/env.js', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test-secret',
    PBS_SCHEMA: 'f8_pbs',
    LIVE_SCHEMA: 'f8',
    FILIALE: 'f8',
  },
}))

vi.mock('../../config/index.js', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test-secret',
    PBS_SCHEMA: 'f8_pbs',
    LIVE_SCHEMA: 'f8',
    FILIALE: 'f8',
  },
}))

vi.mock('../../services/permission/permission-service.js', () => ({
  hasMenuAccess: async (_fastify: unknown, authUser: { isAdmin?: number }, code: string) => {
    const granted = (globalThis as { __grantedMenus?: string[] }).__grantedMenus ?? []
    return authUser?.isAdmin === 1 || granted.includes(code)
  },
  getOrResolvePermissionContext: async () => {
    const granted = (globalThis as { __grantedMenus?: string[] }).__grantedMenus ?? []
    return {
      menus: granted,
      ctrls: {},
      dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] },
      permVersion: 1,
    }
  },
  invalidatePermissionContext: async () => undefined,
  ALL_ACCESS_CONTEXT: { menus: [], ctrls: {}, dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] }, permVersion: 1 },
  buildAdminContext: async () => ({ menus: [], ctrls: {}, dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] }, permVersion: 1 }),
  resolvePermissionContext: async () => ({ menus: [], ctrls: {}, dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] }, permVersion: 1 }),
  permissionKey: () => 'perm:test',
  permissionVersionKey: () => 'perm:ver:test',
  getPermissionVersion: async () => 1,
  bumpPermissionVersion: async () => 1,
}))

import pbsPeriodAdminRoutes from '../../routes/pbs/period-admin.js'

const periodRow = {
  id: 42,
  period_code: 'Jun 2026',
  rp_start: '2026-06-01T00:00:00.000Z',
  rp_end: '2026-06-30T00:00:00.000Z',
  bid_open_at: '2026-05-01T00:00:00.000Z',
  bid_close_at: '2026-05-20T00:00:00.000Z',
  award_publish_at: '2026-05-30T00:00:00.000Z',
  award_final_at: '2026-06-01T00:00:00.000Z',
  mis_award_deadline_at: '2026-06-05T00:00:00.000Z',
  first_published_at: null,
  latest_published_at: null,
  latest_publish_batch_id: null,
  status: 'OPEN',
  created_at: '2026-04-01T00:00:00.000Z',
  updated_at: '2026-04-02T00:00:00.000Z',
}

const validPeriodPayload = {
  periodCode: 'Jun 2026',
  rpStart: '2026-06-01T00:00:00',
  rpEnd: '2026-06-30T00:00:00',
  bidOpenAt: '2026-05-01T00:00:00',
  bidCloseAt: '2026-05-20T00:00:00',
  awardPublishAt: '2026-05-30T00:00:00',
  awardFinalAt: '2026-06-01T00:00:00',
  misAwardDeadlineAt: '2026-06-05T00:00:00',
}

const currentPeriodRow = {
  rp_start: periodRow.rp_start,
  rp_end: periodRow.rp_end,
  pbs_bid_open_at: periodRow.bid_open_at,
  pbs_bid_close_at: periodRow.bid_close_at,
  pbs_award_publish_at: periodRow.award_publish_at,
  pbs_award_final_at: periodRow.award_final_at,
  pbs_mis_award_deadline_at: periodRow.mis_award_deadline_at,
}

const generatedPeriodRow = (periodCode: string, id = 100) => ({
  ...periodRow,
  id,
  period_code: periodCode,
  bid_open_at: '2026-05-01T00:00:00.000Z',
  bid_close_at: '2026-05-08T23:59:00.000Z',
  status: 'DRAFT',
})

const build = async (
  query: ReturnType<typeof vi.fn>,
  isAdmin = 1,
  grantedMenus: string[] = [],
) => {
  ;(globalThis as { __grantedMenus?: string[] }).__grantedMenus = grantedMenus
  const app = Fastify()
  const release = vi.fn()
  app.decorate('pgPool', {
    connect: vi.fn(async () => ({ query, release })),
  } as never)
  app.decorate('db', {} as never)
  app.decorate('redis', {} as never)
  app.decorateRequest('authUser', undefined)
  app.addHook('onRequest', async (req) => {
    ;(req as { authUser?: unknown }).authUser = {
      userCode: 'lei',
      userName: 'Lei',
      schema: 'f8',
      isAdmin,
    }
  })
  await app.register(pbsPeriodAdminRoutes, { prefix: '/api/pbs' })
  return { app, release }
}

describe('PBS period admin routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists PBS periods from roster_period with filters', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-05-05T00:00:00.000Z'))
    const query = vi.fn(async () => ({ rows: [periodRow] }))
    const { app, release } = await build(query)

    const res = await app.inject({
      method: 'GET',
      url: '/api/pbs/period-admin?periodCode=Jun&status=OPEN',
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.rows[0]).toMatchObject({
      id: 42,
      periodCode: 'Jun 2026',
      status: 'OPEN',
      computedStage: 'OPEN',
    })
    expect(res.json().data.rows[0]).not.toHaveProperty('filiale')
    expect(res.json().data.rows[0]).not.toHaveProperty('awardRunAt')
    expect(res.json().data.rows[0]).toMatchObject({
      rpStart: '2026-06-01T00:00:00',
      rpEnd: '2026-06-30T00:00:00',
      awardPublishAt: '2026-05-30T00:00:00',
      awardFinalAt: '2026-06-01T00:00:00',
      misAwardDeadlineAt: '2026-06-05T00:00:00',
      firstPublishedAt: null,
      latestPublishedAt: null,
    })
    expect(res.json().data.rows[0]).not.toHaveProperty('maxTiers')
    expect(res.json().data.rows[0]).not.toHaveProperty('description')
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('from f8.roster_period'),
      ['%Jun%'],
    )
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(`to_char(rp_start, 'YYYY-MM-DD"T"HH24:MI:SS') as rp_start`),
      ['%Jun%'],
    )
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('order by pbs_bid_open_at asc, id asc'),
      expect.any(Array),
    )
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/record\.published = 1[\s\S]*record\.str_dt::date <= roster_period\.rp_start::date[\s\S]*record\.end_dt::date >= roster_period\.rp_end::date/),
      expect.any(Array),
    )
    const queryCalls = query.mock.calls as unknown as Array<[string, ...unknown[]]>
    expect(queryCalls.some(([sql]) => /record\.file_(path|size)|record\.checksum/.test(sql))).toBe(false)
    expect(release).toHaveBeenCalled()
  })

  it('rejects obsolete division filters', async () => {
    const query = vi.fn(async () => ({ rows: [] }))
    const { app } = await build(query)

    const res = await app.inject({
      method: 'GET',
      url: '/api/pbs/period-admin?division=C',
    })

    expect(res.statusCode).toBe(400)
    expect(query).not.toHaveBeenCalled()
  })

  it('rejects obsolete filiale filters', async () => {
    const query = vi.fn(async () => ({ rows: [] }))
    const { app } = await build(query)

    const res = await app.inject({
      method: 'GET',
      url: '/api/pbs/period-admin?filiale=F8',
    })

    expect(res.statusCode).toBe(400)
    expect(query).not.toHaveBeenCalled()
  })

  it('matches roster_period by generated name or roster period code when creating a PBS period', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-05-05T00:00:00.000Z'))
    const query = vi.fn(async () => ({ rows: [periodRow] }))
    const { app } = await build(query)

    const res = await app.inject({
      method: 'POST',
      url: '/api/pbs/period-admin',
      payload: validPeriodPayload,
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.periodCode).toBe('Jun 2026')
    expect(res.json().data).not.toHaveProperty('rosterPeriodId')
    expect(res.json().data).not.toHaveProperty('filiale')
    expect(res.json().data).not.toHaveProperty('awardRunAt')
    expect(res.json().data.awardPublishAt).toBe('2026-05-30T00:00:00')
    expect(res.json().data).not.toHaveProperty('maxTiers')
    expect(res.json().data).not.toHaveProperty('description')
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/update f8\.roster_period[\s\S]*where name = \$10[\s\S]*or roster_period = \$11/),
      [
        'lei',
        'Jun 2026',
        '2026-06-01T00:00:00',
        '2026-06-30T00:00:00',
        '2026-05-01T00:00:00',
        '2026-05-20T00:00:00',
        '2026-05-30T00:00:00',
        '2026-06-01T00:00:00',
        '2026-06-05T00:00:00',
        '2026-06',
        '2026RP06',
      ],
    )
  })

  it('creates roster_period when Period Code has no existing match', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('update f8.roster_period')) return { rows: [] }
      if (sql.includes('insert into f8.roster_period')) return { rows: [periodRow] }
      return { rows: [] }
    })
    const { app } = await build(query)

    const res = await app.inject({
      method: 'POST',
      url: '/api/pbs/period-admin',
      payload: validPeriodPayload,
    })

    expect(res.statusCode).toBe(200)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('insert into f8.roster_period'),
      expect.arrayContaining(['2026', '2026-06', '2026RP06', 'Jun 2026']),
    )
  })

  it('rejects obsolete rosterPeriodId fields in period payloads', async () => {
    const query = vi.fn(async () => ({ rows: [] }))
    const { app } = await build(query)

    const res = await app.inject({
      method: 'POST',
      url: '/api/pbs/period-admin',
      payload: {
        ...validPeriodPayload,
        rosterPeriodId: 7,
      },
    })

    expect(res.statusCode).toBe(400)
    expect(query).not.toHaveBeenCalled()
  })

  it('rejects obsolete division fields in period payloads', async () => {
    const query = vi.fn(async () => ({ rows: [] }))
    const { app } = await build(query)

    const res = await app.inject({
      method: 'POST',
      url: '/api/pbs/period-admin',
      payload: {
        ...validPeriodPayload,
        division: 'C',
      },
    })

    expect(res.statusCode).toBe(400)
    expect(query).not.toHaveBeenCalled()
  })

  it('rejects obsolete filiale fields in period payloads', async () => {
    const query = vi.fn(async () => ({ rows: [] }))
    const { app } = await build(query)

    const res = await app.inject({
      method: 'POST',
      url: '/api/pbs/period-admin',
      payload: {
        ...validPeriodPayload,
        filiale: 'F8',
      },
    })

    expect(res.statusCode).toBe(400)
    expect(query).not.toHaveBeenCalled()
  })

  it('updates PBS fields on roster_period with provided fields only', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-05-21T00:00:00.000Z'))
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("to_char(rp_start") && sql.includes('where id = $1')) return { rows: [currentPeriodRow] }
      if (sql.includes('as rp_overlap')) return { rows: [{ rp_overlap: false, bid_overlap: false }] }
      if (sql.includes('update f8.roster_period')) return { rows: [{ ...periodRow, bid_close_at: '2026-05-22T00:00:00.000Z', status: 'CLOSED' }] }
      return { rows: [] }
    })
    const { app } = await build(query)

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/pbs/period-admin/42',
      payload: { bidCloseAt: '2026-05-22T00:00:00' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.status).toBe('CLOSED')
    expect(res.json().data.computedStage).toBe('OPEN')
    expect(res.json().data).not.toHaveProperty('filiale')
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('update f8.roster_period'),
      ['lei', '2026-05-22T00:00:00', 42],
    )
  })

  it('rejects obsolete rosterPeriodId fields in period updates', async () => {
    const query = vi.fn(async () => ({ rows: [] }))
    const { app } = await build(query)

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/pbs/period-admin/42',
      payload: { rosterPeriodId: 7 },
    })

    expect(res.statusCode).toBe(400)
    expect(query).not.toHaveBeenCalled()
  })

  it('rejects obsolete filiale fields in period updates', async () => {
    const query = vi.fn(async () => ({ rows: [] }))
    const { app } = await build(query)

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/pbs/period-admin/42',
      payload: { filiale: 'F8' },
    })

    expect(res.statusCode).toBe(400)
    expect(query).not.toHaveBeenCalled()
  })

  it.each([
    ['awardRunAt', '2026-05-21T00:00:00.000Z'],
    ['maxTiers', 7],
    ['description', 'unused'],
  ])('rejects removed %s fields in period payloads and updates', async (field, value) => {
    const query = vi.fn(async () => ({ rows: [] }))
    const { app } = await build(query)
    const basePayload = validPeriodPayload

    const [create, update] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/pbs/period-admin',
        payload: { ...basePayload, [field]: value },
      }),
      app.inject({
        method: 'PATCH',
        url: '/api/pbs/period-admin/42',
        payload: { [field]: value },
      }),
    ])

    expect(create.statusCode).toBe(400)
    expect(update.statusCode).toBe(400)
    expect(query).not.toHaveBeenCalled()
  })

  it('accepts Award Publish as the planned Award visibility time', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("to_char(rp_start") && sql.includes('where id = $1')) return { rows: [currentPeriodRow] }
      if (sql.includes('as rp_overlap')) return { rows: [{ rp_overlap: false, bid_overlap: false }] }
      if (sql.includes('update f8.roster_period')) {
        return { rows: [{ ...periodRow, award_publish_at: '2026-06-01T00:00:00.000Z' }] }
      }
      return { rows: [] }
    })
    const { app } = await build(query)

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/pbs/period-admin/42',
      payload: { awardPublishAt: '2026-06-01T00:00:00' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().data.awardPublishAt).toBe('2026-06-01T00:00:00')
  })

  it('rejects invalid period chronology before querying the database', async () => {
    const query = vi.fn(async () => ({ rows: [] }))
    const { app } = await build(query)

    const response = await app.inject({
      method: 'POST',
      url: '/api/pbs/period-admin',
      payload: {
        ...validPeriodPayload,
        rpEnd: '2026-05-31T00:00:00',
        awardPublishAt: '2026-05-19T00:00:00',
      },
    })

    expect(response.statusCode).toBe(400)
    expect(query).not.toHaveBeenCalled()
  })

  it('rejects Final At before Award Publish and a non-later Mis-award Deadline', async () => {
    const query = vi.fn(async () => ({ rows: [] }))
    const { app } = await build(query)

    const finalBeforePublish = await app.inject({
      method: 'POST',
      url: '/api/pbs/period-admin',
      payload: { ...validPeriodPayload, awardFinalAt: '2026-05-29T23:59:59' },
    })
    const deadlineAtFinal = await app.inject({
      method: 'POST',
      url: '/api/pbs/period-admin',
      payload: { ...validPeriodPayload, misAwardDeadlineAt: validPeriodPayload.awardFinalAt },
    })

    expect(finalBeforePublish.statusCode).toBe(400)
    expect(deadlineAtFinal.statusCode).toBe(400)
    expect(query).not.toHaveBeenCalled()
  })

  it('rejects timezone-qualified values because period fields are local wall time', async () => {
    const query = vi.fn(async () => ({ rows: [] }))
    const { app } = await build(query)

    const response = await app.inject({
      method: 'POST',
      url: '/api/pbs/period-admin',
      payload: { ...validPeriodPayload, bidOpenAt: '2026-05-01T00:00:00.000Z' },
    })

    expect(response.statusCode).toBe(400)
    expect(query).not.toHaveBeenCalled()
  })

  it('rejects overlapping roster periods', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('select id from f8.roster_period')) return { rows: [] }
      if (sql.includes('as rp_overlap')) return { rows: [{ rp_overlap: true, bid_overlap: false }] }
      return { rows: [] }
    })
    const { app } = await build(query)

    const response = await app.inject({
      method: 'POST',
      url: '/api/pbs/period-admin',
      payload: validPeriodPayload,
    })

    expect(response.statusCode).toBe(409)
    expect(response.json().message).toBe('Roster period overlaps another PBS period')
  })

  it('rejects delete when the period is referenced', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('pbs_bid')) return { rows: [{ bid_count: 3, award_count: 0 }] }
      return { rows: [] }
    })
    const { app } = await build(query)

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/pbs/period-admin/42',
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().message).toBe('PBS period is in use and cannot be deleted')
  })

  it('clears PBS fields from an unreferenced roster_period', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('pbs_bid')) return { rows: [{ bid_count: 0, award_count: 0 }] }
      return { rows: [{ id: 42 }] }
    })
    const { app } = await build(query)

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/pbs/period-admin/42',
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data).toEqual({ id: 42 })
  })

  it('requires PBS_PERIOD menu permission when not admin', async () => {
    const query = vi.fn(async () => ({ rows: [] }))
    const { app } = await build(query, 0)

    const res = await app.inject({
      method: 'GET',
      url: '/api/pbs/period-admin',
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().message).toBe('Access denied: missing menu permission')
    expect(query).not.toHaveBeenCalled()
  })

  it('grants access to PBS period admin when user has PBS_PERIOD menu permission', async () => {
    const query = vi.fn(async () => ({ rows: [periodRow] }))
    const { app } = await build(query, 0, ['PBS_PERIOD'])

    const res = await app.inject({
      method: 'GET',
      url: '/api/pbs/period-admin',
    })

    expect(res.statusCode).toBe(200)
    expect(query).toHaveBeenCalled()
  })

  it('admin short-circuit grants access without explicit menu permission', async () => {
    const query = vi.fn(async () => ({ rows: [periodRow] }))
    const { app } = await build(query, 1)

    const res = await app.inject({
      method: 'GET',
      url: '/api/pbs/period-admin',
    })

    expect(res.statusCode).toBe(200)
    expect(query).toHaveBeenCalled()
  })

  it('does not register the obsolete Portal active period route', async () => {
    const query = vi.fn(async () => ({ rows: [] }))
    const { app } = await build(query)

    const res = await app.inject({
      method: 'GET',
      url: '/api/pbs/period-admin/portal-active-period?filiale=f8&division=C',
    })

    expect(res.statusCode).toBe(404)
    expect(query).not.toHaveBeenCalled()
  })

  it('does not register Business Time under the Period API', async () => {
    const query = vi.fn(async () => ({ rows: [] }))
    const { app } = await build(query)

    const [getResponse, putResponse] = await Promise.all([
      app.inject({ method: 'GET', url: '/api/pbs/period-admin/business-time' }),
      app.inject({ method: 'PUT', url: '/api/pbs/period-admin/business-time', payload: { action: 'CLEAR' } }),
    ])

    expect(getResponse.statusCode).toBe(404)
    expect(putResponse.statusCode).toBe(404)
  })

  it('previews 12 generated periods using the first Friday of the previous month', async () => {
    const query = vi.fn(async () => ({ rows: [] }))
    const { app } = await build(query)

    const res = await app.inject({
      method: 'POST',
      url: '/api/pbs/period-admin/generate-year/preview',
      payload: {
        year: 2026,
        bidOpenTime: '00:00',
        bidCloseTime: '23:59',
      },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json().data
    expect(body.total).toBe(12)
    expect(body.newCount).toBe(12)
    expect(body.existingCount).toBe(0)
    expect(body.items[0]).toMatchObject({
      periodCode: 'Jan 2026',
      rpStart: '2026-01-01T00:00:00',
      rpEnd: '2026-01-30T00:00:00',
      bidOpenAt: '2025-12-05T00:00:00',
      bidCloseAt: '2025-12-12T23:59:00',
      awardPublishAt: '2025-12-22T23:59:00',
      awardFinalAt: '2025-12-24T23:59:00',
      misAwardDeadlineAt: '2025-12-28T23:59:00',
      exists: false,
    })
    expect(body.items[0]).not.toHaveProperty('filiale')
    expect(body.items[0]).not.toHaveProperty('maxTiers')
    expect(body.items[5]).toMatchObject({
      periodCode: 'Jun 2026',
      bidOpenAt: '2026-05-01T00:00:00',
      bidCloseAt: '2026-05-08T23:59:00',
    })
    expect(body.items[1]).toMatchObject({
      periodCode: 'Feb 2026',
      rpStart: '2026-01-31T00:00:00',
      rpEnd: '2026-03-01T00:00:00',
    })
    expect(body.items[2]).toMatchObject({
      periodCode: 'Mar 2026',
      rpStart: '2026-03-02T00:00:00',
      rpEnd: '2026-03-31T00:00:00',
    })
  })

  it('rejects obsolete division fields in year generation payloads', async () => {
    const query = vi.fn(async () => ({ rows: [] }))
    const { app } = await build(query)

    const res = await app.inject({
      method: 'POST',
      url: '/api/pbs/period-admin/generate-year/preview',
      payload: {
        year: 2026,
        division: 'C',
      },
    })

    expect(res.statusCode).toBe(400)
    expect(query).not.toHaveBeenCalled()
  })

  it('rejects obsolete filiale fields in year generation payloads', async () => {
    const query = vi.fn(async () => ({ rows: [] }))
    const { app } = await build(query)

    const [preview, generate] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/pbs/period-admin/generate-year/preview',
        payload: { year: 2026, filiale: 'F8' },
      }),
      app.inject({
        method: 'POST',
        url: '/api/pbs/period-admin/generate-year',
        payload: { year: 2026, filiale: 'F8' },
      }),
    ])

    expect(preview.statusCode).toBe(400)
    expect(generate.statusCode).toBe(400)
    expect(query).not.toHaveBeenCalled()
  })

  it('rejects removed maxTiers fields in year generation payloads', async () => {
    const query = vi.fn(async () => ({ rows: [] }))
    const { app } = await build(query)

    const [preview, generate] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/pbs/period-admin/generate-year/preview',
        payload: { year: 2026, maxTiers: 7 },
      }),
      app.inject({
        method: 'POST',
        url: '/api/pbs/period-admin/generate-year',
        payload: { year: 2026, maxTiers: 7 },
      }),
    ])

    expect(preview.statusCode).toBe(400)
    expect(generate.statusCode).toBe(400)
    expect(query).not.toHaveBeenCalled()
  })

  it('marks existing generated periods in preview', async () => {
    const query = vi.fn(async () => ({ rows: [generatedPeriodRow('Jun 2026', 77)] }))
    const { app } = await build(query)

    const res = await app.inject({
      method: 'POST',
      url: '/api/pbs/period-admin/generate-year/preview',
      payload: {
        year: 2026,
      },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json().data
    expect(body.newCount).toBe(11)
    expect(body.existingCount).toBe(1)
    expect(body.items.find((item: { periodCode: string }) => item.periodCode === 'Jun 2026')).toMatchObject({
      exists: true,
      existingId: 77,
    })
  })

  it('generates only missing periods and skips existing rows', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('select code, code_value')) return { rows: [] }
      if (sql.includes('from f8.roster_period')) return { rows: [generatedPeriodRow('Jun 2026', 77)] }
      if (sql.includes('update f8.roster_period')) return { rows: [] }
      if (sql.includes('insert into f8.roster_period')) return { rows: [generatedPeriodRow('Jan 2026', 101)] }
      return { rows: [] }
    })
    const { app } = await build(query)

    const res = await app.inject({
      method: 'POST',
      url: '/api/pbs/period-admin/generate-year',
      payload: {
        year: 2026,
      },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json().data
    expect(body.createdCount).toBe(11)
    expect(body.skippedCount).toBe(1)
    expect(body.items[0]).not.toHaveProperty('filiale')
    expect(body.created[0]).not.toHaveProperty('filiale')
    expect(body.items[0]).not.toHaveProperty('maxTiers')
    expect(body.created[0]).not.toHaveProperty('maxTiers')
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('insert into f8.roster_period'),
      expect.arrayContaining(['lei', '2026', '2026-01', '2026RP01', 'Jan 2026']),
    )
  })
})
