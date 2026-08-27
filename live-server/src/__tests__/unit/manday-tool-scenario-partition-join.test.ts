import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../config/index.js', () => ({
  env: {
    LIVE_SCHEMA: 'f8',
    SCENARIO_SCHEMA: 'scenario',
  },
}))

vi.mock('../../services/manday/manday-tool-rust.js', () => ({
  runRust: vi.fn(() => ({ D: [], M: [], Y: [] })),
}))

describe('manday-tool scenario partition-aware flight join', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('joins live.flight when scenario flight_scenario_id = 0 (RO live-backed)', async () => {
    const queries: Array<{ sql: string; params?: unknown[] }> = []
    const pool = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params })
        if (sql.includes('FROM') && sql.includes('.scenario') && sql.includes('flight_scenario_id')) {
          return { rows: [{ pairing_scenario_id: 0, flight_scenario_id: 0 }] }
        }
        if (sql.includes('has_act') || sql.includes('duty_act_credited_minutes')
          || sql.includes('pairing_id IS NOT NULL') || sql.includes('pairing_id is not null')) {
          return {
            rows: [{
              crew_id: '106',
              credit: 535,
              blk: 535,
              start_utc: '2026-07-01T10:30:00',
              dep_utc: '2026-07-01T10:30:00',
              arv_utc: '2026-07-01T19:25:00',
              has_act: true,
            }],
          }
        }
        if (sql.includes('pairing_id IS NULL') || sql.includes('pairing_id is null')) {
          return { rows: [] }
        }
        if (sql.includes('.crew ') && sql.includes('crew_id')) {
          return { rows: [{ crew_id: '106', division: 'C' }] }
        }
        if (sql.includes('crew_base')) {
          return { rows: [{ crew_id: '106', base: 'YYZ' }] }
        }
        if (sql.includes('airport')) {
          return { rows: [{ airport: 'YYZ', zone_id: 'America/Toronto' }] }
        }
        if (sql.includes('.assignment')) {
          return { rows: [] }
        }
        return { rows: [], rowCount: 0 }
      }),
    }

    const { recompute } = await import('../../services/manday/manday-tool.js')
    await recompute(pool as never, {
      schema: 'scenario',
      scenarioId: 690,
      crewIds: ['106'],
      startDt: '2026-07-01',
      endDt: '2026-07-01',
      updatedBy: 'TEST',
    })

    const ptrSql = queries.map((q) => q.sql).find((s) => s.includes('flight_scenario_id'))
    expect(ptrSql, 'must read scenario partition pointers').toBeTruthy()

    const creditSql = queries.map((q) => q.sql).find((s) => s.includes('duty_act_credited_minutes'))
    expect(creditSql).toMatch(/"f8"\.pairing_segment/)

    const legSql = queries.map((q) => q.sql).find((s) => s.includes('has_act'))
    expect(legSql).toBeTruthy()
    expect(legSql).toMatch(/"f8"\.flight/)
    expect(legSql).not.toMatch(/"scenario"\.flight/)
    expect(legSql).not.toMatch(/AND f\.scenario_id\s*=/)
  })

  it('joins scenario.flight filtered by partition when flight_scenario_id > 0 (frozen copy)', async () => {
    const queries: Array<{ sql: string; params?: unknown[] }> = []
    const pool = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params })
        if (sql.includes('FROM') && sql.includes('.scenario') && sql.includes('flight_scenario_id')) {
          return { rows: [{ pairing_scenario_id: 405, flight_scenario_id: 456 }] }
        }
        if (sql.includes('has_act') || sql.includes('duty_act_credited_minutes')
          || sql.includes('pairing_id IS NOT NULL') || sql.includes('pairing_id is not null')) {
          return {
            rows: [{
              crew_id: 'C1',
              credit: 100,
              blk: 90,
              start_utc: '2026-07-01T10:00:00',
              dep_utc: '2026-07-01T10:00:00',
              arv_utc: '2026-07-01T11:30:00',
              has_act: false,
            }],
          }
        }
        if (sql.includes('pairing_id IS NULL') || sql.includes('pairing_id is null')) {
          return { rows: [] }
        }
        if (sql.includes('.crew ') && sql.includes('crew_id')) {
          return { rows: [{ crew_id: 'C1', division: 'P' }] }
        }
        if (sql.includes('crew_base')) {
          return { rows: [{ crew_id: 'C1', base: 'YYC' }] }
        }
        if (sql.includes('airport')) {
          return { rows: [{ airport: 'YYC', zone_id: 'America/Edmonton' }] }
        }
        if (sql.includes('.assignment')) {
          return { rows: [] }
        }
        return { rows: [], rowCount: 0 }
      }),
    }

    const { recompute } = await import('../../services/manday/manday-tool.js')
    await recompute(pool as never, {
      schema: 'scenario',
      scenarioId: 460,
      crewIds: ['C1'],
      startDt: '2026-07-01',
      endDt: '2026-07-01',
      updatedBy: 'TEST',
    })

    const creditSql = queries.map((q) => q.sql).find((s) => s.includes('duty_act_credited_minutes'))
    expect(creditSql).toMatch(/"scenario"\.pairing_segment/)
    expect(creditSql).toMatch(/scenario_id\s*=\s*405/)

    const legSql = queries.map((q) => q.sql).find((s) => s.includes('has_act'))
    expect(legSql).toBeTruthy()
    expect(legSql).toMatch(/"scenario"\.flight/)
    expect(legSql).toMatch(/f\.scenario_id\s*=\s*456/)
  })
})
