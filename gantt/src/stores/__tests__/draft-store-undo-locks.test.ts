import { beforeEach, describe, expect, it, vi } from 'vitest'

const lockMocks = vi.hoisted(() => ({
  releaseAllLocks: vi.fn().mockResolvedValue(undefined),
  releaseCrewLock: vi.fn().mockResolvedValue(undefined),
  acquireLocks: vi.fn().mockResolvedValue(true),
  myLockKeys: new Set<string>(),
}))

const recomputeMocks = vi.hoisted(() => ({
  recomputeRosterItems: vi.fn(),
}))

vi.mock('@/services/draft-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/draft-api')>()
  return { ...actual, draftApi: { commit: vi.fn() } }
})

vi.mock('@/services/roster-api', () => ({
  rosterApi: {
    getView: vi.fn(),
    create: vi.fn(),
    move: vi.fn(),
    swap: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    removeByPairingAndCrew: vi.fn(),
    assignPairing: vi.fn(),
  },
}))

vi.mock('@/services/pairing-api', () => ({
  pairingApi: {},
}))

vi.mock('@/stores/lock-store', () => ({
  useLockStore: {
    getState: () => ({
      releaseAllLocks: lockMocks.releaseAllLocks,
      releaseCrewLock: lockMocks.releaseCrewLock,
      acquireLocks: lockMocks.acquireLocks,
      myLockKeys: lockMocks.myLockKeys,
      currentUser: 'Qiang',
    }),
  },
}))

vi.mock('@/stores/pairing-store', () => ({
  usePairingStore: { getState: () => ({ fetchPairings: vi.fn(), removeItem: vi.fn(), refreshDraftCoverage: vi.fn(), promoteDraftCoverage: vi.fn() }) },
}))

vi.mock('@/stores/filter-store', () => ({
  useFilterStore: { getState: () => ({ dateRange: { start: new Date(), end: new Date() }, pairing: {} }) },
}))

vi.mock('@/stores/pane-store', () => ({
  usePaneStore: { getState: () => ({}) },
}))

vi.mock('@/stores/crew-store', () => ({
  useCrewStore: { getState: () => ({ clearCrewStatsCache: vi.fn(), loadCrewStats: vi.fn() }) },
}))

vi.mock('@/stores/draft-roster-recompute', () => ({
  promoteDraftBase: vi.fn(),
  recomputeRosterItems: recomputeMocks.recomputeRosterItems,
}))

vi.mock('@/utils/viewport-month', () => ({
  getLiveViewportRosterPeriod: vi.fn(() => null),
}))

vi.mock('@/stores/gantt-view-store', () => ({
  useGanttViewStore: { getState: () => ({ markDirty: vi.fn() }) },
}))

import { useDraftStore } from '@/stores/draft-store'

describe('draft-store undo/redo lock sync', () => {
  beforeEach(() => {
    lockMocks.releaseAllLocks.mockClear()
    lockMocks.releaseCrewLock.mockClear()
    lockMocks.acquireLocks.mockClear()
    lockMocks.myLockKeys = new Set()
    useDraftStore.setState({ operations: [], redoStack: [], saving: false, active: true })
  })

  it('undo to empty ops releases all locks', async () => {
    lockMocks.myLockKeys = new Set(['crew:1328', 'pairing:10217'])
    useDraftStore.getState().addOp(
      { type: 'add', task: { id: -1 } as never },
      ['1328'],
      [10217],
    )
    useDraftStore.getState().undoOp()
    await Promise.resolve()
    expect(lockMocks.releaseAllLocks).toHaveBeenCalledTimes(1)
    expect(lockMocks.releaseCrewLock).not.toHaveBeenCalled()
  })

  it('undo releases only crews that are no longer dirty', async () => {
    lockMocks.myLockKeys = new Set(['crew:1328', 'crew:1442', 'pairing:1', 'pairing:2'])
    useDraftStore.getState().addOp(
      { type: 'add', task: { id: -1 } as never },
      ['1328'],
      [1],
    )
    useDraftStore.getState().addOp(
      { type: 'add', task: { id: -2 } as never },
      ['1442'],
      [2],
    )
    useDraftStore.getState().undoOp()
    await Promise.resolve()
    expect(lockMocks.releaseAllLocks).not.toHaveBeenCalled()
    expect(lockMocks.releaseCrewLock).toHaveBeenCalledWith('1442', [2])
    expect(lockMocks.releaseCrewLock).not.toHaveBeenCalledWith('1328', expect.anything())
  })

  it('undo keeps lock when another remaining op still dirties the crew', async () => {
    lockMocks.myLockKeys = new Set(['crew:1328', 'pairing:1', 'pairing:2'])
    useDraftStore.getState().addOp(
      { type: 'add', task: { id: -1 } as never },
      ['1328'],
      [1],
    )
    useDraftStore.getState().addOp(
      { type: 'add', task: { id: -2 } as never },
      ['1328'],
      [2],
    )
    useDraftStore.getState().undoOp()
    await Promise.resolve()
    expect(lockMocks.releaseAllLocks).not.toHaveBeenCalled()
    expect(lockMocks.releaseCrewLock).not.toHaveBeenCalled()
  })

  it('redo re-acquires locks for the restored op', async () => {
    useDraftStore.getState().addOp(
      { type: 'add', task: { id: -1 } as never },
      ['1328'],
      [10217],
    )
    useDraftStore.getState().undoOp()
    await Promise.resolve()
    lockMocks.releaseAllLocks.mockClear()
    lockMocks.acquireLocks.mockClear()

    useDraftStore.getState().redoOp()
    await Promise.resolve()
    expect(lockMocks.acquireLocks).toHaveBeenCalledWith(['1328'], [10217])
  })

  it('addOp returns an id and removeOp removes exactly that op', () => {
    recomputeMocks.recomputeRosterItems.mockClear()
    const opId = useDraftStore.getState().addOp(
      { type: 'add', task: { id: -1 } as never },
      ['1328'],
      [10217],
    )
    expect(opId).toBeTruthy()
    useDraftStore.getState().addOp(
      { type: 'add', task: { id: -2 } as never },
      ['1442'],
      [2],
    )

    useDraftStore.getState().removeOp(opId)
    expect(useDraftStore.getState().operations.map((o) => o.id)).not.toContain(opId)
    expect(useDraftStore.getState().operations).toHaveLength(1)
    expect(useDraftStore.getState().operations[0].affectedCrewIds).toEqual(['1442'])
    expect(recomputeMocks.recomputeRosterItems).toHaveBeenCalled()
  })

  it('removeOp with an unknown id is a no-op', () => {
    recomputeMocks.recomputeRosterItems.mockClear()
    useDraftStore.getState().addOp(
      { type: 'add', task: { id: -1 } as never },
      ['1328'],
      [10217],
    )
    useDraftStore.getState().removeOp('does-not-exist')
    expect(useDraftStore.getState().operations).toHaveLength(1)
    expect(recomputeMocks.recomputeRosterItems).not.toHaveBeenCalled()
  })

  it('removeOp of an op already popped by undo is a no-op', () => {
    const opId = useDraftStore.getState().addOp(
      { type: 'add', task: { id: -1 } as never },
      ['1328'],
      [10217],
    )
    useDraftStore.getState().undoOp()
    useDraftStore.getState().removeOp(opId)
    // undoOp already moved it to the redo stack — nothing left to remove.
    expect(useDraftStore.getState().operations).toHaveLength(0)
    expect(useDraftStore.getState().redoStack.map((o) => o.id)).toContain(opId)
  })
})
