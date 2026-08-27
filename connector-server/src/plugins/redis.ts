import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { createClient, RedisClientType } from 'redis'
import { env } from '../config/index.js'
import { createPrefixedRedis } from '../utils/prefixed-redis.js'

declare module 'fastify' {
  interface FastifyInstance {
    redis: RedisClientType
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const raw = createClient({ url: env.REDIS_URL }) as RedisClientType

  raw.on('error', (err) => {
    fastify.log.error({ err }, 'Redis connection error')
  })

  await raw.connect()
  fastify.log.info('Redis connected')

  // Wrap the raw client with key-prefix injection. See
  // utils/prefixed-redis.ts for details.
  const redis = createPrefixedRedis(raw)
  fastify.decorate('redis', redis)

  fastify.addHook('onClose', async () => {
    await raw.quit()
    fastify.log.info('Redis connection closed')
  })
})
