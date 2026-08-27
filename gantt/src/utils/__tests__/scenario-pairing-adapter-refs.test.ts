import { describe, expect, it, vi } from 'vitest'
import type { ScenarioGanttData } from '@/types/scenario-gantt'

const scenarioData = vi.hoisted(() => ({ current: null as ScenarioGanttData | null }))

vi.mock('@/stores/scenario-gantt-store', () => ({
  getScenarioGanttStore: () => ({
    getState: () => ({ data: scenarioData.current }),
  }),
}))

import { buildPairingItems } from '../scenario-pairing-adapter'
import { buildScenarioPairingInfo } from '../scenario-pairing-adapter'

describe('buildScenarioPairingInfo duty refs', () => {
  it('carries crew-specific duty refs for the selected pairing', () => {
    scenarioData.current = {
      scenarioId: 7,
      scenarioName: 'Scenario',
      fileType: 'RO',
      capabilities: {} as never,
      strDtLoc: '2026-08-01T00:00:00Z',
      endDtLoc: '2026-08-02T00:00:00Z',
      scenarioStrDt: '2026-08-01T00:00:00Z',
      scenarioEndDt: '2026-08-02T00:00:00Z',
      leadinLive: 0,
      dataSource: 'snapshot',
      crew: [{ crewId: 'C1', base: 'YYZ', division: 'P', rank: 'FO', seniorityNum: null, crewName: 'One' }],
      pairings: [{
        pairingId: 10,
        pairingLabel: 'P10',
        base: 'YYZ',
        fleet: '320',
        schStrDtUtc: '2026-08-01T08:00:00Z',
        schEndDtUtc: '2026-08-01T16:00:00Z',
        assignmentGroup: 'FLT',
        assignment: 'FLY',
        division: 'P',
        compositions: [],
      }],
      assignments: [{ crewId: 'C1', pairingId: 10, source: 'CR' }],
      pairingSegments: [{
        pairingId: 10,
        dutySeq: 1,
        segSeq: 1,
        fltId: 100,
        fltDt: '2026-08-01',
        fltNum: '100',
        airline: 'F8',
        depArp: 'YYZ',
        arvArp: 'YVR',
        segAssignment: 'FLT',
        schStrDtUtc: '2026-08-01T08:00:00Z',
        schEndDtUtc: '2026-08-01T12:00:00Z',
        dutyStrArp: 'YYZ',
        dutyEndArp: 'YVR',
        dutySchStrDtUtc: '2026-08-01T07:00:00Z',
        dutySchEndDtUtc: '2026-08-01T13:00:00Z',
        dutySchRestMin: null,
        dutyActRestMin: null,
        dutyActCreditedMinutes: 360,
        brief1StartUtc: '',
        brief1EndUtc: '',
        debrief1StartUtc: '',
        debrief1EndUtc: '',
        pickup1StartUtc: '',
        pickup1EndUtc: '',
        dropoff1StartUtc: '',
        dropoff1EndUtc: '',
      }],
      flights: [{ id: 100, fltNum: '100', depArp: 'YYZ', arvArp: 'YVR', schDepDtUtc: '2026-08-01T08:00:00Z', schArvDtUtc: '2026-08-01T12:00:00Z', fleet: '320', register: null }],
      groundItems: [],
      crewStats: {},
      rosterDutyRefs: [
        { crewId: 'C1', pairingId: 10, dutySeq: 1, dutyRefTz: -300 },
      ],
    }

    const bundle = buildScenarioPairingInfo(7, 10)

    expect(bundle?.rosterDutyRefs).toEqual([
      { crewId: 'C1', pairingId: 10, dutySeq: 1, dutyRefTz: -300 },
    ])
    expect(bundle?.detail.pairing.tafb, 'same-day pairing = 1 calendar day').toBe(1)
  })
})

describe('buildPairingItems local fill', () => {
  const pairing88 = {
    pairingId: 88,
    pairingLabel: 'P88',
    base: 'YYZ',
    fleet: '320',
    division: 'P',
    assignmentGroup: 'FLY',
    assignment: 'DOM',
    schStrDtUtc: '2026-08-01T10:00:00Z',
    schEndDtUtc: '2026-08-01T13:00:00Z',
    compositions: [
      { rank: 'CA', plan: 1, fill: 0 },
      { rank: 'FO', plan: 1, fill: 0 },
    ],
  } as never
  const crew = [
    { crewId: 'F80001', base: 'YYZ', division: 'P', rank: 'CA', seniorityNum: null, crewName: null },
  ] as never

  it('传入 crew+pendingChanges 时 fill 本地计算（pending add 计入槽位）', () => {
    const items = buildPairingItems(
      [pairing88], [], [], [],
      crew,
      [{ op: 'add', crewId: 'F80001', pairingId: 88, rosterActingRank: 'CA' }],
    )
    const ca = items[0].pairing.composition.find((s) => s.rank === 'CA')!
    const fo = items[0].pairing.composition.find((s) => s.rank === 'FO')!
    expect(ca.fill).toBe(1)
    expect(fo.fill).toBe(0)
    expect(items[0].pairing.isFull).toBe(false)
    expect(items[0].pairing.tafb, 'same-day pairing = 1 calendar day').toBe(1)
  })

  it('不传 crew/pendingChanges 时维持 server fill', () => {
    const items = buildPairingItems(
      [{ ...pairing88, compositions: [{ rank: 'CA', plan: 1, fill: 1 }] }], [], [], [],
    )
    expect(items[0].pairing.composition.find((s) => s.rank === 'CA')!.fill).toBe(1)
  })
})
