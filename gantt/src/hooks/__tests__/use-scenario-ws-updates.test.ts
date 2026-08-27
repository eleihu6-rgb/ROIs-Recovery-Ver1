import { describe, expect, it, vi, beforeEach } from 'vitest'
import { handleScenarioRecomputeMessage } from '../use-scenario-ws-updates'
import { getScenarioGanttStore, destroyScenarioGanttStore } from '@/stores/scenario-gantt-store'
import type { ScenarioGanttData } from '@/types/scenario-gantt'

const getScenarioCrewStatsMock = vi.fn(async () => ({
  F80001: { '2026RP07': { credit: 100, dayOffCount: 2, alCount: 0, leaveCount: 0 } },
}))
const getResultsMock = vi.fn(async () => ({ kpi: [{ id: 1, kpiNames: 'Pairing Lines', kpiValues: '10' }], creditHours: [], uncovered: [], distribution: [], rawResult: null }))
const fetchScenarioLegalityMock = vi.fn(async () => ({ status: 'READY', violations: [], computedAt: null, errorText: null }))
const applyScenarioLegalityResponseMock = vi.fn()
const getGanttDataMock = vi.fn(async () => ({
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
  rosterDutyRefs: [{ crewId: '718', pairingId: 15806, dutySeq: 1, dutyRefTz: -360 }],
}))

vi.mock('@/services/scenario-gantt-api', () => ({
  scenarioGanttApi: {
    getScenarioCrewStats: (...args: unknown[]) => getScenarioCrewStatsMock(...args),
    getGanttData: (...args: unknown[]) => getGanttDataMock(...args),
  },
}))
vi.mock('@/services/scenario-api', () => ({
  scenarioApi: { getResults: (...args: unknown[]) => getResultsMock(...args) },
}))
vi.mock('@/services/scenario-legality-api', () => ({
  fetchScenarioLegality: (...args: unknown[]) => fetchScenarioLegalityMock(...args),
  applyScenarioLegalityResponse: (...args: unknown[]) => applyScenarioLegalityResponseMock(...args),
}))
vi.mock('@/services/ws', () => ({ wsClient: { onMessage: vi.fn(() => () => undefined) } }))
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
  assignments: [],
  pairingSegments: [],
  flights: [],
  groundItems: [],
  crewStats: { F80001: { '2026RP07': { credit: 50, dayOffCount: 3, alCount: 0, leaveCount: 0 } } },
})

describe('handleScenarioRecomputeMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getScenarioCrewStatsMock.mockResolvedValue({
      F80001: { '2026RP07': { credit: 100, dayOffCount: 2, alCount: 0, leaveCount: 0 } },
    })
  })

  it('scenario-manday-updated refetches and merges affected crews crewStats', async () => {
    const store = getScenarioGanttStore(623)
    store.setState({ data: makeData() })

    handleScenarioRecomputeMessage(623, { type: 'scenario-manday-updated', scenarioId: 623, crewIds: ['F80001'] })
    await vi.waitFor(() => {
      expect(getScenarioCrewStatsMock).toHaveBeenCalledWith(623, ['F80001'])
    })
    await vi.waitFor(() => {
      const st = store.getState().data
      expect(st?.crewStats.F80001['2026RP07']).toEqual({ credit: 100, dayOffCount: 2, alCount: 0, leaveCount: 0 })
    })
    destroyScenarioGanttStore(623)
  })

  it('scenario-kpi-updated refetches the KPI result', async () => {
    handleScenarioRecomputeMessage(623, { type: 'scenario-kpi-updated', scenarioId: 623 })
    await vi.waitFor(() => expect(getResultsMock).toHaveBeenCalledWith(623))
  })

  it('scenario-legality-updated refetches persisted legality', async () => {
    handleScenarioRecomputeMessage(623, { type: 'scenario-legality-updated', scenarioId: 623 })
    await vi.waitFor(() => expect(fetchScenarioLegalityMock).toHaveBeenCalledWith(623))
  })

  it('scenario-legality-updated READY reloads gantt data when store is loaded', async () => {
    const store = getScenarioGanttStore(623)
    store.setState({ data: makeData(), dataRevision: 1 })
    fetchScenarioLegalityMock.mockResolvedValueOnce({
      status: 'READY',
      violations: [],
      computedAt: null,
      errorText: null,
    })

    handleScenarioRecomputeMessage(623, { type: 'scenario-legality-updated', scenarioId: 623 })

    await vi.waitFor(() => expect(getGanttDataMock).toHaveBeenCalledWith(623, undefined))
    await vi.waitFor(() => {
      expect(store.getState().data?.rosterDutyRefs).toEqual([
        { crewId: '718', pairingId: 15806, dutySeq: 1, dutyRefTz: -360 },
      ])
    })
    expect(applyScenarioLegalityResponseMock).toHaveBeenCalled()
    destroyScenarioGanttStore(623)
  })

  it('scenario-legality-updated COMPUTING does not reload gantt data', async () => {
    const store = getScenarioGanttStore(623)
    store.setState({ data: makeData(), dataRevision: 1 })
    fetchScenarioLegalityMock.mockResolvedValueOnce({
      status: 'COMPUTING',
      violations: [],
      computedAt: null,
      errorText: null,
    })

    handleScenarioRecomputeMessage(623, { type: 'scenario-legality-updated', scenarioId: 623 })

    await vi.waitFor(() => expect(fetchScenarioLegalityMock).toHaveBeenCalledWith(623))
    await vi.waitFor(() => expect(applyScenarioLegalityResponseMock).toHaveBeenCalled())
    expect(getGanttDataMock).not.toHaveBeenCalled()
    destroyScenarioGanttStore(623)
  })

  it('ignores messages for a different scenario', async () => {
    handleScenarioRecomputeMessage(999, { type: 'scenario-manday-updated', scenarioId: 623, crewIds: ['F80001'] })
    handleScenarioRecomputeMessage(623, { type: 'scenario-manday-updated', scenarioId: 999, crewIds: ['F80001'] })
    expect(getScenarioCrewStatsMock).not.toHaveBeenCalled()
  })

  it('ignores a manday signal with empty crewIds', async () => {
    handleScenarioRecomputeMessage(623, { type: 'scenario-manday-updated', scenarioId: 623, crewIds: [] })
    expect(getScenarioCrewStatsMock).not.toHaveBeenCalled()
  })

  it('scenario-roster-updated: data 非空 → 本地应用 patch + bump dataRevision', () => {
    const store = getScenarioGanttStore(623)
    store.setState({
      data: { ...makeData(), assignments: [{ crewId: 'F80001', pairingId: 100, source: 'CR' }] },
      dataRevision: 5,
    })

    handleScenarioRecomputeMessage(623, {
      type: 'scenario-roster-updated',
      scenarioId: 623,
      patches: [{ op: 'remove', crewId: 'F80001', pairingId: 100 }],
    })

    const st = store.getState()
    expect(st.dataRevision).toBe(6)
    expect(st.data?.assignments).toHaveLength(0)
    destroyScenarioGanttStore(623)
  })

  it('scenario-roster-updated: data 为空（未打开）→ 跳过不处理', () => {
    const store = getScenarioGanttStore(623)
    store.setState({ data: null, dataRevision: 5 })

    handleScenarioRecomputeMessage(623, {
      type: 'scenario-roster-updated',
      scenarioId: 623,
      patches: [{ op: 'remove', crewId: 'F80001', pairingId: 100 }],
    })

    expect(store.getState().dataRevision).toBe(5)
    destroyScenarioGanttStore(623)
  })
})
