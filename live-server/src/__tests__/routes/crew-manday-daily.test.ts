import { describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'
import crewMandayDailyRoutes from '../../routes/crew/crew-manday-daily.js'
import scenarioMandayDailyRoutes from '../../routes/scenario/scenario-manday-daily.js'
import type { Pool } from 'pg'

vi.mock('../../utils/db-schema.js', () => ({
  liveSchema: () => '"f8"',
  scenarioSchema: () => '"scenario"',
}))

const buildLiveApp = (query: ReturnType<typeof vi.fn>) => {
  const app = Fastify()
  app.decorate('pgPool', { query } as unknown as Pool)
  app.register(crewMandayDailyRoutes, { prefix: '/api/crew' })
  return app
}

const buildScenarioApp = (query: ReturnType<typeof vi.fn>) => {
  const app = Fastify()
  app.decorate('pgPool', { query } as unknown as Pool)
  app.register(scenarioMandayDailyRoutes, { prefix: '/api/scenario' })
  return app
}

describe('GET /api/crew/manday-daily', () => {
  it('routes FD division to crew_manday_fd_daily and returns minutes', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{ crew_id: '2380', division: 'P', base: 'YYC', zone_id: 'America/Edmonton' }],
      })
      .mockResolvedValueOnce({
        rows: [
          { crew_base_dt: '2026-09-03', credit: 240, blh: 235, dp: 300 },
          { crew_base_dt: new Date('2026-09-04T00:00:00.000Z'), credit: 485, blh: 485, dp: 545 },
        ],
      })

    const app = buildLiveApp(query)
    const res = await app.inject({
      method: 'GET',
      url: '/api/crew/manday-daily?crewId=2380&start=2026-09-03&end=2026-09-07',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.data).toMatchObject({
      crewId: '2380',
      base: 'YYC',
      zoneId: 'America/Edmonton',
    })
    expect(body.data.days).toEqual([
      { date: '2026-09-03', creditMin: 240, blhMin: 235, dpMin: 300 },
      { date: '2026-09-04', creditMin: 485, blhMin: 485, dpMin: 545 },
    ])

    const dailySql = String(query.mock.calls[1][0])
    expect(dailySql).toContain('crew_manday_fd_daily')
    expect(dailySql).not.toContain('crew_manday_cc_am_daily')
    expect(query.mock.calls[1][1]).toEqual(['2380', '2026-09-03', '2026-09-07'])

    await app.close()
  })

  it('routes non-P division to crew_manday_cc_am_daily', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{ crew_id: '9001', division: 'C', base: 'YVR', zone_id: 'America/Vancouver' }],
      })
      .mockResolvedValueOnce({ rows: [] })

    const app = buildLiveApp(query)
    const res = await app.inject({
      method: 'GET',
      url: '/api/crew/manday-daily?crewId=9001&start=2026-08-01&end=2026-08-31',
    })
    expect(res.statusCode).toBe(200)
    expect(String(query.mock.calls[1][0])).toContain('crew_manday_cc_am_daily')
    await app.close()
  })

  it('rejects bad dates before querying', async () => {
    const query = vi.fn()
    const app = buildLiveApp(query)
    const res = await app.inject({
      method: 'GET',
      url: '/api/crew/manday-daily?crewId=2380&start=2026-9-3&end=2026-09-07',
    })
    // Project convention: fail() returns HTTP 200 with body.code = 400
    expect(res.statusCode).toBe(200)
    expect(res.json().code).toBe(400)
    expect(res.json().message).toMatch(/YYYY-MM-DD/)
    expect(query).not.toHaveBeenCalled()
    await app.close()
  })
})

describe('GET /api/scenario/:id/manday-daily', () => {
  it('queries scenario schema daily table with scenario_id', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{ crew_id: '246', division: 'P', base: 'YYC', zone_id: 'America/Edmonton' }],
      })
      .mockResolvedValueOnce({
        rows: [{ crew_base_dt: '2026-09-05', credit: 520, blh: 520, dp: 580 }],
      })

    const app = buildScenarioApp(query)
    const res = await app.inject({
      method: 'GET',
      url: '/api/scenario/42/manday-daily?crewId=246&start=2026-09-01&end=2026-09-30',
    })
    expect(res.statusCode).toBe(200)
    expect(bodyDays(res)).toEqual([{ date: '2026-09-05', creditMin: 520, blhMin: 520, dpMin: 580 }])
    const sql = String(query.mock.calls[1][0])
    expect(sql).toContain('"scenario".crew_manday_fd_daily')
    expect(sql).toContain('scenario_id = $1')
    expect(query.mock.calls[1][1]).toEqual([42, '246', '2026-09-01', '2026-09-30'])
    await app.close()
  })
})

const bodyDays = (res: { json: () => { data: { days: unknown } } }) => res.json().data.days
