import { describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'
import scenarioLegalityRoutes from '../../routes/scenario/legality.js'
import type { Pool } from 'pg'

vi.mock('../../services/scenario/legality-status.js', () => ({
  ensureLegality: vi.fn(async () => ({
    state: 'READY',
    paramsStale: false,
    computedAt: '2026-08-01T00:00:00.000Z',
    errorText: null,
  })),
  forceRecompute: vi.fn(),
}))

vi.mock('../../utils/db-schema.js', () => ({
  liveSchema: () => '"f8"',
  scenarioSchema: () => '"scenario"',
}))

const buildApp = (rows: unknown[]) => {
  const app = Fastify()
  const query = vi.fn().mockResolvedValue({ rows })
  app.decorate('pgPool', { query } as unknown as Pool)
  app.register(scenarioLegalityRoutes, { prefix: '/api/scenario' })
  return { app, query }
}

describe('GET /api/scenario/:id/legality display-window overlap', () => {
  it('filters with scenario official period and coalesce(window_*, start/end)', async () => {
    const { app, query } = buildApp([])

    const res = await app.inject({
      method: 'GET',
      url: '/api/scenario/683/legality',
    })

    expect(res.statusCode).toBe(200)
    const sql = String(query.mock.calls[0][0])
    expect(sql).toContain('coalesce(rv.window_start_dt, rv.start_dt)')
    expect(sql).toContain('coalesce(rv.window_end_dt, rv.end_dt)')
    expect(sql).toContain('s.str_dt_loc::date as start_d')
    expect(sql).toContain('s.end_dt_loc::date as end_d')
    expect(sql).not.toContain("date_trunc('month', s.str_dt_loc) - interval '1 month'")
    expect(sql).toContain('(b.end_d + 1)::timestamptz')
    expect(sql).toContain('(b.start_d::timestamptz)')
    expect(sql).toContain('from "f8".scenario s')
    expect(sql).toContain('from "scenario".rule_violation rv')
    expect(sql).not.toContain('from "scenario".scenario s')
    expect(query.mock.calls[0][1]).toEqual([683])

    await app.close()
  })
})
