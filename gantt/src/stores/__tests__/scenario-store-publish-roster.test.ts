import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  scenarioApi: {
    publishRoster: vi.fn(),
    transition: vi.fn(),
    getRoster: vi.fn(),
    list: vi.fn(),
  },
  notify: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}))

vi.mock('@/services/scenario-api', () => ({ scenarioApi: mocks.scenarioApi }))
vi.mock('@/utils/notify', () => ({ notify: mocks.notify }))

describe('scenario-store publishRoster', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.scenarioApi.publishRoster.mockResolvedValue({ published: 1 })
    mocks.scenarioApi.transition.mockResolvedValue({ id: 901, status: 'PUBLISHED', strDtLoc: '2026-08-01', endDtLoc: '2026-08-31' })
    mocks.scenarioApi.getRoster.mockResolvedValue({ assignments: [] })
    mocks.scenarioApi.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })
  })

  it('marks imported rows locally without blocking on a full roster reload', async () => {
    const { useScenarioStore } = await import('../scenario-store')

    useScenarioStore.setState({
      selectedId: 901,
      detail: { id: 901, status: 'DONE', strDtLoc: '2026-08-01', endDtLoc: '2026-08-31' } as never,
      draftDetail: { id: 901, status: 'DONE' } as never,
      isDirty: true,
      roster: [
        { rosterIds: [31], status: 'PENDING', published: false, publishable: true } as never,
        { rosterIds: [41], status: 'PENDING', published: false, publishable: true } as never,
      ],
    })

    await useScenarioStore.getState().publishRoster(901, [31])

    expect(mocks.scenarioApi.publishRoster).toHaveBeenCalledWith(901, [31])
    expect(mocks.scenarioApi.transition).toHaveBeenCalledWith(901, 'PUBLISHED')
    expect(mocks.scenarioApi.getRoster).not.toHaveBeenCalled()
    expect(useScenarioStore.getState().isDirty).toBe(false)
    expect(useScenarioStore.getState().roster).toMatchObject([
      { rosterIds: [31], status: 'PUBLISHED', published: true, publishable: false },
      { rosterIds: [41], status: 'PENDING', published: false, publishable: true },
    ])
  })
})
