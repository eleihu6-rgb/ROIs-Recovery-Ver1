import { describe, expect, it } from 'vitest'
import { computeScenarioPairingCompositions } from '../scenario-composition-fill'
import type { ScenarioGanttCrew, ScenarioGanttPairing, ScenarioGanttAssignment } from '@/types/scenario-gantt'

const crew: ScenarioGanttCrew[] = [
  { crewId: 'F80001', base: 'YOW', division: 'P', rank: 'CA', seniorityNum: null, crewName: null },
  { crewId: 'F80002', base: 'YOW', division: 'P', rank: 'FO', seniorityNum: null, crewName: null },
]

const pairings: ScenarioGanttPairing[] = [{
  pairingId: 88,
  pairingLabel: 'P88',
  base: 'YOW',
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
}]

const assign = (overrides: Partial<ScenarioGanttAssignment>): ScenarioGanttAssignment => ({
  crewId: 'F80001',
  pairingId: 88,
  source: 'CR',
  ...overrides,
})

describe('computeScenarioPairingCompositions', () => {
  it('按 rosterActingRank / rank 归属槽位并 count distinct crew', () => {
    const map = computeScenarioPairingCompositions(
      [
        assign({ crewId: 'F80001', rosterActingRank: 'CA' }),
        assign({ crewId: 'F80002', rosterActingRank: null, rank: 'FO' }),
      ],
      crew,
      pairings,
    )
    const slots = map.get(88)!
    expect(slots.find((s) => s.rank === 'CA')!.fill).toBe(1)
    expect(slots.find((s) => s.rank === 'FO')!.fill).toBe(1)
    expect(slots.find((s) => s.rank === 'CA')!.plan).toBe(1)
  })

  it('同一 crew 同一 pairing 只计一次（跨多行去重）', () => {
    const map = computeScenarioPairingCompositions(
      [assign({ crewId: 'F80001', rosterActingRank: 'CA' }), assign({ crewId: 'F80001', rosterActingRank: 'CA' })],
      crew,
      pairings,
    )
    expect(map.get(88)!.find((s) => s.rank === 'CA')!.fill).toBe(1)
  })

  it('无 rank 时回退 crew.crewRank', () => {
    const map = computeScenarioPairingCompositions(
      [assign({ crewId: 'F80002', rosterActingRank: null })],
      crew,
      pairings,
    )
    expect(map.get(88)!.find((s) => s.rank === 'FO')!.fill).toBe(1)
  })

  it('fill 以 plan 封顶，不出现超配', () => {
    const map = computeScenarioPairingCompositions(
      [
        assign({ crewId: 'F80001', rosterActingRank: 'CA' }),
        assign({ crewId: 'F80003', rosterActingRank: 'CA' }),
      ],
      crew,
      pairings,
    )
    expect(map.get(88)!.find((s) => s.rank === 'CA')!.fill).toBe(1)
  })
})
