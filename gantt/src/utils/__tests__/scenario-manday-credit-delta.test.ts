import { describe, expect, it } from 'vitest'
import { buildScenarioRosterItems } from '@/components/scenario-gantt/build-scenario-roster-items'
import { crewMandayDelta } from '@/utils/manday-delta'
import type { ScenarioGanttPairing, ScenarioGanttPairingSegment, AssignmentPatch } from '@/types/scenario-gantt'

const rpItems = [
  { id: 1, rosterPeriod: '2026RP07', name: '2026-07', rpStart: '2026-07-01', rpEnd: '2026-07-31', isCurrent: false },
]

const pairing: ScenarioGanttPairing = {
  pairingId: 100,
  pairingLabel: 'P100',
  base: 'YOW',
  fleet: '320',
  division: 'P',
  assignmentGroup: 'FLY',
  assignment: 'DOM',
  schStrDtUtc: '2026-07-05T08:00:00Z',
  schEndDtUtc: '2026-07-05T12:00:00Z',
  compositions: [],
}

const seg: ScenarioGanttPairingSegment = {
  pairingId: 100,
  dutySeq: 1,
  segSeq: 1,
  fltId: 500,
  fltDt: '2026-07-05',
  fltNum: 'F100',
  airline: 'F8',
  depArp: 'YOW',
  arvArp: 'YYZ',
  segAssignment: 'FLT',
  schStrDtUtc: '2026-07-05T08:00:00Z',
  schEndDtUtc: '2026-07-05T12:00:00Z',
  dutyStrArp: 'YOW',
  dutyEndArp: 'YYZ',
  dutySchStrDtUtc: '2026-07-05T08:00:00Z',
  dutySchEndDtUtc: '2026-07-05T12:00:00Z',
  dutySchRestMin: null,
  dutyActRestMin: null,
  dutyActCreditedMinutes: 240,
  brief1StartUtc: '2026-07-05T08:00:00Z',
  brief1EndUtc: '2026-07-05T08:00:00Z',
  debrief1StartUtc: '2026-07-05T12:00:00Z',
  debrief1EndUtc: '2026-07-05T12:00:00Z',
  pickup1StartUtc: '2026-07-05T08:00:00Z',
  pickup1EndUtc: '2026-07-05T08:00:00Z',
  dropoff1StartUtc: '2026-07-05T12:00:00Z',
  dropoff1EndUtc: '2026-07-05T12:00:00Z',
}

const build = (pendingChanges: AssignmentPatch[]) => buildScenarioRosterItems({
  crew: [{ crewId: 'F80001' }],
  pairingMap: new Map([[100, pairing]]),
  assignments: [],
  pairingSegments: [seg],
  groundItems: [],
  pendingChanges,
})

describe('scenario Tier-1 optimistic RP Credit delta', () => {
  it('adding a pairing with credit yields positive mcred delta (RpCred 应刷新)', () => {
    const base = build([])
    const virtual = build([{ op: 'add', crewId: 'F80001', pairingId: 100, rosterActingRank: 'CA' }])
    const delta = crewMandayDelta(base.items, virtual.items, '2026RP07', rpItems)
    const d = delta.get('F80001')
    // The pending add's segment carries dutyActCreditedMinutes=240 → RpCred delta must be 240.
    expect(d?.mcred).toBe(240)
  })
})
