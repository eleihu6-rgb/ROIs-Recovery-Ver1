import { describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'
import jwt from 'jsonwebtoken'
import WebSocket from 'ws'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { isAllowedWsOrigin } from '../../plugins/websocket.js'

process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'

const JWT_SECRET = 'test-websocket-secret-at-least-32-chars'

type TestMessageEvent = { data: string | ArrayBuffer | Blob }
type TestCloseEvent = { code: number; reason?: string }
interface TestWebSocket {
  send: (data: string) => void
  close: () => void
  addEventListener(event: 'open', handler: () => void, options?: { once?: boolean }): void
  addEventListener(event: 'message', handler: (event: TestMessageEvent) => void, options?: { once?: boolean }): void
  addEventListener(event: 'close', handler: (event: TestCloseEvent) => void, options?: { once?: boolean }): void
}

const WebSocketCtor = (globalThis as unknown as { WebSocket: new (url: string) => TestWebSocket }).WebSocket

const withTimeout = async <T>(promise: Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Timed out waiting for WebSocket event')), 1_000)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const onceOpen = (ws: TestWebSocket): Promise<void> =>
  withTimeout(new Promise((resolve) => ws.addEventListener('open', resolve, { once: true })))

const onceMessage = (ws: TestWebSocket): Promise<Record<string, unknown>> =>
  withTimeout(new Promise((resolve) => {
    ws.addEventListener('message', (event) => {
      resolve(JSON.parse(String(event.data)) as Record<string, unknown>)
    }, { once: true })
  }))

const onceClose = (ws: TestWebSocket): Promise<TestCloseEvent> =>
  withTimeout(new Promise((resolve) => ws.addEventListener('close', resolve, { once: true })))

const makeToken = (schema: string, userCode = 'Ryan'): string =>
  jwt.sign({ userCode, userName: userCode, schema, isAdmin: 1, tokenVersion: 1 }, JWT_SECRET, { expiresIn: '1h' })

const createMockDb = () => ({
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () => [{
          userCode: 'Ryan',
          userName: 'Ryan',
          schema: 'f8',
          isAdmin: 1,
          status: 0,
          passwordAccess: 'Y',
          portalAccess: 'Y',
          effDt: new Date(Date.now() - 60_000),
          expDt: null,
          tokenVersion: 1,
        }],
      }),
    }),
  }),
})

async function createWsApp(): Promise<{
  app: FastifyInstance
  url: string
  redis: { get: ReturnType<typeof vi.fn> }
  subscriber: { on: ReturnType<typeof vi.fn> }
}> {
  vi.resetModules()
  process.env.APP_ENV = 'test'
  process.env.JWT_SECRET = JWT_SECRET
  // Test tokens are signed with schema 'f8'; the local env default is
  // f8_dev_live, which would make validateAuthPayload 401 the connection.
  process.env.LIVE_SCHEMA = 'f8'
  process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'

  const plugin = (await import('../../plugins/websocket.js')).default as unknown as FastifyPluginAsync
  const subscriber = {
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    pSubscribe: vi.fn().mockResolvedValue(undefined),
    pUnsubscribe: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  }
  const redis = {
    get: vi.fn().mockResolvedValue('41'),
    duplicate: vi.fn(() => subscriber),
  }
  const app = Fastify({ logger: false })
  ;(app as unknown as { decorate: (name: string, value: unknown) => void }).decorate('redis', redis)
  ;(app as unknown as { decorate: (name: string, value: unknown) => void }).decorate('db', createMockDb())
  await app.register(plugin)
  await app.listen({ port: 0, host: '127.0.0.1' })
  const address = app.server.address()
  if (!address || typeof address === 'string') throw new Error('Unexpected Fastify address')
  return { app, url: `ws://127.0.0.1:${address.port}/ws/locks`, redis, subscriber }
}

describe('websocket auth hardening', () => {
  it('handles Redis subscriber errors so a Redis restart does not crash the process', async () => {
    const { app, subscriber } = await createWsApp()
    const errorHandler = subscriber.on.mock.calls.find(([event]) => event === 'error')?.[1] as
      | ((err: Error) => void)
      | undefined

    expect(errorHandler).toBeDefined()
    expect(() => errorHandler?.(new Error('Socket closed unexpectedly'))).not.toThrow()
    await app.close()
  })

  it('closes unauthenticated subscribe attempts', async () => {
    const { app, url } = await createWsApp()
    const ws = new WebSocketCtor(url)

    await onceOpen(ws)
    ws.send(JSON.stringify({ type: 'subscribe', schema: 'f8', userId: 'attacker' }))

    const close = await onceClose(ws)
    expect(close.code).toBe(1008)
    await app.close()
  })

  it('authenticates with JWT and ignores client-supplied schema/user identity', async () => {
    const { app, url, redis } = await createWsApp()
    const ws = new WebSocketCtor(url)

    await onceOpen(ws)
    ws.send(JSON.stringify({ type: 'authenticate', token: makeToken('f8', 'Ryan') }))
    expect(await onceMessage(ws)).toEqual({ type: 'authenticated' })

    ws.send(JSON.stringify({ type: 'subscribe', schema: 'tg', userId: 'attacker' }))
    expect(await onceMessage(ws)).toEqual({ type: 'connected', lastEventId: 41 })
    expect(redis.get).toHaveBeenCalledWith('rule_engine:last_event:f8')

    app.wsBroadcast('f8', { type: 'roster-updated', crewIds: ['295'] })
    expect(await onceMessage(ws)).toEqual({ type: 'roster-updated', crewIds: ['295'] })

    ws.close()
    await app.close()
  })

  it('handles authenticate and subscribe sent back-to-back on the same connection', async () => {
    const { app, url, redis } = await createWsApp()
    const ws = new WebSocketCtor(url)

    await onceOpen(ws)
    const messages = withTimeout(new Promise<Record<string, unknown>[]>((resolve) => {
      const received: Record<string, unknown>[] = []
      ws.addEventListener('message', (event) => {
        received.push(JSON.parse(String(event.data)) as Record<string, unknown>)
        if (received.length === 2) resolve(received)
      })
    }))
    ws.send(JSON.stringify({ type: 'authenticate', token: makeToken('f8', 'Ryan') }))
    ws.send(JSON.stringify({ type: 'subscribe' }))

    expect(await messages).toEqual([
      { type: 'authenticated' },
      { type: 'connected', lastEventId: 41 },
    ])
    expect(redis.get).toHaveBeenCalledWith('rule_engine:last_event:f8')

    ws.close()
    await app.close()
  })
})

describe('websocket origin validation (CSWSH)', () => {
  it('allows a handshake with no Origin header (non-browser client)', () => {
    expect(isAllowedWsOrigin(undefined, 'crew-f8-usva-uat.roiscloud.com')).toBe(true)
  })

  it('allows localhost dev origins regardless of port', () => {
    expect(isAllowedWsOrigin('http://localhost:5173', 'localhost:3000')).toBe(true)
    expect(isAllowedWsOrigin('http://127.0.0.1:5173', '127.0.0.1:3000')).toBe(true)
  })

  it('allows same-origin (browser dialing its own host via nginx)', () => {
    expect(isAllowedWsOrigin('https://crew-f8-usva-uat.roiscloud.com', 'crew-f8-usva-uat.roiscloud.com')).toBe(true)
  })

  it('rejects a foreign origin (the CSWSH case)', () => {
    expect(isAllowedWsOrigin('https://evil.example', 'crew-f8-usva-uat.roiscloud.com')).toBe(false)
  })

  it('rejects a `null` origin (sandboxed iframe / data URI)', () => {
    expect(isAllowedWsOrigin('null', 'crew-f8-usva-uat.roiscloud.com')).toBe(false)
  })

  it('rejects a malformed Origin header', () => {
    expect(isAllowedWsOrigin('not a url', 'crew-f8-usva-uat.roiscloud.com')).toBe(false)
  })

  it('rejects the WebSocket handshake before 101 when Origin is foreign', async () => {
    const { app, url } = await createWsApp()
    const outcome = await new Promise<'opened' | 'rejected'>((resolve) => {
      let opened = false
      const ws = new WebSocket(url, { headers: { Origin: 'https://evil.example' } })
      ws.on('open', () => { opened = true; resolve('opened') })
      ws.on('error', () => { if (!opened) resolve('rejected') })
      ws.on('close', () => { if (!opened) resolve('rejected') })
    })
    expect(outcome).toBe('rejected')
    await app.close()
  })

  it('accepts the WebSocket handshake for a same-origin client', async () => {
    const { app, url } = await createWsApp()
    const origin = `http://${new URL(url).host}`
    const outcome = await new Promise<'opened' | 'rejected'>((resolve) => {
      let opened = false
      const ws = new WebSocket(url, { headers: { Origin: origin } })
      ws.on('open', () => { opened = true; resolve('opened') })
      ws.on('error', () => { if (!opened) resolve('rejected') })
      ws.on('close', () => { if (!opened) resolve('rejected') })
    })
    expect(outcome).toBe('opened')
    await app.close()
  })
})
