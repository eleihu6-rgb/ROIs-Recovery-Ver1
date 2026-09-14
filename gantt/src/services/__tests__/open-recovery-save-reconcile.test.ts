import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ subscribe: vi.fn(), pairingSubscribe: vi.fn(), loading: false, detail: vi.fn(), add: vi.fn(), dirty: vi.fn(), warn: vi.fn() }))
vi.mock('@/stores/draft-store', () => ({ useDraftStore: { subscribe: mocks.subscribe } }))
vi.mock('@/stores/pairing-store', () => ({ usePairingStore: { subscribe: mocks.pairingSubscribe, getState: () => ({ loading: mocks.loading, items: [{ pairing: { id: 42 } }], addItems: mocks.add }) } }))
vi.mock('@/stores/gantt-view-store', () => ({ useGanttViewStore: { getState: () => ({ markDirty: mocks.dirty }) } }))
vi.mock('@/utils/notify', () => ({ notify: { warning: mocks.warn } }))
vi.mock('../pairing-api', () => ({ pairingApi: { getDetail: mocks.detail } }))
import { reconcileOpenRecoveryAfterSave } from '../open-recovery-save-reconcile'

describe('Case 4 saved coverage reconciliation', () => {
  let listener: (state: {saving:boolean;operations: unknown[]}, previous: {saving:boolean}) => void
  let unsubscribe: ReturnType<typeof vi.fn>
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.loading = false
    unsubscribe = vi.fn()
    mocks.subscribe.mockImplementation(fn => { listener = fn; return unsubscribe })
    mocks.detail.mockResolvedValue({ pairing: { id: 42, composition: [{ rank: 'FO', plan: 1, fill: 1 }] }, segments: [] })
  })
  it('refreshes only registered pairing details after successful Save finishes', async () => {
    reconcileOpenRecoveryAfterSave([42, 42])
    listener({ saving: true, operations: [] }, { saving: true })
    expect(mocks.detail).not.toHaveBeenCalled()
    listener({ saving: false, operations: [] }, { saving: true })
    await vi.waitFor(() => expect(mocks.add).toHaveBeenCalledWith([expect.objectContaining({ id: 42 })]))
    expect(mocks.detail).toHaveBeenCalledExactlyOnceWith(42)
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
  it('waits for the own-save list refresh before applying authoritative detail', async () => {
    mocks.loading = true
    const stop = vi.fn()
    let loaded: (state: {loading:boolean}) => void = () => {}
    mocks.pairingSubscribe.mockImplementation(fn => { loaded = fn; return stop })
    reconcileOpenRecoveryAfterSave([42])
    listener({ saving: false, operations: [] }, { saving: true })
    expect(mocks.detail).not.toHaveBeenCalled()
    loaded({ loading: false })
    await vi.waitFor(() => expect(mocks.detail).toHaveBeenCalledWith(42))
    expect(stop).toHaveBeenCalledOnce()
  })

  it('does not fetch after Undo/discard or during failed Save with retained ops', () => {
    reconcileOpenRecoveryAfterSave([42])
    listener({ saving: false, operations: [{}] }, { saving: true })
    expect(unsubscribe).not.toHaveBeenCalled()
    listener({ saving: false, operations: [] }, { saving: false })
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(mocks.detail).not.toHaveBeenCalled()
  })
  it('reports a saved-state refresh failure without replaying the save', async () => {
    mocks.detail.mockRejectedValue(new Error('offline'))
    reconcileOpenRecoveryAfterSave([42])
    listener({ saving: false, operations: [] }, { saving: true })
    await vi.waitFor(() => expect(mocks.warn).toHaveBeenCalled())
    expect(mocks.add).not.toHaveBeenCalled()
  })
})
