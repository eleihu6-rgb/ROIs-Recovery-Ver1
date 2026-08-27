import { createHash } from 'node:crypto'
import type { ConnectorConfig } from '../../models/index.js'
import type { RedisClientType } from 'redis'
import { withPrefix } from '../../utils/redis-key-prefix.js'

interface F8AuthConfig {
  tokenUrl: string
  clientId: string
  sign: string
}

interface F8TokenResponse {
  accessToken: string
  accessTokenExpirationTime: string // ISO datetime
}

interface CachedToken {
  accessToken: string
  expiresAt: number // Unix timestamp seconds
}

/**
 * F8 custom token authentication service
 * Handles F8's proprietary token-based authentication with Redis caching
 */
export class F8TokenAuthService {
  private redis: RedisClientType | null = null
  private readonly cacheKeyPrefix = 'connector:f8:token:'
  private readonly refreshBufferSeconds = 30

  setRedis(redis: RedisClientType) {
    this.redis = redis
  }

  /**
   * Get valid access token for a connector
   * Will fetch from cache, or acquire new token if expired/missing
   */
  async getAccessToken(config: ConnectorConfig, forceRefresh = false): Promise<string> {
    const auth = config.authConfig as unknown as F8AuthConfig
    if (!auth?.tokenUrl || !auth?.clientId || !auth?.sign) {
      throw new Error('F8 auth config incomplete: tokenUrl, clientId, sign required')
    }

    const cacheKey = `${this.cacheKeyPrefix}${this.getCacheIdentity(auth)}`

    // Skip cache lookup if forceRefresh is true
    if (this.redis && !forceRefresh) {
      const cached = await this.redis.get(withPrefix(cacheKey))
      if (cached) {
        const token: CachedToken = JSON.parse(cached)
        // Refresh 30 seconds before expiry
        if (token.expiresAt > Math.floor(Date.now() / 1000) + this.refreshBufferSeconds) {
          return token.accessToken
        }
      }
    }

    // Acquire new token
    return this.fetchAndCache(auth, cacheKey)
  }

  private getCacheIdentity(auth: F8AuthConfig): string {
    return createHash('sha256')
      .update(`${auth.tokenUrl}\0${auth.clientId}\0${auth.sign}`)
      .digest('hex')
  }

  /**
   * Fetch new token from F8 token endpoint
   */
  private async fetchAndCache(auth: F8AuthConfig, cacheKey: string): Promise<string> {
    const body = {
      clientId: auth.clientId,
      timestamp: Math.floor(Date.now() / 1000),
      sign: auth.sign,
    }

    const response = await fetch(auth.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(`F8 token request failed: ${response.status}`)
    }

    const data = (await response.json()) as F8TokenResponse
    const expiresAt = Math.floor(new Date(data.accessTokenExpirationTime).getTime() / 1000)
    const ttl = Math.max(expiresAt - Math.floor(Date.now() / 1000) - this.refreshBufferSeconds, 60)

    // Cache the token
    if (this.redis) {
      const cached: CachedToken = { accessToken: data.accessToken, expiresAt }
      await this.redis.setEx(withPrefix(cacheKey), ttl, JSON.stringify(cached))
    }

    return data.accessToken
  }
}

export const f8TokenAuth = new F8TokenAuthService()
