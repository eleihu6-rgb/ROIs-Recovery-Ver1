import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// We override the underlying stores per-test by re-mocking each implementation. Vitest
// hoists vi.mock() above imports, so each test scenario uses a fresh module graph.
const checkCrews = vi.fn().mockResolvedValue(true)
const setRuleGroup = vi.fn()
const rosterState: { main: { rosterItems: unknown[] } } = { main: { rosterItems: [] } }
const crewState: { selectedCrewIds: string[] } = { selectedCrewIds: [] }

vi.mock('../rule-check-store', () => ({
  useRuleCheckStore: { getState: () => ({ setRuleGroup, checkCrews }) },
}))

vi.mock('../roster-store', () => ({
  useRosterStore: { getState: () => rosterState },
}))

vi.mock('../crew-store', () => ({
  useCrewStore: { getState: () => crewState },
}))

vi.mock('@/services/legality-api', () => ({
  legalityApi: {
    getRuleset: vi.fn().mockResolvedValue({
      workset: { id: 2, name: 'Other Set', category: null },
      rules: [],
    }),
    listRulesets: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('@/utils/notify', () => ({
  notify: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}))

// Import after mocks so they wire up correctly.
const { useLegalityStore } = await import('../legality-store')

describe('legality-store selectSet triggers a recheck of the loaded roster', () => {
  beforeEach(() => {
    setRuleGroup.mockClear()
    checkCrews.mockClear()
    rosterState.main.rosterItems = []
    crewState.selectedCrewIds = []
    useLegalityStore.setState({
      sets: [],
      selectedId: null,
      worksetName: null,
      rules: [],
      catalogRules: [],
      selectedCatalogRuleId: null,
      loadingList: false,
      loadingRules: false,
      loaded: false,
      lastSave: null,
    })
  })

  afterEach(() => {
    setRuleGroup.mockClear()
    checkCrews.mockClear()
  })

  it('skips recheck when no roster is loaded yet (cold-start path is owned by apply/refresh)', async () => {
    rosterState.main.rosterItems = []
    crewState.selectedCrewIds = ['A', 'B']
    await useLegalityStore.getState().selectSet(2)
    expect(setRuleGroup).toHaveBeenCalledWith('2')
    expect(checkCrews).not.toHaveBeenCalled()
  })

  it('skips recheck when items are loaded but no crew is selected', async () => {
    rosterState.main.rosterItems = [{ id: 1 }, { id: 2 }]
    crewState.selectedCrewIds = []
    await useLegalityStore.getState().selectSet(2)
    expect(setRuleGroup).toHaveBeenCalledWith('2')
    expect(checkCrews).not.toHaveBeenCalled()
  })

  it('kicks off a fresh checkCrews with selected crew ids when both items and crews are loaded', async () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }]
    rosterState.main.rosterItems = items
    crewState.selectedCrewIds = ['C1', 'C2', 'C3']
    await useLegalityStore.getState().selectSet(2)
    expect(setRuleGroup).toHaveBeenCalledWith('2')
    expect(checkCrews).toHaveBeenCalledTimes(1)
    expect(checkCrews).toHaveBeenCalledWith(['C1', 'C2', 'C3'], items)
  })
})
