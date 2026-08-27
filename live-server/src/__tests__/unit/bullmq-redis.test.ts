import { describe, expect, it, vi } from 'vitest'

describe('getBullmqRedisConnection', () => {
  it('uses BULLMQ_REDIS_URL when configured', async () => {
    vi.resetModules()
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
    process.env.REDIS_URL = 'redis://localhost:6379/1'
    process.env.BULLMQ_REDIS_URL = 'redis://:Pier2026!qwer%23@192.168.199.120:6379/3'

    const { getBullmqRedisConnection } = await import('../../utils/bullmq-redis.js')

    expect(getBullmqRedisConnection()).toEqual({
      host: '192.168.199.120',
      port: 6379,
      password: 'Pier2026!qwer#',
      db: 3,
    })
  })

  it('falls back to REDIS_URL when BULLMQ_REDIS_URL is unset', async () => {
    vi.resetModules()
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
    process.env.REDIS_URL = 'redis://192.168.199.121:6380/2'
    delete process.env.BULLMQ_REDIS_URL

    const { getBullmqRedisConnection } = await import('../../utils/bullmq-redis.js')

    expect(getBullmqRedisConnection()).toEqual({
      host: '192.168.199.121',
      port: 6380,
      password: undefined,
      db: 2,
    })
  })
})
