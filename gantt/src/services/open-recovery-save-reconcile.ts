import { pairingApi } from './pairing-api'
import { useDraftStore } from '@/stores/draft-store'
import { usePairingStore } from '@/stores/pairing-store'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { notify } from '@/utils/notify'

/** Reconcile only this recovery's pairings after normal Save, including a newly full target.
 * List/coverage filters may omit that target; the saved detail is authoritative.
 * No subscription is installed for legacy recovery cases.
 */
export function reconcileOpenRecoveryAfterSave(pairingIds: number[]): void {
  const ids = [...new Set(pairingIds)]
  const unsubscribe = useDraftStore.subscribe((state, previous) => {
    if (state.saving || state.operations.length > 0) return
    unsubscribe()
    if (!previous.saving) return // Undo / discard, not a successful Save.
    void waitForPairingList().then(() => Promise.all(ids.map(async id => {
      const detail = await pairingApi.getDetail(id)
      if (!usePairingStore.getState().items.some(item => item.pairing.id === id)) return
      usePairingStore.getState().addItems([{ ...detail.pairing, segments: detail.segments }])
    }))).then(() => useGanttViewStore.getState().markDirty()).catch(() => {
      notify.warning('Roster saved. Refresh the Pairing pane to update recovery coverage.')
    })
  })
}

/** The own-save WS list request can still be in flight when Save finishes.
 * Reconcile after that request, otherwise its older list snapshot overwrites
 * the freshly saved full-seat detail. This wait is scoped to Case 4 only.
 */
function waitForPairingList(): Promise<void> {
  if (!usePairingStore.getState().loading) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { stop(); reject(new Error('Pairing list refresh timed out')) }, 30000)
    const stop = usePairingStore.subscribe(state => {
      if (!state.loading) { clearTimeout(timeout); stop(); resolve() }
    })
  })
}
