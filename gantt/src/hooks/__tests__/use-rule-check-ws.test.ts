import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const handlers: Array<(msg: Record<string, unknown>) => void> = []
const sent: Record<string, unknown>[] = []

vi.mock('@/services/ws', () => ({
  wsClient: {
    onMessage: (handler: (msg: Record<string, unknown>) => void) => {
      handlers.push(handler)
      return () => {
        const i = handlers.indexOf(handler)
        if (i >= 0) handlers.splice(i, 1)
      }
    },
    send: (msg: Record<string, unknown>) => {
      sent.push(msg)
    },
  },
}))

vi.mock('@/stores/rule-check-store', () => {
  const state = {
    applyWsPairingUpdate: vi.fn(),
    applyWsRosterUpdate: vi.fn(),
    ruleGroupCode: '',
  }
  const useRuleCheckStore = Object.assign(
    (selector: (s: typeof state) => unknown) => selector(state),
    { getState: () => state },
  )
  return { useRuleCheckStore }
})

describe('useRuleCheckWs', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    handlers.length = 0
    sent.length = 0
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('re-joins the effective ruleset after WS authenticated/connected', async () => {
    const { useRuleCheckWs } = await import('../use-rule-check-ws')
    const Probe = () => {
      useRuleCheckWs()
      return null
    }
    await act(async () => {
      root.render(React.createElement(Probe))
    })
    expect(handlers).toHaveLength(1)

    act(() => {
      handlers[0]!({ type: 'authenticated' })
    })
    expect(sent).toEqual([{ type: 'set_rule_group', groupCode: '103' }])

    sent.length = 0
    act(() => {
      handlers[0]!({ type: 'connected', lastEventId: 0 })
    })
    expect(sent).toEqual([{ type: 'set_rule_group', groupCode: '103' }])
  })
})
