import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { connectorConfig, ConnectorConfig } from '../../models/index.js'
import type { RedisClientType } from 'redis'
import { withPrefix } from '../../utils/redis-key-prefix.js'

const CACHE_KEY_PREFIX = 'connector:config:'
const CACHE_TTL_SECONDS = 3600 // 1 hour

/**
 * Connector configuration service
 * Loads and caches connector config from database
 */
export class ConnectorConfigService {
  private fastify: FastifyInstance | null = null
  private redis: RedisClientType | null = null

  setFastify(fastify: FastifyInstance) {
    this.fastify = fastify
  }

  setRedis(redis: RedisClientType) {
    this.redis = redis
  }

  /**
   * Get connector config by connector_code
   * Uses Redis cache with 1-hour TTL
   */
  async getConfig(connectorCode: string): Promise<ConnectorConfig | null> {
    if (!this.fastify) {
      throw new Error('Fastify instance not set')
    }

    const cacheKey = `${CACHE_KEY_PREFIX}${connectorCode}`

    // Try cache first
    if (this.redis) {
      const cached = await this.redis.get(withPrefix(cacheKey))
      if (cached) {
        return JSON.parse(cached) as ConnectorConfig
      }
    }

    // Query from database
    const result = await this.fastify.db
      .select()
      .from(connectorConfig)
      .where(eq(connectorConfig.connectorCode, connectorCode))
      .limit(1)

    if (result.length === 0) {
      return null
    }

    const config = result[0]

    // Cache it
    if (this.redis && config.isEnabled === 1 && config.isDeleted === 0) {
      await this.redis.setEx(withPrefix(cacheKey), CACHE_TTL_SECONDS, JSON.stringify(config))
    }

    return config
  }

  /**
   * Get all enabled outbound connectors for a data domain
   * Used by roster-outbound-worker to find push targets
   */
  async getEnabledOutboundConnectors(dataDomain?: string): Promise<ConnectorConfig[]> {
    if (!this.fastify) {
      throw new Error('Fastify instance not set')
    }

    // Query all enabled outbound connectors
    const results = await this.fastify.db
      .select()
      .from(connectorConfig)
      .where(eq(connectorConfig.direction, 'outbound'))

    // Filter in memory for additional conditions
    return results.filter(c =>
      c.isEnabled === 1 &&
      c.isDeleted === 0 &&
      (!dataDomain || c.dataDomain === dataDomain)
    )
  }

  /**
   * Invalidate cache for a connector
   * Called when config is updated via admin API
   */
  async invalidateCache(connectorCode: string): Promise<void> {
    if (this.redis) {
      await this.redis.del(withPrefix(`${CACHE_KEY_PREFIX}${connectorCode}`))
    }
  }

  /**
   * Get connector config for API Key authentication
   * Used by auth plugin to verify HMAC signatures
   */
  async getConfigByApiKey(apiKey: string): Promise<ConnectorConfig | null> {
    if (!this.fastify) {
      throw new Error('Fastify instance not set')
    }

    // Query by matching apiKey in authConfig
    // Note: This is a simplified lookup - in production, apiKey should be indexed
    const results = await this.fastify.db
      .select()
      .from(connectorConfig)
      .limit(100) // Safety limit

    // Filter by apiKey match in authConfig
    const matching = results.find(c => {
      const authConfig = c.authConfig as { apiKey?: string }
      return authConfig.apiKey === apiKey && c.isEnabled === 1 && c.isDeleted === 0
    })

    return matching || null
  }

  /**
   * Get connector config by OAuth2 client_id.
   * Used by the token endpoint to verify client credentials before issuing a JWT.
   * Only returns enabled, non-deleted connectors using oauth2_cc auth.
   *
   * Note: mirrors getConfigByApiKey's in-memory scan (no dedicated index yet);
   * acceptable at current connector counts. Index authConfig->>'clientId' if this
   * table grows large.
   */
  async getConfigByOAuthClientId(clientId: string): Promise<ConnectorConfig | null> {
    if (!this.fastify) {
      throw new Error('Fastify instance not set')
    }

    const results = await this.fastify.db
      .select()
      .from(connectorConfig)
      .limit(100) // Safety limit

    const matching = results.find(c => {
      const authConfig = c.authConfig as { clientId?: string }
      return (
        authConfig.clientId === clientId &&
        c.authType === 'oauth2_cc' &&
        c.isEnabled === 1 &&
        c.isDeleted === 0
      )
    })

    return matching || null
  }
}

export const connectorConfigService = new ConnectorConfigService()