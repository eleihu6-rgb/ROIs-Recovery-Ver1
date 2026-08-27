import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * findPairingsByFlight (spec 2026-06-11-find-by-flight, Part 2 feature).
 *
 * Floats the pairing(s) that use a flight to the top of the pairing pane. Pairings
 * hidden by the current filter (not loaded) are force-loaded via getDetail, and the
 * user is told via notify.info — but only when something was actually force-loaded.
 */

const h = vi.hoisted(() => {
  const store = {
    items: [] as Array<{ pairing: { id: number; schStrDtUtc?: string } }>,
    addItems: vi.fn(),
  }
  const filterState = {
    dateRange: { start: new Date('2026-06-01T00:00:00Z'), end: new Date('2026-07-31T23:59:59Z') },
    setDateRange: vi.fn((start: Date, end: Date) => { filterState.dateRange = { start, end } }),
  }
  return {
    store,
    filterState,
    notify: { info: vi.fn(), error: vi.fn() },
    flightApi: { getPairingIds: vi.fn() },
    pairingApi: { getDetail: vi.fn() },
    paneStore: { addFoundCrewIds: vi.fn() },
    layoutStore: { grid: [] as string[][], panes: new Map(), setViewport: vi.fn() },
    ganttViewStore: { markDirty: vi.fn(), setScrollX: vi.fn(), pxPerHour: 7 },
    applyGanttFilters: vi.fn(async () => {}),
  }
})
const { notify, flightApi, pairingApi, store, paneStore, filterState } = h

vi.mock('@/utils/notify', () => ({ notify: h.notify }))
vi.mock('@/services/flight-api', () => ({ flightApi: h.flightApi }))
vi.mock('@/services/pairing-api', () => ({ pairingApi: h.pairingApi }))
vi.mock('@/stores/pairing-store', () => ({ usePairingStore: { getState: () => h.store } }))
vi.mock('@/stores/pane-store', () => ({ usePaneStore: { getState: () => h.paneStore } }))
vi.mock('@/stores/layout-store', () => ({ useLayoutStore: { getState: () => h.layoutStore } }))
vi.mock('@/stores/gantt-view-store', () => ({ useGanttViewStore: { getState: () => h.ganttViewStore } }))
vi.mock('@/stores/filter-store', () => ({ useFilterStore: { getState: () => h.filterState } }))
vi.mock('@/utils/apply-filters', () => ({ applyGanttFilters: h.applyGanttFilters }))
vi.mock('@/components/gantt/gantt-utils', () => ({ timeToX: () => 0 }))
// Other stores imported by the module but unused by findPairingsByFlight.
vi.mock('@/stores/crew-store', () => ({ useCrewStore: { getState: () => ({}) } }))
vi.mock('@/stores/roster-store', () => ({ useRosterStore: { getState: () => ({}) } }))

import { findPairingsByFlight } from '../bring-matches-to-top'

describe('findPairingsByFlight', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    store.items = []
    filterState.dateRange = { start: new Date('2026-06-01T00:00:00Z'), end: new Date('2026-07-31T23:59:59Z') }
  })

  it('reports "This flight has no pairing" when no pairing uses the flight', async () => {
    flightApi.getPairingIds.mockResolvedValue({ pairingIds: [] })

    await findPairingsByFlight(42)

    expect(notify.info).toHaveBeenCalledWith('This flight has no pairing')
    expect(paneStore.addFoundCrewIds).not.toHaveBeenCalled()
  })

  it('floats an already-loaded pairing to the top WITHOUT a toast (nothing was hidden)', async () => {
    store.items = [{ pairing: { id: 100 } }]
    flightApi.getPairingIds.mockResolvedValue({ pairingIds: [100] })

    await findPairingsByFlight(42)

    expect(pairingApi.getDetail).not.toHaveBeenCalled()
    expect(paneStore.addFoundCrewIds).toHaveBeenCalledWith('pairing', ['100'])
    expect(notify.info).not.toHaveBeenCalled()
  })

  it('force-loads a hidden pairing, floats it to the top, AND toasts', async () => {
    store.items = [{ pairing: { id: 100 } }] // 200 is NOT loaded
    flightApi.getPairingIds.mockResolvedValue({ pairingIds: [100, 200] })
    pairingApi.getDetail.mockResolvedValue({ pairing: { id: 200 } })

    await findPairingsByFlight(42)

    expect(pairingApi.getDetail).toHaveBeenCalledWith(200)
    expect(store.addItems).toHaveBeenCalledWith([{ id: 200 }])
    expect(paneStore.addFoundCrewIds).toHaveBeenCalledWith('pairing', ['100', '200'])
    expect(notify.info).toHaveBeenCalledWith('Pairing not in the current filter — added to the Gantt anyway')
  })

  it('jumps the timeline (extends the date range + reloads) when the pairing is OUTSIDE the range', async () => {
    // Pairing 200 is dated Jan 2026, but the view is Jun–Jul → floating it to the top
    // can't make it visible. The function extends the range to include it and reloads.
    store.items = [{ pairing: { id: 200, schStrDtUtc: '2026-01-12T00:57:00Z' } }]
    flightApi.getPairingIds.mockResolvedValue({ pairingIds: [200] })

    await findPairingsByFlight(42)

    expect(filterState.setDateRange).toHaveBeenCalledTimes(1)
    const [newStart, newEnd] = filterState.setDateRange.mock.calls[0]
    // Start extended back to ~Jan 10 (target − 2 days, day-floored); end kept.
    expect((newStart as Date).toISOString()).toBe('2026-01-10T00:00:00.000Z')
    expect((newEnd as Date).toISOString()).toBe('2026-07-31T23:59:59.000Z')
    expect(h.applyGanttFilters).toHaveBeenCalledTimes(1)
    expect(paneStore.addFoundCrewIds).toHaveBeenCalledWith('pairing', ['200'])
    expect(notify.info).toHaveBeenCalledWith('Jumped the timeline to show this flight\'s pairing (2026-01-12)')
  })

  it('does NOT jump when the pairing is already within the date range', async () => {
    store.items = [{ pairing: { id: 100, schStrDtUtc: '2026-06-15T08:00:00Z' } }]
    flightApi.getPairingIds.mockResolvedValue({ pairingIds: [100] })

    await findPairingsByFlight(42)

    expect(filterState.setDateRange).not.toHaveBeenCalled()
    expect(h.applyGanttFilters).not.toHaveBeenCalled()
    expect(h.ganttViewStore.setScrollX).toHaveBeenCalled() // in-range → horizontal scroll instead
    expect(paneStore.addFoundCrewIds).toHaveBeenCalledWith('pairing', ['100'])
  })

  it('reports an error when the pairing lookup fails', async () => {
    flightApi.getPairingIds.mockRejectedValue(new Error('boom'))

    await findPairingsByFlight(42)

    expect(notify.error).toHaveBeenCalledWith('Failed to find pairing')
    expect(paneStore.addFoundCrewIds).not.toHaveBeenCalled()
  })

  it('local-first: finds the pairing from loaded segments without calling getPairingIds', async () => {
    store.items = [
      { pairing: { id: 555, schStrDtUtc: '2026-06-10T08:00:00Z' }, segments: [{ fltId: 42 }] } as never,
    ]

    await findPairingsByFlight(42)

    expect(flightApi.getPairingIds).not.toHaveBeenCalled() // derived locally
    expect(pairingApi.getDetail).not.toHaveBeenCalled()    // already loaded, no force-load
  })
})
