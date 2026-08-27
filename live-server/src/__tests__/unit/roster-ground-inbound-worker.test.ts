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

const meta = {
  syncId: 'test', filiale: 'F8',
  syncRangeDt: ['2026-06-01', '2026-06-30'] as [string, string],
  filteredCount: 0, rejectionFile: null,
}

describe('processRosterGroundImportJob', () => {
  beforeEach(() => {
    mockDb.execute.mockReset()
    mockDb.execute.mockResolvedValue({ rows: [], rowCount: 0 })
  })

  it('inserts ground records as roster_flight rows with null pairing', async () => {
    mockDb.execute
      .mockResolvedValueOnce({ rows: [{ rank: 'FO', position: 'FO' }, { rank: 'CA', position: 'PIC' }] }) // rank_position lookup
      .mockResolvedValueOnce({ rows: [{ crew_id: 'C001', task_start: '2026-06-10T00:00:00.000Z', rank: 'FO' }] }) // effective crew_rank lookup
      .mockResolvedValueOnce({ rowCount: 3 }) // range DELETE
    const { processRosterGroundImportJob } = await import('../../workers/roster-ground-inbound-worker.js')
    const job = {
      ...meta,
      groundRecords: [{
        crewId: 'C001', assignment: 'ILL', assignmentGroup: 'GRD', location: '',
        depArp: 'PEK', arvArp: 'PEK', credit: 155,
        strDtUtc: '2026-06-10T00:00:00Z', endDtUtc: '2026-06-11T00:00:00Z',
        division: 'P', label: '', role: '', source: 'PA',
      }],
      singleLegRecords: [],
    }

    const result = await processRosterGroundImportJob(job, mockDb as never)
    expect(result.imported).toBe(1)
    expect(result.added).toBe(1)
    expect(result.deleted).toBe(3)
    expect(result.success).toBe(1)
    expect(result.errors).toHaveLength(0)

    const dialect = new PgDialect()
    const inserts = mockDb.execute.mock.calls
      .map(([q]) => dialect.sqlToQuery(q as never))
      .filter((r) => /^\s*insert\s+into\s+roster_flight/i.test(r.sql))
    const groundInsert = inserts.find((r) => r.params.includes(155))

    expect(groundInsert, 'expected ground roster_flight insert').toBeDefined()
    expect(groundInsert!.sql).toContain('act_credited_minutes')
    expect(groundInsert!.sql).toContain('sch_credited_minutes')
    expect(groundInsert!.sql).toContain('active_rank')
    expect(groundInsert!.sql).toContain('position')
    expect(groundInsert!.sql).toContain('act_str_dt_utc')
    expect(groundInsert!.sql).toContain('act_end_dt_utc')
    expect(groundInsert!.params.filter((p) => p === 155)).toHaveLength(2)
    expect(groundInsert!.params).toEqual(expect.arrayContaining(['FO']))
    expect(groundInsert!.params).toEqual(expect.arrayContaining(['2026-06-10T00:00:00Z', '2026-06-11T00:00:00Z']))
    // base is filled from dep_arp (PEK)
    expect(groundInsert!.params).toContain('PEK')
    expect(groundInsert!.params.filter((p) => p === 'PEK').length).toBeGreaterThanOrEqual(2)
  })

  // Regression (import-duplicate bug): the range-only DELETE was scoped by
  // sch_str_dt_utc within [startDt,endDt]. A day-off starting at local midnight has a UTC
  // sch_str on the PRIOR day (e.g. 2026-05-31 16:00Z = Jun-1 local in +8), which falls just
  // below startDt::date and escapes the DELETE — yet it is still INSERTed every run, so
  // re-imports accumulated duplicates. The import must also DELETE rows keyed to the
  // incoming records so a re-run is idempotent regardless of the range boundary.
  it('deletes existing ground rows keyed to incoming records regardless of provenance (idempotent across the sync-range boundary)', async () => {
    mockDb.execute.mockResolvedValue({ rows: [], rowCount: 0 })
    const { processRosterGroundImportJob } = await import('../../workers/roster-ground-inbound-worker.js')
    const job = {
      ...meta, // syncRangeDt = ['2026-06-01','2026-06-30']
      groundRecords: [{
        crewId: 'C700', assignment: 'DO', assignmentGroup: 'GRD', location: '',
        depArp: '', arvArp: '', credit: 0,
        // UTC start is the day BEFORE the sync range starts — the boundary case that
        // escaped the old range-only DELETE.
        strDtUtc: '2026-05-31T16:00:00Z', endDtUtc: '2026-06-01T15:59:00Z',
        division: 'P', label: '', role: '', source: 'PA',
      }],
      singleLegRecords: [],
    }

    const result = await processRosterGroundImportJob(job, mockDb as never)
    expect(result.imported).toBe(1)

    // Render every emitted statement and find temp-table based key deletion that carries
    // THIS record's own key (crew + both UTC timestamps). Without it, a re-run cannot
    // remove the prior boundary row.
    const dialect = new PgDialect()
    const statements = mockDb.execute.mock.calls
      .map(([q]) => dialect.sqlToQuery(q as never))
    const tempInsert = statements.find((d) =>
      /^\s*insert\s+into\s+tmp_roster_ground_import_keys/i.test(d.sql) &&
      d.params.includes('C700') &&
      d.params.includes('2026-05-31T16:00:00Z') &&
      d.params.includes('2026-06-01T15:59:00Z'),
    )
    const keyedDelete = statements.find((d) =>
      /^\s*delete\s+from\s+roster_flight\s+as\s+rf/i.test(d.sql) &&
      d.sql.includes('tmp_roster_ground_import_keys'),
    )
    expect(tempInsert, 'expected temp-table insert keyed to the incoming record').toBeDefined()
    expect(keyedDelete, 'expected a DELETE keyed to the incoming record').toBeDefined()
    expect(keyedDelete!.sql).not.toContain('created_by')
    expect(keyedDelete!.sql).not.toContain('source =')
  })

  it('does not run exact-key delete for records already covered by the sync range purge', async () => {
    mockDb.execute.mockResolvedValue({ rows: [], rowCount: 0 })
    const { processRosterGroundImportJob } = await import('../../workers/roster-ground-inbound-worker.js')
    const job = {
      ...meta,
      groundRecords: [{
        crewId: 'C701', assignment: 'DO', assignmentGroup: 'GRD', location: '',
        depArp: '', arvArp: '', credit: 0,
        strDtUtc: '2026-06-10T16:00:00Z', endDtUtc: '2026-06-11T15:59:00Z',
        division: 'P', label: '', role: '', source: 'PA',
      }],
      singleLegRecords: [],
    }

    const result = await processRosterGroundImportJob(job, mockDb as never)
    expect(result.imported).toBe(1)

    const dialect = new PgDialect()
    const statements = mockDb.execute.mock.calls.map(([q]) => dialect.sqlToQuery(q as never))
    expect(statements.some((s) => /tmp_roster_ground_import_keys/i.test(s.sql))).toBe(false)
  })

  it('matches a single-leg flight by 5-tuple, refreshes only act_* and materializes a synthetic pairing + roster', async () => {
    // The flight table is canonicalized by the proper F8 flight import
    // (flt_num=001, airline=F8). RosterGround must use the post-split values.
    const flightRow = {
      id: 10, interface_flt_id: 'IF123', flt_num: '001',
      dep_arp: 'PEK', arv_arp: 'PVG', flt_dt: '2026-06-01', fleet: 'B738', airline: 'F8',
      sch_dep_dt_utc: '2026-06-01T08:00:00Z', sch_arv_dt_utc: '2026-06-01T10:00:00Z',
      act_dep_dt_utc: '2026-06-01T08:00:00Z', act_arv_dt_utc: '2026-06-01T10:00:00Z',
    }
    mockDb.execute
      .mockResolvedValueOnce({ rows: [{ rank: 'CA', position: 'PIC' }] }) // rank_position lookup
      .mockResolvedValueOnce({})                       // DELETE ground range
      .mockResolvedValueOnce({ rows: [] })             // stale synthetic pairing lookup
      .mockResolvedValueOnce({ rows: [flightRow] })    // 5-tuple batched SELECT
      .mockResolvedValueOnce({ rowCount: 1 })          // UPDATE flight act_* only
      .mockResolvedValueOnce({})                       // SAVEPOINT
      .mockResolvedValueOnce({ rows: [{ id: 500 }] })  // INSERT pairing RETURNING id
      .mockResolvedValue({})                           // DELETEs + inserts + RELEASE

    const { processRosterGroundImportJob } = await import('../../workers/roster-ground-inbound-worker.js')
    const job = {
      ...meta,
      groundRecords: [],
      singleLegRecords: [{
        crewId: 'C001',
        airline: 'F8',                 // split result from connector transform
        interfaceFltId: 'IF123', label: '001',     // post-split flt number
        strDtUtc: '2026-06-01T08:00:00Z',
        endTimeUtc: '2026-06-01T10:00:00Z',
        checkInUtc: '2026-06-01T07:30:00Z',
        dutyEndUtc: '2026-06-01T10:30:00Z',
        actualDepartureTime: '08:00',
        actualArrivalTime: '10:00',
        startLocation: 'PEK',
        endLocation: 'PVG',
        credit: 240,
        division: 'P', source: 'PA',
      }],
    }

    const result = await processRosterGroundImportJob(job, mockDb as never)
    // act_* UPDATE on the matched flight + roster_flight INSERT for the crew.
    expect(result.imported).toBe(2)
    expect(result.updated).toBe(1)
    expect(result.added).toBe(1)
    expect(result.success).toBe(2)
    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)

    const dialect = new PgDialect()
    // UPDATE must refresh only act_* (no sch_*) and target the existing flight id.
    const updateFlight = mockDb.execute.mock.calls
      .map(([q]) => dialect.sqlToQuery(q as never))
      .find((r) => /^\s*update\b/is.test(r.sql) && /flight\b/is.test(r.sql) && r.params.includes(10))
    expect(updateFlight, 'expected UPDATE flight SET act_* for existing flight').toBeDefined()
    expect(updateFlight!.sql).toContain('act_dep_dt_utc')
    expect(updateFlight!.sql).toContain('act_arv_dt_utc')
    expect(updateFlight!.sql).not.toContain('sch_dep_dt_utc =')
    // params = [actDep, actArv, flightId]; the "F8_IMPORT_GND" updated_by is a
    // SQL literal, not a bound parameter.
    expect(updateFlight!.params).toEqual(expect.arrayContaining([
      '2026-06-01T08:00:00Z',
      '2026-06-01T10:00:00Z',
      10,
    ]))
    expect(updateFlight!.sql).toContain("'F8_IMPORT_GND'")

    // No INSERT into flight should fire — the 5-tuple already matched an existing row.
    const flightInsert = mockDb.execute.mock.calls
      .map(([q]) => dialect.sqlToQuery(q as never))
      .find((r) => /^\s*insert\s+into\s+flight\b/i.test(r.sql))
    expect(flightInsert, 'no flight INSERT should be issued on a 5-tuple hit').toBeUndefined()

    // The synthetic pairing + roster_flight pipeline still runs.
    const rosterInsert = mockDb.execute.mock.calls
      .map(([q]) => dialect.sqlToQuery(q as never))
      .find((r) => /^\s*insert\s+into\s+roster_flight/i.test(r.sql))
    expect(rosterInsert?.sql).toContain('position')
    expect(rosterInsert?.sql).toContain('sch_credited_minutes')
    expect(rosterInsert?.sql).toContain('act_credited_minutes')
    expect(rosterInsert?.params).toContain('PIC')
    expect(rosterInsert?.params.filter((p) => p === 240)).toHaveLength(2)
    const segmentInsert = mockDb.execute.mock.calls
      .map(([q]) => dialect.sqlToQuery(q as never))
      .find((r) => /^\s*insert\s+into\s+pairing_segment/i.test(r.sql))
    expect(segmentInsert?.sql).toContain('duty_act_credited_minutes')
    expect(segmentInsert?.params).toContain(240)
  })

  it('inserts a brand-new flight row when the 5-tuple has no match in the flight table', async () => {
    mockDb.execute
      .mockResolvedValueOnce({ rows: [{ rank: 'CA', position: 'PIC' }] }) // rank_position lookup
      .mockResolvedValueOnce({})                       // DELETE ground range
      .mockResolvedValueOnce({ rows: [] })             // stale synthetic pairing lookup
      .mockResolvedValueOnce({ rows: [] })             // 5-tuple batched SELECT (no match)
      .mockResolvedValueOnce({ rows: [{               // createMissingFlight INSERT ... RETURNING
        id: 11, interface_flt_id: 'IF999', flt_num: '002',
        dep_arp: 'PEK', arv_arp: 'PVG', flt_dt: '2026-06-02', fleet: '', airline: 'F8',
        sch_dep_dt_utc: '2026-06-02T08:00:00Z', sch_arv_dt_utc: '2026-06-02T10:00:00Z',
        act_dep_dt_utc: '2026-06-02T08:00:00Z', act_arv_dt_utc: '2026-06-02T10:00:00Z',
      }] })
      .mockResolvedValueOnce({})                       // SAVEPOINT
      .mockResolvedValueOnce({ rows: [{ id: 600 }] })  // INSERT pairing RETURNING id
      .mockResolvedValue({})                           // DELETEs + inserts + RELEASE

    const { processRosterGroundImportJob } = await import('../../workers/roster-ground-inbound-worker.js')
    const job = {
      ...meta,
      groundRecords: [],
      singleLegRecords: [{
        crewId: 'C002', airline: 'F8',
        interfaceFltId: 'IF999', label: '002',
        strDtUtc: '2026-06-02T08:00:00Z',
        endTimeUtc: '2026-06-02T10:00:00Z',
        checkInUtc: '', dutyEndUtc: '',
        actualDepartureTime: '', actualArrivalTime: '',
        startLocation: 'PEK', endLocation: 'PVG',
        credit: 0,
        division: 'P', source: 'PA',
      }],
    }

    const result = await processRosterGroundImportJob(job, mockDb as never)
    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)

    const dialect = new PgDialect()
    // 5-tuple SELECT must use the 5-tuple columns (no interface_flt_id short-circuit).
    const lookup = mockDb.execute.mock.calls
      .map(([q]) => dialect.sqlToQuery(q as never))
      .find((r) => /^\s*select\b.*\bfrom\s+flight\b/is.test(r.sql) && /airline\s+in/i.test(r.sql))
    expect(lookup, 'expected 5-tuple batched SELECT against flight').toBeDefined()
    expect(lookup!.sql).toMatch(/flt_dt\s+in/i)
    expect(lookup!.sql).toMatch(/dep_arp\s+in/i)
    expect(lookup!.sql).toMatch(/arv_arp\s+in/i)
    expect(lookup!.sql).toMatch(/flt_num\s+in/i)
    expect(lookup!.sql).not.toMatch(/interface_flt_id\s+in/i)

    // No UPDATE should fire on a miss.
    const updateFlight = mockDb.execute.mock.calls
      .map(([q]) => dialect.sqlToQuery(q as never))
      .find((r) => /^\s*update\b/is.test(r.sql) && /flight\b/is.test(r.sql))
    expect(updateFlight, 'no UPDATE should fire when the 5-tuple misses').toBeUndefined()

    // Flight INSERT must use the post-split flt_num + airline.
    const flightInsert = mockDb.execute.mock.calls
      .map(([q]) => dialect.sqlToQuery(q as never))
      .find((r) => /^\s*insert\s+into\s+flight\b/i.test(r.sql))
    expect(flightInsert, 'expected INSERT into flight for a 5-tuple miss').toBeDefined()
    expect(flightInsert!.params).toEqual(expect.arrayContaining(['002', 'F8', 'IF999']))
  })

  it('reports a warning when a single-leg flight cannot be created (missing times)', async () => {
    mockDb.execute
      .mockResolvedValueOnce({ rows: [] })  // rank_position lookup
      .mockResolvedValueOnce({})            // DELETE ground range
      .mockResolvedValueOnce({ rows: [] })  // stale synthetic pairing lookup
      .mockResolvedValueOnce({ rows: [] })  // SELECT by interface_flt_id (no match)
      .mockResolvedValueOnce({ rows: [] })  // SELECT by flt_num (no match)
      // createMissingFlight throws because endTimeUtc is empty → warning recorded

    const { processRosterGroundImportJob } = await import('../../workers/roster-ground-inbound-worker.js')
    const job = {
      ...meta,
      groundRecords: [],
      singleLegRecords: [{
        crewId: 'C001', interfaceFltId: 'MISSING', label: 'F8999',
        airline: 'F8',
        strDtUtc: '2026-06-01T08:00:00Z',
        endTimeUtc: '',          // empty → createMissingFlight throws
        checkInUtc: '',
        dutyEndUtc: '',
        actualDepartureTime: '',
        actualArrivalTime: '',
        startLocation: '',
        endLocation: '',
        credit: 0,
        division: 'P', source: 'PA',
      }],
    }

    const result = await processRosterGroundImportJob(job, mockDb as never)
    expect(result.imported).toBe(0)
    expect(result.skipped).toBeGreaterThan(0)
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('deletes stale synthetic single-leg pairings in the sync range when no single-leg payload returns', async () => {
    mockDb.execute
      .mockResolvedValueOnce({ rows: [] }) // rank_position lookup
      .mockResolvedValueOnce({ rowCount: 0 }) // DELETE ground range
      .mockResolvedValueOnce({ rows: [{ id: 500 }] }) // stale synthetic pairing lookup
      .mockResolvedValueOnce({}) // delete roster_flight
      .mockResolvedValueOnce({}) // delete pairing_segment
      .mockResolvedValueOnce({}) // delete pairing_composition
      .mockResolvedValueOnce({ rowCount: 1 }) // delete pairing

    const { processRosterGroundImportJob } = await import('../../workers/roster-ground-inbound-worker.js')
    const result = await processRosterGroundImportJob({
      ...meta,
      groundRecords: [],
      singleLegRecords: [],
    }, mockDb as never)

    expect(result.deleted).toBe(1)
    const dialect = new PgDialect()
    const statements = mockDb.execute.mock.calls.map(([q]) => dialect.sqlToQuery(q as never))
    const staleSelect = statements.find((s) => /from\s+pairing/i.test(s.sql) && /interface_id\s+like/i.test(s.sql))
    expect(staleSelect?.sql).toContain('GND-%')
    expect(staleSelect?.params).toEqual(expect.arrayContaining(['2026-06-01', '2026-06-30']))
  })
})
