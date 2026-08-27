import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * findCrewToTop toast gate (spec 2026-06-11-find-by-flight, Part 1 fix).
 *
 * When crew assigned to the flight/pairing are NOT in the current roster selection
 * (filtered or paged out) they are force-added AND the user is told via notify.info.
 * Before the fix they were injected silently. The notice fires only when crew were
 * genuinely hidden (missing > 0) AND a roster view already existed (hadView), so the
 * very first crew load stays quiet. This test pins exactly that gate.
 */

const h = vi.hoisted(() => {
  const state = {
    selectedCrewIds: [] as string[],
    // Loaded roster rows for the local-first crew derivation (findCrewToTop reads these).
    rosterMain: [] as Array<{ crewId: string; fltId: number | null; pairingId: number | null }>,
  }
  return {
    state,
    notify: { info: vi.fn(), error: vi.fn() },
    crewStore: {
      get selectedCrewIds() { return state.selectedCrewIds },
      selectCrews: vi.fn((ids: string[]) => { state.selectedCrewIds = ids }),
      fetchCrewsByIds: vi.fn(async () => {}),
    },
    rosterStore: {
      appendRoster: vi.fn(async () => {}),
      get main() { return { rosterItems: state.rosterMain } },
      get sub() { return { rosterItems: [] } },
    },
    paneStore: {
      dateRange: { start: new Date('2026-06-01T00:00:00Z'), end: new Date('2026-06-07T00:00:00Z') },
      addFoundCrewIds: vi.fn(),
      clearRowSelection: vi.fn(),
      toggleRowSelection: vi.fn(),
    },
    layoutStore: { grid: [] as string[][], panes: new Map(), setViewport: vi.fn() },
    ganttViewStore: { markDirty: vi.fn() },
    flightApi: { getCrewList: vi.fn() },
    pairingApi: { getCrew: vi.fn() },
  }
})
const { notify, crewStore, paneStore, flightApi } = h

vi.mock('@/utils/notify', () => ({ notify: h.notify }))
vi.mock('@/services/flight-api', () => ({ flightApi: h.flightApi }))
vi.mock('@/services/pairing-api', () => ({ pairingApi: h.pairingApi }))
vi.mock('@/stores/crew-store', () => ({ useCrewStore: { getState: () => h.crewStore } }))
vi.mock('@/stores/roster-store', () => ({ useRosterStore: { getState: () => h.rosterStore } }))
vi.mock('@/stores/pane-store', () => ({ usePaneStore: { getState: () => h.paneStore } }))
vi.mock('@/stores/layout-store', () => ({ useLayoutStore: { getState: () => h.layoutStore } }))
vi.mock('@/stores/gantt-view-store', () => ({ useGanttViewStore: { getState: () => h.ganttViewStore } }))

import { findCrewToTop } from '../find-crew'

const flightCrew = (ids: string[]) => ({ items: ids.map((crewId) => ({ crewId })), composition: {}, status: 'full' })

describe('findCrewToTop — filter notice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.state.selectedCrewIds = []
    h.state.rosterMain = [] // empty roster → these toast-gate tests exercise the server fallback
  })

  it('toasts "not in the current filter" when flight crew were outside an existing view', async () => {
    h.state.selectedCrewIds = ['C001', 'C002'] // a roster view already exists
    flightApi.getCrewList.mockResolvedValue(flightCrew(['C900', 'C901'])) // both hidden

    await findCrewToTop('flight', 42, 'main')

    expect(crewStore.selectCrews).toHaveBeenCalledWith(['C001', 'C002', 'C900', 'C901'])
    expect(notify.info).toHaveBeenCalledTimes(1)
    expect(notify.info.mock.calls[0][0]).toMatch(/not in the current filter/i)
    // Count-aware: two hidden crew → "2 crew ..."
    expect(notify.info.mock.calls[0][0]).toMatch(/^2 crew/)
    expect(paneStore.addFoundCrewIds).toHaveBeenCalledWith('roster-main', ['C900', 'C901'])
  })

  it('uses singular "Crew" when exactly one crew was hidden', async () => {
    h.state.selectedCrewIds = ['C001']
    flightApi.getCrewList.mockResolvedValue(flightCrew(['C900']))

    await findCrewToTop('flight', 42, 'main')

    expect(notify.info.mock.calls[0][0]).toBe('Crew not in the current filter — added to the Gantt anyway')
  })

  it('stays silent when all flight crew are already in the current view (no missing)', async () => {
    h.state.selectedCrewIds = ['C001', 'C900', 'C901']
    flightApi.getCrewList.mockResolvedValue(flightCrew(['C900', 'C901'])) // both already present

    await findCrewToTop('flight', 42, 'main')

    expect(crewStore.selectCrews).not.toHaveBeenCalled()
    expect(notify.info).not.toHaveBeenCalled()
    expect(paneStore.addFoundCrewIds).toHaveBeenCalledWith('roster-main', ['C900', 'C901'])
  })

  it('stays silent on the first crew load (no prior view), even though crew are added', async () => {
    h.state.selectedCrewIds = [] // empty roster → hadView is false
    flightApi.getCrewList.mockResolvedValue(flightCrew(['C900', 'C901']))

    await findCrewToTop('flight', 42, 'main')

    expect(crewStore.selectCrews).toHaveBeenCalled()
    expect(notify.info).not.toHaveBeenCalled()
  })

  it('reports "No crew assigned" when the flight has no crew', async () => {
    h.state.selectedCrewIds = ['C001']
    flightApi.getCrewList.mockResolvedValue(flightCrew([]))

    await findCrewToTop('flight', 42, 'main')

    expect(notify.info).toHaveBeenCalledWith('No crew assigned')
    expect(paneStore.addFoundCrewIds).not.toHaveBeenCalled()
  })

  it('local-first: derives flight crew from the loaded roster without hitting the server', async () => {
    h.state.selectedCrewIds = ['C001']
    h.state.rosterMain = [
      { crewId: 'C900', fltId: 42, pairingId: 10 },
      { crewId: 'C901', fltId: 42, pairingId: 10 },
      { crewId: 'C902', fltId: 99, pairingId: 11 }, // different flight — excluded
    ]

    await findCrewToTop('flight', 42, 'main')

    expect(flightApi.getCrewList).not.toHaveBeenCalled()             // no server round-trip
    expect(paneStore.addFoundCrewIds).toHaveBeenCalledWith('roster-main', ['C900', 'C901'])
  })
})
