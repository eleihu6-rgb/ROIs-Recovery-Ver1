import { afterEach, describe, expect, it, vi } from 'vitest'
import { destroyScenarioGanttStore, getScenarioGanttStore } from '../scenario-gantt-store'

vi.mock('@/services/scenario-gantt-api', () => ({
  scenarioGanttApi: {
    getGanttData: vi.fn(async () => ({
      scenarioId: 992101,
      scenarioName: 'Scenario',
      fileType: 'RO',
      capabilities: {
        panes: ['roster', 'pairing'],
        defaultPanes: ['roster', 'pairing'],
        roster: { canAssign: true, canRemove: true, canReassign: true },
        pairing: { canEditSegments: false },
      },
      strDtLoc: '2026-03-01T00:00:00.000Z',
      endDtLoc: '2026-03-31T23:59:59.000Z',
      scenarioStrDt: '2026-03-01T00:00:00',
      scenarioEndDt: '2026-03-31T00:00:00',
      leadinLive: 1,
      dataSource: 'snapshot',
      crew: [],
      pairings: [],
      assignments: [],
      pairingSegments: [],
      flights: [],
      groundItems: [],
      crewStats: {},
    })),
  },
}))

const SCENARIO_ID = 992101

describe('scenario gantt patch history', () => {
  afterEach(() => {
    destroyScenarioGanttStore(SCENARIO_ID)
  })

  it('undoes and redoes pending scenario patches without touching saved data', () => {
    const store = getScenarioGanttStore(SCENARIO_ID)

    store.getState().addPatch({ op: 'add', crewId: 'C1', pairingId: 101 })
    store.getState().addPatch({ op: 'remove', crewId: 'C1', pairingId: 102 })

    expect(store.getState().pendingChanges).toHaveLength(2)
    expect(store.getState().canUndo()).toBe(true)
    expect(store.getState().canRedo()).toBe(false)

    store.getState().undo()
    expect(store.getState().pendingChanges).toEqual([
      { op: 'add', crewId: 'C1', pairingId: 101 },
    ])
    expect(store.getState().canRedo()).toBe(true)

    store.getState().redo()
    expect(store.getState().pendingChanges).toEqual([
      { op: 'add', crewId: 'C1', pairingId: 101 },
      { op: 'remove', crewId: 'C1', pairingId: 102 },
    ])
  })

  it('preserves dirty patches when background refresh reloads data', async () => {
    const store = getScenarioGanttStore(SCENARIO_ID)

    store.getState().addPatch({ op: 'remove', crewId: 'C1', pairingId: 102 })
    await store.getState().loadData(SCENARIO_ID)

    expect(store.getState().pendingChanges).toEqual([
      { op: 'remove', crewId: 'C1', pairingId: 102 },
    ])
    expect(store.getState().isDirty).toBe(true)
  })

  it('removePatch removes a specific pending patch by reference and fixes isDirty', () => {
    const store = getScenarioGanttStore(SCENARIO_ID)
    const patchA = { op: 'add' as const, crewId: 'C1', pairingId: 101 }
    const patchB = { op: 'remove' as const, crewId: 'C1', pairingId: 102 }

    store.getState().addPatch(patchA)
    store.getState().addPatch(patchB)
    expect(store.getState().isDirty).toBe(true)

    store.getState().removePatch(patchA)
    expect(store.getState().pendingChanges).toEqual([patchB])
    expect(store.getState().isDirty).toBe(true)

    store.getState().removePatch(patchB)
    expect(store.getState().pendingChanges).toEqual([])
    expect(store.getState().isDirty).toBe(false)
  })

  it('removePatch is a no-op for a patch not in pendingChanges (e.g. already undone)', () => {
    const store = getScenarioGanttStore(SCENARIO_ID)
    const patch = { op: 'add' as const, crewId: 'C1', pairingId: 101 }

    store.getState().addPatch(patch)
    // A structurally identical but distinct object must NOT remove the stored patch.
    store.getState().removePatch({ op: 'add' as const, crewId: 'C1', pairingId: 101 })
    expect(store.getState().pendingChanges).toEqual([patch])
    expect(store.getState().isDirty).toBe(true)
  })
})
