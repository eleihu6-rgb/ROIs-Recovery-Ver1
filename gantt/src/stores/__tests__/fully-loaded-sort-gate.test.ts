import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Windowed first-paint: `fullyLoaded` lifecycle + sort gating (plan 2026-06-13).
 *
 * During windowed first-paint only the first N rows are loaded; client-side sort must NOT
 * run on that partial list. `applySort` waits for the background full load (`whenFullyLoaded`)
 * before reordering. Non-windowed paths keep `fullyLoaded=true`, so sort is immediate.
 */

vi.mock('@/services/crew-api', () => ({ crewApi: { list: vi.fn(), getCrewStats: vi.fn() } }))
vi.mock('@/services/pairing-api', () => ({ pairingApi: { list: vi.fn() } }))

import { useCrewStore } from '@/stores/crew-store'

const crewItem = (id: string) => ({ crew: { crewId: id }, sessionTags: [] }) as never
const ids = () => useCrewStore.getState().items.map((i) => i.crew.crewId)

beforeEach(() => {
  useCrewStore.setState({ items: [], fullyLoaded: true, sortBy: 'crew_id', sortOrder: 'asc' })
})

describe('fullyLoaded lifecycle', () => {
  it('starts true; markPartiallyLoaded → false; markFullyLoaded → true', () => {
    expect(useCrewStore.getState().fullyLoaded).toBe(true)
    useCrewStore.getState().markPartiallyLoaded()
    expect(useCrewStore.getState().fullyLoaded).toBe(false)
    useCrewStore.getState().markFullyLoaded()
    expect(useCrewStore.getState().fullyLoaded).toBe(true)
  })

  it('whenFullyLoaded resolves immediately when already loaded', async () => {
    let done = false
    await useCrewStore.getState().whenFullyLoaded().then(() => { done = true })
    expect(done).toBe(true)
  })

  it('whenFullyLoaded stays pending until markFullyLoaded', async () => {
    useCrewStore.getState().markPartiallyLoaded()
    let done = false
    const p = useCrewStore.getState().whenFullyLoaded().then(() => { done = true })
    await Promise.resolve()
    expect(done).toBe(false)        // still pending
    useCrewStore.getState().markFullyLoaded()
    await p
    expect(done).toBe(true)
  })
})

describe('applySort gating', () => {
  it('does NOT reorder until the full set is loaded, then sorts', async () => {
    useCrewStore.setState({ items: [crewItem('A'), crewItem('B')], sortBy: 'crew_id', sortOrder: 'asc' })
    useCrewStore.getState().markPartiallyLoaded()           // simulate windowed first-paint

    const sortP = useCrewStore.getState().applySort('crew_id', 'desc')
    await new Promise((r) => setTimeout(r, 0))
    expect(ids()).toEqual(['A', 'B'])                       // still waiting — not reordered

    useCrewStore.getState().markFullyLoaded()              // background full load finished
    await sortP
    expect(ids()).toEqual(['B', 'A'])                       // now sorted desc
  })

  it('sorts immediately when fullyLoaded (non-windowed path)', async () => {
    useCrewStore.setState({ items: [crewItem('A'), crewItem('B')], fullyLoaded: true })
    await useCrewStore.getState().applySort('crew_id', 'desc')
    expect(ids()).toEqual(['B', 'A'])
  })
})
