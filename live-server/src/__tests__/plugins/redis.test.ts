import { describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'
import type { FastifyPluginAsync } from 'fastify'

const redisMocks = vi.hoisted(() => {
  const handlers = new Map<string, (arg?: unknown) => void>()
  const redis = {
    on: vi.fn((event: string, handler: (arg?: unknown) => void) => {
      handlers.set(event, handler)
      return redis
    }),
    connect: vi.fn(async () => undefined),
    quit: vi.fn(async () => undefined),
  }
  return { handlers, redis, createClient: vi.fn(() => redis) }
})

vi.mock('../../config/index.js', () => ({
  env: { REDIS_URL: 'redis://localhost:6379' },
}))

vi.mock('redis', () => ({
  createClient: redisMocks.createClient,
}))

describe('redis plugin observability', () => {
  it('tracks Redis connection transitions without throwing on errors', async () => {
    const app = Fastify({ logger: false })
    const pluginModule = await import('../../plugins/redis.js')
    const plugin = pluginModule.default as unknown as FastifyPluginAsync
    await app.register(plugin)

    expect(redisMocks.handlers.has('error')).toBe(true)
    expect(redisMocks.handlers.has('reconnecting')).toBe(true)
    expect(redisMocks.handlers.has('ready')).toBe(true)
    expect(redisMocks.handlers.has('end')).toBe(true)

    expect(() => redisMocks.handlers.get('error')?.(new Error('Socket closed unexpectedly'))).not.toThrow()
    expect(() => redisMocks.handlers.get('reconnecting')?.()).not.toThrow()
    expect(() => redisMocks.handlers.get('ready')?.()).not.toThrow()
    expect(() => redisMocks.handlers.get('end')?.()).not.toThrow()

    await app.close()
    expect(redisMocks.redis.quit).toHaveBeenCalled()
  })
})
