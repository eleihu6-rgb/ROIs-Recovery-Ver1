import { afterEach, describe, expect, it } from 'vitest'
import { useUiStore } from '@/stores/ui-store'

afterEach(() => {
  useUiStore.getState().closePairingInfo()
})

describe('pairing info crew selection', () => {
  it('locks the crew when opened from a roster entry', () => {
    useUiStore.getState().openPairingInfo(10, 7, 'C2')

    expect(useUiStore.getState().pairingInfoCrewId).toBe('C2')
    expect(useUiStore.getState().pairingInfoCrewLocked).toBe(true)
  })

  it('starts un locked so pairing-pane entry can choose a crew', () => {
    useUiStore.getState().openPairingInfo(10, 7)

    expect(useUiStore.getState().pairingInfoCrewId).toBeNull()
    expect(useUiStore.getState().pairingInfoCrewLocked).toBe(false)
  })

  it('allows the dialog to change the selected crew only for pairing-pane entry', () => {
    useUiStore.getState().openPairingInfo(10, 7)
    useUiStore.getState().setPairingInfoCrewId('C2')
    expect(useUiStore.getState().pairingInfoCrewId).toBe('C2')

    useUiStore.getState().openPairingInfo(10, 7, 'C1')
    useUiStore.getState().setPairingInfoCrewId('C2')
    expect(useUiStore.getState().pairingInfoCrewId).toBe('C1')
  })
})
