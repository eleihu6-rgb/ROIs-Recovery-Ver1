import { describe, it, expect } from 'vitest'
import {
  getScenarioLayoutStore,
  destroyScenarioLayoutStore,
  type ScenarioPaneType,
} from '@/stores/scenario-layout-store'

// Each test uses a unique scenarioId so the registry store starts fresh.
let nextId = 900_000
const freshId = (): number => nextId++

const paneTypes = (id: number): ScenarioPaneType[] =>
  [...getScenarioLayoutStore(id).getState().panes.values()].map((p) => p.type)

const gridIds = (id: number): string[] =>
  getScenarioLayoutStore(id)
    .getState()
    .grid.flat()
    .filter((c): c is string => c !== null)

describe('applyCapabilityDefaults', () => {
  it('first apply (PO) rebuilds to pairing + flight, no roster', () => {
    const id = freshId()
    const store = getScenarioLayoutStore(id)
    store.getState().applyCapabilityDefaults({
      panes: ['pairing', 'flight'],
      defaultPanes: ['pairing', 'flight'],
    })

    expect(paneTypes(id).sort()).toEqual(['flight', 'pairing'])
    expect(paneTypes(id)).not.toContain('roster')
    // Order preserved, stable ids, one pane per row.
    expect(gridIds(id)).toEqual(['pairing-1', 'flight-1'])
    expect(store.getState().panes.has('pairing-1')).toBe(true)
    expect(store.getState().panes.has('flight-1')).toBe(true)
    expect(store.getState().capabilitiesApplied).toBe(true)
    expect(store.getState().counters).toEqual({ roster: 0, pairing: 1, flight: 1 })
    expect(store.getState().rowHeights).toEqual([-1, -1])
    destroyScenarioLayoutStore(id)
  })

  it('first apply (RO) shows roster + pairing default, flight allowed-but-not-shown', () => {
    const id = freshId()
    const store = getScenarioLayoutStore(id)
    store.getState().applyCapabilityDefaults({
      panes: ['roster', 'pairing', 'flight'],
      defaultPanes: ['roster', 'pairing'],
    })

    expect(gridIds(id)).toEqual(['roster-1', 'pairing-1'])
    expect(paneTypes(id)).not.toContain('flight')
    expect(store.getState().allowedPanes).toEqual(['roster', 'pairing', 'flight'])
    // flight is allowed → addPane succeeds.
    const newId = store.getState().addPane('flight')
    expect(newId).toBe('flight-1')
    expect(paneTypes(id)).toContain('flight')
    destroyScenarioLayoutStore(id)
  })

  it('second apply does NOT reset a user-customized layout (idempotent on flag)', () => {
    const id = freshId()
    const store = getScenarioLayoutStore(id)
    const caps = {
      panes: ['roster', 'pairing', 'flight'] as ScenarioPaneType[],
      defaultPanes: ['roster', 'pairing'] as ScenarioPaneType[],
    }
    store.getState().applyCapabilityDefaults(caps)
    // User adds flight.
    store.getState().addPane('flight')
    expect(paneTypes(id)).toContain('flight')

    // Data reloads with the same caps → must NOT rebuild away the user's flight pane.
    store.getState().applyCapabilityDefaults(caps)
    expect(paneTypes(id)).toContain('flight')
    expect(gridIds(id)).toEqual(['roster-1', 'pairing-1', 'flight-1'])
    destroyScenarioLayoutStore(id)
  })

  it('apply with a narrower allowed set closes an open disallowed pane', () => {
    const id = freshId()
    const store = getScenarioLayoutStore(id)
    // Start RO-like: roster + pairing open.
    store.getState().applyCapabilityDefaults({
      panes: ['roster', 'pairing', 'flight'],
      defaultPanes: ['roster', 'pairing'],
    })
    expect(paneTypes(id)).toContain('roster')

    // Reload with a capability set that no longer allows roster → roster pane closes.
    store.getState().applyCapabilityDefaults({
      panes: ['pairing', 'flight'],
      defaultPanes: ['pairing', 'flight'],
    })
    expect(paneTypes(id)).not.toContain('roster')
    expect(gridIds(id)).toEqual(['pairing-1'])
    expect(store.getState().allowedPanes).toEqual(['pairing', 'flight'])
    // addPane('roster') now rejected by the guard.
    expect(store.getState().addPane('roster')).toBeNull()
    destroyScenarioLayoutStore(id)
  })

  it('reset + re-apply restores the PO capability default (no forbidden roster pane)', () => {
    const id = freshId()
    const store = getScenarioLayoutStore(id)
    const poCaps = {
      panes: ['pairing', 'flight'] as ScenarioPaneType[],
      defaultPanes: ['pairing', 'flight'] as ScenarioPaneType[],
    }
    // Apply PO caps → pairing + flight, no roster.
    store.getState().applyCapabilityDefaults(poCaps)
    expect(gridIds(id)).toEqual(['pairing-1', 'flight-1'])
    expect(paneTypes(id)).not.toContain('roster')

    // Reset (the toolbar Reset button) → hardcoded roster + pairing default, flag cleared.
    store.getState().reset()
    expect(paneTypes(id)).toContain('roster')
    expect(store.getState().capabilitiesApplied).toBe(false)

    // Re-apply PO caps (what the fixed reset handler does) → fresh first-rebuild back to
    // pairing + flight, the forbidden roster pane is gone again.
    store.getState().applyCapabilityDefaults(poCaps)
    expect(gridIds(id)).toEqual(['pairing-1', 'flight-1'])
    expect(paneTypes(id).sort()).toEqual(['flight', 'pairing'])
    expect(paneTypes(id)).not.toContain('roster')
    expect(store.getState().allowedPanes).toEqual(['pairing', 'flight'])
    destroyScenarioLayoutStore(id)
  })

  it('empty defaultPanes (TO) produces an empty-but-valid grid', () => {
    const id = freshId()
    const store = getScenarioLayoutStore(id)
    store.getState().applyCapabilityDefaults({ panes: [], defaultPanes: [] })

    expect(store.getState().panes.size).toBe(0)
    // Grid is valid (renderable: nonEmptyRows filters it out) and contains no pane ids.
    expect(gridIds(id)).toEqual([])
    expect(store.getState().capabilitiesApplied).toBe(true)
    destroyScenarioLayoutStore(id)
  })

  it('closing the last open pane leaves an empty placeholder grid, not a ghost pane id', () => {
    const id = freshId()
    const store = getScenarioLayoutStore(id)
    store.getState().applyCapabilityDefaults({
      panes: ['roster', 'pairing', 'flight'],
      defaultPanes: ['roster', 'pairing'],
    })

    store.getState().closePane('roster-1')
    store.getState().closePane('pairing-1')

    expect(store.getState().panes.size).toBe(0)
    expect(store.getState().grid).toEqual([[null, null]])
    expect(gridIds(id)).toEqual([])
    destroyScenarioLayoutStore(id)
  })

  it('reopening from the empty placeholder row reuses row 0 so one pane fills the layout', () => {
    const id = freshId()
    const store = getScenarioLayoutStore(id)
    store.getState().applyCapabilityDefaults({
      panes: ['roster', 'pairing', 'flight'],
      defaultPanes: ['roster', 'pairing'],
    })

    store.getState().closePane('roster-1')
    store.getState().closePane('pairing-1')
    const reopenedId = store.getState().addPane('roster')

    expect(reopenedId).toBe('roster-2')
    expect(store.getState().grid).toEqual([['roster-2', null]])
    expect(gridIds(id)).toEqual(['roster-2'])
    expect(paneTypes(id)).toEqual(['roster'])
    destroyScenarioLayoutStore(id)
  })

  it('reorders panes to roster then pairing when reopened in reverse order', () => {
    const id = freshId()
    const store = getScenarioLayoutStore(id)
    store.getState().applyCapabilityDefaults({
      panes: ['roster', 'pairing', 'flight'],
      defaultPanes: ['roster', 'pairing'],
    })

    store.getState().closePane('roster-1')
    store.getState().closePane('pairing-1')

    const pairingId = store.getState().addPane('pairing')
    const rosterId = store.getState().addPane('roster')

    expect(pairingId).toBe('pairing-2')
    expect(rosterId).toBe('roster-2')
    expect(store.getState().grid).toEqual([['roster-2', null], ['pairing-2', null]])
    expect(gridIds(id)).toEqual(['roster-2', 'pairing-2'])
    destroyScenarioLayoutStore(id)
  })

  it('keeps canonical roster → pairing → flight order regardless of add order', () => {
    const id = freshId()
    const store = getScenarioLayoutStore(id)
    store.getState().applyCapabilityDefaults({
      panes: ['roster', 'pairing', 'flight'],
      defaultPanes: ['roster', 'pairing'],
    })

    store.getState().closePane('roster-1')
    store.getState().closePane('pairing-1')

    const flightId = store.getState().addPane('flight')
    const pairingId = store.getState().addPane('pairing')
    const rosterId = store.getState().addPane('roster')

    expect(flightId).toBe('flight-1')
    expect(pairingId).toBe('pairing-2')
    expect(rosterId).toBe('roster-2')
    expect(store.getState().grid).toEqual([
      ['roster-2', null],
      ['pairing-2', null],
      ['flight-1', null],
    ])
    destroyScenarioLayoutStore(id)
  })

  it('normalizes movePane back to canonical order', () => {
    const id = freshId()
    const store = getScenarioLayoutStore(id)
    store.getState().applyCapabilityDefaults({
      panes: ['roster', 'pairing', 'flight'],
      defaultPanes: ['roster', 'pairing'],
    })
    store.getState().addPane('flight')

    store.getState().movePane('flight-1', 0, 0, 'top')

    expect(store.getState().grid).toEqual([
      ['roster-1', null],
      ['pairing-1', null],
      ['flight-1', null],
    ])
    destroyScenarioLayoutStore(id)
  })
})
