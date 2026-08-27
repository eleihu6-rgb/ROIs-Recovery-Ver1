import { ConnectorConfig, AuthConfig } from '../../models/index.js'
import type { RedisClientType } from 'redis'
import jwt from 'jsonwebtoken'
import { withPrefix } from '../../utils/redis-key-prefix.js'

interface OAuth2TokenResponse {
  access_token: string
  expires_in: number
  token_type: string
  scope?: string
}

interface CachedToken {
  accessToken: string
  expiresAt: number // Unix timestamp in seconds
}

/**
 * OAuth 2.0 Client Credentials authentication service
 * Manages token acquisition, caching, and refresh
 */
export class OAuth2AuthService {
  private redis: RedisClientType | null = null
  private tokenCacheKeyPrefix = 'connector:oauth:token:'

  setRedis(redis: RedisClientType) {
    this.redis = redis
  }

  /**
   * Get valid access token for a connector
   * Will fetch from cache, or acquire new token if expired/missing
   */
  async getAccessToken(config: ConnectorConfig): Promise<string> {
    const authConfig = config.authConfig as AuthConfig
    if (!authConfig.clientId || !authConfig.clientSecret || !authConfig.tokenUrl) {
      throw new Error('OAuth2 configuration incomplete')
    }

    const cacheKey = `${this.tokenCacheKeyPrefix}${config.connectorCode}`

    // Try to get cached token
    if (this.redis) {
      const cached = await this.redis.get(withPrefix(cacheKey))
      if (cached) {
        const token: CachedToken = JSON.parse(cached)
        // Refresh 60 seconds before expiry
        if (token.expiresAt > Math.floor(Date.now() / 1000) + 60) {
          return token.accessToken
        }
      }
    }

    // Acquire new token
    const tokenResponse = await this.fetchNewToken(authConfig)

    // Cache the token
    if (this.redis) {
      const cachedToken: CachedToken = {
        accessToken: tokenResponse.access_token,
        expiresAt: Math.floor(Date.now() / 1000) + tokenResponse.expires_in,
      }
      // TTL: expires_in - 60 seconds (refresh buffer)
      const ttl = Math.max(tokenResponse.expires_in - 60, 60)
      await this.redis.setEx(withPrefix(cacheKey), ttl, JSON.stringify(cachedToken))
    }

    return tokenResponse.access_token
  }

  /**
   * Fetch new token from OAuth2 token endpoint
   */
  private async fetchNewToken(authConfig: AuthConfig): Promise<OAuth2TokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: authConfig.clientId!,
      client_secret: authConfig.clientSecret!,
    })

    if (authConfig.scopes?.length) {
      params.set('scope', authConfig.scopes.join(' '))
    }

    const response = await fetch(authConfig.tokenUrl!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    if (!response.ok) {
      throw new Error(`OAuth2 token request failed: ${response.status}`)
    }

    return response.json() as Promise<OAuth2TokenResponse>
  }

  /**
   * Generate JWT token for connector authentication (our side issuing tokens)
   */
  generateConnectorJwt(
    clientId: string,
    schema: string,
    scopes: string[],
    jwtSecret: string,
    expiresIn = '1h'
  ): string {
    const payload = {
      clientId,
      schema,
      scopes,
      type: 'connector',
    }

    return jwt.sign(payload, jwtSecret, { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] })
  }
}

export const oauth2Auth = new OAuth2AuthService()