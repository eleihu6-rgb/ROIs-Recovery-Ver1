import { beforeEach, describe, expect, it, vi } from 'vitest'

type FakeMessageEvent = { data: string }
type FakeCloseEvent = { code: number }

class FakeWebSocket {
  static OPEN = 1

  readonly url: string
  readonly sent: string[] = []
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((event: FakeMessageEvent) => void) | null = null
  onclose: ((event: FakeCloseEvent) => void) | null = null
  onerror: (() => void) | null = null

  constructor(url: string) {
    this.url = url
    fakeSockets.push(this)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(code = 1000): void {
    this.readyState = 3
    this.onclose?.({ code })
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }
}

let fakeSockets: FakeWebSocket[] = []

describe('wsClient auth handshake', () => {
  beforeEach(() => {
    vi.resetModules()
    fakeSockets = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
    vi.useRealTimers()
  })

  it('sends JWT authentication before subscribing after server ack', async () => {
    const { wsClient } = await import('../ws')

    wsClient.connect('f8', 'Ryan', 'jwt-token')
    expect(fakeSockets).toHaveLength(1)

    fakeSockets[0].open()

    expect(fakeSockets[0].sent.map((payload) => JSON.parse(payload) as Record<string, unknown>)).toEqual([
      { type: 'authenticate', token: 'jwt-token' },
    ])

    fakeSockets[0].onmessage?.({ data: JSON.stringify({ type: 'authenticated' }) })

    expect(fakeSockets[0].sent.map((payload) => JSON.parse(payload) as Record<string, unknown>)).toEqual([
      { type: 'authenticate', token: 'jwt-token' },
      { type: 'subscribe' },
    ])

    wsClient.disconnect()
  })

  it('does not reconnect after an authentication policy close', async () => {
    vi.useFakeTimers()
    const { wsClient } = await import('../ws')

    wsClient.connect('f8', 'Ryan', 'expired-token')
    fakeSockets[0].open()
    fakeSockets[0].close(1008)

    vi.advanceTimersByTime(1_000)

    expect(fakeSockets).toHaveLength(1)
  })
})
