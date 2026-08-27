import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

const workerMocks = vi.hoisted(() => ({
  Worker: vi.fn().mockImplementation((_queueName: string, processor: unknown) => ({
    processor,
    on: vi.fn(),
  })),
  refreshPairingCompositionFillBulk: vi.fn(),
  refreshLiveLegalityAndManday: vi.fn(),
}))

// Mock config to avoid env var validation (DATABASE_URL required)
vi.mock('../../config/index.js', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    LIVE_SCHEMA: 'f8',
  },
}))

vi.mock('bullmq', () => ({
  Worker: workerMocks.Worker,
}))

vi.mock('../../utils/bullmq-redis.js', () => ({
  attachBullmqErrorLogger: vi.fn((emitter) => emitter),
  getBullmqRedisConnection: vi.fn(() => ({})),
}))

vi.mock('../../services/manday/manday-operation-service.js', () => ({
  refreshLiveLegalityAndManday: workerMocks.refreshLiveLegalityAndManday,
}))

vi.mock('../../utils/composition-fill.js', () => ({
  refreshPairingCompositionFillBulk: workerMocks.refreshPairingCompositionFillBulk,
}))

const mockDb = {
  execute: vi.fn(),
  transaction: async (cb: (tx: unknown) => unknown) => cb(mockDb),
}

describe('processRosterImportJob', () => {
  beforeEach(() => {
    mockDb.execute.mockReset()
    workerMocks.Worker.mockClear()
    workerMocks.refreshPairingCompositionFillBulk.mockReset()
    workerMocks.refreshPairingCompositionFillBulk.mockResolvedValue(undefined)
    workerMocks.refreshLiveLegalityAndManday.mockReset()
  })

  const buildSuccessfulImportMocks = (): void => {
    mockDb.execute
      .mockResolvedValueOnce({ rows: [{ id: 101, interface_id: 'P001', base: 'TPE' }] })
      .mockResolvedValueOnce({ rows: [{ rank: 'CA', position: 'PIC' }] })
      .mockResolvedValueOnce({ rows: [
        {
          id: 201, duty_seq: 1, seg_seq: 1, flt_id: 10, pairing_id: 101,
          flt_dt: '2026-06-01', flt_num: 'F8001', dep_arp: 'PEK', arv_arp: 'PVG',
          duty_act_credited_minutes: 300, duty_sch_credited_minutes: 290,
        },
        {
          id: 202, duty_seq: 1, seg_seq: 2, flt_id: 20, pairing_id: 101,
          flt_dt: '2026-06-01', flt_num: 'F8002', dep_arp: 'PVG', arv_arp: 'TPE',
          duty_act_credited_minutes: 300, duty_sch_credited_minutes: 290,
        },
      ]})
      .mockResolvedValueOnce({ rows: [] }) // existing import-owned assignment lookup
      .mockResolvedValueOnce({}) // SAVEPOINT
      .mockResolvedValueOnce({}) // DELETE
      .mockResolvedValueOnce({}) // INSERT row 1
      .mockResolvedValueOnce({}) // INSERT row 2
      .mockResolvedValueOnce({}) // RELEASE SAVEPOINT
  }

  const buildSuccessfulJob = () => ({
      syncId: 'test', filiale: 'F8',
      syncRangeDt: ['2026-06-01', '2026-06-30'] as [string, string],
      filteredCount: 0, rejectionFile: null,
      records: [{
        crewId: 'C001', pairingInterfaceId: 'P001',
        actingRank: 'CA', activeRank: 'CA', division: 'P',
        seqOrder: 1, assignment: 'FLY', assignmentGroup: 'FLY',
        base: 'PEK', source: 'PA',
      }],
    })

  it('expands roster records to per-segment rows', async () => {
    buildSuccessfulImportMocks()

    const { processRosterImportJob } = await import('../../workers/roster-inbound-worker.js')
    const job = buildSuccessfulJob()

    const result = await processRosterImportJob(job, mockDb as never)
    expect(result.imported).toBe(2)
    expect(result.success).toBe(2)
    expect(result.added).toBe(1)
    expect(result.updated).toBe(0)
    expect(result.errors).toHaveLength(0)
    expect(workerMocks.refreshPairingCompositionFillBulk).toHaveBeenCalledWith(mockDb, [101], 'F8_IMPORT')

    const dialect = new PgDialect()
    const statements = mockDb.execute.mock.calls.map(([q]) => dialect.sqlToQuery(q as never))
    const deleteSql = statements.find((s) => /^\s*delete\s+from\s+roster_flight/i.test(s.sql))
    expect(deleteSql?.sql).not.toContain('source =')
    expect(deleteSql?.sql).not.toContain('created_by =')

    const segmentSelect = statements.find((s) => /from\s+pairing_segment/i.test(s.sql))
    expect(segmentSelect?.sql).toContain('duty_act_credited_minutes')
    expect(segmentSelect?.sql).toContain('duty_sch_credited_minutes')
    expect(segmentSelect?.sql).toContain('dep_arp')
    expect(segmentSelect?.sql).toContain('arv_arp')

    const insertSql = statements.find((s) => /^\s*insert\s+into\s+roster_flight/i.test(s.sql))
    expect(insertSql?.sql).toContain('act_credited_minutes')
    expect(insertSql?.sql).toContain('sch_credited_minutes')
    expect(insertSql?.sql).toContain('position')
    expect(insertSql?.sql).toContain('dep_arp')
    expect(insertSql?.sql).toContain('arv_arp')
    // duty credit is written on every segment of the duty
    expect(insertSql?.params).toEqual(expect.arrayContaining([300, 290]))
    // base comes from pairing.base; position comes from active_rank → rank_position.
    expect(insertSql?.params).toEqual(expect.arrayContaining(['TPE', 'PIC', 'PEK', 'PVG']))
  })

  it('uses linked flight scheduled timestamps for roster_flight sch fields', async () => {
    mockDb.execute
      .mockResolvedValueOnce({ rows: [{ id: 101, interface_id: 'P001', base: 'TPE' }] })
      .mockResolvedValueOnce({ rows: [{ rank: 'CA', position: 'PIC' }] })
      .mockResolvedValueOnce({ rows: [{
        id: 201,
        duty_seq: 1,
        seg_seq: 1,
        flt_id: 11857,
        pairing_id: 101,
        flt_dt: '2026-08-10',
        flt_num: '7211',
        dep_arp: 'YEG',
        arv_arp: 'YYZ',
        sch_str_dt_utc: '2026-08-10T12:12:00.000Z',
        sch_end_dt_utc: '2026-08-10T15:17:00.000Z',
        act_str_dt_utc: '2026-08-10T12:12:00.000Z',
        act_end_dt_utc: '2026-08-10T15:17:00.000Z',
        flight_sch_str_dt_utc: '2026-08-10T12:00:00.000Z',
        flight_sch_end_dt_utc: '2026-08-10T15:05:00.000Z',
        duty_act_credited_minutes: 300,
        duty_sch_credited_minutes: 290,
      }] })
      .mockResolvedValueOnce({ rows: [] }) // existing assignment lookup
      .mockResolvedValueOnce({}) // stale roster delete
      .mockResolvedValueOnce({}) // SAVEPOINT
      .mockResolvedValueOnce({}) // DELETE crew pairing
      .mockResolvedValueOnce({}) // INSERT roster_flight
      .mockResolvedValueOnce({}) // RELEASE SAVEPOINT

    const { processRosterImportJob } = await import('../../workers/roster-inbound-worker.js')
    const result = await processRosterImportJob(buildSuccessfulJob(), mockDb as never)

    expect(result.imported).toBe(1)
    expect(result.errors).toHaveLength(0)

    const dialect = new PgDialect()
    const statements = mockDb.execute.mock.calls.map(([q]) => dialect.sqlToQuery(q as never))
    const segmentSelect = statements.find((s) => /from\s+pairing_segment\s+ps/i.test(s.sql))
    expect(segmentSelect?.sql).toContain('f.sch_dep_dt_utc AS flight_sch_str_dt_utc')
    expect(segmentSelect?.sql).toContain('LEFT JOIN flight f')

    const rosterInsert = statements.find((s) => /^\s*insert\s+into\s+roster_flight/i.test(s.sql))
    expect(rosterInsert?.params).toEqual(expect.arrayContaining([
      11857,
      '2026-08-10T12:00:00.000Z',
      '2026-08-10T15:05:00.000Z',
      '2026-08-10T12:12:00.000Z',
      '2026-08-10T15:17:00.000Z',
    ]))
  })

  it('emits a warning when pairing not found, skips record', async () => {
    mockDb.execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    const { processRosterImportJob } = await import('../../workers/roster-inbound-worker.js')
    const job = {
      syncId: 'test', filiale: 'F8',
      syncRangeDt: ['2026-06-01', '2026-06-30'] as [string, string],
      filteredCount: 0, rejectionFile: null,
      records: [{
        crewId: 'C001', pairingInterfaceId: 'UNKNOWN',
        actingRank: 'CA', activeRank: 'CA', division: 'P',
        seqOrder: 1, assignment: 'FLY', assignmentGroup: 'FLY',
        base: 'PEK', source: 'PA',
      }],
    }

    const result = await processRosterImportJob(job, mockDb as never)
    expect(result.imported).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.warnings).toHaveLength(1)
  })

  it('reports updated when the crew-pairing assignment already exists', async () => {
    mockDb.execute.mockReset()
    mockDb.execute.mockImplementationOnce(async () => ({ rows: [{ id: 101, interface_id: 'P001', base: 'TPE' }] }))
      .mockImplementationOnce(async () => ({ rows: [{ rank: 'CA', position: 'PIC' }] }))
      .mockImplementationOnce(async () => ({ rows: [
        {
          id: 201, duty_seq: 1, seg_seq: 1, flt_id: 10, pairing_id: 101,
          flt_dt: '2026-06-01', flt_num: 'F8001', dep_arp: 'PEK', arv_arp: 'PVG',
          duty_act_credited_minutes: 300, duty_sch_credited_minutes: 290,
        },
      ]}))
      .mockImplementationOnce(async () => ({ rows: [{ pairing_id: 101, crew_id: 'C001' }] }))
      .mockImplementation(async () => ({}))

    const { processRosterImportJob } = await import('../../workers/roster-inbound-worker.js')

    const result = await processRosterImportJob(buildSuccessfulJob(), mockDb as never)
    expect(result.added).toBe(0)
    expect(result.updated).toBe(1)
    expect(result.success).toBe(1)
  })

  it('reactivates a soft-deleted pairing after importing its roster segments', async () => {
    mockDb.execute
      .mockResolvedValueOnce({ rows: [{ id: 101, interface_id: 'P001', base: 'TPE', is_deleted: 1 }] })
      .mockResolvedValueOnce({ rows: [{ rank: 'CA', position: 'PIC' }] })
      .mockResolvedValueOnce({ rows: [
        {
          id: 201, duty_seq: 1, seg_seq: 1, flt_id: 10, pairing_id: 101,
          flt_dt: '2026-06-01', flt_num: 'F8001', dep_arp: 'PEK', arv_arp: 'PVG',
          duty_act_credited_minutes: 300, duty_sch_credited_minutes: 290,
        },
      ]})
      .mockResolvedValueOnce({ rows: [] }) // existing import-owned assignment lookup
      .mockResolvedValueOnce({}) // SAVEPOINT
      .mockResolvedValueOnce({}) // DELETE
      .mockResolvedValueOnce({}) // INSERT
      .mockResolvedValueOnce({}) // RELEASE SAVEPOINT
      .mockResolvedValueOnce({}) // reactivate pairing

    const { processRosterImportJob } = await import('../../workers/roster-inbound-worker.js')

    const result = await processRosterImportJob(buildSuccessfulJob(), mockDb as never)
    expect(result.success).toBe(1)

    const dialect = new PgDialect()
    const statements = mockDb.execute.mock.calls.map(([q]) => dialect.sqlToQuery(q as never))
    const reactivateSql = statements.find((s) => /^\s*update\s+pairing/i.test(s.sql))
    expect(reactivateSql?.sql).toContain('SET is_deleted = 0')
    expect(reactivateSql?.sql).toContain('updated_by')
    expect(reactivateSql?.params).toContain(101)
  })

  it('deletes roster rows for pairings in the sync range regardless of provenance when the payload is empty', async () => {
    mockDb.execute
      .mockResolvedValueOnce({ rows: [] }) // pairing lookup
      .mockResolvedValueOnce({ rows: [] }) // rank_position lookup
      .mockResolvedValueOnce({ rowCount: 7 }) // stale roster delete

    const { processRosterImportJob } = await import('../../workers/roster-inbound-worker.js')

    const result = await processRosterImportJob({
      syncId: 'test', filiale: 'F8',
      syncRangeDt: ['2026-06-01', '2026-06-30'] as [string, string],
      filteredCount: 0, rejectionFile: null,
      records: [],
    }, mockDb as never)

    expect(result.deleted).toBe(7)
    const dialect = new PgDialect()
    const statements = mockDb.execute.mock.calls.map(([q]) => dialect.sqlToQuery(q as never))
    const purge = statements.find((s) => /^\s*delete\s+from\s+roster_flight\s+as\s+rf/i.test(s.sql))
    expect(purge?.sql).toContain('USING pairing AS p')
    expect(purge?.sql).toContain('p.sch_str_dt_utc >=')
    expect(purge?.sql).not.toContain('rf.source')
    expect(purge?.sql).not.toContain('rf.created_by')
    expect(purge?.sql).not.toContain('p.source')
    expect(purge?.sql).not.toContain('p.created_by')
  })

  it('fails roster import when pairing composition fill refresh fails', async () => {
    buildSuccessfulImportMocks()
    workerMocks.refreshPairingCompositionFillBulk.mockRejectedValue(new Error('fill refresh failed'))

    const { processRosterImportJob } = await import('../../workers/roster-inbound-worker.js')

    await expect(processRosterImportJob(buildSuccessfulJob(), mockDb as never))
      .rejects.toThrow('fill refresh failed')
  })
})

describe('startRosterInboundWorker', () => {
  beforeEach(() => {
    mockDb.execute.mockReset()
    workerMocks.Worker.mockClear()
    workerMocks.refreshPairingCompositionFillBulk.mockReset()
    workerMocks.refreshPairingCompositionFillBulk.mockResolvedValue(undefined)
    workerMocks.refreshLiveLegalityAndManday.mockReset()
  })

  it('requires manday refresh after roster import', async () => {
    workerMocks.refreshLiveLegalityAndManday.mockResolvedValue(undefined)
    mockDb.execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({})

    const { startRosterInboundWorker } = await import('../../workers/roster-inbound-worker.js')
    const fastify = {
      db: mockDb,
      pgPool: {},
      log: { info: vi.fn(), error: vi.fn() },
    }

    startRosterInboundWorker(fastify as never)
    const processor = workerMocks.Worker.mock.calls[0][1] as (job: { data: unknown }) => Promise<unknown>
    const job = {
      data: {
        syncId: 'test',
        filiale: 'F8',
        syncRangeDt: ['2026-06-01', '2026-06-30'] as [string, string],
        filteredCount: 0,
        rejectionFile: null,
        records: [],
      },
    }

    await processor(job)

    expect(workerMocks.refreshLiveLegalityAndManday).toHaveBeenCalledWith(fastify, {
      legalityDates: ['2026-06-01', '2026-06-30'],
      startDt: '2026-06-01',
      endDt: '2026-06-30',
      updatedBy: 'ROSTER_IMPORT',
    })
  })

  it('still refreshes both consumers when the batch is marked defer-to-rosterGround', async () => {
    mockDb.execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({})

    const { startRosterInboundWorker } = await import('../../workers/roster-inbound-worker.js')
    const fastify = {
      db: mockDb,
      pgPool: {},
      log: { info: vi.fn(), error: vi.fn() },
    }

    startRosterInboundWorker(fastify as never)
    const processor = workerMocks.Worker.mock.calls[0][1] as (job: {
      data: {
        syncId: string
        filiale: string
        syncRangeDt: [string, string]
        filteredCount: number
        rejectionFile: string | null
        records: unknown[]
        deferMandayRecompute?: boolean
      }
    }) => Promise<unknown>

    await processor({
      data: {
        syncId: 'test',
        filiale: 'F8',
        syncRangeDt: ['2026-06-01', '2026-06-30'] as [string, string],
        filteredCount: 0,
        rejectionFile: null,
        records: [],
        deferMandayRecompute: true,
      },
    })

    expect(workerMocks.refreshLiveLegalityAndManday).toHaveBeenCalled()
  })

  it('fails the worker job when manday refresh fails', async () => {
    workerMocks.refreshLiveLegalityAndManday.mockRejectedValue(new Error('refresh failed'))
    mockDb.execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    const { startRosterInboundWorker } = await import('../../workers/roster-inbound-worker.js')
    const fastify = {
      db: mockDb,
      pgPool: {},
      log: { info: vi.fn(), error: vi.fn() },
    }

    startRosterInboundWorker(fastify as never)
    const processor = workerMocks.Worker.mock.calls[0][1] as (job: { data: unknown }) => Promise<unknown>

    await expect(processor({
      data: {
        syncId: 'test',
        filiale: 'F8',
        syncRangeDt: ['2026-06-01', '2026-06-30'] as [string, string],
        filteredCount: 0,
        rejectionFile: null,
        records: [],
      },
    })).rejects.toThrow('refresh failed')
  })
})
