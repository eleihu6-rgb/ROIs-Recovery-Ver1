import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  scenarioApi: {
    run: vi.fn(),
    getById: vi.fn(),
    getProgress: vi.fn(),
    list: vi.fn(),
    getResults: vi.fn(),
  },
  notify: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}))

vi.mock('@/services/scenario-api', () => ({ scenarioApi: mocks.scenarioApi }))
vi.mock('@/utils/notify', () => ({ notify: mocks.notify }))

/**
 * runScenario start-failure handling. Regression for scenario 669 (UAT): the
 * scenario matched no crew in scope, so POST /api/scenario/:id/run rejected
 * immediately with a clear message — but runScenario kept the optimistic RUNNING
 * state, spun the progress panel, and swallowed the error for the whole ~10 min
 * poll window (POLL_INTERVAL_MS=3000 × POLL_MAX_ATTEMPTS=200).
 */
describe('scenario-store runScenario', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.scenarioApi.run.mockResolvedValue({ taskId: 't-1' })
    mocks.scenarioApi.getById.mockResolvedValue({ id: 669, status: 'DONE' })
    mocks.scenarioApi.getProgress.mockResolvedValue({ status: 'DONE', percent: 100 })
    mocks.scenarioApi.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })
    mocks.scenarioApi.getResults.mockResolvedValue({ kpi: [], creditHours: [], uncovered: [], distribution: [], rawResult: null })
  })

  it('surfaces a start error immediately and clears the fake RUNNING state instead of polling for 10 minutes', async () => {
    vi.useFakeTimers()
    try {
      const { useScenarioStore } = await import('../scenario-store')
      useScenarioStore.setState({
        selectedId: 669,
        items: [{ id: 669, status: 'DRAFT', scenarioName: '669' } as never],
        detail: { id: 669, status: 'DRAFT', scenarioName: '669' } as never,
        draftDetail: { id: 669, status: 'DRAFT', scenarioName: '669' } as never,
      })
      mocks.scenarioApi.run.mockRejectedValue(new Error('No crew matched the selected scenario scope'))
      mocks.scenarioApi.getById.mockResolvedValue({ id: 669, status: 'DRAFT' })

      const promise = useScenarioStore.getState().runScenario(669)
      // run() rejects in the same tick — the real error must be surfaced immediately,
      // before any poll interval elapses. Under the old code this only fired after the
      // full ~10 min poll window.
      await vi.advanceTimersByTimeAsync(0)
      expect(mocks.notify.error).toHaveBeenCalledWith('No crew matched the selected scenario scope')
      expect(mocks.notify.warning).not.toHaveBeenCalled()

      // One poll interval is enough for the poll to notice runningId was cleared and exit.
      await vi.advanceTimersByTimeAsync(3001)
      await promise

      const state = useScenarioStore.getState()
      expect(state.runningId).toBeNull()
      expect(state.detail?.status).toBe('DRAFT')
      expect(state.items.find((it) => it.id === 669)?.status).toBe('DRAFT')
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the happy path: on a successful start it polls to DONE and clears runningId', async () => {
    vi.useFakeTimers()
    try {
      const { useScenarioStore } = await import('../scenario-store')
      useScenarioStore.setState({
        selectedId: 596,
        items: [{ id: 596, status: 'DRAFT', scenarioName: '596' } as never],
        detail: { id: 596, status: 'DRAFT', scenarioName: '596' } as never,
      })
      mocks.scenarioApi.run.mockResolvedValue({ taskId: 't-596' })
      mocks.scenarioApi.getById.mockResolvedValue({ id: 596, status: 'DONE' })

      const promise = useScenarioStore.getState().runScenario(596)
      await vi.advanceTimersByTimeAsync(3001)
      await promise

      expect(mocks.notify.success).toHaveBeenCalledWith('Optimization started successfully')
      expect(mocks.notify.success).toHaveBeenCalledWith('Optimization complete — result ready')
      expect(mocks.notify.error).not.toHaveBeenCalled()
      expect(useScenarioStore.getState().runningId).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
