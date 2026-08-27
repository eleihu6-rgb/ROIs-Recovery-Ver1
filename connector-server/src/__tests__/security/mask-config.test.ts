import { describe, it, expect } from 'vitest'
import { maskConnectorConfig, maskAuthConfig } from '../../utils/mask-config.js'
import type { ConnectorConfig } from '../../models/index.js'

describe('maskAuthConfig', () => {
  it('masks apiSecret and clientSecret, keeping identifiers visible', () => {
    const masked = maskAuthConfig({
      apiKey: 'pub-key',
      apiSecret: 'hmac-secret',
      clientId: 'client-id',
      clientSecret: 'oauth-secret',
      tokenUrl: 'https://idp/token',
      scopes: ['connector:read'],
    })

    expect(masked.apiSecret).toBe('***')
    expect(masked.clientSecret).toBe('***')
    expect(masked.hasApiSecret).toBe(true)
    expect(masked.hasClientSecret).toBe(true)
    // Non-secret identifiers stay visible
    expect(masked.apiKey).toBe('pub-key')
    expect(masked.clientId).toBe('client-id')
    expect(masked.tokenUrl).toBe('https://idp/token')
    expect(masked.scopes).toEqual(['connector:read'])
  })

  it('reports absent secrets without inventing a mask', () => {
    const masked = maskAuthConfig({ apiKey: 'pub-key' })
    expect(masked.apiSecret).toBeUndefined()
    expect(masked.clientSecret).toBeUndefined()
    expect(masked.hasApiSecret).toBe(false)
    expect(masked.hasClientSecret).toBe(false)
  })
})

describe('maskConnectorConfig', () => {
  it('never returns the raw secret in a connector config response', () => {
    const config = {
      id: 1,
      connectorCode: 'f8-oauth-test',
      authType: 'oauth2_cc',
      authConfig: { clientId: 'cid', clientSecret: 'top-secret-value', scopes: ['connector:read'] },
    } as unknown as ConnectorConfig

    const masked = maskConnectorConfig(config)
    const serialized = JSON.stringify(masked)
    expect(serialized).not.toContain('top-secret-value')
    expect((masked.authConfig as { clientSecret?: string }).clientSecret).toBe('***')
    // Original object is not mutated
    expect((config.authConfig as { clientSecret?: string }).clientSecret).toBe('top-secret-value')
  })
})
