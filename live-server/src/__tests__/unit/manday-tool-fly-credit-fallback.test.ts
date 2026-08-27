import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../config/index.js', () => ({
  env: {
    LIVE_SCHEMA: 'f8',
    SCENARIO_SCHEMA: 'scenario',
  },
}))

// Pure arithmetic core is optional here — mock so unit tests don't need the binary.
vi.mock('../../services/manday/manday-tool-rust.js', () => ({
  runRust: vi.fn(() => ({ D: [], M: [], Y: [] })),
}))

import { runRust } from '../../services/manday/manday-tool-rust.js'

describe('manday-tool FLY credit fallback', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('loadActivity / recompute flying SQL prefers RF credit then pairing duty credit', async () => {
    const queries: Array<{ sql: string; params?: unknown[] }> = []
    const pool = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params })
        // Minimal result shapes so recompute can proceed without real data.
        if (sql.includes('has_act')) {
          return {
            rows: [{
              crew_id: 'C1',
              blk: 100,
              dep_utc: '2026-07-01T10:00:00',
              arv_utc: '2026-07-01T11:40:00',
              has_act: true,
            }],
          }
        }
        if (sql.includes('duty_act_credited_minutes')
          || sql.includes('pairing_id IS NOT NULL') || sql.includes('pairing_id is not null')) {
          return {
            rows: [{
              crew_id: 'C1',
              credit: 120,
              start_utc: '2026-07-01T10:00:00',
            }],
          }
        }
        if (sql.includes('pairing_id IS NULL') || sql.includes('pairing_id is null')) {
          return { rows: [] }
        }
        if (sql.includes('FROM') && sql.includes('.crew ') && sql.includes('crew_id')) {
          return { rows: [{ crew_id: 'C1', division: 'P' }] }
        }
        if (sql.includes('crew_base')) {
          return { rows: [{ crew_id: 'C1', base: 'YYC' }] }
        }
        if (sql.includes('airport')) {
          return { rows: [{ airport: 'YYC', zone_id: 'America/Edmonton' }] }
        }
        if (sql.includes('FROM') && sql.includes('.assignment')) {
          return { rows: [] }
        }
        // zero/upsert/reagg statements
        return { rows: [], rowCount: 0 }
      }),
    }

    const { recompute } = await import('../../services/manday/manday-tool.js')
    await recompute(pool as never, {
      schema: 'f8',
      crewIds: ['C1'],
      startDt: '2026-07-01',
      endDt: '2026-07-31',
      updatedBy: 'TEST',
    })

    const flySql = queries.map((q) => q.sql).find((s) =>
      s.includes('duty_act_credited_minutes'))
    expect(flySql).toBeTruthy()
    expect(flySql).toContain('COALESCE(rf.act_credited_minutes, ps.duty_credit, 0)')
    expect(flySql).toContain('duty_act_credited_minutes')
    expect(flySql).toMatch(/pairing_segment/i)
  })

  it('uses the CrewBase effective at duty start and guards UTC-midnight candidate queries', async () => {
    const queries: string[] = []
    const pool = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql)
        if (sql.includes('COALESCE(ps.duty_min')) return {
          rows: [{ crew_id: 'C1', assignment: 'FT', duty_min: 120, credit: 120, start_utc: '2026-08-01T00:30:00', end_utc: '2026-08-01T02:30:00' }],
        }
        if (sql.includes('has_act')) return { rows: [] }
        if (sql.includes('pairing_id IS NULL')) return { rows: [] }
        if (/FROM\s+[^\s]+\.crew\s/.test(sql)) return { rows: [{ crew_id: 'C1', division: 'P' }] }
        if (/FROM\s+[^\s]+\.crew_base\s/.test(sql)) return {
          rows: [
            { crew_id: 'C1', base: 'YYZ', eff_dt: '2026-08-01T00:00:00Z', exp_dt: null, is_prime_base: 1, zone_id: 'America/Toronto' },
            { crew_id: 'C1', base: 'YVR', eff_dt: '2026-01-01T00:00:00Z', exp_dt: '2026-08-01T00:00:00Z', is_prime_base: 1, zone_id: 'America/Vancouver' },
          ],
        }
        if (/FROM\s+[^\s]+\.assignment\b/.test(sql)) return { rows: [] }
        return { rows: [], rowCount: 0 }
      }),
    }

    const { recompute } = await import('../../services/manday/manday-tool.js')
    await recompute(pool as never, {
      schema: 'f8', crewIds: ['C1'], startDt: '2026-07-31', endDt: '2026-07-31', updatedBy: 'TEST',
    })

    expect(queries.find((sql) => sql.includes('rf.sch_str_dt_utc >= '))).toContain("- INTERVAL '1 day'")
    expect(queries.find((sql) => sql.includes('rf.sch_str_dt_utc < '))).toContain("+ INTERVAL '2 days'")
    expect(vi.mocked(runRust)).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ crewId: 'C1', localDate: '2026-07-31' }),
    ]))
  })
})
