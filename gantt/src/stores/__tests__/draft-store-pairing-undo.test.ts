import { beforeEach, describe, expect, it, vi } from 'vitest'

const pairingMocks = vi.hoisted(() => ({
  fetchPairings: vi.fn().mockResolvedValue(undefined),
  removeItem: vi.fn(),
}))

vi.mock('@/services/draft-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/draft-api')>()
  return { ...actual, draftApi: { commit: vi.fn() } }
})

vi.mock('@/services/roster-api', () => ({
  rosterApi: {},
}))

vi.mock('@/services/pairing-api', () => ({
  pairingApi: {},
}))

vi.mock('@/stores/lock-store', () => ({
  useLockStore: {
    getState: () => ({
      releaseAllLocks: vi.fn(),
      releaseCrewLock: vi.fn(),
      acquireLocks: vi.fn().mockResolvedValue(true),
      myLockKeys: new Set<string>(),
      currentUser: 'tester',
    }),
  },
}))

vi.mock('@/stores/pairing-store', () => ({
  usePairingStore: { getState: () => pairingMocks },
}))

vi.mock('@/stores/filter-store', () => ({
  useFilterStore: {
    getState: () => ({
      dateRange: { start: new Date('2026-06-01'), end: new Date('2026-06-30') },
      pairing: { bases: [], fleets: [], divisions: [], depArps: [], assignments: [], ranks: [], coverage: [], pairingIds: [], label: '' },
    }),
  },
}))

vi.mock('@/stores/pane-store', () => ({
  usePaneStore: { getState: () => ({}) },
}))

vi.mock('@/stores/draft-roster-recompute', () => ({
  promoteDraftBase: vi.fn(),
  recomputeRosterItems: vi.fn(),
}))

vi.mock('@/stores/gantt-view-store', () => ({
  useGanttViewStore: { getState: () => ({ markDirty: vi.fn() }) },
}))

describe('draft-store pairing undo/redo', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { useDraftStore } = await import('@/stores/draft-store')
    useDraftStore.setState({ operations: [], redoStack: [], saving: false })
  })

  it('reloads pairings after undoing remove-pairing', async () => {
    const { useDraftStore } = await import('@/stores/draft-store')
    useDraftStore.getState().addOp({ type: 'remove-pairing', pairingId: 42 }, [], [42])

    useDraftStore.getState().undoOp()

    await vi.waitFor(() => {
      expect(pairingMocks.fetchPairings).toHaveBeenCalledTimes(1)
    })
    expect(useDraftStore.getState().operations).toHaveLength(0)
  })

  it('undo of a batched remove-pairing is one stack step', async () => {
    const { useDraftStore } = await import('@/stores/draft-store')
    useDraftStore.getState().addOp(
      { type: 'remove-pairing', pairingId: 42, pairingIds: [42, 43] },
      [],
      [42, 43],
    )

    useDraftStore.getState().undoOp()

    expect(useDraftStore.getState().operations).toHaveLength(0)
    await vi.waitFor(() => {
      expect(pairingMocks.fetchPairings).toHaveBeenCalledTimes(1)
    })
  })

  it('re-applies remaining remove-pairing hides after undo reload', async () => {
    const { useDraftStore } = await import('@/stores/draft-store')
    useDraftStore.getState().addOp({ type: 'remove-pairing', pairingId: 42 }, [], [42])
    useDraftStore.getState().addOp({ type: 'remove-pairing', pairingId: 43 }, [], [43])

    useDraftStore.getState().undoOp()

    await vi.waitFor(() => {
      expect(pairingMocks.fetchPairings).toHaveBeenCalledTimes(1)
      expect(pairingMocks.removeItem).toHaveBeenCalledWith(42)
    })
    expect(useDraftStore.getState().operations).toHaveLength(1)
  })

  it('removes all batched pairing ids locally after redo', async () => {
    const { useDraftStore } = await import('@/stores/draft-store')
    useDraftStore.getState().addOp(
      { type: 'remove-pairing', pairingId: 42, pairingIds: [42, 43] },
      [],
      [42, 43],
    )
    useDraftStore.getState().undoOp()
    pairingMocks.removeItem.mockClear()

    useDraftStore.getState().redoOp()

    expect(pairingMocks.removeItem).toHaveBeenCalledWith(42)
    expect(pairingMocks.removeItem).toHaveBeenCalledWith(43)
  })
})
