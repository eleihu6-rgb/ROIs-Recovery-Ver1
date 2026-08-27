import { describe, expect, it } from 'vitest'
import { getScenarioRosterSelectionStore } from '../scenario-roster-selection-store'

const derive = (ids: Set<number>): Set<string> => {
  // Simple inversion: task 1 → crew A, task 2 → crew B, task 3 → crew A.
  const taskCrew: Record<number, string> = { 1: 'A', 2: 'B', 3: 'A' }
  const crews = new Set<string>()
  for (const id of ids) if (taskCrew[id]) crews.add(taskCrew[id])
  return crews
}

describe('scenario-roster-selection-store toggleTask', () => {
  it('adds an unselected task and re-derives owning crews', () => {
    const store = getScenarioRosterSelectionStore(9001)
    store.getState().clear()
    store.getState().toggleTask(1, derive)
    const s = store.getState()
    expect(s.selectedTaskIds).toEqual(new Set([1]))
    expect(s.selectedCrewIds).toEqual(new Set(['A']))
  })

  it('removes a selected task, and clears both sets when the last one is toggled off', () => {
    const store = getScenarioRosterSelectionStore(9002)
    store.getState().clear()
    store.getState().toggleTask(1, derive)
    store.getState().toggleTask(2, derive)
    expect(store.getState().selectedTaskIds).toEqual(new Set([1, 2]))
    expect(store.getState().selectedCrewIds).toEqual(new Set(['A', 'B']))

    store.getState().toggleTask(1, derive)
    expect(store.getState().selectedTaskIds).toEqual(new Set([2]))
    expect(store.getState().selectedCrewIds).toEqual(new Set(['B']))

    store.getState().toggleTask(2, derive)
    expect(store.getState().selectedTaskIds).toEqual(new Set<number>())
    expect(store.getState().selectedCrewIds).toEqual(new Set<string>())
  })

  it('accumulates tasks while re-deriving the union of owning crews', () => {
    const store = getScenarioRosterSelectionStore(9003)
    store.getState().clear()
    store.getState().toggleTask(1, derive)
    store.getState().toggleTask(3, derive)
    const s = store.getState()
    expect(s.selectedTaskIds).toEqual(new Set([1, 3]))
    expect(s.selectedCrewIds).toEqual(new Set(['A']))
  })
})
