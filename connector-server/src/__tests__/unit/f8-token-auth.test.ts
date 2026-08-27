import { describe, it, expect, vi, beforeEach } from 'vitest'
import { F8TokenAuthService } from '../../services/auth/f8-token-auth.js'

const mockFetch = vi.fn()
global.fetch = mockFetch

const mockRedis = {
  get: vi.fn(),
  setEx: vi.fn(),
}

const mockConfig = {
  connectorCode: 'f8-crew',
  authType: 'f8_token',
  authConfig: {
    tokenUrl: 'https://auth.example.com/getToken',
    clientId: 'ROIS',
    sign: 'f7a2c9e1b4d83f6a0e5c2b7d9f1a4e8c',
  },
}

describe('F8TokenAuthService', () => {
  let service: F8TokenAuthService

  beforeEach(() => {
    service = new F8TokenAuthService()
    service.setRedis(mockRedis as never)
    vi.clearAllMocks()
  })

  it('fetches token when cache is empty', async () => {
    mockRedis.get.mockResolvedValue(null)
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        accessToken: 'test-token-abc',
        accessTokenExpirationTime: new Date(Date.now() + 3600_000).toISOString(),
      }),
    })

    const token = await service.getAccessToken(mockConfig as never)

    expect(token).toBe('test-token-abc')
    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('https://auth.example.com/getToken')
    expect(options.method).toBe('POST')
    const body = JSON.parse(options.body)
    expect(body.clientId).toBe('ROIS')
    expect(body.sign).toBe('f7a2c9e1b4d83f6a0e5c2b7d9f1a4e8c')
    expect(typeof body.timestamp).toBe('number')
    expect(mockRedis.setEx).toHaveBeenCalledOnce()
  })

  it('returns cached token when still valid', async () => {
    const cachedData = JSON.stringify({
      accessToken: 'cached-token',
      expiresAt: Math.floor(Date.now() / 1000) + 600,
    })
    mockRedis.get.mockResolvedValue(cachedData)

    const token = await service.getAccessToken(mockConfig as never)

    expect(token).toBe('cached-token')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('shares the cache entry across connectors with the same F8 auth config', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify({
      accessToken: 'shared-token',
      expiresAt: Math.floor(Date.now() / 1000) + 600,
    }))

    const otherConnector = {
      ...mockConfig,
      connectorCode: 'f8-roster-publish-outbound',
    }

    await expect(service.getAccessToken(mockConfig as never)).resolves.toBe('shared-token')
    await expect(service.getAccessToken(otherConnector as never)).resolves.toBe('shared-token')

    expect(mockRedis.get.mock.calls[1]?.[0]).toBe(mockRedis.get.mock.calls[0]?.[0])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('re-fetches token when cache is within 30s of expiry', async () => {
    const cachedData = JSON.stringify({
      accessToken: 'expiring-token',
      expiresAt: Math.floor(Date.now() / 1000) + 20, // 20s left — within 30s buffer
    })
    mockRedis.get.mockResolvedValue(cachedData)
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        accessToken: 'new-token',
        accessTokenExpirationTime: new Date(Date.now() + 3600_000).toISOString(),
      }),
    })

    const token = await service.getAccessToken(mockConfig as never)

    expect(token).toBe('new-token')
    expect(mockFetch).toHaveBeenCalledOnce()
  })

  it('throws when token endpoint returns non-ok response', async () => {
    mockRedis.get.mockResolvedValue(null)
    mockFetch.mockResolvedValue({ ok: false, status: 401 })

    await expect(service.getAccessToken(mockConfig as never)).rejects.toThrow(
      'F8 token request failed: 401'
    )
  })

  it('throws when authConfig is missing tokenUrl', async () => {
    const badConfig = { ...mockConfig, authConfig: { clientId: 'ROIS' } }
    await expect(service.getAccessToken(badConfig as never)).rejects.toThrow(
      'F8 auth config incomplete'
    )
  })
})
