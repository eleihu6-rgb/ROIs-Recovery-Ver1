import { describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'
import rosterViolationsRoutes from '../../routes/roster/roster-violations.js'
import type { Pool } from 'pg'

const buildApp = (rows: unknown[]) => {
  const app = Fastify()
  const query = vi.fn().mockResolvedValue({ rows })
  app.decorate('pgPool', { query } as unknown as Pool)
  app.register(rosterViolationsRoutes, { prefix: '/api' })
  return { app, query }
}

describe('GET /api/violations effective-window overlap', () => {
  it('uses coalesced effective-window overlap instead of contained anchor bounds', async () => {
    const { app, query } = buildApp([
      {
        crew_id: '2380',
        pairing_id: 9130713,
        rule_code: '8002',
        rule_instance: '001',
        ruleset_id: 103,
        severity: 3,
        actual_value: 3660,
        limit_value: 3600,
        unit: 'MINUTE',
        message: 'Cumulative block 61.0h exceeds 60h in the 28-day window 2026-06-16..2026-07-13 (America/Edmonton).',
        start_dt: new Date('2026-07-13T12:00:00.000Z'),
        end_dt: new Date('2026-07-13T18:00:00.000Z'),
        window_start_dt: new Date('2026-06-16T00:00:00.000Z'),
        window_end_dt: new Date('2026-07-13T00:00:00.000Z'),
      },
    ])

    const res = await app.inject({
      method: 'GET',
      url: '/api/violations?crewIds=2380&groupCode=103&start=2026-06-01T00%3A00%3A00.000Z&end=2026-06-30T23%3A59%3A59.000Z',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].crewId).toBe('2380')
    expect(body.data[0].pairingId).toBe(9130713)
    expect(body.data[0].checkResults[0]).toMatchObject({
      ruleCode: '8002',
      windowStartDt: '2026-06-16T00:00:00.000Z',
      windowEndDt: '2026-07-13T00:00:00.000Z',
    })

    const sql = String(query.mock.calls[0][0])
    expect(sql).toContain('coalesce(window_start_dt, start_dt)')
    expect(sql).toContain('coalesce(window_end_dt, end_dt)')
    expect(sql).toContain('($4::date + 1)::timestamptz')
    expect(sql).toContain('$3::date::timestamptz')
    expect(sql).not.toContain('start_dt >= $3')
    expect(sql).not.toContain('end_dt   <= $4')
    expect(query.mock.calls[0][1]).toEqual([['2380'], 103, '2026-06-01T00:00:00.000Z', '2026-06-30T23:59:59.000Z'])

    await app.close()
  })

  it('rejects non-numeric groupCode before querying', async () => {
    const { app, query } = buildApp([])
    const res = await app.inject({
      method: 'GET',
      url: '/api/violations?crewIds=2380&groupCode=pbs_solver_ruleset&start=2026-06-01&end=2026-06-30',
    })
    expect(res.statusCode).toBe(400)
    expect(query).not.toHaveBeenCalled()
    await app.close()
  })
})
