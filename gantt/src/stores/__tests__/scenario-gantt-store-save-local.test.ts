import { describe, expect, it, vi, beforeEach } from 'vitest'
import { getScenarioGanttStore, destroyScenarioGanttStore } from '../scenario-gantt-store'
import { applyScenarioPatchesToData } from '@/utils/scenario-roster-edit'
import type { ScenarioGanttData } from '@/types/scenario-gantt'

const clearSessionGdoMock = vi.hoisted(() => vi.fn())

vi.mock('@/services/scenario-gantt-api', () => ({
  scenarioGanttApi: {
    patchOutput: vi.fn(async () => undefined),
    getGanttData: vi.fn(),
  },
}))
vi.mock('@/services/scenario-legality-api', () => ({
  refreshScenarioLegality: vi.fn(async () => ({ status: 'READY', violations: [] })),
}))
vi.mock('@/stores/session-violation-store', () => ({
  useSessionViolationStore: {
    getState: () => ({
      clearSessionViolationsByRuleCodes: clearSessionGdoMock,
    }),
  },
}))
vi.mock('@/utils/notify', () => ({
  notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

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
  assignments: [
    { crewId: 'F80001', pairingId: 100, source: 'CR' },
    { crewId: 'F80002', pairingId: 200, source: 'CR' },
  ],
  pairingSegments: [],
  flights: [],
  groundItems: [
    { crewId: 'F80001', assignmentGroup: 'GRD', assignment: 'DO', schStrDtUtc: '2026-07-01T08:00:00Z', schEndDtUtc: '2026-07-01T16:00:00Z', actingRank: 'CA', source: 'CR' },
  ],
  crewStats: {},
})

describe('applyScenarioPatchesToData', () => {
  it('removes a ground task (DO) from groundItems', () => {
    const out = applyScenarioPatchesToData(makeData(), [
      { op: 'remove', crewId: 'F80001', pairingId: null, startDtUtc: '2026-07-01T08:00:00Z', endDtUtc: '2026-07-01T16:00:00Z', assignmentGroup: 'GRD', assignment: 'DO' },
    ])
    expect(out.groundItems).toHaveLength(0)
    expect(out.assignments).toHaveLength(2)
  })

  it('removes a pairing assignment', () => {
    const out = applyScenarioPatchesToData(makeData(), [
      { op: 'remove', crewId: 'F80001', pairingId: 100 },
    ])
    expect(out.assignments).toEqual([{ crewId: 'F80002', pairingId: 200, source: 'CR' }])
  })

  it('reassigns a pairing to another crew', () => {
    const out = applyScenarioPatchesToData(makeData(), [
      { op: 'reassign', crewId: 'F80001', pairingId: 100, toCrewId: 'F80003' },
    ])
    expect(out.assignments).toContainEqual({ crewId: 'F80003', pairingId: 100, source: 'CR' })
    expect(out.assignments).not.toContainEqual({ crewId: 'F80001', pairingId: 100, source: 'CR' })
  })

  it('adds a new assignment', () => {
    const out = applyScenarioPatchesToData(makeData(), [
      { op: 'add', crewId: 'F80004', pairingId: 300 },
    ])
    expect(out.assignments).toContainEqual({ crewId: 'F80004', pairingId: 300, source: 'MA' })
  })
})

describe('scenario-gantt-store save (authoritative reload)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearSessionGdoMock.mockClear()
  })

  it('reloads full gantt data after save and restores rosterDutyRefs', async () => {
    const store = getScenarioGanttStore(623)
    const loadedData: ScenarioGanttData = {
      ...makeData(),
      groundItems: [],
      rosterDutyRefs: [{ crewId: 'F80001', pairingId: 100, dutySeq: 1, dutyRefTz: -420 }],
    }
    store.setState({
      data: makeData(),
      pendingChanges: [{
        op: 'remove', crewId: 'F80001', pairingId: null,
        startDtUtc: '2026-07-01T08:00:00Z', endDtUtc: '2026-07-01T16:00:00Z',
        assignmentGroup: 'GRD', assignment: 'DO',
      }],
      isDirty: true,
      saving: false,
    })

    vi.mocked((await import('@/services/scenario-gantt-api')).scenarioGanttApi.getGanttData)
      .mockResolvedValue(loadedData)

    await store.getState().save()

    const st = store.getState()
    expect(st.data?.groundItems).toHaveLength(0)
    expect(st.data?.rosterDutyRefs).toEqual(loadedData.rosterDutyRefs)
    expect(st.pendingChanges).toHaveLength(0)
    expect(st.isDirty).toBe(false)
    expect(st.saving).toBe(false)

    const { scenarioGanttApi } = await import('@/services/scenario-gantt-api')
    expect(scenarioGanttApi.patchOutput).toHaveBeenCalledWith(623, expect.any(Array))
    expect(scenarioGanttApi.getGanttData).toHaveBeenCalledTimes(1)
    const { refreshScenarioLegality } = await import('@/services/scenario-legality-api')
    expect(refreshScenarioLegality).toHaveBeenCalledWith(623)
    expect(clearSessionGdoMock).toHaveBeenCalledWith(['7505', '7507'])
    destroyScenarioGanttStore(623)
  })
})
