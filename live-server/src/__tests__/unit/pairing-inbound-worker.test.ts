import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

const workerMocks = vi.hoisted(() => ({
  refreshPairingCompositionFillBulk: vi.fn(),
  refreshFlightCompositionFill: vi.fn(),
  refreshPairingTafb: vi.fn(),
}))

// Mock env config so module loads without DATABASE_URL
vi.mock('../../config/index.js', () => ({
  env: { REDIS_URL: 'redis://localhost:6379' },
}))

vi.mock('../../utils/composition-fill.js', () => ({
  refreshPairingCompositionFillBulk: workerMocks.refreshPairingCompositionFillBulk,
  refreshFlightCompositionFill: workerMocks.refreshFlightCompositionFill,
}))

vi.mock('../../services/pairing/pairing-tafb-service.js', () => ({
  refreshPairingTafb: workerMocks.refreshPairingTafb,
}))

const mockDb = {
  execute: vi.fn(),
  transaction: async (cb: (tx: unknown) => unknown) => cb(mockDb),
}

describe('processPairingImportJob', () => {
  beforeEach(() => {
    mockDb.execute.mockReset()
    workerMocks.refreshPairingCompositionFillBulk.mockReset()
    workerMocks.refreshPairingCompositionFillBulk.mockResolvedValue(undefined)
    workerMocks.refreshFlightCompositionFill.mockReset()
    workerMocks.refreshFlightCompositionFill.mockResolvedValue(undefined)
    workerMocks.refreshPairingTafb.mockReset()
    workerMocks.refreshPairingTafb.mockResolvedValue(undefined)
  })

  it('upserts pairing and its segments', async () => {
    mockDb.execute
      .mockResolvedValueOnce({ rows: [{ id: 9001, interface_flt_id: '12345', flt_num: 'F8001', flt_dt: '2026-06-01', dep_arp: 'PEK', arv_arp: 'PVG' }] }) // flight FK lookup (interfaceFltId)
      .mockResolvedValueOnce({ rows: [] })                // composite (route+schDep) lookup
      .mockResolvedValueOnce({ rows: [] })                // 5-field flight fallback lookup
      .mockResolvedValueOnce({ rows: [] })                // existing pairing interface_id lookup
      .mockResolvedValueOnce({})                           // SAVEPOINT
      .mockResolvedValueOnce({ rows: [{ id: 101 }] })     // INSERT pairing RETURNING id
      .mockResolvedValueOnce({})                           // DELETE old segments
      .mockResolvedValueOnce({})                           // INSERT segment (flt_id resolved via fltMap)
      .mockResolvedValueOnce({})                           // DELETE old compositions
      .mockResolvedValueOnce({})                           // INSERT composition CA
      .mockResolvedValueOnce({})                           // INSERT composition FO
      .mockResolvedValueOnce({})                           // RELEASE SAVEPOINT

    const { processPairingImportJob } = await import('../../workers/pairing-inbound-worker.js')
    const job = {
      syncId: 'test', filiale: 'F8',
      syncRangeDt: ['2026-06-01', '2026-06-30'] as [string, string],
      pairings: [{
        interfaceId: 'P001', pairingLabel: 'P001', base: 'PEK', fleet: 'B738',
        division: 'P', assignmentGroup: 'FLY', assignment: 'FLY',
        schStrDtUtc: '2026-06-01T06:00:00Z', schEndDtUtc: '2026-06-01T18:00:00Z',
        actStrDtUtc: '2026-06-01T06:00:00Z', actEndDtUtc: '2026-06-01T18:00:00Z',
        durationDays: 1, tafb: 720, comments: '',
        perDiemMins: 0, perDiemMinsAdjustment: 0, fmLhPerDiemMins: 0,
        wpMins: 0, wpMinsAdjustment: 0, source: 'F8',
        compositions: [{ rank: 'CA', plan: 1 }, { rank: 'FO', plan: 1 }],
        duties: [{
          dutySeq: 1, strArp: 'PEK', endArp: 'PVG',
          schStrDtUtc: '2026-06-01T06:00:00Z', schEndDtUtc: '2026-06-01T18:00:00Z',
          actStrDtUtc: '2026-06-01T06:00:00Z', actEndDtUtc: '2026-06-01T18:00:00Z',
          creditedMinutes: 0, fdpDiscretionMin: 0, maxFdpMin: 0, minRestMin: 0,
          actRestMin: 0, layoverNits: 0, planFlightMin: 0, planFdpMin: 0,
          actFlightMin: 0, actFdpMin: 0, actualDutyMinutes: 0,
          briefMin: 60, debriefMin: 15, comments: '',
          segments: [{
            segSeq: 1, interfaceFltId: '12345', fltNum: 'F8001', airline: 'F8',
            depArp: 'PEK', arvArp: 'PVG', fleet: 'B738',
            schStrDtUtc: '2026-06-01T08:00:00Z', schEndDtUtc: '2026-06-01T10:00:00Z',
            actStrDtUtc: '2026-06-01T08:00:00Z', actEndDtUtc: '2026-06-01T10:00:00Z',
            segAssignment: 'FLY', isLongTransit: 0, fltDt: '2026-06-01',
          }],
        }],
      }],
    }

    const result = await processPairingImportJob(job, mockDb as never)
    expect(result.imported).toBe(1)
    expect(result.added).toBe(1)
    expect(result.updated).toBe(0)
    expect(result.success).toBe(1)
    expect(result.errors).toHaveLength(0)
    expect(workerMocks.refreshPairingCompositionFillBulk).toHaveBeenCalledWith(mockDb, [101], 'F8_IMPORT')
    expect(workerMocks.refreshFlightCompositionFill).toHaveBeenCalledWith(mockDb, [9001], 'F8_IMPORT')
    expect(workerMocks.refreshPairingTafb).toHaveBeenCalledWith(mockDb, 101, 'F8_IMPORT')
    const dialect = new PgDialect()
    const statements = mockDb.execute.mock.calls.map(([q]) => dialect.sqlToQuery(q as never))
    const pairingInsert = statements.find((s) => /^\s*insert\s+into\s+pairing\s/i.test(s.sql))
    expect(pairingInsert?.sql).toContain('pairing_dt')
    expect(pairingInsert?.sql).toContain('pg_timezone_names')
    expect(pairingInsert?.sql).toContain('base_airport.zone_id')
    expect(pairingInsert?.params).toEqual(expect.arrayContaining(['2026-06-01T06:00:00Z', 'PEK']))
    const purges = statements.filter((s) => /^\s*update\s+pairing/i.test(s.sql) && /interface_id\s+not\s+like/i.test(s.sql))
    expect(purges).toHaveLength(0)
  })

  it('rolls back savepoint on error, continues next pairing', async () => {
    mockDb.execute
      .mockResolvedValueOnce({ rows: [] })  // flight FK lookup
      .mockResolvedValueOnce({ rows: [] })  // composite lookup
      .mockResolvedValueOnce({ rows: [] })  // 5-field flight fallback lookup
      .mockResolvedValueOnce({ rows: [] })  // existing pairing interface_id lookup
      .mockResolvedValueOnce({})             // SAVEPOINT
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce({})             // ROLLBACK TO SAVEPOINT

    const { processPairingImportJob } = await import('../../workers/pairing-inbound-worker.js')
    const job = {
      syncId: 'test', filiale: 'F8',
      syncRangeDt: ['2026-06-01', '2026-06-30'] as [string, string],
      pairings: [{ interfaceId: 'P001', pairingLabel: null, base: 'PEK', fleet: 'B738',
        division: 'P', assignmentGroup: 'FLY', assignment: 'FLY',
        schStrDtUtc: '2026-06-01T06:00:00Z', schEndDtUtc: '2026-06-01T18:00:00Z',
        actStrDtUtc: '2026-06-01T06:00:00Z', actEndDtUtc: '2026-06-01T18:00:00Z',
        durationDays: 1, tafb: 0, comments: '',
        perDiemMins: 0, perDiemMinsAdjustment: 0, fmLhPerDiemMins: 0,
        wpMins: 0, wpMinsAdjustment: 0, source: 'F8', compositions: [], duties: [] }],
    }
    const result = await processPairingImportJob(job, mockDb as never)
    expect(result.imported).toBe(0)
    expect(result.errors).toHaveLength(1)
  })

  it('fails pairing import when pairing composition fill refresh fails', async () => {
    workerMocks.refreshPairingCompositionFillBulk.mockRejectedValue(new Error('fill refresh failed'))
    mockDb.execute
      .mockResolvedValueOnce({ rows: [{ id: 9001, interface_flt_id: '12345', flt_num: 'F8001', flt_dt: '2026-06-01', dep_arp: 'PEK', arv_arp: 'PVG' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 101 }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})

    const { processPairingImportJob } = await import('../../workers/pairing-inbound-worker.js')

    await expect(processPairingImportJob({
      syncId: 'test', filiale: 'F8',
      syncRangeDt: ['2026-06-01', '2026-06-30'] as [string, string],
      pairings: [{
        interfaceId: 'P001', pairingLabel: 'P001', base: 'PEK', fleet: 'B738',
        division: 'P', assignmentGroup: 'FLY', assignment: 'FLY',
        schStrDtUtc: '2026-06-01T06:00:00Z', schEndDtUtc: '2026-06-01T18:00:00Z',
        actStrDtUtc: '2026-06-01T06:00:00Z', actEndDtUtc: '2026-06-01T18:00:00Z',
        durationDays: 1, tafb: 720, comments: '',
        perDiemMins: 0, perDiemMinsAdjustment: 0, fmLhPerDiemMins: 0,
        wpMins: 0, wpMinsAdjustment: 0, source: 'F8',
        compositions: [{ rank: 'CA', plan: 1 }, { rank: 'FO', plan: 1 }],
        duties: [{
          dutySeq: 1, strArp: 'PEK', endArp: 'PVG',
          schStrDtUtc: '2026-06-01T06:00:00Z', schEndDtUtc: '2026-06-01T18:00:00Z',
          actStrDtUtc: '2026-06-01T06:00:00Z', actEndDtUtc: '2026-06-01T18:00:00Z',
          creditedMinutes: 0, fdpDiscretionMin: 0, maxFdpMin: 0, minRestMin: 0,
          actRestMin: 0, layoverNits: 0, planFlightMin: 0, planFdpMin: 0,
          actFlightMin: 0, actFdpMin: 0, actualDutyMinutes: 0,
          briefMin: 60, debriefMin: 15, comments: '',
          segments: [{
            segSeq: 1, interfaceFltId: '12345', fltNum: 'F8001', airline: 'F8',
            depArp: 'PEK', arvArp: 'PVG', fleet: 'B738',
            schStrDtUtc: '2026-06-01T08:00:00Z', schEndDtUtc: '2026-06-01T10:00:00Z',
            actStrDtUtc: '2026-06-01T08:00:00Z', actEndDtUtc: '2026-06-01T10:00:00Z',
            segAssignment: 'FLY', isLongTransit: 0, fltDt: '2026-06-01',
          }],
        }],
      }],
    }, mockDb as never)).rejects.toThrow('fill refresh failed')
  })

  it('synthesizes a flight when a flight-bearing segment matches no existing flight', async () => {
    // Regression: when neither interfaceFltId nor route+schDep resolve a flight, the worker
    // MUST synthesize one so the segment gets a flt_id (block-hour rules like 8002 can then
    // compute hours). Previously flt_id was left NULL → 8002 saw 0h → optimizer over-assigned.
    mockDb.execute
      .mockResolvedValueOnce({ rows: [] })                // flight FK lookup → no match
      .mockResolvedValueOnce({ rows: [] })                // composite lookup → no match
      .mockResolvedValueOnce({ rows: [] })                // 5-field flight fallback lookup → no match
      .mockResolvedValueOnce({ rows: [] })                // existing pairing interface_id lookup
      .mockResolvedValueOnce({})                           // SAVEPOINT
      .mockResolvedValueOnce({ rows: [{ id: 202 }] })     // INSERT pairing RETURNING id
      .mockResolvedValueOnce({})                           // DELETE old segments
      .mockResolvedValueOnce({ rows: [{ id: 9999 }] })    // synthesize INSERT flight RETURNING id
      .mockResolvedValueOnce({})                           // INSERT segment (flt_id = 9999)
      .mockResolvedValueOnce({})                           // DELETE old compositions
      .mockResolvedValueOnce({})                           // RELEASE SAVEPOINT

    const { processPairingImportJob } = await import('../../workers/pairing-inbound-worker.js')
    const job = {
      syncId: 'test', filiale: 'F8',
      syncRangeDt: ['2026-06-01', '2026-06-30'] as [string, string],
      pairings: [{
        interfaceId: 'P900', pairingLabel: 'E4106', base: 'YEG', fleet: '7M8',
        division: 'P', assignmentGroup: 'FLY', assignment: 'FLY',
        schStrDtUtc: '2026-06-02T20:09:00Z', schEndDtUtc: '2026-06-03T02:00:00Z',
        actStrDtUtc: '2026-06-02T20:09:00Z', actEndDtUtc: '2026-06-03T02:00:00Z',
        durationDays: 1, tafb: 525, comments: '',
        perDiemMins: 0, perDiemMinsAdjustment: 0, fmLhPerDiemMins: 0,
        wpMins: 0, wpMinsAdjustment: 0, source: 'F8',
        compositions: [],
        duties: [{
          dutySeq: 1, strArp: 'YEG', endArp: 'YEG',
          schStrDtUtc: '2026-06-02T20:09:00Z', schEndDtUtc: '2026-06-03T02:00:00Z',
          actStrDtUtc: '2026-06-02T20:09:00Z', actEndDtUtc: '2026-06-03T02:00:00Z',
          creditedMinutes: 0, fdpDiscretionMin: 0, maxFdpMin: 0, minRestMin: 0,
          actRestMin: 0, layoverNits: 0, planFlightMin: 0, planFdpMin: 0,
          actFlightMin: 0, actFdpMin: 0, actualDutyMinutes: 0,
          briefMin: 60, debriefMin: 15, comments: '',
          segments: [{
            // No matching flight (interfaceFltId not in DB, composite/5-field miss) → must
            // synthesize. The self-created flight must NOT take interfaceFltId: the source
            // fltId goes to origin_interface_flt_id so it can't hijack a later real flight.
            segSeq: 1, interfaceFltId: 'SEG-IFID', fltNum: 'F8727', airline: 'F8',
            depArp: 'YEG', arvArp: 'YYJ', fleet: '7M8',
            schStrDtUtc: '2026-06-02T20:09:00Z', schEndDtUtc: '2026-06-02T21:46:00Z',
            actStrDtUtc: '2026-06-02T20:09:00Z', actEndDtUtc: '2026-06-02T21:46:00Z',
            segAssignment: 'FLY', isLongTransit: 0, fltDt: '2026-06-02',
          }],
        }],
      }],
    }

    const result = await processPairingImportJob(job, mockDb as never)
    expect(result.imported).toBe(1)
    expect(result.errors).toHaveLength(0)

    const dialect = new PgDialect()
    const statements = mockDb.execute.mock.calls.map(([q]) => dialect.sqlToQuery(q as never))

    // A flight was synthesized (unique marker: flight_assignment column on the flight INSERT).
    const flightInsert = statements.find((s) => /^\s*insert\s+into\s+flight\s/i.test(s.sql))
    expect(flightInsert).toBeDefined()
    expect(flightInsert!.sql).toContain('origin_interface_flt_id')
    // Self-created flight never hijacks a real interface id: the segment's fltId is written to
    // origin_interface_flt_id only (appears exactly once), while interface_flt_id stays NULL.
    expect(flightInsert!.params).toContain('SEG-IFID')
    expect(flightInsert!.params.filter((p) => p === 'SEG-IFID')).toHaveLength(1)
    // The segment INSERT is linked to that synthesized flight id (9999), not NULL.
    const segInsert = statements.find((s) => /^\s*insert\s+into\s+pairing_segment\s/i.test(s.sql))
    expect(segInsert!.params).toContain(9999)
  })

  it('discards a wrong interfaceFltId match when the flight mismatches the segment, links the 5-field flight', async () => {
    // Regression: pairing 7471 (C4073) seg1 references fltId whose flight is a JANUARY 2653
    // KIN-YYZ, while the segment is the APRIL-28 F8515 (515) YYC-YXX. The interface match must
    // be discarded and the segment linked to the real 515 via the 5-field lookup instead.
    mockDb.execute
      .mockResolvedValueOnce({ rows: [{ id: 123, interface_flt_id: 'X', flt_num: '2653', flt_dt: '2025-01-05', dep_arp: 'KIN', arv_arp: 'YYZ' }] }) // fltMap → wrong flight
      .mockResolvedValueOnce({ rows: [] }) // composite lookup
      .mockResolvedValueOnce({ rows: [{ id: 7777, airline: 'F8', flt_dt: '2025-04-28', flt_num: '515', dep_arp: 'YYC', arv_arp: 'YXX', sch_dep_dt_utc: '2025-04-28T15:40:00Z', sch_arv_dt_utc: '2025-04-28T17:10:00Z' }] }) // 5-field → real 515
      .mockResolvedValueOnce({ rows: [] }) // existing pairing interface_id lookup
      .mockResolvedValueOnce({}) // SAVEPOINT
      .mockResolvedValueOnce({ rows: [{ id: 202 }] }) // INSERT pairing RETURNING id
      .mockResolvedValueOnce({}) // DELETE old segments
      .mockResolvedValueOnce({}) // INSERT segment (flt_id = 7777, NOT 123)
      .mockResolvedValueOnce({}) // DELETE old compositions
      .mockResolvedValueOnce({}) // RELEASE SAVEPOINT

    const { processPairingImportJob } = await import('../../workers/pairing-inbound-worker.js')
    const result = await processPairingImportJob({
      syncId: 'test', filiale: 'F8',
      syncRangeDt: ['2025-04-21', '2025-04-30'] as [string, string],
      pairings: [{
        interfaceId: 'P7471', pairingLabel: 'C4073', base: 'YYC', fleet: '7M8',
        division: 'P', assignmentGroup: 'FLY', assignment: 'FLY',
        schStrDtUtc: '2025-04-28T15:40:00Z', schEndDtUtc: '2025-04-29T00:00:00Z',
        actStrDtUtc: '2025-04-28T15:40:00Z', actEndDtUtc: '2025-04-29T00:00:00Z',
        durationDays: 1, tafb: 0, comments: '',
        perDiemMins: 0, perDiemMinsAdjustment: 0, fmLhPerDiemMins: 0,
        wpMins: 0, wpMinsAdjustment: 0, source: 'F8',
        compositions: [],
        duties: [{
          dutySeq: 1, strArp: 'YYC', endArp: 'YXX',
          schStrDtUtc: '2025-04-28T15:40:00Z', schEndDtUtc: '2025-04-28T17:10:00Z',
          actStrDtUtc: '2025-04-28T15:40:00Z', actEndDtUtc: '2025-04-28T17:10:00Z',
          creditedMinutes: 0, fdpDiscretionMin: 0, maxFdpMin: 0, minRestMin: 0,
          actRestMin: 0, layoverNits: 0, planFlightMin: 0, planFdpMin: 0,
          actFlightMin: 0, actFdpMin: 0, actualDutyMinutes: 0,
          briefMin: 60, debriefMin: 15, comments: '',
          segments: [{
            // interfaceFltId 'X' resolves to a Jan-05 2653 KIN-YYZ flight, but the segment is
            // Apr-28 515 YYC-YXX → the interface match is discarded and 515 found via 5-field.
            segSeq: 1, interfaceFltId: 'X', fltNum: '515', airline: 'F8',
            depArp: 'YYC', arvArp: 'YXX', fleet: '7M8',
            schStrDtUtc: '2025-04-28T15:40:00Z', schEndDtUtc: '2025-04-28T17:10:00Z',
            actStrDtUtc: '2025-04-28T15:40:00Z', actEndDtUtc: '2025-04-28T17:10:00Z',
            segAssignment: 'FLY', isLongTransit: 0, fltDt: '2025-04-28',
          }],
        }],
      }],
    }, mockDb as never)

    expect(result.imported).toBe(1)
    expect(result.errors).toHaveLength(0)
    const dialect = new PgDialect()
    const statements = mockDb.execute.mock.calls.map(([q]) => dialect.sqlToQuery(q as never))
    const segInsert = statements.find((s) => /^\s*insert\s+into\s+pairing_segment\s/i.test(s.sql))
    // Linked to the real 515 (7777) via the 5-field lookup — NOT the wrong 2653 (123).
    expect(segInsert!.params).toContain(7777)
    expect(segInsert!.params).not.toContain(123)
  })

  it('uses linked flight scheduled timestamps for pairing_segment sch fields', async () => {
    mockDb.execute
      .mockResolvedValueOnce({
        rows: [{
          id: 11857,
          interface_flt_id: '12676-FLT',
          sch_dep_dt_utc: '2026-08-10T12:00:00.000Z',
          sch_arv_dt_utc: '2026-08-10T15:05:00.000Z',
          flt_num: '7211',
          flt_dt: '2026-08-10',
          dep_arp: 'YEG',
          arv_arp: 'YYZ',
        }],
      }) // flight FK lookup (interfaceFltId)
      .mockResolvedValueOnce({ rows: [] }) // composite lookup
      .mockResolvedValueOnce({ rows: [] }) // 5-field flight fallback lookup
      .mockResolvedValueOnce({ rows: [] }) // existing pairing interface_id lookup
      .mockResolvedValueOnce({}) // SAVEPOINT
      .mockResolvedValueOnce({ rows: [{ id: 12676 }] }) // INSERT pairing RETURNING id
      .mockResolvedValueOnce({}) // DELETE old segments
      .mockResolvedValueOnce({}) // INSERT segment (sch_* from linked flight)
      .mockResolvedValueOnce({}) // DELETE old compositions
      .mockResolvedValueOnce({}) // RELEASE SAVEPOINT

    const { processPairingImportJob } = await import('../../workers/pairing-inbound-worker.js')
    const result = await processPairingImportJob({
      syncId: 'test', filiale: 'F8',
      syncRangeDt: ['2026-08-01', '2026-08-31'] as [string, string],
      pairings: [{
        interfaceId: 'P12676', pairingLabel: 'P12676', base: 'YEG', fleet: '7M8',
        division: 'P', assignmentGroup: 'FLY', assignment: 'FLY',
        schStrDtUtc: '2026-08-10T11:00:00Z', schEndDtUtc: '2026-08-10T16:00:00Z',
        actStrDtUtc: '2026-08-10T11:00:00Z', actEndDtUtc: '2026-08-10T16:00:00Z',
        durationDays: 1, tafb: 300, comments: '',
        perDiemMins: 0, perDiemMinsAdjustment: 0, fmLhPerDiemMins: 0,
        wpMins: 0, wpMinsAdjustment: 0, source: 'F8',
        compositions: [],
        duties: [{
          dutySeq: 1, strArp: 'YEG', endArp: 'YYZ',
          schStrDtUtc: '2026-08-10T11:00:00Z', schEndDtUtc: '2026-08-10T16:00:00Z',
          actStrDtUtc: '2026-08-10T11:00:00Z', actEndDtUtc: '2026-08-10T16:00:00Z',
          creditedMinutes: 0, fdpDiscretionMin: 0, maxFdpMin: 0, minRestMin: 0,
          actRestMin: 0, layoverNits: 0, planFlightMin: 0, planFdpMin: 0,
          actFlightMin: 0, actFdpMin: 0, actualDutyMinutes: 0,
          briefMin: 60, debriefMin: 15, comments: '',
          segments: [{
            segSeq: 1, interfaceFltId: '12676-FLT', fltNum: '7211', airline: 'F8',
            depArp: 'YEG', arvArp: 'YYZ', fleet: '7M8',
            schStrDtUtc: '2026-08-10T12:12:00Z', schEndDtUtc: '2026-08-10T15:17:00Z',
            actStrDtUtc: '2026-08-10T12:12:00Z', actEndDtUtc: '2026-08-10T15:17:00Z',
            segAssignment: 'FLY', isLongTransit: 0, fltDt: '2026-08-10',
          }],
        }],
      }],
    }, mockDb as never)

    expect(result.imported).toBe(1)
    expect(result.errors).toHaveLength(0)

    const dialect = new PgDialect()
    const statements = mockDb.execute.mock.calls.map(([q]) => dialect.sqlToQuery(q as never))
    const segmentInsert = statements.find((s) => /^\s*insert\s+into\s+pairing_segment\s/i.test(s.sql))
    expect(segmentInsert?.params).toEqual(expect.arrayContaining([
      11857,
      '2026-08-10T12:00:00.000Z',
      '2026-08-10T15:05:00.000Z',
      '2026-08-10T12:12:00Z',
      '2026-08-10T15:17:00Z',
    ]))
  })

  it('soft-deletes unreferenced pairings outside the full snapshot interface list', async () => {
    mockDb.execute
      .mockResolvedValueOnce({ rows: [] }) // flight FK lookup
      .mockResolvedValueOnce({ rows: [] }) // composite lookup
      .mockResolvedValueOnce({ rows: [] }) // 5-field fallback lookup
      .mockResolvedValueOnce({ rows: [{ interface_id: 'P001' }] }) // existing pairing interface_id lookup
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 200 }] }) // soft-delete pairings outside the snapshot
      .mockResolvedValueOnce({}) // SAVEPOINT
      .mockResolvedValueOnce({ rows: [{ id: 101 }] }) // INSERT pairing RETURNING id
      .mockResolvedValueOnce({}) // DELETE old segments
      .mockResolvedValueOnce({}) // DELETE old compositions
      .mockResolvedValueOnce({}) // RELEASE SAVEPOINT

    const { processPairingImportJob } = await import('../../workers/pairing-inbound-worker.js')
    const result = await processPairingImportJob({
      syncId: 'test', filiale: 'F8',
      syncRangeDt: ['2026-06-01', '2026-06-30'] as [string, string],
      purgeStalePairings: true,
      snapshotPairingInterfaceIds: ['P001'],
      pairings: [{
        interfaceId: 'P001', pairingLabel: 'P001', base: 'PEK', fleet: 'B738',
        division: 'P', assignmentGroup: 'FLY', assignment: 'FLY',
        schStrDtUtc: '2026-06-01T06:00:00Z', schEndDtUtc: '2026-06-01T18:00:00Z',
        actStrDtUtc: '2026-06-01T06:00:00Z', actEndDtUtc: '2026-06-01T18:00:00Z',
        durationDays: 1, tafb: 720, comments: '',
        perDiemMins: 0, perDiemMinsAdjustment: 0, fmLhPerDiemMins: 0,
        wpMins: 0, wpMinsAdjustment: 0, source: 'F8',
        compositions: [],
        duties: [],
      }],
    }, mockDb as never)

    expect(result.deleted).toBe(1)
    expect(result.imported).toBe(1)
    expect(result.touchedPairingIds).toEqual([101, 200])
    const dialect = new PgDialect()
    const statements = mockDb.execute.mock.calls.map(([q]) => dialect.sqlToQuery(q as never))
    const purge = statements.find((s) => /^\s*update\s+pairing/i.test(s.sql) && /interface_id\s+not\s+in/i.test(s.sql))
    expect(purge?.sql).toMatch(/interface_id\s+is\s+null\s+or\s+interface_id\s+not\s+in/i)
    expect(purge?.sql).toMatch(/not exists\s*\(\s*select 1\s+from roster_flight/i)
    expect(purge?.sql).not.toMatch(/created_by\s+=\s+'F8_IMPORT'/i)
    expect(purge?.sql).not.toMatch(/source\s+=\s+'F8'/i)
    expect(purge?.sql).not.toMatch(/assignment_group\s+=\s+'RES'/i)
    expect(purge?.params).toContain('P001')
  })

  it('soft-deletes any unreferenced active live pairing in range for an empty snapshot job', async () => {
    mockDb.execute
      .mockResolvedValueOnce({ rows: [] }) // flight FK lookup
      .mockResolvedValueOnce({ rows: [] }) // composite lookup
      .mockResolvedValueOnce({ rows: [] }) // 5-field fallback lookup
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 201 }] }) // soft-delete pairings

    const { processPairingImportJob } = await import('../../workers/pairing-inbound-worker.js')
    const result = await processPairingImportJob({
      syncId: 'test', filiale: 'F8',
      syncRangeDt: ['2026-06-01', '2026-06-30'] as [string, string],
      pairings: [],
    }, mockDb as never)

    expect(result.deleted).toBe(1)
    expect(result.touchedPairingIds).toEqual([201])
    const dialect = new PgDialect()
    const statements = mockDb.execute.mock.calls.map(([q]) => dialect.sqlToQuery(q as never))
    const purge = statements.find((s) => /^\s*update\s+pairing/i.test(s.sql))
    expect(purge?.sql).toContain('is_deleted = 1')
    expect(purge?.sql).not.toContain("GND-%")
    expect(purge?.sql).not.toMatch(/created_by\s+=\s+'F8_IMPORT'/i)
    expect(purge?.sql).not.toMatch(/source\s+=\s+'F8'/i)
    expect(purge?.params).toEqual(expect.arrayContaining(['2026-06-01', '2026-06-30']))
  })

  it('soft-deletes unassigned manual pairings regardless of assignment group', async () => {
    mockDb.execute
      .mockResolvedValueOnce({ rows: [] }) // flight FK lookup
      .mockResolvedValueOnce({ rows: [] }) // composite lookup
      .mockResolvedValueOnce({ rows: [] }) // 5-field fallback lookup
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 17376 }] }) // soft-delete unassigned manual pairing

    const { processPairingImportJob } = await import('../../workers/pairing-inbound-worker.js')
    const result = await processPairingImportJob({
      syncId: 'test', filiale: 'F8',
      syncRangeDt: ['2026-08-01', '2026-08-31'] as [string, string],
      pairings: [],
    }, mockDb as never)

    expect(result.deleted).toBe(1)
    expect(result.touchedPairingIds).toEqual([17376])
    const dialect = new PgDialect()
    const statements = mockDb.execute.mock.calls.map(([q]) => dialect.sqlToQuery(q as never))
    const purge = statements.find((s) => /^\s*update\s+pairing/i.test(s.sql))
    expect(purge?.sql).toMatch(/not exists\s*\(\s*select 1\s+from roster_flight/i)
    expect(purge?.sql).not.toMatch(/assignment_group\s+=/i)
    expect(purge?.sql).not.toMatch(/created_by\s+=\s+'F8_IMPORT'/i)
    expect(purge?.sql).not.toMatch(/source\s+=\s+'F8'/i)
    expect(purge?.params).toEqual(expect.arrayContaining(['2026-08-01', '2026-08-31']))
  })
})
