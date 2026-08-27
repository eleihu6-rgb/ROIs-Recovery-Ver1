// live-server/src/__tests__/services/scenario-gantt-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { gzipSync } from 'node:zlib'
import { PgDialect } from 'drizzle-orm/pg-core'

vi.mock('../../config/env.js', () => ({ env: { ENGINE_SERVER_URL: 'http://engine:3003' } }))
vi.mock('../../services/engine-server-client.js')
vi.mock('../../services/scenario/scenario-export-service.js')

import { engineServerClient } from '../../services/engine-server-client.js'
import { buildRoInputGz } from '../../services/scenario/scenario-export-service.js'
import { buildGanttDataSnapshot, buildGanttDataLiveRefresh, buildGanttDataSeed, buildGanttDataFromSnapshotFiles } from '../../services/scenario/scenario-gantt-service.js'
import { computeScenarioCrewStats } from '../../services/scenario/scenario-crew-stats-service.js'

function makeGz(sections: string): Buffer {
  return gzipSync(Buffer.from(sections, 'utf-8'))
}

const MOCK_INPUT = makeGz(`## crew
crew_id,division
F80001,P
F80002,C

## crew_base
crew_id,base
F80001,PVG
F80002,CAN

## crew_rank
crew_id,rank
F80001,CA
F80002,FA

## pairing
id,pairing_label,base,sch_str_dt_utc,sch_end_dt_utc,assignment_group,assignment,division
100,P2045,PVG,2026-05-01T00:00:00.000Z,2026-05-02T00:00:00.000Z,GRP,CA,P

## pairing_segment
pairing_id,duty_seq,seg_seq,flt_id,flt_dt,flt_num,airline,dep_arp,arv_arp,seg_assignment,sch_str_dt_utc,sch_end_dt_utc,act_str_dt_utc,act_end_dt_utc,duty_str_arp,duty_end_arp,duty_sch_str_dt_utc,duty_sch_end_dt_utc
100,1,1,9001,2026-05-01,101,F8,PVG,PEK,FLT,2026-05-01T01:00:00.000Z,2026-05-01T03:00:00.000Z,2026-05-01T01:15:00.000Z,2026-05-01T03:20:00.000Z,PVG,PEK,2026-05-01T00:00:00.000Z,2026-05-01T04:00:00.000Z

## flight
id,flt_num,dep_arp,arv_arp,sch_dep_dt_utc,sch_arv_dt_utc,fleet,register
9001,101,PVG,PEK,2026-05-01T02:05:00.000Z,2026-05-01T04:00:00.000Z,737,B-001
9999,999,CAN,PVG,2026-05-01T02:00:00.000Z,2026-05-01T04:00:00.000Z,737,B-999
`)
const MOCK_OUTPUT = makeGz(`## ASSIGNMENTS
crew_id,pairing_id
F80001,100
`)

const MOCK_OUTPUT_WITH_GROUND = makeGz(`## ASSIGNMENTS
crew_id,pairing_id
F80001,100

## ROSTER
crew_id,base,assignment_group,assignment,sch_str_dt_utc,sch_end_dt_utc,acting_rank,source
F80002,YVR,GRD,SIM,2026-05-03T09:00:00.000Z,2026-05-03T12:00:00.000Z,FA,CR
`)

const MOCK_SC = {
  id: 42, name: 'RO-Test', taskId: 't-abc', strDtLoc: new Date('2026-05-01'),
  endDtLoc: new Date('2026-05-31'), leadinLive: 0 as 0,
  worksetId: 1, filterParams: {}, rulesetId: 103, fileType: 'RO' as const,
}

describe('buildGanttDataSnapshot (path B)', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns crew from input.gz and assignments from output.gz', async () => {
    vi.mocked(engineServerClient.fetchInputFile).mockResolvedValue(MOCK_INPUT)
    vi.mocked(engineServerClient.fetchResultFile).mockResolvedValue(MOCK_OUTPUT)

    const mockFastify = { db: { execute: vi.fn().mockResolvedValue({ rows: [] }) } } as never
    const data = await buildGanttDataSnapshot(mockFastify, MOCK_SC, 'tok', 'f8')

    expect(data.dataSource).toBe('snapshot')
    expect(data.crew).toHaveLength(2)
    expect(data.crew[0]).toMatchObject({ crewId: 'F80001', base: 'PVG', division: 'P', rank: 'CA' })
    expect(data.pairings).toHaveLength(1)
    expect(data.pairings[0].pairingId).toBe(100)
    expect(data.assignments).toHaveLength(1)
    expect(data.assignments[0]).toEqual({ crewId: 'F80001', pairingId: 100, source: 'CR', rosterActingRank: null, rank: null })
    expect(data.flights.map((f) => f.id)).toEqual([9001])
    expect(data.pairingSegments[0]).toMatchObject({
      schStrDtUtc: '2026-05-01T01:00:00.000Z',
      schEndDtUtc: '2026-05-01T03:00:00.000Z',
      actStrDtUtc: '2026-05-01T01:15:00.000Z',
      actEndDtUtc: '2026-05-01T03:20:00.000Z',
    })
  })

  it('throws when taskId missing', async () => {
    vi.mocked(engineServerClient.fetchInputFile).mockRejectedValue(new Error('404'))
    const mockFastify = { db: { execute: vi.fn().mockResolvedValue({ rows: [] }) } } as never
    await expect(buildGanttDataSnapshot(mockFastify, { ...MOCK_SC, taskId: '' }, 'tok', 'f8')).rejects.toThrow()
  })

  it('deduplicates crew when same crew_id appears multiple times in input.gz', async () => {
    const dupInput = makeGz(`## crew
crew_id,division
F80001,P
F80001,P
F80002,C

## crew_base
crew_id,base
F80001,PVG
F80002,CAN

## crew_rank
crew_id,rank
F80001,CA
F80002,FA

## pairing
id,pairing_label,base,sch_str_dt_utc,sch_end_dt_utc,assignment_group,assignment,division
100,P2045,PVG,2026-05-01T00:00:00.000Z,2026-05-02T00:00:00.000Z,GRP,CA,P
`)
    vi.mocked(engineServerClient.fetchInputFile).mockResolvedValue(dupInput)
    vi.mocked(engineServerClient.fetchResultFile).mockResolvedValue(MOCK_OUTPUT)

    const mockFastify = { db: { execute: vi.fn().mockResolvedValue({ rows: [] }) } } as never
    const data = await buildGanttDataSnapshot(mockFastify, MOCK_SC, 'tok', 'f8')

    expect(data.crew).toHaveLength(2)
    expect(data.crew.filter((c) => c.crewId === 'F80001')).toHaveLength(1)
  })

  it('preserves base from optimizer roster ground items', async () => {
    vi.mocked(engineServerClient.fetchInputFile).mockResolvedValue(MOCK_INPUT)
    vi.mocked(engineServerClient.fetchResultFile).mockResolvedValue(MOCK_OUTPUT_WITH_GROUND)

    const mockFastify = { db: { execute: vi.fn().mockResolvedValue({ rows: [] }) } } as never
    const data = await buildGanttDataSnapshot(mockFastify, MOCK_SC, 'tok', 'f8')

    expect(data.groundItems[0]).toMatchObject({
      crewId: 'F80002',
      base: 'YVR',
      assignmentGroup: 'GRD',
      assignment: 'SIM',
    })
  })

  it('carries ASSIGNMENTS.acting_rank so Pairing Info shows the crew Acting Rank', async () => {
    // output.gz ASSIGNMENTS carries acting_rank (the optimizer's assignment role).
    // Dropping it left the snapshot path (historical versions / gz source) with a
    // blank Acting Rank column in the Pairing Info "Crew on Pairing" table.
    const outputWithRank = makeGz(`## ASSIGNMENTS
crew_id,pairing_id,acting_rank,source
F80001,100,CA,CR
`)
    vi.mocked(engineServerClient.fetchInputFile).mockResolvedValue(MOCK_INPUT)
    vi.mocked(engineServerClient.fetchResultFile).mockResolvedValue(outputWithRank)

    const mockFastify = { db: { execute: vi.fn().mockResolvedValue({ rows: [] }) } } as never
    const data = await buildGanttDataSnapshot(mockFastify, MOCK_SC, 'tok', 'f8')

    expect(data.assignments[0]).toMatchObject({
      crewId: 'F80001',
      pairingId: 100,
      source: 'CR',
      rosterActingRank: 'CA',
      rank: 'CA',
    })
  })
})

import {
  mapLeadinRows,
  leadinWindowBounds,
  livePaWindowBounds,
  deriveDateRange,
  GANTT_LEAD_DAYS,
  loadLeadinFromLive,
  mergeLeadinPairingGeometry,
} from '../../services/scenario/scenario-gantt-service.js'

describe('deriveDateRange', () => {
  it('pads official calendar dates by exactly 7 days at day boundaries', () => {
    const result = deriveDateRange(
      [],
      new Date('2026-07-01T07:00:00.000Z'),
      new Date('2026-07-31T07:00:00.000Z'),
    )

    expect(result.strDtLoc).toBe('2026-06-24T00:00:00.000Z')
    expect(result.endDtLoc).toBe('2026-08-07T23:59:59.999Z')
  })

  it('does not widen the fixed display range for pairings outside the scenario window', () => {
    const result = deriveDateRange(
      [{
        pairingId: 1,
        pairingLabel: 'outside',
        base: '',
        fleet: '',
        schStrDtUtc: '2026-06-10T04:00:00.000Z',
        schEndDtUtc: '2026-08-20T19:00:00.000Z',
        assignmentGroup: '',
        assignment: '',
        division: 'P',
        compositions: [],
      }],
      new Date('2026-07-01T07:00:00.000Z'),
      new Date('2026-07-31T07:00:00.000Z'),
    )

    expect(result).toEqual({
      strDtLoc: '2026-06-24T00:00:00.000Z',
      endDtLoc: '2026-08-07T23:59:59.999Z',
    })
  })
})

describe('leadinWindowBounds', () => {
  it('returns [strDtLoc - 7d, strDtLoc)', () => {
    const { leadStart, leadEndExclusive } = leadinWindowBounds(new Date('2026-07-01T00:00:00.000Z'))
    expect(leadEndExclusive.toISOString()).toBe('2026-07-01T00:00:00.000Z')
    expect(leadStart.toISOString()).toBe('2026-06-24T00:00:00.000Z')
    expect(GANTT_LEAD_DAYS).toBe(7)
  })
})

describe('livePaWindowBounds', () => {
  it('returns [strDtLoc - 7d, endDtLoc + 1d) covering lead-in + scenario period', () => {
    const { leadStart, loadEndExclusive } = livePaWindowBounds(
      new Date('2026-07-01T00:00:00.000Z'),
      new Date('2026-07-31T00:00:00.000Z'),
    )
    expect(leadStart.toISOString()).toBe('2026-06-24T00:00:00.000Z')
    expect(loadEndExclusive.toISOString()).toBe('2026-08-01T00:00:00.000Z')
  })
})

describe('mapLeadinRows', () => {
  const base = {
    base: 'YVR',
    assignmentGroup: 'FLT', assignment: 'FLT', actingRank: 'CA',
    rosterActingRank: 'CA',
    schStrDtUtc: new Date('2026-06-02T01:00:00Z'),
    schEndDtUtc: new Date('2026-06-02T05:00:00Z'),
    actCreditedMinutes: '240',
  }

  it('maps pairing-linked rows to PA assignments', () => {
    const { assignments, groundItems } = mapLeadinRows([
      { ...base, crewId: 'C1', pairingId: 99, isDeleted: 0 },
    ])
    expect(assignments).toEqual([
      expect.objectContaining({
        crewId: 'C1',
        pairingId: 99,
        source: 'PA',
        rank: 'CA',
        rosterActingRank: 'CA',
      }),
    ])
    expect(groundItems).toHaveLength(0)
  })

  it('keeps pairing and flight acting rank separate on pairing-linked rows', () => {
    const { assignments } = mapLeadinRows([
      {
        ...base,
        crewId: 'C1',
        pairingId: 99,
        isDeleted: 0,
        activeRank: 'CA',
        rosterActingRank: 'CA',
        flightActingRank: 'FO',
      },
    ])
    expect(assignments[0]).toMatchObject({
      crewRank: 'CA',
      rosterActingRank: 'CA',
      flightActingRank: 'FO',
      rank: 'CA',
    })
  })

  it('maps pairing-less rows to PA ground items', () => {
    const { assignments, groundItems } = mapLeadinRows([
      { ...base, crewId: 'C1', pairingId: null, isDeleted: 0, label: 'GDO' },
    ])
    expect(assignments).toHaveLength(0)
    expect(groundItems[0]).toMatchObject({
      crewId: 'C1', base: 'YVR', source: 'PA', actCreditedMinutes: 240,
      assignment: 'FLT', label: 'GDO',
    })
    expect(groundItems[0].schStrDtUtc).toBe('2026-06-02T01:00:00.000Z')
  })

  it('preserves Live roster_flight.label on DO → GDO ground items', () => {
    const { groundItems } = mapLeadinRows([{
      crewId: 'C1',
      base: 'YVR',
      pairingId: null,
      assignmentGroup: 'DO',
      assignment: 'DO',
      label: 'GDO',
      schStrDtUtc: new Date('2026-06-25T07:01:00Z'),
      schEndDtUtc: new Date('2026-06-26T07:00:00Z'),
      actingRank: '',
      isDeleted: 0,
      actCreditedMinutes: null,
    }])
    expect(groundItems).toHaveLength(1)
    expect(groundItems[0]).toMatchObject({ assignment: 'DO', label: 'GDO' })
  })

  it('drops deleted rows and ground rows missing a window', () => {
    const { assignments, groundItems } = mapLeadinRows([
      { ...base, crewId: 'C1', pairingId: 99, isDeleted: 1 },
      { ...base, crewId: 'C2', pairingId: null, isDeleted: 0, schStrDtUtc: null },
    ])
    expect(assignments).toHaveLength(0)
    expect(groundItems).toHaveLength(0)
  })

  it('deduplicates multi-segment live rows into one PA assignment per crew pairing', () => {
    const { assignments, groundItems } = mapLeadinRows([
      {
        ...base,
        crewId: '379',
        pairingId: 12875,
        isDeleted: 0,
        schStrDtUtc: new Date('2026-07-03T18:50:00Z'),
        schEndDtUtc: new Date('2026-07-03T21:40:00Z'),
        rosterActingRank: 'CA',
        flightActingRank: 'CA',
      },
      {
        ...base,
        crewId: '379',
        pairingId: 12875,
        isDeleted: 0,
        schStrDtUtc: new Date('2026-07-03T22:25:00Z'),
        schEndDtUtc: new Date('2026-07-04T01:35:00Z'),
        rosterActingRank: 'CA',
        flightActingRank: 'CA',
      },
      {
        ...base,
        crewId: '379',
        pairingId: 12875,
        isDeleted: 0,
        schStrDtUtc: new Date('2026-07-04T02:20:00Z'),
        schEndDtUtc: new Date('2026-07-04T03:50:00Z'),
        rosterActingRank: 'CA',
        flightActingRank: 'CA',
      },
      {
        ...base,
        crewId: '379',
        pairingId: 12875,
        isDeleted: 0,
        schStrDtUtc: new Date('2026-07-04T04:35:00Z'),
        schEndDtUtc: new Date('2026-07-04T06:15:00Z'),
        rosterActingRank: 'CA',
        flightActingRank: 'CA',
      },
    ])

    expect(assignments).toEqual([
      expect.objectContaining({
        crewId: '379',
        pairingId: 12875,
        source: 'PA',
        rank: 'CA',
        sourcePairingId: 12875,
        pairingSource: 'live',
      }),
    ])
    expect(groundItems).toHaveLength(0)
  })
})

/** Sequential select().from().where() mock — first call is lead-in roster, rest are merge geometry. */
function mockDbSelectSequence(...responses: unknown[][]) {
  let i = 0
  return {
    select: () => ({
      from: () => ({
        where: vi.fn().mockImplementation(async () => responses[i++] ?? []),
      }),
    }),
    // loadScenarioRosterDutyRefs reads duty refs via fastify.db.execute — default to no rows.
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  }
}

const IN_WINDOW_STR = new Date('2026-04-28T12:00:00.000Z')
const IN_WINDOW_END = new Date('2026-04-28T16:00:00.000Z')

describe('loadLeadinFromLive', () => {
  it('returns empty when crewIds is empty (no DB call)', async () => {
    const select = vi.fn()
    const result = await loadLeadinFromLive(
      { select } as never,
      [],
      new Date('2026-04-24T00:00:00.000Z'),
      new Date('2026-05-01T00:00:00.000Z'),
    )
    expect(result).toEqual({ assignments: [], groundItems: [] })
    expect(select).not.toHaveBeenCalled()
  })

  it('maps in-window FLY + ground rows returned by the filtered query', async () => {
    const db = mockDbSelectSequence([
      {
        crewId: 'C1', pairingId: 99, isDeleted: 0,
        base: 'YVR', assignmentGroup: 'FLY', assignment: 'FLY',
        schStrDtUtc: IN_WINDOW_STR, schEndDtUtc: IN_WINDOW_END,
        actingRank: 'CA', rosterActingRank: 'CA', actCreditedMinutes: null,
      },
      {
        crewId: 'C1', pairingId: null, isDeleted: 0,
        base: 'YVR', assignmentGroup: 'DO', assignment: 'DO',
        schStrDtUtc: IN_WINDOW_STR, schEndDtUtc: IN_WINDOW_END,
        actingRank: '', actCreditedMinutes: 0,
      },
    ])
    const { leadStart, leadEndExclusive } = leadinWindowBounds(new Date('2026-05-01T00:00:00.000Z'))
    const result = await loadLeadinFromLive(db as never, ['C1'], leadStart, leadEndExclusive)
    expect(result.assignments).toEqual([
      expect.objectContaining({ crewId: 'C1', pairingId: 99, source: 'PA', rank: 'CA' }),
    ])
    expect(result.groundItems).toHaveLength(1)
    expect(result.groundItems[0].assignment).toBe('DO')
  })
})

describe('mergeLeadinPairingGeometry', () => {
  it('appends missing live pairing / segment / flight for lead-in pairingIds', async () => {
    const db = mockDbSelectSequence(
      // live pairing 99
      [{
        id: 99,
        pairingLabel: 'P99',
        base: 'YVR',
        schStrDtUtc: IN_WINDOW_STR,
        schEndDtUtc: IN_WINDOW_END,
        assignmentGroup: 'FLY',
        assignment: 'FLY',
        division: 'C',
      }],
      // compositions
      [{ pairingId: 99, actingRank: 'FA', plan: 1, fill: 0 }],
      // segments
      [{
        pairingId: 99, dutySeq: 1, segSeq: 1, fltId: 8001,
        fltDt: '2026-04-28', fltNum: '888', airline: 'F8',
        depArp: 'YVR', arvArp: 'YYC', segAssignment: 'FLT',
        schStrDtUtc: IN_WINDOW_STR, schEndDtUtc: IN_WINDOW_END,
        dutyStrArp: 'YVR', dutyEndArp: 'YYC',
        dutySchStrDtUtc: IN_WINDOW_STR, dutySchEndDtUtc: IN_WINDOW_END,
        dutySchRestMin: null, dutyActRestMin: null, dutyActCreditedMinutes: null,
        briefStartUtc: null, briefEndUtc: null,
        debriefStartUtc: null, debriefEndUtc: null,
        pickupStartUtc: null, pickupEndUtc: null,
        dropoffStartUtc: null, dropoffEndUtc: null,
      }],
      // flights
      [{
        id: 8001, fltNum: '888', depArp: 'YVR', arvArp: 'YYC',
        schDepDtUtc: IN_WINDOW_STR, schArvDtUtc: IN_WINDOW_END,
        fleet: '7M8', register: null,
      }],
    )

    const merged = await mergeLeadinPairingGeometry(
      db as never,
      [{
        pairingId: 100, pairingLabel: 'P100', base: 'PVG',
        fleet: '7M8',
        schStrDtUtc: '2026-05-01T00:00:00.000Z', schEndDtUtc: '2026-05-02T00:00:00.000Z',
        assignmentGroup: 'GRP', assignment: 'CA', division: 'P', compositions: [],
      }],
      [],
      [],
      [{ crewId: 'C1', pairingId: 99, source: 'PA' }],
    )

    expect(merged.pairings.map((p) => p.pairingId).sort((a, b) => a - b)).toEqual([99, 100])
    expect(merged.pairings.find((p) => p.pairingId === 99)).toMatchObject({
      pairingLabel: 'P99', base: 'YVR', division: 'C',
      compositions: [{ rank: 'FA', plan: 1, fill: 0 }],
    })
    expect(merged.pairingSegments).toHaveLength(1)
    expect(merged.pairingSegments[0]).toMatchObject({ pairingId: 99, fltId: 8001, fltNum: '888' })
    expect(merged.flights).toEqual([
      expect.objectContaining({ id: 8001, fltNum: '888', depArp: 'YVR' }),
    ])
  })

  it('is a no-op when lead-in pairingIds are already in the RO payload', async () => {
    const select = vi.fn()
    const pairings = [{
      pairingId: 99, pairingLabel: 'P99', base: 'YVR',
      fleet: '7M8',
      schStrDtUtc: '2026-04-28T12:00:00.000Z', schEndDtUtc: '2026-04-28T16:00:00.000Z',
      assignmentGroup: 'FLY', assignment: 'FLY', division: 'C', compositions: [],
    }]
    const merged = await mergeLeadinPairingGeometry(
      { select } as never,
      pairings,
      [],
      [],
      [{ crewId: 'C1', pairingId: 99, source: 'PA' }],
    )
    expect(merged.pairings).toBe(pairings)
    expect(merged.assignments).toEqual([
      expect.objectContaining({ crewId: 'C1', pairingId: 99, sourcePairingId: 99, pairingSource: 'live' }),
    ])
    expect(select).not.toHaveBeenCalled()
  })

  it('keeps colliding scenario and live pairing ids separate and remaps live assignments', async () => {
    const db = mockDbSelectSequence(
      [{
        id: 300,
        pairingLabel: 'LIVE300',
        base: 'YVR',
        schStrDtUtc: IN_WINDOW_STR,
        schEndDtUtc: IN_WINDOW_END,
        assignmentGroup: 'FLY',
        assignment: 'FLY',
        division: 'P',
      }],
      [{ pairingId: 300, actingRank: 'CA', plan: 1, fill: 0 }],
      [{
        pairingId: 300, dutySeq: 1, segSeq: 1, fltId: 8300,
        fltDt: '2026-04-28', fltNum: 'LIVE300', airline: 'F8',
        depArp: 'YVR', arvArp: 'YYC', segAssignment: 'FLT',
        schStrDtUtc: IN_WINDOW_STR, schEndDtUtc: IN_WINDOW_END,
        dutyStrArp: 'YVR', dutyEndArp: 'YYC',
        dutySchStrDtUtc: IN_WINDOW_STR, dutySchEndDtUtc: IN_WINDOW_END,
        dutySchRestMin: null, dutyActRestMin: null, dutyActCreditedMinutes: null,
        briefStartUtc: null, briefEndUtc: null,
        debriefStartUtc: null, debriefEndUtc: null,
        pickupStartUtc: null, pickupEndUtc: null,
        dropoffStartUtc: null, dropoffEndUtc: null,
      }],
      [],
    )

    const merged = await mergeLeadinPairingGeometry(
      db as never,
      [{
        pairingId: 300,
        sourcePairingId: 300,
        pairingSource: 'scenario',
        pairingLabel: 'SCEN300',
        base: 'YVR',
        fleet: '7M8',
        schStrDtUtc: '2026-05-01T00:00:00.000Z',
        schEndDtUtc: '2026-05-01T04:00:00.000Z',
        assignmentGroup: 'FLY',
        assignment: 'FLY',
        division: 'P',
        compositions: [],
      }],
      [{ pairingId: 300, dutySeq: 1, segSeq: 1, fltId: null, fltDt: '2026-05-01', fltNum: 'SCEN300', airline: 'F8', depArp: 'YVR', arvArp: 'YYC', segAssignment: 'FLT', schStrDtUtc: '2026-05-01T00:00:00.000Z', schEndDtUtc: '2026-05-01T04:00:00.000Z', dutyStrArp: 'YVR', dutyEndArp: 'YYC', dutySchStrDtUtc: '2026-05-01T00:00:00.000Z', dutySchEndDtUtc: '2026-05-01T04:00:00.000Z', brief1StartUtc: '', brief1EndUtc: '', debrief1StartUtc: '', debrief1EndUtc: '', pickup1StartUtc: '', pickup1EndUtc: '', dropoff1StartUtc: '', dropoff1EndUtc: '', dutySchRestMin: null, dutyActRestMin: null, dutyActCreditedMinutes: null }],
      [],
      [{ crewId: 'C1', pairingId: 300, source: 'PA', sourcePairingId: 300, pairingSource: 'live' }],
      'scenario',
    )

    const livePairing = merged.pairings.find((p) => p.pairingSource === 'live')
    expect(livePairing).toMatchObject({ pairingId: -300, sourcePairingId: 300, pairingLabel: 'LIVE300' })
    expect(merged.pairings.find((p) => p.pairingSource === 'scenario')).toMatchObject({ pairingId: 300 })
    expect(merged.pairingSegments.filter((s) => s.fltNum === 'SCEN300')).toEqual([
      expect.objectContaining({ pairingId: 300 }),
    ])
    expect(merged.pairingSegments.filter((s) => s.fltNum === 'LIVE300')).toEqual([
      expect.objectContaining({ pairingId: -300 }),
    ])
    expect(merged.assignments).toEqual([
      expect.objectContaining({ crewId: 'C1', pairingId: -300, sourcePairingId: 300, pairingSource: 'live' }),
    ])
  })
})

describe('buildGanttDataLiveRefresh (path A)', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns live-refresh dataSource and includes PA assignments', async () => {
    vi.mocked(buildRoInputGz).mockResolvedValue(MOCK_INPUT)
    vi.mocked(engineServerClient.fetchResultFile).mockResolvedValue(MOCK_OUTPUT)

    // lead-in roster row (in window); then empty live pairing → no geometry merge
    const mockDb = mockDbSelectSequence(
      [{
        crewId: 'F80001', pairingId: 99, isDeleted: 0,
        base: 'YVR', assignmentGroup: 'FLY', assignment: 'FLY',
        schStrDtUtc: IN_WINDOW_STR, schEndDtUtc: IN_WINDOW_END,
        actingRank: 'CA', actCreditedMinutes: null,
      }],
      [],
    )

    const data = await buildGanttDataLiveRefresh(
      { db: mockDb } as never,
      { ...MOCK_SC, leadinLive: 1 },
      'tok',
      'f8',
    )

    expect(data.dataSource).toBe('live-refresh')
    const PA = data.assignments.filter((a) => a.source === 'PA')
    expect(PA).toHaveLength(1)
    expect(PA[0].pairingId).toBe(99)
  })

  it('merges missing lead-in pairing geometry into the payload', async () => {
    vi.mocked(buildRoInputGz).mockResolvedValue(MOCK_INPUT)
    vi.mocked(engineServerClient.fetchResultFile).mockResolvedValue(MOCK_OUTPUT)

    const mockDb = mockDbSelectSequence(
      [{
        crewId: 'F80001', pairingId: 99, isDeleted: 0,
        base: 'YVR', assignmentGroup: 'FLY', assignment: 'FLY',
        schStrDtUtc: IN_WINDOW_STR, schEndDtUtc: IN_WINDOW_END,
        actingRank: 'CA', actCreditedMinutes: null,
      }],
      [{
        id: 99, pairingLabel: 'LEAD99', base: 'YVR',
        schStrDtUtc: IN_WINDOW_STR, schEndDtUtc: IN_WINDOW_END,
        assignmentGroup: 'FLY', assignment: 'FLY', division: 'P',
      }],
      [],
      [{
        pairingId: 99, dutySeq: 1, segSeq: 1, fltId: 8001,
        fltDt: '2026-04-28', fltNum: '777', airline: 'F8',
        depArp: 'YVR', arvArp: 'YYC', segAssignment: 'FLT',
        schStrDtUtc: IN_WINDOW_STR, schEndDtUtc: IN_WINDOW_END,
        dutyStrArp: 'YVR', dutyEndArp: 'YYC',
        dutySchStrDtUtc: IN_WINDOW_STR, dutySchEndDtUtc: IN_WINDOW_END,
        dutySchRestMin: null, dutyActRestMin: null, dutyActCreditedMinutes: null,
        briefStartUtc: null, briefEndUtc: null,
        debriefStartUtc: null, debriefEndUtc: null,
        pickupStartUtc: null, pickupEndUtc: null,
        dropoffStartUtc: null, dropoffEndUtc: null,
      }],
      [{
        id: 8001, fltNum: '777', depArp: 'YVR', arvArp: 'YYC',
        schDepDtUtc: IN_WINDOW_STR, schArvDtUtc: IN_WINDOW_END,
        fleet: '7M8', register: null,
      }],
    )

    const data = await buildGanttDataLiveRefresh(
      { db: mockDb } as never,
      { ...MOCK_SC, leadinLive: 1 },
      'tok',
      'f8',
    )

    expect(data.pairings.some((p) => p.pairingId === 99)).toBe(true)
    expect(data.pairingSegments.some((s) => s.pairingId === 99 && s.fltNum === '777')).toBe(true)
    expect(data.flights.some((f) => f.id === 8001)).toBe(true)
  })
})

describe('buildGanttDataSeed', () => {
  beforeEach(() => vi.resetAllMocks())

  it('loads live lead-in assignments by default even when leadinLive=0', async () => {
    vi.mocked(buildRoInputGz).mockResolvedValue(MOCK_INPUT)

    const mockDb = mockDbSelectSequence(
      [{
        crewId: 'F80001', pairingId: 99, isDeleted: 0,
        base: 'YVR', assignmentGroup: 'FLY', assignment: 'FLY',
        schStrDtUtc: IN_WINDOW_STR, schEndDtUtc: IN_WINDOW_END,
        actingRank: 'CA', actCreditedMinutes: null,
      }],
      [],
    )

    const data = await buildGanttDataSeed(
      { db: mockDb } as never,
      { ...MOCK_SC, leadinLive: 0 },
    )

    expect(data.dataSource).toBe('seed')
    expect(data.readOnly).toBe(true)
    const PA = data.assignments.filter((a) => a.source === 'PA')
    expect(PA).toHaveLength(1)
    expect(PA[0].pairingId).toBe(99)
  })

  it('drops unreferenced reserve pairings while keeping roster-referenced reserve geometry', async () => {
    const reserveInput = makeGz(`## crew
crew_id,division
F80001,P

## crew_base
crew_id,base
F80001,YVR

## crew_rank
crew_id,rank
F80001,CA

## pairing
id,pairing_label,base,sch_str_dt_utc,sch_end_dt_utc,assignment_group,assignment,division
100,F100,YVR,2026-05-01T00:00:00.000Z,2026-05-01T04:00:00.000Z,FLY,FLY,P
200,PRAM200,YVR,2026-05-02T00:00:00.000Z,2026-05-02T04:00:00.000Z,RES,PRAM,P
400,F400,YVR,2026-05-03T00:00:00.000Z,2026-05-03T04:00:00.000Z,FLY,FLY,P

## pairing_segment
pairing_id,duty_seq,seg_seq,flt_id,flt_dt,flt_num,airline,dep_arp,arv_arp,seg_assignment,sch_str_dt_utc,sch_end_dt_utc,duty_str_arp,duty_end_arp,duty_sch_str_dt_utc,duty_sch_end_dt_utc
100,1,1,9001,2026-05-01,101,F8,YVR,YYC,FLT,2026-05-01T00:00:00.000Z,2026-05-01T04:00:00.000Z,YVR,YYC,2026-05-01T00:00:00.000Z,2026-05-01T04:00:00.000Z
200,1,1,9002,2026-05-02,102,F8,YVR,YYC,PRAM,2026-05-02T00:00:00.000Z,2026-05-02T04:00:00.000Z,YVR,YYC,2026-05-02T00:00:00.000Z,2026-05-02T04:00:00.000Z
400,1,1,9004,2026-05-03,104,F8,YVR,YYC,FLT,2026-05-03T00:00:00.000Z,2026-05-03T04:00:00.000Z,YVR,YYC,2026-05-03T00:00:00.000Z,2026-05-03T04:00:00.000Z

## flight
id,flt_num,dep_arp,arv_arp,sch_dep_dt_utc,sch_arv_dt_utc,fleet,register
9001,101,YVR,YYC,2026-05-01T00:00:00.000Z,2026-05-01T04:00:00.000Z,737,B-001
9002,102,YVR,YYC,2026-05-02T00:00:00.000Z,2026-05-02T04:00:00.000Z,737,B-002
9004,104,YVR,YYC,2026-05-03T00:00:00.000Z,2026-05-03T04:00:00.000Z,737,B-004
`)
    vi.mocked(buildRoInputGz).mockResolvedValue(reserveInput)

    const mockDb = mockDbSelectSequence(
      [{
        crewId: 'F80001',
        pairingId: 300,
        isDeleted: 0,
        base: 'YVR',
        assignmentGroup: 'FLY',
        assignment: 'FLY',
        schStrDtUtc: IN_WINDOW_STR,
        schEndDtUtc: IN_WINDOW_END,
        actingRank: 'CA',
        actCreditedMinutes: null,
      }],
      [{
        id: 300,
        pairingLabel: 'PRPM300',
        base: 'YVR',
        schStrDtUtc: IN_WINDOW_STR,
        schEndDtUtc: IN_WINDOW_END,
        assignmentGroup: 'RES',
        assignment: 'PRPM',
        division: 'P',
      }],
      [{ pairingId: 300, actingRank: 'CA', plan: 1, fill: 0 }],
      [{
        pairingId: 300,
        dutySeq: 1,
        segSeq: 1,
        fltId: 9100,
        fltDt: '2026-04-28',
        fltNum: 'PRPM300',
        airline: 'F8',
        depArp: 'YVR',
        arvArp: 'YYC',
        segAssignment: 'PRPM',
        schStrDtUtc: IN_WINDOW_STR,
        schEndDtUtc: IN_WINDOW_END,
        dutyStrArp: 'YVR',
        dutyEndArp: 'YYC',
        dutySchStrDtUtc: IN_WINDOW_STR,
        dutySchEndDtUtc: IN_WINDOW_END,
        dutySchRestMin: null,
        dutyActRestMin: null,
        dutyActCreditedMinutes: null,
        briefStartUtc: null,
        briefEndUtc: null,
        debriefStartUtc: null,
        debriefEndUtc: null,
        pickupStartUtc: null,
        pickupEndUtc: null,
        dropoffStartUtc: null,
        dropoffEndUtc: null,
      }],
      [{
        id: 9100,
        fltNum: 'PRPM300',
        depArp: 'YVR',
        arvArp: 'YYC',
        schDepDtUtc: IN_WINDOW_STR,
        schArvDtUtc: IN_WINDOW_END,
        fleet: '737',
        register: 'B-300',
      }],
    )

    const data = await buildGanttDataSeed(
      { db: mockDb } as never,
      { ...MOCK_SC, pairingScenarioId: null },
    )

    expect(data.pairings.map((p) => p.pairingId).sort((a, b) => a - b)).toEqual([100, 200, 300, 400])
    expect(data.pairings.filter((p) => p.assignmentGroup === 'RES').map((p) => p.pairingId)).toEqual([200, 300])
    expect(data.pairingSegments.map((s) => s.pairingId).sort((a, b) => a - b)).toEqual([100, 200, 300, 400])
    expect(data.flights.map((f) => f.id).sort((a, b) => a - b)).toEqual([9001, 9002, 9004, 9100])
  })

  it('keeps RES source pairings when Scenario pairing Type selects RES, plus roster-referenced RES geometry', async () => {
    vi.mocked(buildRoInputGz).mockResolvedValue(makeGz(`## crew
crew_id,division
F80001,P

## crew_base
crew_id,base
F80001,YVR

## crew_rank
crew_id,rank
F80001,CA

## pairing
id,pairing_label,base,sch_str_dt_utc,sch_end_dt_utc,assignment_group,assignment,division
200,PRAM200,YVR,2026-05-02T00:00:00.000Z,2026-05-02T04:00:00.000Z,RES,PRAM,P

## pairing_segment
pairing_id,duty_seq,seg_seq,flt_id,flt_dt,flt_num,airline,dep_arp,arv_arp,seg_assignment,sch_str_dt_utc,sch_end_dt_utc,duty_str_arp,duty_end_arp,duty_sch_str_dt_utc,duty_sch_end_dt_utc
200,1,1,9002,2026-05-02,102,F8,YVR,YYC,PRAM,2026-05-02T00:00:00.000Z,2026-05-02T04:00:00.000Z,YVR,YYC,2026-05-02T00:00:00.000Z,2026-05-02T04:00:00.000Z

## flight
id,flt_num,dep_arp,arv_arp,sch_dep_dt_utc,sch_arv_dt_utc,fleet,register
9002,102,YVR,YYC,2026-05-02T00:00:00.000Z,2026-05-02T04:00:00.000Z,737,B-002
`))

    const mockDb = mockDbSelectSequence(
      [{
        crewId: 'F80001',
        pairingId: 300,
        isDeleted: 0,
        base: 'YVR',
        assignmentGroup: 'FLY',
        assignment: 'FLY',
        schStrDtUtc: IN_WINDOW_STR,
        schEndDtUtc: IN_WINDOW_END,
        actingRank: 'CA',
        actCreditedMinutes: null,
      }],
      [{
        id: 300,
        pairingLabel: 'PRPM300',
        base: 'YVR',
        schStrDtUtc: IN_WINDOW_STR,
        schEndDtUtc: IN_WINDOW_END,
        assignmentGroup: 'RES',
        assignment: 'PRPM',
        division: 'P',
      }],
      [{ pairingId: 300, actingRank: 'CA', plan: 1, fill: 0 }],
      [],
      [],
    )

    const data = await buildGanttDataSeed(
      { db: mockDb } as never,
      { ...MOCK_SC, pairingScenarioId: null, filterParams: { pairing: { types: ['RES'] } } },
    )

    expect(data.pairings.map((p) => p.pairingId).sort((a, b) => a - b)).toEqual([200, 300])
    expect(data.pairings.every((p) => p.assignmentGroup === 'RES')).toBe(true)
  })

  it('does not fall back to RO input pairings when a PO pairing scenario is configured', async () => {
    vi.mocked(buildRoInputGz).mockResolvedValue(makeGz(`## crew
crew_id,division
F80001,P

## crew_base
crew_id,base
F80001,YVR

## crew_rank
crew_id,rank
F80001,CA

## pairing
id,pairing_label,base,sch_str_dt_utc,sch_end_dt_utc,assignment_group,assignment,division
100,F100,YVR,2026-05-01T00:00:00.000Z,2026-05-01T04:00:00.000Z,FLY,FLY,P
200,PRAM200,YVR,2026-05-02T00:00:00.000Z,2026-05-02T04:00:00.000Z,RES,PRAM,P
400,F400,YVR,2026-05-03T00:00:00.000Z,2026-05-03T04:00:00.000Z,FLY,FLY,P

## pairing_segment
pairing_id,duty_seq,seg_seq,flt_id,flt_dt,flt_num,airline,dep_arp,arv_arp,seg_assignment,sch_str_dt_utc,sch_end_dt_utc,duty_str_arp,duty_end_arp,duty_sch_str_dt_utc,duty_sch_end_dt_utc
100,1,1,9001,2026-05-01,101,F8,YVR,YYC,FLT,2026-05-01T00:00:00.000Z,2026-05-01T04:00:00.000Z,YVR,YYC,2026-05-01T00:00:00.000Z,2026-05-01T04:00:00.000Z
200,1,1,9002,2026-05-02,102,F8,YVR,YYC,PRAM,2026-05-02T00:00:00.000Z,2026-05-02T04:00:00.000Z,YVR,YYC,2026-05-02T00:00:00.000Z,2026-05-02T04:00:00.000Z
400,1,1,9004,2026-05-03,104,F8,YVR,YYC,FLT,2026-05-03T00:00:00.000Z,2026-05-03T04:00:00.000Z,YVR,YYC,2026-05-03T00:00:00.000Z,2026-05-03T04:00:00.000Z

## flight
id,flt_num,dep_arp,arv_arp,sch_dep_dt_utc,sch_arv_dt_utc,fleet,register
9001,101,YVR,YYC,2026-05-01T00:00:00.000Z,2026-05-01T04:00:00.000Z,737,B-001
9002,102,YVR,YYC,2026-05-02T00:00:00.000Z,2026-05-02T04:00:00.000Z,737,B-002
9004,104,YVR,YYC,2026-05-03T00:00:00.000Z,2026-05-03T04:00:00.000Z,737,B-004
`))

    const selectDb = mockDbSelectSequence(
      [{
        crewId: 'F80001',
        pairingId: 300,
        isDeleted: 0,
        base: 'YVR',
        assignmentGroup: 'FLY',
        assignment: 'FLY',
        schStrDtUtc: IN_WINDOW_STR,
        schEndDtUtc: IN_WINDOW_END,
        actingRank: 'CA',
        actCreditedMinutes: null,
      }],
      [{
        id: 300,
        pairingLabel: 'PRPM300',
        base: 'YVR',
        schStrDtUtc: IN_WINDOW_STR,
        schEndDtUtc: IN_WINDOW_END,
        assignmentGroup: 'RES',
        assignment: 'PRPM',
        division: 'P',
      }],
      [{ pairingId: 300, actingRank: 'CA', plan: 1, fill: 0 }],
      [{
        pairingId: 300,
        dutySeq: 1,
        segSeq: 1,
        fltId: 9100,
        fltDt: '2026-04-28',
        fltNum: 'PRPM300',
        airline: 'F8',
        depArp: 'YVR',
        arvArp: 'YYC',
        segAssignment: 'PRPM',
        schStrDtUtc: IN_WINDOW_STR,
        schEndDtUtc: IN_WINDOW_END,
        dutyStrArp: 'YVR',
        dutyEndArp: 'YYC',
        dutySchStrDtUtc: IN_WINDOW_STR,
        dutySchEndDtUtc: IN_WINDOW_END,
        dutySchRestMin: null,
        dutyActRestMin: null,
        dutyActCreditedMinutes: null,
        briefStartUtc: null,
        briefEndUtc: null,
        debriefStartUtc: null,
        debriefEndUtc: null,
        pickupStartUtc: null,
        pickupEndUtc: null,
        dropoffStartUtc: null,
        dropoffEndUtc: null,
      }],
      [{
        id: 9100,
        fltNum: 'PRPM300',
        depArp: 'YVR',
        arvArp: 'YYC',
        schDepDtUtc: IN_WINDOW_STR,
        schArvDtUtc: IN_WINDOW_END,
        fleet: '737',
        register: 'B-300',
      }],
    )
    const fakeDb = {
      select: selectDb.select,
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    }

    const data = await buildGanttDataSeed(
      { db: fakeDb } as never,
      { ...MOCK_SC, pairingScenarioId: 692 },
    )

    expect(data.pairings.map((p) => p.pairingId)).toEqual([300])
    expect(data.pairings[0]).toMatchObject({ assignmentGroup: 'RES', assignment: 'PRPM' })
    expect(data.pairingSegments.map((s) => s.pairingId)).toEqual([300])
    expect(data.flights.map((f) => f.id)).toEqual([9100])
  })

  it('does not bulk-load unreferenced Live pairings for a PO-backed RO scenario', async () => {
    vi.mocked(buildRoInputGz).mockResolvedValue(makeGz(`## crew
crew_id,division
F80001,P

## crew_base
crew_id,base
F80001,YVR

## crew_rank
crew_id,rank
F80001,CA
`))

    const dialect = new PgDialect()
    const executed: string[] = []
    const selectDb = mockDbSelectSequence([])
    const fakeDb = {
      select: selectDb.select,
      execute: vi.fn().mockImplementation(async (query: unknown) => {
        const { sql: text } = dialect.sqlToQuery(query as never)
        executed.push(text)
        if (text.includes('SELECT pairing_scenario_id')) {
          return { rows: [{ pairing_scenario_id: null }] }
        }
        if (text.includes('.pairing')) {
          return { rows: [{
            id: '300',
            pairing_label: 'PO300',
            base: 'YVR',
            fleet: '7M8',
            sch_str: '2026-04-20T00:00:00Z',
            sch_end: '2026-04-20T04:00:00Z',
            assignment_group: 'FLY',
            assignment: 'FLY',
            division: 'P',
          }] }
        }
        return { rows: [] }
      }),
    }
    const fakePgPool = {
      query: vi.fn().mockImplementation(async (text: string) => {
        if (text.includes('pairing_composition')) {
          return { rows: [{ pairing_id: '300', acting_rank: 'CA', plan: 1, fill: 0 }] }
        }
        if (text.includes('pairing_segment')) {
          return { rows: [{
            pairing_id: '300',
            duty_seq: '1',
            seg_seq: '1',
            flt_id: null,
            flt_dt: '2026-04-20',
            flt_num: 'PO300',
            airline: 'F8',
            dep_arp: 'YVR',
            arv_arp: 'YYC',
            seg_assignment: 'FLT',
            sch_str: '2026-04-20T00:00:00Z',
            sch_end: '2026-04-20T04:00:00Z',
            duty_str_arp: 'YVR',
            duty_end_arp: 'YYC',
            duty_sch_str: '2026-04-20T00:00:00Z',
            duty_sch_end: '2026-04-20T04:00:00Z',
            duty_sch_rest_min: null,
            duty_act_rest_min: null,
            duty_act_credited_minutes: null,
            brief_start: null,
            brief_end: null,
            debrief_start: null,
            debrief_end: null,
            pickup_start: null,
            pickup_end: null,
            dropoff_start: null,
            dropoff_end: null,
          }] }
        }
        return { rows: [] }
      }),
    }

    const data = await buildGanttDataSeed(
      { db: fakeDb, pgPool: fakePgPool } as never,
      {
        ...MOCK_SC,
        pairingScenarioId: 692,
        filterParams: { pairing: { bases: ['YVR'], fleets: ['7M8'] } },
      },
    )

    const pairingQueries = executed.filter((text) => text.includes('.pairing') && text.includes('SELECT id, pairing_label'))
    expect(pairingQueries).toHaveLength(1)
    expect(pairingQueries[0]).toContain('scenario')
    expect(pairingQueries[0]).not.toMatch(/FROM\s+f8\.pairing/i)
    expect(data.pairings).toEqual([
      expect.objectContaining({ pairingId: 300, pairingSource: 'scenario', pairingLabel: 'PO300' }),
    ])
  })

  it('keeps in-period Live PA (not only lead-in window) so scenario month duties render', async () => {
    vi.mocked(buildRoInputGz).mockResolvedValue(MOCK_INPUT)

    const inPeriodStr = new Date('2026-05-10T12:00:00.000Z')
    const inPeriodEnd = new Date('2026-05-10T16:00:00.000Z')
    const mockDb = mockDbSelectSequence(
      [
        {
          crewId: 'F80001', pairingId: 99, isDeleted: 0,
          base: 'YVR', assignmentGroup: 'FLY', assignment: 'FLY',
          schStrDtUtc: IN_WINDOW_STR, schEndDtUtc: IN_WINDOW_END,
          actingRank: 'CA', actCreditedMinutes: null,
        },
        {
          crewId: 'F80001', pairingId: 100, isDeleted: 0,
          base: 'PVG', assignmentGroup: 'GRP', assignment: 'CA',
          schStrDtUtc: inPeriodStr, schEndDtUtc: inPeriodEnd,
          actingRank: 'CA', actCreditedMinutes: null,
        },
      ],
      [], // pairing 99 missing from RO → merge finds none; 100 already in RO
    )

    const data = await buildGanttDataSeed(
      { db: mockDb } as never,
      { ...MOCK_SC, leadinLive: 1 },
    )

    const paIds = data.assignments.filter((a) => a.source === 'PA').map((a) => a.pairingId).sort((a, b) => a - b)
    expect(paIds).toEqual([99, 100])
    // In-period pairing geometry comes from RO input (no merge needed).
    expect(data.pairings.some((p) => p.pairingId === 100)).toBe(true)
  })
})

describe('version snapshot crewStats (manday)', () => {
  // Mirrors the version gantt-data route: build from the archived input/output gz files, then
  // compute per-crew crewStats with computeScenarioCrewStats (the archive has no manday of its own).
  it('computes per-crew per-month crewStats from snapshot roster data', async () => {
    const input = makeGz(`## crew
crew_id,division
F80001,P

## crew_base
crew_id,base
F80001,PVG

## crew_rank
crew_id,rank
F80001,CA

## pairing
id,pairing_label,base,sch_str_dt_utc,sch_end_dt_utc,assignment_group,assignment,division
100,P2045,PVG,2026-05-01T00:00:00.000Z,2026-05-02T00:00:00.000Z,GRP,CA,P

## pairing_segment
pairing_id,duty_seq,seg_seq,flt_id,flt_dt,flt_num,airline,dep_arp,arv_arp,seg_assignment,sch_str_dt_utc,sch_end_dt_utc,act_str_dt_utc,act_end_dt_utc,duty_str_arp,duty_end_arp,duty_sch_str_dt_utc,duty_sch_end_dt_utc,duty_act_credited_minutes
100,1,1,9001,2026-05-01,101,F8,PVG,PEK,FLT,2026-05-01T01:00:00.000Z,2026-05-01T03:00:00.000Z,2026-05-01T01:15:00.000Z,2026-05-01T03:20:00.000Z,PVG,PEK,2026-05-01T00:00:00.000Z,2026-05-01T04:00:00.000Z,300

## flight
id,flt_num,dep_arp,arv_arp,sch_dep_dt_utc,sch_arv_dt_utc,fleet,register
9001,101,PVG,PEK,2026-05-01T02:05:00.000Z,2026-05-01T04:00:00.000Z,737,B-001
`)
    const output = makeGz(`## ASSIGNMENTS
crew_id,pairing_id
F80001,100
`)
    const mockExecute = vi.fn(async () => {
      const i = mockExecute.mock.calls.length - 1
      if (i === 0) return { rows: [{ airport: 'PVG', zone_id: 'Asia/Shanghai' }] }
      if (i === 1) return { rows: [{ roster_period: '2026RP05', rp_start: '2026-05-01', rp_end: '2026-05-31' }] }
      return { rows: [] }
    })
    const mockDb = { execute: mockExecute }

    const data = await buildGanttDataFromSnapshotFiles({ db: mockDb } as never, MOCK_SC, input, output)
    expect(data.crewStats).toEqual({})
    mockExecute.mockClear() // reset call index so computeScenarioCrewStats queries start at 0

    const crewStats = await computeScenarioCrewStats(mockDb as never, data)

    // RP-period dimension (not Month) — the aggregation basis Live's manday tool uses.
    expect(crewStats.F80001?.['2026RP05']).toMatchObject({ credit: 300 })
  })
})
