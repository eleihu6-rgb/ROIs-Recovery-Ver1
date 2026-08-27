import { describe, it, expect } from 'vitest'
import { buildScenarioFlightCrew, mergeScenarioAndLiveFlightCrew } from '../build-scenario-flight-crew'
import { READ_ONLY_CAPABILITIES } from '@/components/gantt/source/gantt-pane-source'
import type { ScenarioGanttData } from '@/types/scenario-gantt'

const baseData = (): ScenarioGanttData => ({
  scenarioId: 1,
  scenarioName: 't',
  fileType: 'RO',
  capabilities: READ_ONLY_CAPABILITIES,
  strDtLoc: '2026-03-01',
  endDtLoc: '2026-03-31',
  scenarioStrDt: '2026-03-01',
  scenarioEndDt: '2026-03-31',
  leadinLive: 0,
  dataSource: 'db',
  crew: [
    { crewId: 'F80001', base: 'YYC', division: 'P', crewRank: 'CA', rank: 'CA', seniorityNum: null, crewName: 'Alpha' },
    { crewId: 'F80002', base: 'YYC', division: 'P', crewRank: 'FO', rank: 'FO', seniorityNum: null, crewName: 'Bravo' },
  ],
  pairings: [
    {
      pairingId: 10,
      pairingLabel: 'P10',
      base: 'YYC',
      fleet: '320',
      schStrDtUtc: '2026-03-01T12:00:00Z',
      schEndDtUtc: '2026-03-01T18:00:00Z',
      assignmentGroup: 'FLY',
      assignment: 'FLY',
      division: 'P',
      compositions: [
        { rank: 'CA', plan: 1, fill: 1 },
        { rank: 'FO', plan: 1, fill: 0 },
      ],
    },
  ],
  assignments: [
    { crewId: 'F80001', pairingId: 10, source: 'CR', crewRank: 'CA', flightActingRank: 'CA' },
    { crewId: 'F80002', pairingId: 10, source: 'IMP', crewRank: 'FO', flightActingRank: 'FO' },
  ],
  pairingSegments: [
    {
      pairingId: 10,
      dutySeq: 1,
      segSeq: 1,
      fltId: 100,
      fltDt: '2026-03-01',
      fltNum: 'F8100',
      airline: 'F8',
      depArp: 'YYC',
      arvArp: 'YVR',
      segAssignment: 'FLY',
      schStrDtUtc: '2026-03-01T12:00:00Z',
      schEndDtUtc: '2026-03-01T14:00:00Z',
      dutyStrArp: 'YYC',
      dutyEndArp: 'YVR',
      dutySchStrDtUtc: '2026-03-01T12:00:00Z',
      dutySchEndDtUtc: '2026-03-01T14:00:00Z',
      dutySchRestMin: null,
      dutyActRestMin: null,
      dutyActCreditedMinutes: null,
      brief1StartUtc: '',
      brief1EndUtc: '',
      debrief1StartUtc: '',
      debrief1EndUtc: '',
      pickup1StartUtc: '',
      pickup1EndUtc: '',
      dropoff1StartUtc: '',
      dropoff1EndUtc: '',
    },
    {
      pairingId: 10,
      dutySeq: 1,
      segSeq: 2,
      fltId: 200,
      fltDt: '2026-03-01',
      fltNum: 'F8200',
      airline: 'F8',
      depArp: 'YVR',
      arvArp: 'YYC',
      segAssignment: 'DHD',
      schStrDtUtc: '2026-03-01T16:00:00Z',
      schEndDtUtc: '2026-03-01T18:00:00Z',
      dutyStrArp: 'YYC',
      dutyEndArp: 'YVR',
      dutySchStrDtUtc: '2026-03-01T12:00:00Z',
      dutySchEndDtUtc: '2026-03-01T18:00:00Z',
      dutySchRestMin: null,
      dutyActRestMin: null,
      dutyActCreditedMinutes: null,
      brief1StartUtc: '',
      brief1EndUtc: '',
      debrief1StartUtc: '',
      debrief1EndUtc: '',
      pickup1StartUtc: '',
      pickup1EndUtc: '',
      dropoff1StartUtc: '',
      dropoff1EndUtc: '',
    },
  ],
  flights: [],
  groundItems: [],
})


describe('buildScenarioFlightCrew', () => {
  it('lists operating crew on the flight and excludes DHD-only legs', () => {
    const data = baseData()
    const fly = buildScenarioFlightCrew(data, 100)
    expect(fly.items.map((i) => i.crewId).sort()).toEqual(['F80001', 'F80002'])
    expect(fly.items.find((i) => i.crewId === 'F80002')?.source).toBe('IMPORT')
    expect(fly.items.find((i) => i.crewId === 'F80001')?.base).toBe('YYC')

    const dhd = buildScenarioFlightCrew(data, 200)
    expect(dhd.items).toHaveLength(0)
  })

  it('falls back to rosterActingRank when flightActingRank is blank so composition counts IFD', () => {
    const data = baseData()
    data.crew.push({
      crewId: '1256',
      base: 'YVR',
      division: 'C',
      crewRank: 'IFD',
      rank: 'IFD',
      seniorityNum: null,
      crewName: 'Elissa',
    })
    data.pairings[0].compositions.push({ rank: 'IFD', plan: 1, fill: 0 })
    data.assignments.push({
      crewId: '1256',
      pairingId: 10,
      source: 'MA',
      crewRank: 'IFD',
      flightActingRank: '',
      rosterActingRank: 'IFD',
    })

    const fly = buildScenarioFlightCrew(data, 100)
    expect(fly.items.find((i) => i.crewId === '1256')?.actingRank).toBe('IFD')
    expect(fly.composition.IFD).toEqual({ plan: 1, actual: 1 })
  })
})

describe('mergeScenarioAndLiveFlightCrew', () => {
  it('keeps scenario assignees and appends Live-only mates on the same flight', () => {
    const scenario = buildScenarioFlightCrew(baseData(), 100)
    const live = {
      items: [
        {
          seqOrder: 1,
          crewId: '1012',
          crewName: 'Out Of Scope',
          base: 'YUL',
          seniorityNum: '7',
          crewRank: 'CA',
          actingRank: 'CA',
          label: '',
          source: 'MANUAL' as const,
          mbh: '0:00',
          mfdp: null,
        },
        {
          seqOrder: 2,
          crewId: 'F80001',
          crewName: 'Live Stale Name',
          base: 'YYZ',
          seniorityNum: '3',
          crewRank: 'CA',
          actingRank: 'CA',
          label: '',
          source: 'MANUAL' as const,
          mbh: '0:00',
          mfdp: null,
        },
      ],
      composition: { CA: { plan: 1, actual: 1 }, FO: { plan: 1, actual: 0 } },
      status: 'partial' as const,
    }
    const merged = mergeScenarioAndLiveFlightCrew(scenario, live)
    expect(merged.items.map((i) => i.crewId).sort()).toEqual(['1012', 'F80001', 'F80002'])
    expect(merged.items.find((i) => i.crewId === 'F80001')?.crewName).toBe('Alpha')
    expect(merged.items.find((i) => i.crewId === 'F80001')?.base).toBe('YYC')
    expect(merged.items.find((i) => i.crewId === '1012')?.crewName).toBe('Out Of Scope')
    expect(merged.items.find((i) => i.crewId === '1012')?.base).toBe('YUL')
  })

  it('keeps Live cabin composition plan when Live has no assigned crew items', () => {
    const scenario = buildScenarioFlightCrew(baseData(), 100)
    expect(scenario.composition.FA).toBeUndefined()

    const live = {
      items: [] as [],
      composition: {
        CA: { plan: 1, actual: 0 },
        FO: { plan: 1, actual: 0 },
        FA: { plan: 3, actual: 0 },
        IFD: { plan: 1, actual: 0 },
      },
      status: 'partial' as const,
    }
    const merged = mergeScenarioAndLiveFlightCrew(scenario, live)
    expect(merged.composition.FA).toEqual({ plan: 3, actual: 0 })
    expect(merged.composition.IFD).toEqual({ plan: 1, actual: 0 })
    expect(merged.composition.CA?.plan).toBeGreaterThanOrEqual(1)
    expect(merged.items.map((i) => i.crewId).sort()).toEqual(['F80001', 'F80002'])
  })
})
