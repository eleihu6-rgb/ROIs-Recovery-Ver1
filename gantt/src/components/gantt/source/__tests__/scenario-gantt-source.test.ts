import { describe, it, expect } from 'vitest'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { buildScenarioCrewIdentity, buildScenarioFlightComposition, buildScenarioFlightItems, useScenarioGanttSource } from '../scenario-gantt-source'
import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { getScenarioLayoutStore } from '@/stores/scenario-layout-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { useRosterPeriodStore } from '@/stores/roster-period-store'
import type { ScenarioGanttData } from '@/types/scenario-gantt'

const scenarioCapabilities = {
  panes: ['roster', 'pairing', 'flight'] as Array<'roster' | 'pairing' | 'flight'>,
  defaultPanes: ['roster', 'pairing', 'flight'] as Array<'roster' | 'pairing' | 'flight'>,
  roster: { canAssign: true, canRemove: true, canReassign: true },
  pairing: { canEditSegments: false },
}

const makeScenarioData = (): ScenarioGanttData => ({
  scenarioId: 990100,
  scenarioName: 'Scenario flight hover unit',
  fileType: 'RO',
  capabilities: scenarioCapabilities,
  strDtLoc: '2026-03-01T00:00:00.000Z',
  endDtLoc: '2026-03-31T23:59:59.000Z',
  scenarioStrDt: '2026-03-01T00:00:00',
  scenarioEndDt: '2026-03-31T00:00:00',
  leadinLive: 1,
  dataSource: 'snapshot',
  crew: [],
  pairings: [
    {
      pairingId: 2000,
      pairingLabel: 'P2000',
      base: 'YEG',
      schStrDtUtc: '2026-03-02T08:00:00.000Z',
      schEndDtUtc: '2026-03-02T16:00:00.000Z',
      assignmentGroup: 'FLT',
      assignment: 'FLT',
      division: 'Pilots',
      compositions: [
        { rank: 'CA', plan: 1, fill: 1 },
        { rank: 'FO', plan: 1, fill: 0 },
      ],
    },
    {
      pairingId: 2001,
      pairingLabel: 'P2001',
      base: 'YEG',
      schStrDtUtc: '2026-03-02T08:00:00.000Z',
      schEndDtUtc: '2026-03-02T16:00:00.000Z',
      assignmentGroup: 'FLT',
      assignment: 'FLT',
      division: 'Pilots',
      compositions: [
        { rank: 'CA', plan: 1, fill: 0 },
        { rank: 'FA', plan: 2, fill: 1 },
      ],
    },
  ],
  assignments: [],
  pairingSegments: [
    {
      pairingId: 2000,
      dutySeq: 1,
      segSeq: 1,
      fltId: 6010,
      fltDt: '2026-03-02',
      fltNum: '2010',
      airline: 'F8',
      depArp: 'YEG',
      arvArp: 'YYZ',
      segAssignment: 'FLT',
      schStrDtUtc: '2026-03-02T08:00:00.000Z',
      schEndDtUtc: '2026-03-02T16:00:00.000Z',
      dutyStrArp: 'YEG',
      dutyEndArp: 'YYZ',
      dutySchStrDtUtc: '2026-03-02T08:00:00.000Z',
      dutySchEndDtUtc: '2026-03-02T16:00:00.000Z',
      dutySchRestMin: null,
      dutyActRestMin: null,
      dutyActCreditedMinutes: 480,
      brief1StartUtc: '2026-03-02T08:00:00.000Z',
      brief1EndUtc: '2026-03-02T08:00:00.000Z',
      debrief1StartUtc: '2026-03-02T16:00:00.000Z',
      debrief1EndUtc: '2026-03-02T16:00:00.000Z',
      pickup1StartUtc: '2026-03-02T08:00:00.000Z',
      pickup1EndUtc: '2026-03-02T08:00:00.000Z',
      dropoff1StartUtc: '2026-03-02T16:00:00.000Z',
      dropoff1EndUtc: '2026-03-02T16:00:00.000Z',
    },
    {
      pairingId: 2001,
      dutySeq: 1,
      segSeq: 1,
      fltId: 6010,
      fltDt: '2026-03-02',
      fltNum: '2010',
      airline: 'F8',
      depArp: 'YEG',
      arvArp: 'YYZ',
      segAssignment: 'FLT',
      schStrDtUtc: '2026-03-02T08:00:00.000Z',
      schEndDtUtc: '2026-03-02T16:00:00.000Z',
      dutyStrArp: 'YEG',
      dutyEndArp: 'YYZ',
      dutySchStrDtUtc: '2026-03-02T08:00:00.000Z',
      dutySchEndDtUtc: '2026-03-02T16:00:00.000Z',
      dutySchRestMin: null,
      dutyActRestMin: null,
      dutyActCreditedMinutes: 480,
      brief1StartUtc: '2026-03-02T08:00:00.000Z',
      brief1EndUtc: '2026-03-02T08:00:00.000Z',
      debrief1StartUtc: '2026-03-02T16:00:00.000Z',
      debrief1EndUtc: '2026-03-02T16:00:00.000Z',
      pickup1StartUtc: '2026-03-02T08:00:00.000Z',
      pickup1EndUtc: '2026-03-02T08:00:00.000Z',
      dropoff1StartUtc: '2026-03-02T16:00:00.000Z',
      dropoff1EndUtc: '2026-03-02T16:00:00.000Z',
    },
  ],
  flights: [
    {
      id: 6010,
      fltNum: '2010',
      depArp: 'YEG',
      arvArp: 'YYZ',
      schDepDtUtc: '2026-03-02T08:00:00.000Z',
      schArvDtUtc: '2026-03-02T16:00:00.000Z',
      fleet: 'B737',
      register: 'C-FABC',
    },
  ],
  groundItems: [],
  crewStats: {},
})

// Each test uses a UNIQUE scenarioId so the per-scenario registry stores never
// cross-talk. The layout store seeds two default panes (roster-1 / pairing-1),
// so positive scrollY round-trips can target an existing pane without adding one.

describe('useScenarioGanttSource', () => {
  it('useScrollX() reflects scenario-gantt-store scrollX', () => {
    const id = 990001
    getScenarioGanttStore(id).setState({ scrollX: 250 })

    const container = document.createElement('div')
    document.body.appendChild(container)

    let captured: number | null = null
    const Probe = () => {
      const src = useScenarioGanttSource(id)
      captured = src.useScrollX()
      return null
    }

    act(() => {
      createRoot(container).render(React.createElement(Probe))
    })

    expect(captured).toBe(250)
    document.body.removeChild(container)
  })

  it('getScrollY(paneId) round-trips a value set via the layout store setScrollY', () => {
    const id = 990002
    // pairing-1 is a default-seeded pane, so this is a real positive round-trip.
    getScenarioLayoutStore(id).getState().setScrollY('pairing-1', 40)

    const container = document.createElement('div')
    document.body.appendChild(container)

    let captured: number | null = null
    let capturedMissing: number | null = null
    const Probe = () => {
      const src = useScenarioGanttSource(id)
      captured = src.getScrollY('pairing-1')
      // Non-existent pane is a safe no-op read → 0.
      capturedMissing = src.getScrollY('does-not-exist')
      return null
    }

    act(() => {
      createRoot(container).render(React.createElement(Probe))
    })

    expect(captured).toBe(40)
    expect(capturedMissing).toBe(0)
    document.body.removeChild(container)
  })

  it('setScrollY on a non-existent pane is a safe no-op', () => {
    const id = 990003
    const container = document.createElement('div')
    document.body.appendChild(container)

    let after: number | null = null
    const Probe = () => {
      const src = useScenarioGanttSource(id)
      src.setScrollY('ghost-pane', 99)
      after = src.getScrollY('ghost-pane')
      return null
    }

    act(() => {
      createRoot(container).render(React.createElement(Probe))
    })

    expect(after).toBe(0)
    document.body.removeChild(container)
  })

  it('reports scenario shape: mode, READ_ONLY capabilities, always-present edit + violations', () => {
    // P3-Task3: edit + violations are ALWAYS present (capability gating happens inside
    // edit.execute; violation rendering is always-on). With no loaded data the capabilities
    // still default to READ_ONLY, so the controllers exist but execute would no-op.
    const id = 990004
    const container = document.createElement('div')
    document.body.appendChild(container)

    let capturedMode: string | undefined
    let capturedCanReassign: boolean | undefined
    let capturedCanEditSegments: boolean | undefined
    let capturedEditIsFn: boolean | undefined
    let capturedViolationsIsFn: boolean | undefined
    const Probe = () => {
      const src = useScenarioGanttSource(id)
      capturedMode = src.mode
      capturedCanReassign = src.capabilities.roster.canReassign
      capturedCanEditSegments = src.capabilities.pairing.canEditSegments
      capturedEditIsFn = typeof src.edit?.execute === 'function'
      capturedViolationsIsFn = typeof src.violations?.useViolations === 'function'
      return null
    }

    act(() => {
      createRoot(container).render(React.createElement(Probe))
    })

    expect(capturedMode).toBe('scenario')
    expect(capturedCanReassign).toBe(false)
    expect(capturedCanEditSegments).toBe(false)
    expect(capturedEditIsFn).toBe(true)
    expect(capturedViolationsIsFn).toBe(true)
    document.body.removeChild(container)
  })

  it('capabilities getter reflects live data.capabilities once loaded (not the static READ_ONLY fallback)', () => {
    const id = 990006
    // Seed the store with loaded data whose capabilities differ from READ_ONLY:
    // only the pairing pane is visible and segments are editable.
    getScenarioGanttStore(id).setState({
      data: {
        capabilities: {
          panes: ['pairing'],
          defaultPanes: ['pairing'],
          roster: { canAssign: false, canRemove: false, canReassign: false },
          pairing: { canEditSegments: true },
        },
      } as ScenarioGanttData,
    })

    const container = document.createElement('div')
    document.body.appendChild(container)

    let capturedPanes: string[] | undefined
    let capturedCanEditSegments: boolean | undefined
    const Probe = () => {
      const src = useScenarioGanttSource(id)
      capturedPanes = src.capabilities.panes
      capturedCanEditSegments = src.capabilities.pairing.canEditSegments
      return null
    }

    act(() => {
      createRoot(container).render(React.createElement(Probe))
    })

    expect(capturedPanes).toEqual(['pairing'])
    expect(capturedCanEditSegments).toBe(true)
    document.body.removeChild(container)
  })

  it('getScrollX() (synchronous getter) returns current scrollX without a render', () => {
    const id = 990005
    getScenarioGanttStore(id).setState({ scrollX: 777 })

    // No React render — call the synchronous getter directly off the hook return.
    // The adapter is built inside useMemo, but getScrollX reads .getState() live,
    // so we can exercise it via a throwaway render that only captures the closure.
    const container = document.createElement('div')
    document.body.appendChild(container)

    let getScrollX: (() => number) | null = null
    const Probe = () => {
      const src = useScenarioGanttSource(id)
      getScrollX = src.getScrollX
      return null
    }
    act(() => {
      createRoot(container).render(React.createElement(Probe))
    })

    // Mutate AFTER render; synchronous getter must observe the fresh value.
    getScenarioGanttStore(id).setState({ scrollX: 888 })
    expect(getScrollX!()).toBe(888)
    document.body.removeChild(container)
  })

  it('buildScenarioFlightComposition aggregates scenario pairing plan/fill by rank for a flight', () => {
    const comp = buildScenarioFlightComposition(6010, makeScenarioData())

    expect(comp).toEqual({
      CA: { plan: 2, actual: 1 },
      FO: { plan: 1, actual: 0 },
      FA: { plan: 2, actual: 1 },
    })
  })

  it('scenario flight rows derive status from composition, not assignment presence', () => {
    const id = 990101
    getScenarioGanttStore(id).setState({ data: makeScenarioData() })

    const container = document.createElement('div')
    document.body.appendChild(container)

    let statuses: Array<[number, string]> = []
    const Probe = () => {
      const src = useScenarioGanttSource(id)
      const { compositionStatusMap } = src.flight!.useRows()
      statuses = [...compositionStatusMap.entries()].map(([flightId, status]) => [flightId, status])
      return null
    }

    act(() => {
      createRoot(container).render(React.createElement(Probe))
    })

    expect(statuses).toEqual([[6010, 'partial']])
    document.body.removeChild(container)
  })

  it('bin-packs overlapping unregistered scenario flights into separate fleet rows like Live', () => {
    const { flightRows } = buildScenarioFlightItems({
      ...makeScenarioData(),
      flights: [
        {
          id: 7001,
          fltNum: '7001',
          depArp: 'YVR',
          arvArp: 'YYZ',
          schDepDtUtc: '2026-03-02T08:00:00.000Z',
          schArvDtUtc: '2026-03-02T12:00:00.000Z',
          fleet: '7M8',
          register: null,
        },
        {
          id: 7002,
          fltNum: '7002',
          depArp: 'YYC',
          arvArp: 'YUL',
          schDepDtUtc: '2026-03-02T09:00:00.000Z',
          schArvDtUtc: '2026-03-02T13:00:00.000Z',
          fleet: '7M8',
          register: null,
        },
        {
          id: 7003,
          fltNum: '7003',
          depArp: 'YYZ',
          arvArp: 'YVR',
          schDepDtUtc: '2026-03-02T12:00:00.000Z',
          schArvDtUtc: '2026-03-02T16:00:00.000Z',
          fleet: '7M8',
          register: null,
        },
      ],
    })

    expect(flightRows.map((row) => row.registration)).toEqual(['7M8-1', '7M8-2'])
    expect(flightRows.every((row) => row.isFleetGrouped)).toBe(true)
    expect(flightRows.map((row) => row.flights.map((flight) => flight.id))).toEqual([
      [7001, 7003],
      [7002],
    ])
  })

  it('bin-packs overlapping registered scenario flights into numbered register rows like Live', () => {
    const { flightRows } = buildScenarioFlightItems({
      ...makeScenarioData(),
      flights: [
        {
          id: 7101,
          fltNum: '7101',
          depArp: 'YVR',
          arvArp: 'YYZ',
          schDepDtUtc: '2026-03-02T08:00:00.000Z',
          schArvDtUtc: '2026-03-02T12:00:00.000Z',
          fleet: '7M8',
          register: 'C-FABC',
        },
        {
          id: 7102,
          fltNum: '7102',
          depArp: 'YYC',
          arvArp: 'YUL',
          schDepDtUtc: '2026-03-02T09:00:00.000Z',
          schArvDtUtc: '2026-03-02T13:00:00.000Z',
          fleet: '7M8',
          register: 'C-FABC',
        },
      ],
    })

    expect(flightRows.map((row) => row.registration)).toEqual(['C-FABC', 'C-FABC#2'])
    expect(flightRows.map((row) => row.flights.map((flight) => flight.id))).toEqual([[7101], [7102]])
  })

  it('scenario flight source formats hover status with scenario-derived composition fill', () => {
    const id = 990101
    getScenarioGanttStore(id).setState({ data: makeScenarioData() })
    useTimezoneStore.setState({ timezone: 'UTC', timezoneAirport: 'UTC' })

    const container = document.createElement('div')
    document.body.appendChild(container)

    let line = ''
    const Probe = () => {
      const src = useScenarioGanttSource(id)
      line = src.flight?.formatStatusLine?.(6010) ?? ''
      return null
    }

    act(() => {
      createRoot(container).render(React.createElement(Probe))
    })

    expect(line).toContain('2010')
    expect(line).toContain('F8-2010')
    expect(line).toContain('YEG 3/2 08:00')
    expect(line).toContain('YYZ 3/2 16:00')
    expect(line).toContain('B737')
    expect(line).toContain('C-FABC')
    expect(line).toContain('CA 2/1')
    expect(line).toContain('FO 1/0')
    expect(line).toContain('FA 2/1')
    document.body.removeChild(container)
  })

  it('scenario roster header uses Live manday KPIs when supplied by seed data', () => {
    const id = 990102
    useRosterPeriodStore.setState({
      items: [{ id: 3, rosterPeriod: '2026RP03', name: '2026-03', rpStart: '2026-03-01', rpEnd: '2026-03-31', isCurrent: false }],
      loaded: true,
      loading: false,
    })
    getScenarioGanttStore(id).setState({
      data: {
        ...makeScenarioData(),
        scenarioId: id,
        crew: [{
          crewId: 'C1',
          base: 'YVR',
          division: 'P',
          rank: 'CA',
          seniorityNum: '12',
          crewName: 'One Crew',
        }],
        crewStats: {
          C1: {
            '2026RP03': {
              credit: 1200,
              dayOffCount: 6,
              alCount: 1,
              leaveCount: 1,
              ybh: 3000,
              mbh: 900,
              mcred: 1200,
              yal: 2,
              mal: 1,
              ydo: 20,
              mdo: 6,
            },
          },
        },
      },
    })

    const container = document.createElement('div')
    document.body.appendChild(container)

    let values: Record<string, unknown> = {}
    const Probe = () => {
      const src = useScenarioGanttSource(id, 'roster-1')
      values = src.roster?.useRosterModel().panelRows[0]?.values ?? {}
      return null
    }

    act(() => {
      createRoot(container).render(React.createElement(Probe))
    })

    expect(values).toMatchObject({
      crewId: 'C1',
      ybh: '50:00',
      mbh: '15:00',
      mcred: '20:00',
      yal: '2',
      mal: '1',
      ydo: '20',
      mdo: '6',
    })
    document.body.removeChild(container)
  })

  it('formats scenario roster seniority like Live rows', () => {
    const id = 990104
    getScenarioGanttStore(id).setState({
      data: {
        ...makeScenarioData(),
        scenarioId: id,
        crew: [{
          crewId: 'C1',
          base: 'YVR',
          division: 'P',
          rank: 'CA',
          seniorityNum: '12.00',
          crewName: 'One Crew',
        }],
      },
    })

    const container = document.createElement('div')
    document.body.appendChild(container)

    let values: Record<string, unknown> = {}
    const Probe = () => {
      const src = useScenarioGanttSource(id, 'roster-1')
      values = src.roster?.useRosterModel().panelRows[0]?.values ?? {}
      return null
    }

    act(() => {
      createRoot(container).render(React.createElement(Probe))
    })

    expect(values.seniority).toBe('12')
    document.body.removeChild(container)
  })

  it('scenario roster header stats follow the month selected by zoomToMonth', () => {
    const id = 990103
    const store = getScenarioGanttStore(id)
    useRosterPeriodStore.setState({
      items: [
        { id: 3, rosterPeriod: '2026RP03', name: '2026-03', rpStart: '2026-03-01', rpEnd: '2026-03-31', isCurrent: false },
        { id: 4, rosterPeriod: '2026RP04', name: '2026-04', rpStart: '2026-04-01', rpEnd: '2026-04-30', isCurrent: false },
      ],
      loaded: true,
      loading: false,
    })
    store.setState({
      data: {
        ...makeScenarioData(),
        scenarioId: id,
        strDtLoc: '2026-03-01T00:00:00.000Z',
        endDtLoc: '2026-04-30T23:59:59.000Z',
        crew: [{
          crewId: 'C1',
          base: 'YVR',
          division: 'P',
          rank: 'CA',
          seniorityNum: '12',
          crewName: 'One Crew',
        }],
        crewStats: {
          C1: {
            '2026RP03': {
              credit: 1200,
              dayOffCount: 6,
              ybh: 3000,
              mbh: 900,
              mcred: 1200,
              ydo: 20,
              mdo: 6,
            },
            '2026RP04': {
              credit: 2400,
              dayOffCount: 10,
              ybh: 6000,
              mbh: 1800,
              mcred: 2400,
              ydo: 30,
              mdo: 10,
            },
          },
        },
      },
      viewportWidth: 1000,
    })
    store.getState().zoomToMonth(2026, 3, new Date('2026-03-01T00:00:00.000Z'), 1000)

    const container = document.createElement('div')
    document.body.appendChild(container)

    let values: Record<string, unknown> = {}
    const Probe = () => {
      const src = useScenarioGanttSource(id, 'roster-1')
      values = src.roster?.useRosterModel().panelRows[0]?.values ?? {}
      return null
    }

    act(() => {
      createRoot(container).render(React.createElement(Probe))
    })

    expect(values).toMatchObject({
      crewId: 'C1',
      ybh: '100:00',
      mbh: '30:00',
      mcred: '40:00',
      ydo: '30',
      mdo: '10',
    })
    document.body.removeChild(container)
  })
})

describe('buildScenarioCrewIdentity', () => {
  const crew = {
    crewId: 'F80001',
    base: 'YOW',
    division: 'P',
    rank: 'FO',
    crewRank: 'FO',
    seniorityNum: null,
    crewName: null,
    ranks: [
      { id: 1, crewId: 'F80001', rank: 'FO', effDt: '2026-07-01T00:00:00Z', expDt: '2026-08-15T00:00:00Z' },
      { id: 2, crewId: 'F80001', rank: 'CA', effDt: '2026-08-16T00:00:00Z', expDt: null },
    ],
    bases: [
      { id: 1, crewId: 'F80001', base: 'YOW', effDt: '2026-07-01T00:00:00Z', expDt: null },
    ],
  } as ScenarioGanttData['crew'][number]

  it('按视口最左日期解析有效 rank/base', () => {
    const id = buildScenarioCrewIdentity(crew, new Date('2026-08-01T00:00:00Z'))
    expect(id.rank).toBe('FO')
    expect(id.base).toBe('YOW')
  })

  it('多有效记录用 | 拼接', () => {
    const both = {
      ...crew,
      ranks: [
        { id: 1, crewId: 'F80001', rank: 'FO', effDt: '2026-07-01T00:00:00Z', expDt: null },
        { id: 2, crewId: 'F80001', rank: 'CA', effDt: '2026-07-01T00:00:00Z', expDt: null },
      ],
    } as ScenarioGanttData['crew'][number]
    expect(buildScenarioCrewIdentity(both, new Date('2026-08-01T00:00:00Z')).rank).toBe('FO | CA')
  })

  it('无历史时回退单值 rank/base', () => {
    const plain = { crewId: 'F80001', base: 'YYZ', division: 'P', rank: 'FO', seniorityNum: null, crewName: null }
    const id = buildScenarioCrewIdentity(plain, new Date('2026-08-01T00:00:00Z'))
    expect(id.rank).toBe('FO')
    expect(id.base).toBe('YYZ')
  })
})
