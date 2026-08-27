import { beforeEach, describe, expect, it, vi } from 'vitest'

const clearSessionViolations = vi.fn()
const getRecheckStatus = vi.fn()

vi.mock('@/services/draft-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/draft-api')>()
  return { ...actual, draftApi: { commit: vi.fn().mockResolvedValue({ committed: 1 }) } }
})

vi.mock('@/services/roster-api', () => ({
  rosterApi: {
    getView: vi.fn().mockResolvedValue([]),
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

vi.mock('@/services/legality-api', () => ({
  legalityApi: {
    getRecheckStatus: (...args: unknown[]) => getRecheckStatus(...args),
  },
}))

vi.mock('@/stores/lock-store', () => ({
  useLockStore: {
    getState: () => ({
      releaseAllLocks: vi.fn().mockResolvedValue(undefined),
      releaseCrewLock: vi.fn(),
      acquireLocks: vi.fn(),
      myLockKeys: new Set(['crew:2324']),
      currentUser: 'Qiang',
    }),
  },
}))

vi.mock('@/stores/pairing-store', () => ({
  usePairingStore: {
    getState: () => ({
      fetchPairings: vi.fn(),
      refreshDraftCoverage: vi.fn(),
      promoteDraftCoverage: vi.fn(),
    }),
  },
}))

vi.mock('@/stores/filter-store', () => ({
  useFilterStore: {
    getState: () => ({
      dateRange: { start: new Date('2026-09-01'), end: new Date('2026-09-30') },
      pairing: {},
    }),
  },
}))

vi.mock('@/stores/pane-store', () => ({
  usePaneStore: { getState: () => ({}) },
}))

vi.mock('@/stores/crew-store', () => ({
  useCrewStore: {
    getState: () => ({
      clearCrewStatsCache: vi.fn(),
      loadCrewStats: vi.fn().mockResolvedValue(undefined),
    }),
  },
}))

vi.mock('@/stores/draft-roster-recompute', () => ({
  promoteDraftBase: vi.fn(),
  recomputeRosterItems: vi.fn(),
}))

vi.mock('@/utils/viewport-month', () => ({
  getLiveViewportRosterPeriod: vi.fn(() => null),
}))

vi.mock('@/stores/gantt-view-store', () => ({
  useGanttViewStore: { getState: () => ({ markDirty: vi.fn() }) },
}))

vi.mock('@/stores/legality-store', () => ({
  useLegalityStore: { getState: () => ({ selectedId: 103 }) },
}))

vi.mock('@/stores/rule-check-store', () => ({
  useRuleCheckStore: { getState: () => ({ ruleGroupCode: '103' }) },
}))

vi.mock('@/stores/session-violation-store', () => ({
  useSessionViolationStore: {
    getState: () => ({ clearSessionViolations }),
  },
}))

vi.mock('@/stores/roster-store', () => ({
  useRosterStore: {
    getState: () => ({
      replaceCrewItems: vi.fn(),
      removeItemLocally: vi.fn(),
      patchItems: vi.fn(),
    }),
  },
}))

import { useDraftStore } from '@/stores/draft-store'

describe('draft-store commit violations refresh', () => {
  beforeEach(() => {
    clearSessionViolations.mockClear()
    getRecheckStatus.mockReset()
    useDraftStore.setState({ operations: [], redoStack: [], saving: false, active: true })
    useDraftStore.getState().addOp(
      { type: 'remove', taskId: 1161414 },
      ['2324'],
      [122631],
    )
  })

  it('clears session violations and fires one immediate refetch; final refresh comes from the legality-updated push', async () => {
    const events: CustomEvent[] = []
    const onUpdated = (e: Event) => {
      events.push(e as CustomEvent)
    }
    window.addEventListener('violations:updated', onUpdated)

    await useDraftStore.getState().commit()

    expect(clearSessionViolations).toHaveBeenCalledTimes(1)
    expect(events).toHaveLength(1)
    expect(events[0]!.detail).toEqual({ groupCode: '103' })
    // No polling — the async live-legality recompute signals completion via the
    // legality-updated WS push (lock-store dispatches violations:updated), not here.
    expect(getRecheckStatus).not.toHaveBeenCalled()

    window.removeEventListener('violations:updated', onUpdated)
  })
})
