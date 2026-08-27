import { describe, expect, it } from 'vitest'
import { applyScenarioPatchesToData, buildScenarioRosterRemovePatch, isScenarioRosterTaskDeletable } from '../scenario-roster-edit'
import type { ScenarioGanttData } from '@/types/scenario-gantt'

const base = {
  crewId: 'C1',
  pairingId: null,
  source: 'CR',
  schStrDtUtc: '2026-07-01T08:00:00Z',
  schEndDtUtc: '2026-07-01T16:00:00Z',
  assignmentGroup: 'GRD',
  assignment: 'SIM',
} as const

const makeData = (): ScenarioGanttData => ({
  scenarioId: 623,
  scenarioName: null,
  fileType: 'RO',
  capabilities: {} as never,
  strDtLoc: '2026-07-01',
  endDtLoc: '2026-07-31',
  scenarioStrDt: '2026-07-01',
  scenarioEndDt: '2026-07-31',
  leadinLive: 0,
  dataSource: 'db',
  crew: [],
  pairings: [],
  assignments: [],
  pairingSegments: [],
  flights: [],
  groundItems: [],
  crewStats: {},
})

describe('scenario roster delete rules', () => {
  it('allows source CR (solver-created) and MA (user-assigned)', () => {
    expect(isScenarioRosterTaskDeletable({ source: 'CR' })).toBe(true)
    expect(isScenarioRosterTaskDeletable({ source: 'MA' })).toBe(true)
  })

  it.each(['PA', 'IMP', null])('rejects source %s', (source) => {
    expect(isScenarioRosterTaskDeletable({ source })).toBe(false)
    expect(buildScenarioRosterRemovePatch({ ...base, source })).toBeNull()
  })

  it('builds the ground-task patch with its identity fields', () => {
    expect(buildScenarioRosterRemovePatch(base)).toEqual({
      op: 'remove',
      crewId: 'C1',
      pairingId: null,
      startDtUtc: '2026-07-01T08:00:00Z',
      endDtUtc: '2026-07-01T16:00:00Z',
      assignmentGroup: 'GRD',
      assignment: 'SIM',
    })
  })

  it('builds a pairing remove patch without exposing pairing edits', () => {
    expect(buildScenarioRosterRemovePatch({
      ...base,
      pairingId: 7021,
    })).toEqual({ op: 'remove', crewId: 'C1', pairingId: 7021 })
  })
})

describe('applyScenarioPatchesToData rosterActingRank', () => {
  it('add patch 的 rosterActingRank 传播到有效 assignments', () => {
    const out = applyScenarioPatchesToData(makeData(), [
      { op: 'add', crewId: 'F80001', pairingId: 88, rosterActingRank: 'CA' },
    ])
    const added = out.assignments.find((a) => a.pairingId === 88 && a.crewId === 'F80001')
    expect(added?.rosterActingRank).toBe('CA')
  })

  it('add patch 缺省 rank 时 assignments 不带 rank（fill 回退 crewRank）', () => {
    const out = applyScenarioPatchesToData(makeData(), [
      { op: 'add', crewId: 'F80001', pairingId: 88 },
    ])
    const added = out.assignments.find((a) => a.pairingId === 88 && a.crewId === 'F80001')
    expect(added?.rosterActingRank).toBeUndefined()
  })
})
