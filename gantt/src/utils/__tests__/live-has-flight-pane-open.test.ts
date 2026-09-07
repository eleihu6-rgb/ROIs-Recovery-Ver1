import { beforeEach, describe, expect, it } from 'vitest'
import { liveHasFlightPaneOpen } from '../bring-matches-to-top'
import { useLayoutStore } from '@/stores/layout-store'
import { usePaneStore } from '@/stores/pane-store'

describe('liveHasFlightPaneOpen', () => {
  beforeEach(() => {
    useLayoutStore.getState().resetLayout()
    usePaneStore.setState({
      panes: [
        { type: 'roster-main', visible: true, height: 300, minHeight: 150, floating: false },
        { type: 'roster-sub', visible: false, height: 250, minHeight: 150, floating: false },
        { type: 'pairing', visible: true, height: 250, minHeight: 120, floating: false },
        { type: 'flight', visible: false, height: 250, minHeight: 120, floating: false },
      ],
    })
  })

  it('is false when neither layout-store nor pane-store has a flight pane', () => {
    expect(liveHasFlightPaneOpen()).toBe(false)
  })

  it('is true when layout-store has a flight pane even if pane-store.flight.visible is false', () => {
    useLayoutStore.getState().addPane('flight')
    expect(usePaneStore.getState().panes.find((p) => p.type === 'flight')?.visible).toBe(false)
    expect(liveHasFlightPaneOpen()).toBe(true)
  })

  it('falls back to legacy pane-store.flight.visible', () => {
    usePaneStore.getState().setVisible('flight', true)
    expect(liveHasFlightPaneOpen()).toBe(true)
  })
})
