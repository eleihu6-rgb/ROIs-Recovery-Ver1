import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

// Mock config to avoid env var validation (DATABASE_URL required)
vi.mock('../../config/index.js', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
  },
}))

const mockDb = {
  execute: vi.fn(),
  transaction: async (cb: (tx: unknown) => unknown) => cb(mockDb),
}

describe('processFlightImportJob', () => {
  beforeEach(() => { mockDb.execute.mockReset() })

  it('upserts a flight record and returns imported count', async () => {
    mockDb.execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValue({ rows: [{ id: 1 }] })
    const { processFlightImportJob } = await import('../../workers/flight-inbound-worker.js')
    const job = {
      syncId: 'test-sync',
      filiale: 'F8',
      syncRangeDt: ['2026-06-01', '2026-06-30'] as [string, string],
      records: [{
        interfaceFltId: '12345', fltNum: '12345', airline: 'F8',
        fltDt: '2026-06-01', depArp: 'PEK', arvArp: 'PVG',
        fleet: 'B738', tailNum: null,
        schStrDtUtc: '2026-06-01T08:00:00.000Z',
        schEndDtUtc: '2026-06-01T10:00:00.000Z',
        actStrDtUtc: '2026-06-01T08:00:00.000Z',
        actEndDtUtc: '2026-06-01T10:00:00.000Z',
        estStrDtUtc: null, estEndDtUtc: null,
        actTakeOffUtc: null, actTouchDownUtc: null,
        segType: 'J', deviceCode: '',
        blkMin: 120, fltType: 'PAX', fltSts: null,
      }],
    }

    const result = await processFlightImportJob(job, mockDb as never)
    expect(result.imported).toBe(1)
    expect(result.added).toBe(1)
    expect(result.updated).toBe(0)
    expect(result.success).toBe(1)
    expect(result.errors).toHaveLength(0)
    expect(mockDb.execute).toHaveBeenCalled()

    const dialect = new PgDialect()
    const statements = mockDb.execute.mock.calls.map(([q]) => dialect.sqlToQuery(q as never))
    const insert = statements.find((s) => /^\s*insert\s+into\s+flight/i.test(s.sql))
    expect(insert?.sql).toContain('ac_owner')
    expect(insert?.sql).toContain('pilot_owner')
    expect(insert?.sql).toContain('cabin_owner')
    expect(insert?.sql).toContain('flt_dt_utc')
    expect(insert?.sql).toContain('flight_assignment')
    expect(insert?.sql).toContain("'F8', 'F8', 'F8'")
    expect(insert?.sql).toContain("'A', 'FLY'")
    expect(insert?.params).toContain('2026-06-01T08:00:00.000Z')
  })

  it('reports updated when the incoming flight interface id already exists', async () => {
    mockDb.execute
      .mockResolvedValueOnce({ rows: [{ interface_flt_id: '12345' }] })
      .mockResolvedValue({ rows: [{ id: 1 }] })
    const { processFlightImportJob } = await import('../../workers/flight-inbound-worker.js')
    const job = {
      syncId: 'test-sync',
      filiale: 'F8',
      syncRangeDt: ['2026-06-01', '2026-06-30'] as [string, string],
      records: [{
        interfaceFltId: '12345', fltNum: '12345', airline: 'F8',
        fltDt: '2026-06-01', depArp: 'PEK', arvArp: 'PVG',
        fleet: 'B738', tailNum: null,
        schStrDtUtc: '2026-06-01T08:00:00.000Z',
        schEndDtUtc: '2026-06-01T10:00:00.000Z',
        actStrDtUtc: '2026-06-01T08:00:00.000Z',
        actEndDtUtc: '2026-06-01T10:00:00.000Z',
        estStrDtUtc: null, estEndDtUtc: null,
        actTakeOffUtc: null, actTouchDownUtc: null,
        segType: 'J', deviceCode: '',
        blkMin: 120, fltType: 'PAX', fltSts: null,
      }],
    }

    const result = await processFlightImportJob(job, mockDb as never)
    expect(result.added).toBe(0)
    expect(result.updated).toBe(1)
    expect(result.success).toBe(1)
  })

  it('soft-deletes unreferenced flights in the sync range before inserting the fresh payload', async () => {
    mockDb.execute.mockResolvedValueOnce({ rowCount: 4 })
    const { processFlightImportJob } = await import('../../workers/flight-inbound-worker.js')

    const result = await processFlightImportJob({
      syncId: 'test-sync',
      filiale: 'F8',
      syncRangeDt: ['2026-06-01', '2026-06-30'] as [string, string],
      records: [],
    }, mockDb as never)

    expect(result.deleted).toBe(4)
    const dialect = new PgDialect()
    const statements = mockDb.execute.mock.calls.map(([q]) => dialect.sqlToQuery(q as never))
    const purge = statements.find((s) => /^\s*update\s+flight/i.test(s.sql))
    expect(purge?.sql).toContain('is_deleted = 1')
    expect(purge?.sql).toContain('sch_dep_dt_utc >=')
    expect(purge?.sql).not.toContain('created_by =')
    expect(purge?.sql).toMatch(/not exists\s*\(\s*select 1\s+from pairing_segment/i)
    expect(purge?.sql).toMatch(/join pairing/i)
    expect(purge?.params).toEqual(expect.arrayContaining(['2026-06-01', '2026-06-30']))
  })
})
