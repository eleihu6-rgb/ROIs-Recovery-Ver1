import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../config/index.js', () => ({
  env: { ENGINE_SERVER_URL: 'http://engine:3003' },
}))

import { engineServerClient } from '../../services/engine-server-client.js'

describe('engineServerClient', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('startRoTask posts type=LegacyRO with scenarioId and forwards token', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ task_id: 't-1', status: 'started' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const taskId = await engineServerClient.startRoTask({
      scenarioId: 123,
      rosterPeriodId: 6,
      periodCode: 'Jun 2026',
      liveServerUrl: 'http://live',
      token: 'JWT',
      airline: 'f8',
    })

    expect(taskId).toBe('t-1')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(String(url)).toContain('/api/optimize/start')
    const body = JSON.parse(init.body as string)
    expect(body.airline).toBe('F8') // engine-server expects upper-case airline keys
    expect(body.type).toBe('LegacyRO')
    expect(body.parameters.scenarioId).toBe(123)
    expect(body.parameters.rosterPeriodId).toBe(6)
    expect(body.parameters.periodCode).toBe('Jun 2026')
    expect(body.url).toBe('http://live')
    expect(body.token).toBe('JWT')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer JWT' })
  })

  it('normalizes schema names to airline codes for engine-server', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ task_id: 't-1', status: 'started' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await engineServerClient.startRoTask({
      scenarioId: 123,
      rosterPeriodId: 6,
      periodCode: 'Jun 2026',
      liveServerUrl: 'http://live',
      token: 'JWT',
      airline: 'f8',
    })

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.airline).toBe('F8')
    expect(init.headers).toMatchObject({ 'X-Airline': 'F8' })
  })

  it('startRoTask throws on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })))
    await expect(
      engineServerClient.startRoTask({
        scenarioId: 1,
        rosterPeriodId: 6,
        periodCode: 'Jun 2026',
        liveServerUrl: 'http://l',
        token: 't',
        airline: 'f8',
      }),
    ).rejects.toThrow(/500/)
  })

  it('startRoTask maps LegacyRO concurrency limit errors to a planner-friendly message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ detail: 'Maximum concurrency limit reached for optimizer LegacyRO: 1' }),
      { status: 429 },
    )))

    await expect(
      engineServerClient.startRoTask({
        scenarioId: 1,
        rosterPeriodId: 6,
        periodCode: 'Jun 2026',
        liveServerUrl: 'http://l',
        token: 't',
        airline: 'f8',
      }),
    ).rejects.toMatchObject({
      statusCode: 429,
      message: 'Another optimization is already running. This environment allows 1 LegacyRO optimization at a time. Please wait for the current run to finish.',
    })
  })

  it('fetchResultFile returns a Buffer of the gz bytes', async () => {
    const bytes = new Uint8Array([0x1f, 0x8b, 0x01, 0x02])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes, { status: 200 })))

    const buf = await engineServerClient.fetchResultFile('t-1', 'JWT', 'f8')
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf[0]).toBe(0x1f)
    expect(buf[1]).toBe(0x8b)
  })

  it('fetchInputFile returns a Buffer of the gz bytes', async () => {
    const bytes = new Uint8Array([0x1f, 0x8b, 0x02, 0x03])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes, { status: 200 })))

    const buf = await engineServerClient.fetchInputFile('t-2', 'JWT', 'f8')
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf[0]).toBe(0x1f)
  })

  it('fetchInputFile throws on 404', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })))
    await expect(engineServerClient.fetchInputFile('t-x', 'JWT', 'f8')).rejects.toThrow(/404/)
  })
})
