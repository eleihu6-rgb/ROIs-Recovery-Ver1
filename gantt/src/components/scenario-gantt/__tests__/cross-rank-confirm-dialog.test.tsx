import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CrossRankConfirmProvider, useCrossRankConfirm } from '../cross-rank-confirm-dialog'

const Probe = ({ onResult }: { onResult: (v: boolean) => void }) => {
  const { confirmCrossRank } = useCrossRankConfirm()
  return (
    <button
      data-testid="ask"
      onClick={() => {
        void confirmCrossRank({ crewId: 'F80001', crewRank: 'FO', actingRank: 'CA', pairingLabel: 'P88' }).then(onResult)
      }}
    >
      ask
    </button>
  )
}

const click = (el: HTMLElement | null): void => {
  el?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

afterEach(() => {
  document.body.innerHTML = ''
})

const setup = (onResult: (v: boolean) => void) => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      <CrossRankConfirmProvider><Probe onResult={onResult} /></CrossRankConfirmProvider>,
    )
  })
  return { container, root }
}

describe('CrossRankConfirmProvider', () => {
  it('Confirm → resolve(true)，文案含 crew/acting rank', async () => {
    const onResult = vi.fn()
    const { container, root } = setup(onResult)

    await act(async () => {
      click(container.querySelector('[data-testid="ask"]'))
      await Promise.resolve()
    })
    // Radix Dialog portals to document.body
    expect(document.body.textContent).toContain('F80001')
    expect(document.body.textContent).toContain('acting as')
    expect(document.body.textContent).toContain('P88')

    await act(async () => {
      click(document.body.querySelector('[data-testid="cross-rank-confirm-btn"]'))
      await Promise.resolve()
    })
    expect(onResult).toHaveBeenCalledWith(true)
    await act(async () => { root.unmount() })
  })

  it('Cancel → resolve(false)，不分配', async () => {
    const onResult = vi.fn()
    const { container, root } = setup(onResult)

    await act(async () => {
      click(container.querySelector('[data-testid="ask"]'))
      await Promise.resolve()
    })
    await act(async () => {
      click(document.body.querySelector('[data-testid="cross-rank-cancel"]'))
      await Promise.resolve()
    })
    expect(onResult).toHaveBeenCalledWith(false)
    await act(async () => { root.unmount() })
  })
})
