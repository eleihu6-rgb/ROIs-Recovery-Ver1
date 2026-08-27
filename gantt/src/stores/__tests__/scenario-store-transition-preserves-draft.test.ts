import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  scenarioApi: {
    transition: vi.fn(),
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

describe('scenario-store transitionStatus — preserves draft edits', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    // The server row after "Remove result": committed fleets kept, status DRAFT,
    // result counters cleared and modifier set by the actor.
    mocks.scenarioApi.transition.mockResolvedValue({
      id: 729,
      status: 'DRAFT',
      optimizedCount: 0,
      updatedBy: 'tester',
      strDtLoc: '2026-07-01',
      endDtLoc: '2026-07-31',
      filterParams: { crew: { fleets: ['7M8', '737'] } },
    })
    mocks.scenarioApi.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })
  })

  it('keeps unsaved field edits across the transition while refreshing status + counters', async () => {
    const { useScenarioStore } = await import('../scenario-store')

    // User had unsaved edits (deleted "737" from crew fleets) before removing the result.
    useScenarioStore.setState({
      selectedId: 729,
      detail: { id: 729, status: 'DONE', strDtLoc: '2026-07-01', endDtLoc: '2026-07-31', filterParams: { crew: { fleets: ['7M8', '737'] } } } as never,
      draftDetail: { id: 729, status: 'DONE', strDtLoc: '2026-07-01', endDtLoc: '2026-07-31', filterParams: { crew: { fleets: ['7M8'] } } } as never,
      isDirty: true,
    })

    await useScenarioStore.getState().transitionStatus(729, 'DRAFT')

    const state = useScenarioStore.getState()
    // detail reflects the committed (transitioned) row…
    expect(state.detail).toMatchObject({ status: 'DRAFT', optimizedCount: 0, filterParams: { crew: { fleets: ['7M8', '737'] } } })
    // …but the draft keeps the user's pending fleet edit, with status refreshed.
    expect(state.draftDetail).toMatchObject({ status: 'DRAFT', filterParams: { crew: { fleets: ['7M8'] } } })
    // isDirty stays true: the edit was preserved, not discarded.
    expect(state.isDirty).toBe(true)
  })

  it('does not mark a clean scenario dirty', async () => {
    const { useScenarioStore } = await import('../scenario-store')

    useScenarioStore.setState({
      selectedId: 729,
      detail: { id: 729, status: 'DONE', strDtLoc: '2026-07-01', endDtLoc: '2026-07-31', filterParams: { crew: { fleets: ['7M8', '737'] } } } as never,
      draftDetail: { id: 729, status: 'DONE', strDtLoc: '2026-07-01', endDtLoc: '2026-07-31', filterParams: { crew: { fleets: ['7M8', '737'] } } } as never,
      isDirty: false,
    })

    await useScenarioStore.getState().transitionStatus(729, 'DRAFT')

    expect(useScenarioStore.getState().draftDetail).toMatchObject({ status: 'DRAFT', filterParams: { crew: { fleets: ['7M8', '737'] } } })
    expect(useScenarioStore.getState().isDirty).toBe(false)
  })
})
