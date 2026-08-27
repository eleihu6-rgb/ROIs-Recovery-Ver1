import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { createClient, RedisClientType } from 'redis'
import { env } from '../config/index.js'
import { getOrCreateCounter, getOrCreateGauge } from '../utils/metrics.js'
import { createPrefixedRedis } from '../utils/prefixed-redis.js'

const redisConnectionUp = getOrCreateGauge({
  name: 'rois_live_server_redis_connection_up',
  help: 'Whether the primary live-server Redis connection is ready (1) or unavailable (0).',
})
const redisConnectionErrors = getOrCreateCounter({
  name: 'rois_live_server_redis_connection_errors_total',
  help: 'Redis connection errors observed by live-server.',
})
const redisReconnects = getOrCreateCounter({
  name: 'rois_live_server_redis_reconnects_total',
  help: 'Redis reconnect attempts observed by live-server.',
})

declare module 'fastify' {
  interface FastifyInstance {
    redis: RedisClientType
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const raw = createClient({ url: env.REDIS_URL }) as RedisClientType
  let wasReady = false

  redisConnectionUp.set(0)

  raw.on('error', (err) => {
    redisConnectionErrors.inc()
    fastify.log.error({ err }, 'Redis connection error')
  })
  raw.on('reconnecting', () => {
    redisReconnects.inc()
    redisConnectionUp.set(0)
    fastify.log.warn('Redis reconnecting')
  })
  raw.on('ready', () => {
    redisConnectionUp.set(1)
    if (wasReady) {
      fastify.log.warn('Redis connection restored')
    } else {
      fastify.log.info('Redis connection ready')
    }
    wasReady = true
  })
  raw.on('end', () => {
    redisConnectionUp.set(0)
    fastify.log.warn('Redis connection ended')
  })

  await raw.connect()
  fastify.log.info('Redis connected')

  // Wrap the raw client with key-prefix injection. All callers that use
  // fastify.redis.* now transparently write <env>:<key> without having to
  // remember withPrefix(...). See utils/prefixed-redis.ts for details.
  const redis = createPrefixedRedis(raw)
  fastify.decorate('redis', redis)

  fastify.addHook('onClose', async () => {
    redisConnectionUp.set(0)
    await raw.quit()
    fastify.log.info('Redis connection closed')
  })
})
