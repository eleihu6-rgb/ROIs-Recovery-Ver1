import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PushOutboundHandler } from '../../services/protocols/push-outbound.js'

const mockFetch = vi.fn()
global.fetch = mockFetch

const baseConfig = {
  connectorCode: 'f8-roster-publish-outbound',
  dataDomain: 'roster',
  authType: 'f8_token',
  authConfig: {
    tokenUrl: 'https://auth.example.com/getToken',
    clientId: 'ROIS',
    sign: 'abc123',
  },
  endpointConfig: {
    url: 'https://api.example.com/rosterFlight',
    method: 'POST',
    timeout: 30000,
  },
  transformPlugin: 'default',
}

describe('PushOutboundHandler — F8 token outbound', () => {
  let handler: PushOutboundHandler

  beforeEach(() => {
    handler = new PushOutboundHandler()
    mockFetch.mockReset()
  })

  it('posts the roster publish payload with AuthorizationToken', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accessToken: 'mock-f8-token',
          accessTokenExpirationTime: new Date(Date.now() + 3600_000).toISOString(),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '{"code":200}',
      })

    const payload = {
      requestId: '1234567892',
      rpStart: '2026-08-01',
      rpEnd: '2026-08-31',
      rosters: [{ action: 'Add', uniqueId: '247_116443', crewId: '247', pairingId: 116443 }],
    }

    const result = await handler.execute(baseConfig as never, { payload, recordCount: 1 })

    expect(result).toEqual(expect.objectContaining({
      status: 'success',
      recordsIn: 1,
      recordsOut: 1,
      responseStatus: 200,
      responseBody: '{"code":200}',
    }))
    expect(mockFetch).toHaveBeenNthCalledWith(1, 'https://auth.example.com/getToken', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"clientId":"ROIS"'),
    }))
    expect(mockFetch).toHaveBeenNthCalledWith(2, 'https://api.example.com/rosterFlight', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ AuthorizationToken: 'mock-f8-token' }),
      body: JSON.stringify(payload),
    }))
  })

  it('refreshes the F8 token once when the outbound API rejects authentication', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accessToken: 'expired-token',
          accessTokenExpirationTime: new Date(Date.now() + 3600_000).toISOString(),
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'unauthorized',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accessToken: 'fresh-token',
          accessTokenExpirationTime: new Date(Date.now() + 3600_000).toISOString(),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '{"code":200}',
      })

    const result = await handler.execute(baseConfig as never, {
      payload: { requestId: '1234567892', rosters: [] },
      recordCount: 0,
    })

    expect(result.status).toBe('success')
    expect(mockFetch).toHaveBeenNthCalledWith(2, 'https://api.example.com/rosterFlight', expect.objectContaining({
      headers: expect.objectContaining({ AuthorizationToken: 'expired-token' }),
    }))
    expect(mockFetch).toHaveBeenNthCalledWith(4, 'https://api.example.com/rosterFlight', expect.objectContaining({
      headers: expect.objectContaining({ AuthorizationToken: 'fresh-token' }),
    }))
  })

  it('treats business code 1 as a failed outbound package', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accessToken: 'mock-f8-token',
          accessTokenExpirationTime: new Date(Date.now() + 3600_000).toISOString(),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '{"requestId":"4694123811439118","code":1}',
      })

    const result = await handler.execute(baseConfig as never, {
      payload: { requestId: '4694123811439118', rosters: [] },
      recordCount: 1,
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'fail',
      recordsIn: 1,
      recordsOut: 0,
      errorMessage: 'External API returned code 1',
      responseStatus: 200,
      responseBody: '{"requestId":"4694123811439118","code":1}',
    }))
  })

  it('preserves the original exception stack for operations logs', async () => {
    const error = new Error('socket hang up')
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accessToken: 'mock-f8-token',
          accessTokenExpirationTime: new Date(Date.now() + 3600_000).toISOString(),
        }),
      })
      .mockRejectedValueOnce(error)

    const result = await handler.execute(baseConfig as never, {
      payload: { requestId: '1234567892', rosters: [] },
      recordCount: 0,
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'fail',
      errorMessage: error.stack,
    }))
  })
})
