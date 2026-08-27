// gantt/src/utils/__tests__/scenario-find-helpers.test.ts
import { describe, it, expect } from 'vitest'
import {
  scenarioLocatePairing,
  scenarioLocateFlight,
  scenarioFindCrewByPairing,
  scenarioFindCrewByFlight,
  scenarioFindPairingByFlight,
  scenarioHasPaneType,
} from '@/utils/scenario-find-helpers'
import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { getScenarioLayoutStore } from '@/stores/scenario-layout-store'
import type {
  ScenarioGanttData,
  ScenarioGanttAssignment,
  ScenarioGanttPairingSegment,
} from '@/types/scenario-gantt'

// Minimal segment factory — only the fields the helpers read (pairingId / fltId) matter.
const seg = (pairingId: number, fltId: number | null): ScenarioGanttPairingSegment =>
  ({ pairingId, fltId } as ScenarioGanttPairingSegment)

const asg = (crewId: string, pairingId: number): ScenarioGanttAssignment =>
  ({ crewId, pairingId, source: 'CR' } as ScenarioGanttAssignment)

// Seed data: pairing 100 → crew A,B ; pairing 200 → crew C. flight 11 ∈ pairing 100, flight 22 ∈ pairing 200.
function seedData(): ScenarioGanttData {
  return {
    assignments: [asg('A', 100), asg('B', 100), asg('C', 200), asg('A', 200)],
    pairingSegments: [seg(100, 11), seg(100, 11), seg(200, 22)],
  } as unknown as ScenarioGanttData
}

// Each test uses a UNIQUE scenarioId so the per-scenario store registries stay isolated.
let nextId = 90001
function freshScenario(withPanes = true): number {
  const id = nextId++
  getScenarioGanttStore(id).setState({ data: seedData() })
  const layout = getScenarioLayoutStore(id).getState()
  layout.reset() // seeds roster-1 + pairing-1
  if (!withPanes) {
    // Close both default panes so the helpers find no target.
    getScenarioLayoutStore(id).getState().closePane('pairing-1')
    getScenarioLayoutStore(id).getState().closePane('roster-1')
  }
  return id
}

describe('scenario-find-helpers', () => {
  it('scenarioLocatePairing: floats pairing id on the pairing pane + scrolls to top', () => {
    const id = freshScenario()
    const beforeRenderRevision = getScenarioGanttStore(id).getState().renderRevision
    getScenarioLayoutStore(id).getState().setScrollY('pairing-1', 500)
    expect(scenarioLocatePairing(id, 100)).toBe(true)
    const pane = getScenarioLayoutStore(id).getState().panes.get('pairing-1')!
    expect(pane.foundCrewIds).toEqual(['100'])
    expect(pane.scrollY).toBe(0)
    expect(getScenarioGanttStore(id).getState().renderRevision).toBe(beforeRenderRevision + 1)
  })

  it('scenarioFindCrewByPairing: resolves unique crew on the roster pane', () => {
    const id = freshScenario()
    expect(scenarioFindCrewByPairing(id, 100)).toBe(true)
    const pane = getScenarioLayoutStore(id).getState().panes.get('roster-1')!
    expect(pane.foundCrewIds.sort()).toEqual(['A', 'B'])
    expect(pane.scrollY).toBe(0)
  })

  it('scenarioFindCrewByFlight: flight → segments → pairings → assignments → crew', () => {
    const id = freshScenario()
    // flight 11 ∈ pairing 100 → crew A, B
    expect(scenarioFindCrewByFlight(id, 11)).toBe(true)
    const pane = getScenarioLayoutStore(id).getState().panes.get('roster-1')!
    expect(pane.foundCrewIds.sort()).toEqual(['A', 'B'])
  })

  it('scenarioFindPairingByFlight: flight → containing pairing(s) on the pairing pane', () => {
    const id = freshScenario()
    // flight 22 ∈ pairing 200
    expect(scenarioFindPairingByFlight(id, 22)).toBe(true)
    const pane = getScenarioLayoutStore(id).getState().panes.get('pairing-1')!
    expect(pane.foundCrewIds).toEqual(['200'])
  })

  it('scenarioLocateFlight: floats flight id on the flight pane + scrolls to top', () => {
    const id = freshScenario()
    expect(getScenarioLayoutStore(id).getState().addPane('flight')).toBe('flight-1')
    getScenarioLayoutStore(id).getState().setScrollY('flight-1', 400)
    expect(scenarioLocateFlight(id, 11)).toBe(true)
    const pane = getScenarioLayoutStore(id).getState().panes.get('flight-1')!
    expect(pane.foundCrewIds).toEqual(['11'])
    expect(pane.scrollY).toBe(0)
  })

  it('returns false (no-op) when the target pane is absent from the layout', () => {
    const id = freshScenario(false)
    expect(scenarioLocatePairing(id, 100)).toBe(false)
    expect(scenarioLocateFlight(id, 11)).toBe(false)
    expect(scenarioFindCrewByPairing(id, 100)).toBe(false)
    expect(scenarioFindCrewByFlight(id, 11)).toBe(false)
    expect(scenarioFindPairingByFlight(id, 22)).toBe(false)
  })

  it('returns false when nothing resolves (unknown id)', () => {
    const id = freshScenario()
    expect(scenarioFindCrewByPairing(id, 999)).toBe(false)
    expect(scenarioFindCrewByFlight(id, 999)).toBe(false)
    expect(scenarioFindPairingByFlight(id, 999)).toBe(false)
  })

  it('scenarioHasPaneType gates on the current layout', () => {
    const present = freshScenario()
    expect(scenarioHasPaneType(present, 'roster')).toBe(true)
    expect(scenarioHasPaneType(present, 'pairing')).toBe(true)
    const empty = freshScenario(false)
    expect(scenarioHasPaneType(empty, 'roster')).toBe(false)
    expect(scenarioHasPaneType(empty, 'pairing')).toBe(false)
  })
})
