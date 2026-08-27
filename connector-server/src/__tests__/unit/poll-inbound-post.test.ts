import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PollInboundHandler } from '../../services/protocols/poll-inbound.js'

const mockFetch = vi.fn()
global.fetch = mockFetch

const mockQueue = { add: vi.fn() }

const baseConfig = {
  connectorCode: 'f8-flight',
  dataDomain: 'flight',
  authType: 'f8_token',
  authConfig: {
    tokenUrl: 'https://auth.example.com/getToken',
    clientId: 'ROIS',
    sign: 'abc123',
  },
  endpointConfig: {
    url: 'https://api.example.com/flight',
    method: 'POST',
    timeout: 30000,
    retryCount: 2,
    retryDelay: 100,
  },
  transformPlugin: 'f8/flight',
}

describe('PollInboundHandler — POST + F8 token', () => {
  let handler: PollInboundHandler

  beforeEach(() => {
    handler = new PollInboundHandler(mockQueue as never)
    vi.clearAllMocks()
    // Mock F8 token fetch
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accessToken: 'mock-f8-token',
          accessTokenExpirationTime: new Date(Date.now() + 3600_000).toISOString(),
        }),
      })
  })

  it('sends POST with AuthorizationToken header and date body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ flightNo: 'F8804', depDate: '2026-03-04', depAirport: 'YVR', arrAirport: 'YYC' }],
    })

    const result = await handler.execute(baseConfig as never, {
      startDt: '2026-03-01',
      endDt: '2026-03-05',
    })

    expect(result.status).toBe('success')
    const [url, options] = mockFetch.mock.calls[1]
    expect(url).toBe('https://api.example.com/flight')
    expect(options.method).toBe('POST')
    expect(options.headers.AuthorizationToken).toBe('mock-f8-token')
    expect(JSON.parse(options.body)).toEqual({ startDt: '2026-03-01', endDt: '2026-03-05' })
  })

  it('retries on failure up to retryCount times', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

    const result = await handler.execute(baseConfig as never, {
      startDt: '2026-03-01',
      endDt: '2026-03-05',
    })

    // retryCount: 2 means 1 initial + 2 retries = 3 total fetch calls (after token fetch)
    expect(mockFetch).toHaveBeenCalledTimes(4) // 1 token + 3 data fetches
    expect(result.status).toBe('success')
  })

  it('returns fail after exhausting retries', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: false, status: 503 })

    const result = await handler.execute(baseConfig as never, {
      startDt: '2026-03-01',
      endDt: '2026-03-05',
    })

    expect(result.status).toBe('fail')
  })

  it('sends GET without body when method is GET', async () => {
    const getConfig = {
      ...baseConfig,
      endpointConfig: { url: 'https://api.example.com/crew', method: 'GET', timeout: 60000 },
    }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    })

    await handler.execute(getConfig as never)

    const [, options] = mockFetch.mock.calls[1]
    expect(options.method).toBe('GET')
    expect(options.body).toBeUndefined()
  })

  it('re-fetches token on 401 and retries', async () => {
    // First data call returns 401
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })
    // Token re-fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        accessToken: 'new-f8-token',
        accessTokenExpirationTime: new Date(Date.now() + 3600_000).toISOString(),
      }),
    })
    // Retry with new token succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ flightNo: 'F8804' }],
    })

    const result = await handler.execute(baseConfig as never, {
      startDt: '2026-03-01',
      endDt: '2026-03-05',
    })

    expect(result.status).toBe('success')
    // Verify AuthorizationToken header was updated with new token
    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]
    expect(lastCall[1].headers.AuthorizationToken).toBe('new-f8-token')
    // 1 initial token + 1 failed request + 1 token refresh + 1 success request = 4 calls
    expect(mockFetch).toHaveBeenCalledTimes(4)
  })

  it('computes date range from pollBodyDays when no pollConfig provided', async () => {
    const configWithPollDays = {
      ...baseConfig,
      endpointConfig: {
        ...baseConfig.endpointConfig,
        pollBodyDays: 7,
      },
    }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    })

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const endDate = new Date(today)
    endDate.setDate(endDate.getDate() + 7)

    await handler.execute(configWithPollDays as never)

    const [, options] = mockFetch.mock.calls[1]
    const body = JSON.parse(options.body)

    // Check that dates are formatted correctly
    expect(body.startDt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(body.endDt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})