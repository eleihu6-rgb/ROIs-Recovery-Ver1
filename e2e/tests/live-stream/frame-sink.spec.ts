// Unit test for the live-stream frame sink — pure transport logic, no browser.
// Verifies the best-effort contract: inert without a URL, sends meta on open,
// forwards frames, drops under back-pressure, and never throws when the sink dies.

import { test, expect } from '@playwright/test'
import { createFrameSink, type MinimalSocket } from '../../utils/live-stream/frame-sink'

class FakeSocket implements MinimalSocket {
  sent: string[] = []
  bufferedAmount = 0
  closed = false
  throwOnSend = false
  private handlers: Record<string, Array<(...a: unknown[]) => void>> = {}

  constructor(public url: string) {}
  send(data: string): void {
    if (this.throwOnSend) throw new Error('socket broken')
    this.sent.push(data)
  }
  close(): void {
    this.closed = true
  }
  addEventListener(type: string, listener: (...a: unknown[]) => void): void {
    ;(this.handlers[type] ??= []).push(listener)
  }
  fire(type: string): void {
    for (const h of this.handlers[type] ?? []) h()
  }
  parsedTypes(): string[] {
    return this.sent.map((s) => JSON.parse(s).type)
  }
}

test('sink is inert without a URL (never constructs a socket)', () => {
  let constructed = false
  class Tracker extends FakeSocket {
    constructor(url: string) {
      super(url)
      constructed = true
    }
  }
  const sink = createFrameSink({ WebSocketImpl: Tracker as unknown as new (u: string) => MinimalSocket })
  // All methods must be safe no-ops.
  sink.meta({ kind: 'x' })
  sink.frame('AAAA')
  sink.end()
  sink.close()
  expect(constructed).toBe(false)
})

test('sends meta on open, then forwards frames', () => {
  let sock: FakeSocket | undefined
  class Cap extends FakeSocket {
    constructor(url: string) {
      super(url)
      sock = this
    }
  }
  const sink = createFrameSink({
    url: 'ws://x/ingest',
    kind: 'crewbids',
    title: 'YYC · CA',
    WebSocketImpl: Cap as unknown as new (u: string) => MinimalSocket,
  })
  // Before open, sends are dropped.
  sink.frame('EARLY')
  expect(sock!.sent).toHaveLength(0)

  sock!.fire('open')
  expect(JSON.parse(sock!.sent[0])).toMatchObject({ type: 'meta', kind: 'crewbids', title: 'YYC · CA' })

  sink.frame('Zm9v') // "foo"
  sink.page({ title: '/pairing' })
  expect(sock!.parsedTypes()).toEqual(['meta', 'frame', 'page'])
  expect(JSON.parse(sock!.sent[1])).toMatchObject({ type: 'frame', data: 'Zm9v' })
})

test('drops frames under back-pressure (bufferedAmount over cap)', () => {
  let sock: FakeSocket | undefined
  class Cap extends FakeSocket {
    constructor(url: string) {
      super(url)
      sock = this
    }
  }
  const sink = createFrameSink({
    url: 'ws://x/ingest',
    maxBuffer: 1000,
    WebSocketImpl: Cap as unknown as new (u: string) => MinimalSocket,
  })
  sock!.fire('open') // sends meta
  const after = sock!.sent.length
  sock!.bufferedAmount = 5000 // backed up
  sink.frame('DROP')
  expect(sock!.sent.length).toBe(after) // frame was dropped, not queued
})

test('never throws when the socket send fails or after close', () => {
  let sock: FakeSocket | undefined
  class Cap extends FakeSocket {
    constructor(url: string) {
      super(url)
      sock = this
    }
  }
  const sink = createFrameSink({
    url: 'ws://x/ingest',
    WebSocketImpl: Cap as unknown as new (u: string) => MinimalSocket,
  })
  sock!.fire('open')
  sock!.throwOnSend = true
  expect(() => sink.frame('boom')).not.toThrow() // swallowed

  sock!.fire('close')
  expect(() => sink.frame('after-close')).not.toThrow()
  expect(() => sink.end()).not.toThrow()
})
