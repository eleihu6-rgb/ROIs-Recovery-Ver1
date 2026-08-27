import { describe, expect, it, beforeEach } from 'vitest'
import { usePairingStore } from '../pairing-store'
import type { PairingItem } from '@/types/pairing'
import type { RosterItem } from '@/types/roster'

const pairingItem = (): PairingItem => ({
  pairing: {
    id: 42,
    composition: [{ rank: 'CA', plan: 2, fill: 1 }],
    isFull: false,
  } as PairingItem['pairing'],
  flights: [],
  segments: [],
  sessionTags: [],
})

const rosterItem = (id: number, crewId: string, pairingId: number | null, rank = 'CA'): RosterItem =>
  ({
    id,
    crewId,
    pairingId,
    rosterActingRank: rank,
    flightActingRank: rank,
    activeRank: rank,
  }) as RosterItem

describe('pairing-store draft coverage', () => {
  beforeEach(() => {
    const item = pairingItem()
    usePairingStore.setState({
      items: [item],
      authoritativeComposition: new Map([[42, item.pairing.composition.map((slot) => ({ ...slot }))]]),
    })
  })

  it('counts a crew once when a pairing has multiple roster segments', () => {
    const base = [rosterItem(1, 'C1', 42)]
    const displayed = [...base, rosterItem(2, 'C1', 42)]

    usePairingStore.getState().refreshDraftCoverage(base, displayed)

    expect(usePairingStore.getState().items[0].pairing.composition[0].fill).toBe(1)
  })

  it('applies remove and undo deltas idempotently', () => {
    const base = [rosterItem(1, 'C1', 42)]
    const removed: RosterItem[] = []

    usePairingStore.getState().refreshDraftCoverage(base, removed)
    expect(usePairingStore.getState().items[0].pairing.composition[0].fill).toBe(0)

    usePairingStore.getState().refreshDraftCoverage(base, base)
    expect(usePairingStore.getState().items[0].pairing.composition[0].fill).toBe(1)
  })

  it('promotes the saved fill so a later zero-delta refresh does not revert it', () => {
    const base = [rosterItem(1, 'C1', 42)]
    const added = [...base, rosterItem(2, 'C2', 42)]

    usePairingStore.getState().refreshDraftCoverage(base, added)
    usePairingStore.getState().promoteDraftCoverage()
    usePairingStore.getState().refreshDraftCoverage(added, added)

    expect(usePairingStore.getState().items[0].pairing.composition[0].fill).toBe(2)
  })

  it('does not double-count when server fill lags (stale fill, fresh roster → fill=count, clamped to plan)', () => {
    // Stale server: pairing.composition[0].fill=1 but roster has 0 CA assigned.
    // A fresh CA assignment (1 in displayed) must yield fill=1, NOT 1+1=2.
    const staleItem = {
      ...pairingItem(),
      pairing: {
        ...pairingItem().pairing,
        composition: [{ rank: 'CA', plan: 1, fill: 1 }],
      } as PairingItem['pairing'],
    }
    usePairingStore.setState({ items: [staleItem] })

    const base: RosterItem[] = []
    const displayed = [rosterItem(1, 'C1', 42, 'CA')]

    usePairingStore.getState().refreshDraftCoverage(base, displayed)

    expect(usePairingStore.getState().items[0].pairing.composition[0].fill).toBe(1)
  })

  it('clamps fill to plan even when many crews end up on one slot', () => {
    const base = [rosterItem(1, 'C1', 42, 'CA')]
    const displayed = [rosterItem(1, 'C1', 42, 'CA'), rosterItem(2, 'C2', 42, 'CA')]

    usePairingStore.getState().refreshDraftCoverage(base, displayed)

    // plan=2, 2 distinct CA crews → fill=2 (full)
    expect(usePairingStore.getState().items[0].pairing.composition[0].fill).toBe(2)
  })

  it('skips roster rows with empty rank so they do not bump a slot', () => {
    const base: RosterItem[] = []
    // Placeholder-like item: rank missing entirely.
    const displayed = [rosterItem(1, 'C1', 42, '') as RosterItem]

    usePairingStore.getState().refreshDraftCoverage(base, displayed)

    expect(usePairingStore.getState().items[0].pairing.composition[0].fill).toBe(0)
  })
})

