import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { gunzipSync } from 'node:zlib'
import { readFileSync, existsSync } from 'node:fs'
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { sql } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { computeScenarioCrewStatsFromDb, buildGanttDataFromDb } from '../scenario-gantt-db-service.js'
import {
  buildGanttDataSeed,
  mapLeadinRows,
  pruneUnreferencedReservePairings,
  recomputeCompositionFill,
  type ScenarioGanttPairing,
} from '../scenario-gantt-service.js'

vi.mock('../../../config/index.js', () => ({
  env: {
    DATABASE_URL: 'postgresql://f8:Pier2026AIf8@47.253.173.207:55432/rois',
    LIVE_SCHEMA: 'f8',
    SCENARIO_SCHEMA: 'scenario',
  },
}))
vi.mock('../../../config/env.js', () => ({
  env: {
    DATABASE_URL: 'postgresql://f8:Pier2026AIf8@47.253.173.207:55432/rois',
    LIVE_SCHEMA: 'f8',
    SCENARIO_SCHEMA: 'scenario',
  },
}))

const DB = 'postgresql://f8:Pier2026AIf8@47.253.173.207:55432/rois'

let pool: pg.Pool
let db: ReturnType<typeof drizzle>

beforeAll(async () => {
  // Pool (not Client) so the drizzle instance's $client type matches the
  // service's signature — drizzle 0.45 types $client by the connection kind.
  pool = new pg.Pool({ connectionString: DB })
  db = drizzle(pool)
})
afterAll(async () => {
  await pool.end()
})

describe('computeScenarioCrewStatsFromDb', () => {
  it('crewStats for scenario 6', async () => {
    const s = await computeScenarioCrewStatsFromDb(db, 6)
    expect(Object.keys(s).length).toBe(26)
    const m = Object.values(Object.values(s)[0])[0]
    expect(m).toHaveProperty('credit')
    expect(typeof m.credit).toBe('number')
    expect(m).toHaveProperty('dayOffCount')
    expect(m).toHaveProperty('alCount')
    expect(m).toHaveProperty('leaveCount')
  })
})

const meta = (id: number, p: number, f: number) => ({
  id,
  name: `s${id}`,
  strDtLoc: new Date('2026-06-01T07:00:00Z'),
  endDtLoc: new Date('2026-06-30T07:00:00Z'),
  leadinLive: 0,
  fileType: 'RO',
  pairingScenarioId: p,
  flightScenarioId: f,
})

describe('buildGanttDataFromDb', () => {
  it('assembles 459 from LIVE pairings (0/0)', async () => {
    const d = await buildGanttDataFromDb(db, meta(459, 0, 0))
    expect(d.dataSource).toBe('db')
    const pids = new Set(d.pairings.map((p) => p.pairingId))
    for (const a of d.assignments) expect(pids.has(a.pairingId)).toBe(true) // 182/182
    if (d.assignments.length > 0) {
      expect(d.crew.length).toBeGreaterThan(0)
      expect(d.pairingSegments.length).toBeGreaterThan(0)
      expect(Object.keys(d.crewStats).length).toBeGreaterThan(0)
    }
  })

  it('assembles 460 from COPY pairings (405/456)', async () => {
    const d = await buildGanttDataFromDb(db, meta(460, 405, 456))
    expect(d.dataSource).toBe('db')
    const pids = new Set(d.pairings.map((p) => p.pairingId))
    for (const a of d.assignments) expect(pids.has(a.pairingId)).toBe(true) // 182/182 after widening 405
    expect(d.pairingSegments.length).toBeGreaterThan(0)
  })

  it('loads only flights referenced by scoped pairing segments', async () => {
    const dialect = new PgDialect()
    const executed: string[] = []
    const fakeDb = {
      execute: async (query: unknown) => {
        const { sql: text } = dialect.sqlToQuery(query as never)
        executed.push(text)

        if (text.includes('max(active_rank) AS active_rank')) {
          return { rows: [{ crew_id: 'C1', pairing_id: '7001', source: 'CR' }] }
        }
        if (text.includes('SELECT crew_id, pairing_id, duty_seq, duty_ref_tz')) {
          return {
            rows: [
              { crew_id: 'C1', pairing_id: '7001', duty_seq: '1', duty_ref_tz: '-300' },
              { crew_id: 'C2', pairing_id: '7001', duty_seq: '1', duty_ref_tz: '60' },
            ],
          }
        }
        if (text.includes('SELECT crew_id, assignment_group')) {
          return { rows: [] }
        }
        if (text.includes('SELECT id, pairing_label, interface_id, base')) {
          return { rows: [{
            id: '7001',
            pairing_label: 'YYZ7001',
            base: 'YYZ',
            sch_str: '2026-06-10T10:00:00Z',
            sch_end: '2026-06-10T18:00:00Z',
            assignment_group: 'FLT',
            assignment: 'FLT',
            division: 'P',
          }] }
        }
        if (text.includes('SELECT pairing_id, acting_rank')) {
          return { rows: [{ pairing_id: '7001', acting_rank: 'CA', plan: 1, fill: 0 }] }
        }
        if (text.includes('SELECT ps.pairing_id, ps.duty_seq')) {
          return { rows: [{
            pairing_id: '7001',
            duty_seq: '1',
            seg_seq: '1',
            flt_id: '9001',
            flt_dt: '2026-06-10',
            flt_num: '101',
            airline: 'F8',
            dep_arp: 'YYZ',
            arv_arp: 'YVR',
            seg_assignment: 'FLT',
            sch_str: '2026-06-10T12:05:00Z',
            sch_end: '2026-06-10T17:00:00Z',
            duty_str_arp: 'YYZ',
            duty_end_arp: 'YVR',
            duty_sch_str: '2026-06-10T09:00:00Z',
            duty_sch_end: '2026-06-10T19:00:00Z',
            duty_sch_rest_min: null,
            duty_act_rest_min: null,
            duty_act_credited_minutes: '480',
            brief_start: '',
            brief_end: '',
            debrief_start: '',
            debrief_end: '',
            pickup_start: '',
            pickup_end: '',
            dropoff_start: '',
            dropoff_end: '',
          }] }
        }
        if (text.includes('SELECT id, flt_num, dep_arp, arv_arp')) {
          const scoped = text.includes('ARRAY[9001]::bigint[]')
          return { rows: scoped
            ? [{
                id: '9001',
                flt_num: '101',
                dep_arp: 'YYZ',
                arv_arp: 'YVR',
                sch_dep: '2026-06-10T10:00:00Z',
                sch_arv: '2026-06-10T18:00:00Z',
                fleet: '7M8',
                register: 'C-F8A',
              }]
            : [
                {
                  id: '9001',
                  flt_num: '101',
                  dep_arp: 'YYZ',
                  arv_arp: 'YVR',
                  sch_dep: '2026-06-10T10:00:00Z',
                  sch_arv: '2026-06-10T18:00:00Z',
                  fleet: '7M8',
                  register: 'C-F8A',
                },
                {
                  id: '9999',
                  flt_num: '999',
                  dep_arp: 'YUL',
                  arv_arp: 'YEG',
                  sch_dep: '2026-06-10T11:00:00Z',
                  sch_arv: '2026-06-10T16:00:00Z',
                  fleet: '7M8',
                  register: 'C-F8Z',
                },
              ] }
        }
        if (text.includes('FROM f8.crew_base')) {
          return { rows: [{ crew_id: 'C1', base: 'YYZ' }] }
        }
        if (text.includes('FROM f8.crew_rank')) {
          return { rows: [{ crew_id: 'C1', rank: 'CA' }] }
        }
        if (text.includes('FROM f8.crew')) {
          return { rows: [{ crew_id: 'C1', first_name: 'Test', middle_name: null, last_name: 'Crew', division: 'P', seniority_num: '1' }] }
        }
        if (text.includes('scenario.crew_manday_')) {
          return { rows: [] }
        }
        return { rows: [] }
      },
    }

    const d = await buildGanttDataFromDb(fakeDb as never, meta(900, 0, 0))

    expect(d.flights.map((f) => f.id)).toEqual([9001])
    expect(d.rosterDutyRefs).toEqual([
      { crewId: 'C1', pairingId: 7001, dutySeq: 1, dutyRefTz: -300 },
      { crewId: 'C2', pairingId: 7001, dutySeq: 1, dutyRefTz: 60 },
    ])
    expect(d.pairingSegments[0]).toMatchObject({
      schStrDtUtc: '2026-06-10T12:05:00Z',
      schEndDtUtc: '2026-06-10T17:00:00Z',
      actStrDtUtc: '',
      actEndDtUtc: '',
    })
    const segmentQuery = executed.find((text) => text.includes('SELECT ps.pairing_id, ps.duty_seq'))
    expect(segmentQuery).not.toContain('JOIN f8.flight')
    expect(segmentQuery).toContain('ps.sch_str_dt_utc')
    expect(segmentQuery).toContain('ps.act_str_dt_utc')
  })

  it('passes roster_flight.label through DB ground items (RES → PRPM)', async () => {
    const dialect = new PgDialect()
    const executed: string[] = []
    const fakeDb = {
      execute: async (query: unknown) => {
        const { sql: text } = dialect.sqlToQuery(query as never)
        executed.push(text)

        if (text.includes('pairing_id IS NULL') && text.includes('assignment_group')) {
          return {
            rows: [{
              crew_id: '1485',
              base: 'YVR',
              dep_arp: 'YVR',
              arv_arp: 'YVR',
              assignment_group: 'GRD',
              assignment: 'RES',
              label: 'PRPM',
              sch_str: '2026-08-06T22:00:00Z',
              sch_end: '2026-08-07T07:59:00Z',
              flight_acting_rank: null,
              source: 'PA',
              act_credited_minutes: null,
            }],
          }
        }
        if (text.includes('max(active_rank) AS active_rank')) {
          return { rows: [] }
        }
        if (text.includes('SELECT id') && text.includes('.pairing') && !text.includes('pairing_label')) {
          return { rows: [] }
        }
        if (text.includes('SELECT id, pairing_label, interface_id, base')) {
          return { rows: [] }
        }
        if (text.includes('SELECT pairing_id, acting_rank')) {
          return { rows: [] }
        }
        if (text.includes('SELECT ps.pairing_id, ps.duty_seq')) {
          return { rows: [] }
        }
        if (text.includes('SELECT id, flt_num, dep_arp, arv_arp')) {
          return { rows: [] }
        }
        if (/SELECT\s+crew_id\s+FROM\s+\S+\.crew\s+WHERE\s+crew_id\s+IN/s.test(text) && !text.includes('first_name')) {
          return { rows: [] }
        }
        if (text.includes('scenario.crew_manday_')) {
          return { rows: [] }
        }
        return { rows: [] }
      },
    }

    const d = await buildGanttDataFromDb(fakeDb as never, meta(904, 0, 0))

    const groundQuery = executed.find((text) => text.includes('pairing_id IS NULL') && text.includes('assignment_group'))
    expect(groundQuery).toMatch(/assignment,\s*label/)
    expect(d.groundItems).toEqual([
      expect.objectContaining({
        crewId: '1485',
        assignmentGroup: 'GRD',
        assignment: 'RES',
        label: 'PRPM',
      }),
    ])
  })

  it('loads crew from Scenario Crew Filter even when a filtered crew has no roster rows', async () => {
    const dialect = new PgDialect()
    const fakeDb = {
      execute: async (query: unknown) => {
        const { sql: text } = dialect.sqlToQuery(query as never)

        if (text.includes('max(active_rank) AS active_rank')) {
          return { rows: [{ crew_id: 'C1', pairing_id: '7001', source: 'CR' }] }
        }
        if (text.includes('SELECT crew_id, base, assignment_group')) {
          return { rows: [] }
        }
        if (text.includes('SELECT id') && text.includes('.pairing') && !text.includes('pairing_label')) {
          return { rows: [{ id: '7001' }] }
        }
        if (text.includes('SELECT id, pairing_label, interface_id, base')) {
          return { rows: [{
            id: '7001',
            pairing_label: 'YVR7001',
            base: 'YVR',
            sch_str: '2026-06-10T10:00:00Z',
            sch_end: '2026-06-10T18:00:00Z',
            assignment_group: 'FLY',
            assignment: 'FLY',
            division: 'P',
          }] }
        }
        if (text.includes('SELECT pairing_id, acting_rank')) {
          return { rows: [{ pairing_id: '7001', acting_rank: 'CA', plan: 1, fill: 0 }] }
        }
        if (text.includes('SELECT ps.pairing_id, ps.duty_seq')) {
          return { rows: [] }
        }
        if (text.includes('SELECT id, flt_num, dep_arp, arv_arp')) {
          return { rows: [] }
        }
        if (/SELECT\s+crew_id\s+FROM\s+\S+\.crew\s+WHERE\s+crew_id\s+IN/s.test(text) && !text.includes('first_name')) {
          return { rows: [{ crew_id: 'C1' }, { crew_id: 'C4' }] }
        }
        if (text.includes('.crew_base')) {
          return { rows: [
            { crew_id: 'C1', base: 'YVR' },
            { crew_id: 'C4', base: 'YVR' },
          ] }
        }
        if (text.includes('.crew_rank')) {
          return { rows: [
            { crew_id: 'C1', rank: 'CA' },
            { crew_id: 'C4', rank: 'FO' },
          ] }
        }
        if (text.includes('.crew')) {
          return { rows: [
            { crew_id: 'C1', first_name: 'Assigned', middle_name: null, last_name: 'Crew', division: 'P', seniority_num: '1' },
            { crew_id: 'C4', first_name: 'Empty', middle_name: null, last_name: 'Crew', division: 'P', seniority_num: '4' },
          ] }
        }
        if (text.includes('scenario.crew_manday_')) {
          return { rows: [] }
        }
        return { rows: [] }
      },
    }

    const d = await buildGanttDataFromDb(fakeDb as never, {
      ...meta(903, 0, 0),
      filterParams: { crew: { bases: ['YVR'], ranks: ['CA', 'FO'], fleets: ['737', '7M8'] } },
      division: 'P',
    })

    expect(d.crew.map((crew) => crew.crewId)).toEqual(['C1', 'C4'])
    expect(d.assignments).toEqual([expect.objectContaining({ crewId: 'C1', pairingId: 7001 })])
  })

  it('loads Live source pairings by RO pairing filters, including unassigned RES rows when RES type is selected', async () => {
    const dialect = new PgDialect()
    const executed: string[] = []
    const fakeDb = {
      execute: async (query: unknown) => {
        const { sql: text } = dialect.sqlToQuery(query as never)
        executed.push(text)

        if (text.includes('max(active_rank) AS active_rank')) {
          return { rows: [{ crew_id: 'C1', pairing_id: '200', source: 'PA' }] }
        }
        if (text.includes('SELECT crew_id, base, assignment_group')) {
          return { rows: [] }
        }
        if (text.includes('SELECT id') && text.includes('.pairing') && !text.includes('pairing_label')) {
          return { rows: [{ id: '100' }, { id: '101' }] }
        }
        if (text.includes('SELECT id, pairing_label, interface_id, base')) {
          return { rows: [
            {
              id: '100',
              pairing_label: 'SRC100',
              base: 'YYZ',
              sch_str: '2026-06-10T10:00:00Z',
              sch_end: '2026-06-10T18:00:00Z',
              assignment_group: 'FLY',
              assignment: 'FLY',
              division: 'C',
            },
            {
              id: '200',
              pairing_label: 'PA200',
              base: 'YVR',
              sch_str: '2026-05-28T10:00:00Z',
              sch_end: '2026-05-28T18:00:00Z',
              assignment_group: 'FLY',
              assignment: 'FLY',
              division: 'C',
            },
            {
              id: '101',
              pairing_label: 'CRAM101',
              base: 'YYZ',
              fleet: '7M8',
              sch_str: '2026-06-12T10:00:00Z',
              sch_end: '2026-06-12T18:00:00Z',
              assignment_group: 'RES',
              assignment: 'CRAM',
              division: 'C',
            },
          ] }
        }
        if (text.includes('SELECT pairing_id, acting_rank')) {
          return { rows: [
            { pairing_id: '100', acting_rank: 'CA', plan: 1, fill: 0 },
            { pairing_id: '200', acting_rank: 'CA', plan: 1, fill: 0 },
            { pairing_id: '101', acting_rank: 'FA', plan: 1, fill: 0 },
          ] }
        }
        if (text.includes('SELECT ps.pairing_id, ps.duty_seq')) {
          return { rows: [
            {
              pairing_id: '100',
              duty_seq: '1',
              seg_seq: '1',
              flt_id: null,
              flt_dt: '2026-06-10',
              flt_num: '100',
              airline: 'F8',
              dep_arp: 'YYZ',
              arv_arp: 'YVR',
              seg_assignment: 'FLT',
              sch_str: '2026-06-10T10:00:00Z',
              sch_end: '2026-06-10T18:00:00Z',
              duty_str_arp: 'YYZ',
              duty_end_arp: 'YVR',
              duty_sch_str: '2026-06-10T09:00:00Z',
              duty_sch_end: '2026-06-10T19:00:00Z',
              duty_sch_rest_min: null,
              duty_act_rest_min: null,
              duty_act_credited_minutes: '480',
              brief_start: '',
              brief_end: '',
              debrief_start: '',
              debrief_end: '',
              pickup_start: '',
              pickup_end: '',
              dropoff_start: '',
              dropoff_end: '',
            },
            {
              pairing_id: '200',
              duty_seq: '1',
              seg_seq: '1',
              flt_id: null,
              flt_dt: '2026-05-28',
              flt_num: '200',
              airline: 'F8',
              dep_arp: 'YVR',
              arv_arp: 'YYZ',
              seg_assignment: 'FLT',
              sch_str: '2026-05-28T10:00:00Z',
              sch_end: '2026-05-28T18:00:00Z',
              duty_str_arp: 'YVR',
              duty_end_arp: 'YYZ',
              duty_sch_str: '2026-05-28T09:00:00Z',
              duty_sch_end: '2026-05-28T19:00:00Z',
              duty_sch_rest_min: null,
              duty_act_rest_min: null,
              duty_act_credited_minutes: '480',
              brief_start: '',
              brief_end: '',
              debrief_start: '',
              debrief_end: '',
              pickup_start: '',
              pickup_end: '',
              dropoff_start: '',
              dropoff_end: '',
            },
            {
              pairing_id: '101',
              duty_seq: '1',
              seg_seq: '1',
              flt_id: null,
              flt_dt: '2026-06-12',
              flt_num: 'CRAM',
              airline: 'F8',
              dep_arp: 'YYZ',
              arv_arp: 'YYZ',
              seg_assignment: 'CRAM',
              sch_str: '2026-06-12T10:00:00Z',
              sch_end: '2026-06-12T18:00:00Z',
              duty_str_arp: 'YYZ',
              duty_end_arp: 'YYZ',
              duty_sch_str: '2026-06-12T10:00:00Z',
              duty_sch_end: '2026-06-12T18:00:00Z',
              duty_sch_rest_min: null,
              duty_act_rest_min: null,
              duty_act_credited_minutes: '0',
              brief_start: '',
              brief_end: '',
              debrief_start: '',
              debrief_end: '',
              pickup_start: '',
              pickup_end: '',
              dropoff_start: '',
              dropoff_end: '',
            },
          ] }
        }
        if (text.includes('SELECT id, flt_num, dep_arp, arv_arp')) {
          return { rows: [] }
        }
        if (text.includes('FROM f8.crew_base')) {
          return { rows: [{ crew_id: 'C1', base: 'YYZ' }] }
        }
        if (text.includes('FROM f8.crew_rank')) {
          return { rows: [{ crew_id: 'C1', rank: 'FA' }] }
        }
        if (text.includes('FROM f8.crew')) {
          return { rows: [{ crew_id: 'C1', first_name: 'Test', middle_name: null, last_name: 'Crew', division: 'C', seniority_num: '1' }] }
        }
        if (text.includes('scenario.crew_manday_')) {
          return { rows: [] }
        }
        return { rows: [] }
      },
    }

    const d = await buildGanttDataFromDb(fakeDb as never, {
      ...meta(901, 0, 0),
      filterParams: { pairing: { bases: ['YYZ'], fleets: ['7M8'], types: ['RES'] } },
      division: 'C',
    })

    const sourceQuery = executed.find((text) => text.includes('SELECT id') && text.includes('.pairing') && !text.includes('pairing_label'))
    expect(sourceQuery).toContain('sch_str_dt_utc <=')
    expect(sourceQuery).toContain('sch_end_dt_utc >=')
    expect(sourceQuery).toContain('division =')
    expect(sourceQuery).toContain('base = ANY')
    expect(sourceQuery).toContain('fleet = ANY')
    expect(executed.join('\n')).not.toContain("assignment_group = 'SBY'")
    expect(d.pairings.map((p) => p.pairingId).sort((a, b) => a - b)).toEqual([100, 101, 200])
  })

  it('filters PO-backed RO source pairings by RO pairing filters and keeps only roster-linked extras', async () => {
    const dialect = new PgDialect()
    const executed: string[] = []
    const liveSelectResponses = [
      [{
        id: 300,
        pairingLabel: 'LIVE300',
        base: 'YYZ',
        schStrDtUtc: new Date('2026-06-09T10:00:00Z'),
        schEndDtUtc: new Date('2026-06-09T18:00:00Z'),
        assignmentGroup: 'FLY',
        assignment: 'FLY',
        division: 'P',
      }],
      [{ pairingId: 300, actingRank: 'CA', plan: 1, fill: 0 }],
      [{
        pairingId: 300,
        dutySeq: 1,
        segSeq: 1,
        fltId: null,
        fltDt: '2026-06-09',
        fltNum: '300',
        airline: 'F8',
        depArp: 'YYZ',
        arvArp: 'YVR',
        segAssignment: 'FLT',
        schStrDtUtc: new Date('2026-06-09T10:00:00Z'),
        schEndDtUtc: new Date('2026-06-09T18:00:00Z'),
        dutyStrArp: 'YYZ',
        dutyEndArp: 'YVR',
        dutySchStrDtUtc: new Date('2026-06-09T09:00:00Z'),
        dutySchEndDtUtc: new Date('2026-06-09T19:00:00Z'),
        dutySchRestMin: null,
        dutyActRestMin: null,
        dutyActCreditedMinutes: 480,
        briefStartUtc: null,
        briefEndUtc: null,
        debriefStartUtc: null,
        debriefEndUtc: null,
        pickupStartUtc: null,
        pickupEndUtc: null,
        dropoffStartUtc: null,
        dropoffEndUtc: null,
      }],
    ]
    let liveSelectIndex = 0
    const fakeDb = {
      select: () => ({
        from: () => ({
          where: async () => liveSelectResponses[liveSelectIndex++] ?? [],
        }),
      }),
      execute: async (query: unknown) => {
        const { sql: text } = dialect.sqlToQuery(query as never)
        executed.push(text)

        if (text.includes('max(active_rank) AS active_rank')) {
          return { rows: [{ crew_id: 'C1', pairing_id: '300', source: 'PA' }] }
        }
        if (text.includes('SELECT crew_id, base, assignment_group')) {
          return { rows: [{
            crew_id: 'C1',
            base: 'YVR',
            assignment_group: 'SBY',
            assignment: 'RES',
            sch_str: '2026-06-12T10:00:00Z',
            sch_end: '2026-06-12T18:00:00Z',
            flight_acting_rank: 'CA',
            source: 'PA',
            act_credited_minutes: '480',
          }] }
        }
        if (text.includes('SELECT id') && text.includes('.pairing') && !text.includes('pairing_label')) {
          return { rows: [{ id: '100' }, { id: '200' }] }
        }
        if (text.includes('SELECT id, pairing_label, interface_id, base')) {
          return { rows: [
            {
              id: '100',
              pairing_label: 'YVR100',
              base: 'YVR',
              fleet: '7M8',
              sch_str: '2026-06-10T10:00:00Z',
              sch_end: '2026-06-10T18:00:00Z',
              assignment_group: 'FLY',
              assignment: 'FLY',
              division: 'P',
            },
            {
              id: '200',
              pairing_label: 'YVR200',
              base: 'YVR',
              fleet: '7M8',
              sch_str: '2026-06-11T10:00:00Z',
              sch_end: '2026-06-11T18:00:00Z',
              assignment_group: 'FLY',
              assignment: 'FLY',
              division: 'P',
            },
          ] }
        }
        if (text.includes('SELECT pairing_id, acting_rank')) {
          return { rows: [
            { pairing_id: '100', acting_rank: 'CA', plan: 1, fill: 0 },
            { pairing_id: '200', acting_rank: 'CA', plan: 1, fill: 0 },
          ] }
        }
        if (text.includes('SELECT ps.pairing_id, ps.duty_seq')) {
          return { rows: [
            {
              pairing_id: '100',
              duty_seq: '1',
              seg_seq: '1',
              flt_id: null,
              flt_dt: '2026-06-10',
              flt_num: '100',
              airline: 'F8',
              dep_arp: 'YVR',
              arv_arp: 'YYZ',
              seg_assignment: 'FLT',
              sch_str: '2026-06-10T10:00:00Z',
              sch_end: '2026-06-10T18:00:00Z',
              duty_str_arp: 'YVR',
              duty_end_arp: 'YYZ',
              duty_sch_str: '2026-06-10T09:00:00Z',
              duty_sch_end: '2026-06-10T19:00:00Z',
              duty_sch_rest_min: null,
              duty_act_rest_min: null,
              duty_act_credited_minutes: '480',
              brief_start: '',
              brief_end: '',
              debrief_start: '',
              debrief_end: '',
              pickup_start: '',
              pickup_end: '',
              dropoff_start: '',
              dropoff_end: '',
            },
            {
              pairing_id: '200',
              duty_seq: '1',
              seg_seq: '1',
              flt_id: null,
              flt_dt: '2026-06-11',
              flt_num: '200',
              airline: 'F8',
              dep_arp: 'YVR',
              arv_arp: 'YYZ',
              seg_assignment: 'FLT',
              sch_str: '2026-06-11T10:00:00Z',
              sch_end: '2026-06-11T18:00:00Z',
              duty_str_arp: 'YVR',
              duty_end_arp: 'YYZ',
              duty_sch_str: '2026-06-11T09:00:00Z',
              duty_sch_end: '2026-06-11T19:00:00Z',
              duty_sch_rest_min: null,
              duty_act_rest_min: null,
              duty_act_credited_minutes: '480',
              brief_start: '',
              brief_end: '',
              debrief_start: '',
              debrief_end: '',
              pickup_start: '',
              pickup_end: '',
              dropoff_start: '',
              dropoff_end: '',
            },
          ] }
        }
        if (text.includes('SELECT id, flt_num, dep_arp, arv_arp')) {
          return { rows: [] }
        }
        if (text.includes('FROM f8.crew_base')) {
          return { rows: [{ crew_id: 'C1', base: 'YVR' }] }
        }
        if (text.includes('FROM f8.crew_rank')) {
          return { rows: [{ crew_id: 'C1', rank: 'CA' }] }
        }
        if (text.includes('FROM f8.crew')) {
          return { rows: [{ crew_id: 'C1', first_name: 'Test', middle_name: null, last_name: 'Crew', division: 'P', seniority_num: '1' }] }
        }
        if (text.includes('scenario.crew_manday_')) {
          return { rows: [] }
        }
        return { rows: [] }
      },
    }

    const d = await buildGanttDataFromDb(fakeDb as never, {
      ...meta(902, 692, 0),
      filterParams: { pairing: { bases: ['YVR'], fleets: ['737'] } },
      division: 'P',
    })

    const sourceQuery = executed.find((text) => text.includes('SELECT id') && text.includes('.pairing') && !text.includes('pairing_label'))
    expect(sourceQuery).toContain('scenario_id = $1')
    expect(sourceQuery).not.toContain('sch_str_dt_utc <=')
    expect(sourceQuery).not.toContain('sch_end_dt_utc >=')
    expect(sourceQuery).toContain('division =')
    expect(sourceQuery).toContain('base = ANY')
    expect(sourceQuery).toContain('fleet = ANY')
    expect(executed.join('\n')).not.toContain("assignment_group = 'SBY'")
    expect(d.pairings.map((p) => p.pairingId).sort((a, b) => a - b)).toEqual([100, 200, 300])
    expect(d.pairings.filter((p) => p.pairingSource === 'scenario').map((p) => p.fleet)).toEqual(['7M8', '7M8'])
    expect(d.groundItems).toHaveLength(0)
    expect(d.assignments).toEqual([
      expect.objectContaining({ crewId: 'C1', pairingId: 300, source: 'PA' }),
    ])
  })
})

describe('pruneUnreferencedReservePairings', () => {
  const pairing = (
    pairingId: number,
    assignmentGroup: string,
    pairingSource: 'live' | 'scenario' = 'live',
  ): ScenarioGanttPairing => ({
    pairingId,
    sourcePairingId: pairingId,
    pairingSource,
    pairingLabel: `${assignmentGroup}-${pairingId}`,
    base: 'YYZ',
    fleet: '737',
    schStrDtUtc: '',
    schEndDtUtc: '',
    assignmentGroup,
    assignment: assignmentGroup,
    division: 'C',
    compositions: [],
  })

  it('keeps unassigned RES pairings when they are inside the source scope', () => {
    const sourceRes = pairing(7101, 'RES')
    const extraRes = pairing(7102, 'RES')
    const result = pruneUnreferencedReservePairings(
      [sourceRes, extraRes],
      [],
      [],
      [],
      new Set([`live:${sourceRes.pairingId}`]),
    )

    expect(result.pairings.map((row) => row.pairingId)).toEqual([7101])
  })

  it('keeps source and roster-referenced reserve rows while pruning unrelated extras', () => {
    const poSourceRes = pairing(7201, 'RES', 'scenario')
    const unrelatedLiveRes = pairing(7202, 'RES')
    const referencedLiveRes = pairing(7203, 'RES')
    const result = pruneUnreferencedReservePairings(
      [poSourceRes, unrelatedLiveRes, referencedLiveRes],
      [],
      [],
      [{ crewId: 'C001', pairingId: referencedLiveRes.pairingId, source: 'PA', pairingSource: 'live', sourcePairingId: referencedLiveRes.pairingId }],
      new Set([`scenario:${poSourceRes.pairingId}`]),
    )

    expect(result.pairings.map((row) => row.pairingId)).toEqual([7201, 7203])
  })
})

describe('buildGanttDataFromDb — SBY standby association (scenario 6)', () => {
  it('only converts SBY ground rows when a matching in-source SBY pairing is loaded', async () => {
    const d = await buildGanttDataFromDb(db, meta(6, 0, 0))

    // Unmatched standby remains a ground item; the builder must not invent or load unrelated PRAM/PRPM.
    const sbyGround = d.groundItems.filter((g) => g.assignmentGroup === 'SBY')
    for (const item of sbyGround) expect(item.assignment).toBe('RES')

    // Any loaded SBY pairing must carry a standby code and be referenced by a synthetic assignment.
    const sbyPairings = d.pairings.filter((p) => p.assignmentGroup === 'SBY')
    for (const p of sbyPairings) expect(['PRAM', 'PRPM']).toContain(p.assignment)

    const assignedPids = new Set(d.assignments.map((a) => a.pairingId))
    for (const p of sbyPairings) expect(assignedPids.has(p.pairingId)).toBe(true)

    const sbyPids = new Set(sbyPairings.map((p) => p.pairingId))
    const sbySegs = d.pairingSegments.filter((s) => sbyPids.has(s.pairingId))
    for (const s of sbySegs) expect(['PRAM', 'PRPM']).toContain(s.fltNum)
  })
})

describe('buildGanttDataSeed', () => {
  // Reuse a real scenario's scope (460 = RO, PO-backed) so the input is bounded.
  const loadScope = async (id: number) => {
    const r = await db.execute<{
      workset_id: string; ruleset_id: string | null
      str_dt_loc: string; end_dt_loc: string; filter_params: unknown
    }>(sql`SELECT workset_id, ruleset_id, str_dt_loc, end_dt_loc, filter_params
           FROM f8.scenario WHERE id = ${id}`)
    const row = r.rows[0]
    return {
      worksetId: Number(row.workset_id),
      rulesetId: Number(row.ruleset_id ?? 103),
      strDtLoc: new Date(row.str_dt_loc),
      endDtLoc: new Date(row.end_dt_loc),
      filterParams: (row.filter_params ?? {}) as Record<string, unknown>,
    }
  }
  const fastify = () => ({ db, pgPool: pool }) as never

  it('leadinLive=1 → assignments seeded from live, all source=PA', async () => {
    const scope = await loadScope(460)
    // SET search_path so drizzle selects (lead-in roster + pairing geometry) hit f8.
    await db.execute(sql`SET search_path TO f8`)
    const d = await buildGanttDataSeed(fastify(), {
      id: 460, name: 'seed-test', fileType: 'RO', leadinLive: 1, ...scope,
    })
    expect(d.dataSource).toBe('seed')
    expect(d.crew.length).toBeGreaterThan(0)
    for (const a of d.assignments) expect(a.source).toBe('PA')
    for (const g of d.groundItems) expect(g.source).toBe('PA')
    // Lead-in FLY bars need pairing geometry when RO window omits pure lead-in rings.
    const leadinPids = new Set(
      d.assignments.filter((a) => a.source === 'PA').map((a) => a.pairingId),
    )
    for (const pid of leadinPids) {
      expect(d.pairings.some((p) => p.pairingId === pid)).toBe(true)
    }
  }, 60_000)
})

describe('scenario composition fill recompute', () => {
  it('counts each live lead-in crew once per pairing rank across multi-segment rows', () => {
    const leadin = mapLeadinRows([
      {
        crewId: '197',
        base: 'YYC',
        pairingId: 10544,
        assignmentGroup: 'FLY',
        assignment: 'FLY',
        schStrDtUtc: null,
        schEndDtUtc: null,
        actingRank: 'CA',
        rosterActingRank: 'CA',
        isDeleted: 0,
        actCreditedMinutes: null,
      },
      {
        crewId: '197',
        base: 'YYC',
        pairingId: 10544,
        assignmentGroup: 'FLY',
        assignment: 'FLY',
        schStrDtUtc: null,
        schEndDtUtc: null,
        actingRank: 'CA',
        rosterActingRank: 'CA',
        isDeleted: 0,
        actCreditedMinutes: null,
      },
      {
        crewId: '1811',
        base: 'YYC',
        pairingId: 10544,
        assignmentGroup: 'FLY',
        assignment: 'FLY',
        schStrDtUtc: null,
        schEndDtUtc: null,
        actingRank: 'FO',
        rosterActingRank: 'FO',
        isDeleted: 0,
        actCreditedMinutes: null,
      },
      {
        crewId: '1811',
        base: 'YYC',
        pairingId: 10544,
        assignmentGroup: 'FLY',
        assignment: 'FLY',
        schStrDtUtc: null,
        schEndDtUtc: null,
        actingRank: 'FO',
        rosterActingRank: 'FO',
        isDeleted: 0,
        actCreditedMinutes: null,
      },
    ])

    const updated = recomputeCompositionFill(
      [{
        pairingId: 10544,
        pairingLabel: 'C4110',
        base: 'YYC',
        fleet: '7M8',
        schStrDtUtc: '2026-06-04T13:00:00Z',
        schEndDtUtc: '2026-06-04T22:05:00Z',
        assignmentGroup: 'FLY',
        assignment: 'FLY',
        division: 'P',
        compositions: [
          { rank: 'CA', plan: 1, fill: 0 },
          { rank: 'FO', plan: 1, fill: 0 },
        ],
      }],
      leadin.assignments,
      [
        { crewId: '197', base: 'YYC', division: 'P', rank: 'CA', seniorityNum: null, crewName: null },
        { crewId: '1811', base: 'YYC', division: 'P', rank: 'FO', seniorityNum: null, crewName: null },
      ],
    )

    expect(updated[0].compositions).toEqual([
      { rank: 'CA', plan: 1, fill: 1 },
      { rank: 'FO', plan: 1, fill: 1 },
    ])
  })

  it('uses roster slot rank instead of crew master rank when recomputing fill', () => {
    const leadin = mapLeadinRows([{
      crewId: '197',
      base: 'YYC',
      pairingId: 10545,
      assignmentGroup: 'FLY',
      assignment: 'FLY',
      schStrDtUtc: null,
      schEndDtUtc: null,
      actingRank: 'FO',
      rosterActingRank: 'FO',
      isDeleted: 0,
      actCreditedMinutes: null,
    }])

    const updated = recomputeCompositionFill(
      [{
        pairingId: 10545,
        pairingLabel: 'C4111',
        base: 'YYC',
        fleet: '7M8',
        schStrDtUtc: '2026-06-04T13:00:00Z',
        schEndDtUtc: '2026-06-04T22:05:00Z',
        assignmentGroup: 'FLY',
        assignment: 'FLY',
        division: 'P',
        compositions: [
          { rank: 'CA', plan: 1, fill: 0 },
          { rank: 'FO', plan: 1, fill: 0 },
        ],
      }],
      leadin.assignments,
      [{ crewId: '197', base: 'YYC', division: 'P', rank: 'CA', seniorityNum: null, crewName: null }],
    )

    expect(updated[0].compositions).toEqual([
      { rank: 'CA', plan: 1, fill: 0 },
      { rank: 'FO', plan: 1, fill: 1 },
    ])
  })
})

/** Parse the gz `## ASSIGNMENTS` section into a set of `crew_id|pairing_id` keys (same parser as the loaders). */
const gzAssignmentSet = (gzPath: string): Set<string> => {
  const text = gunzipSync(readFileSync(gzPath)).toString('utf-8')
  const set = new Set<string>()
  let cur: string | null = null
  let header: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('## ')) {
      cur = line.slice(3).trim()
      header = []
    } else if (!line || !cur) {
      continue
    } else if (cur === 'ASSIGNMENTS' && header.length === 0) {
      header = line.split(',')
    } else if (cur === 'ASSIGNMENTS') {
      const cells = line.split(',')
      const row: Record<string, string> = {}
      header.forEach((h, i) => (row[h] = cells[i] ?? ''))
      if (row['crew_id'] && row['pairing_id']) {
        set.add(`${row['crew_id']}|${Number(row['pairing_id'])}`)
      }
    }
  }
  return set
}

describe('DB ↔ gz assignment parity', () => {
  for (const { id, p, f } of [
    { id: 459, p: 0, f: 0 }, // live-backed
    { id: 460, p: 405, f: 456 }, // copy-backed
  ]) {
    it(`scenario ${id} DB assignments == gz ## ASSIGNMENTS`, async () => {
      const gzPath = `/tmp/sc${id}/output.gz`
      if (!existsSync(gzPath)) {
        console.warn(`[skip] ${gzPath} absent — re-fetch via engine result endpoint to run parity`)
        return
      }
      const gz = gzAssignmentSet(gzPath)
      const d = await buildGanttDataFromDb(db, meta(id, p, f))
      // SBY (standby) assignments are injected from the ROSTER section — the engine never writes them
      // to gz `## ASSIGNMENTS` — so they are intentionally absent from the gz set. Exclude SBY pairings
      // from the DB side so this parity check covers the regular pairing assignments it's meant to
      // validate. (A non-SBY mismatch would still surface, since only SBY pairings are filtered out.)
      const sbyPids = new Set(
        d.pairings.filter((pr) => pr.assignmentGroup === 'SBY').map((pr) => pr.pairingId),
      )
      const dbSet = new Set(
        d.assignments.filter((a) => !sbyPids.has(a.pairingId)).map((a) => `${a.crewId}|${a.pairingId}`),
      )
      expect(dbSet.size).toBeGreaterThan(0)
      expect(gz.size).toBeGreaterThan(0)
      // Same set both ways (no missing, no extra).
      const missing = [...gz].filter((k) => !dbSet.has(k))
      const extra = [...dbSet].filter((k) => !gz.has(k))
      expect({ missing, extra }).toEqual({ missing: [], extra: [] })
    })
  }
})
