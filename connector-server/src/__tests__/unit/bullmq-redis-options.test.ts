import { describe, expect, it, vi } from 'vitest'

describe('connector BullMQ Redis options', () => {
  it('uses decoded password and database from BULLMQ_REDIS_URL', async () => {
    vi.resetModules()
    process.env.DATABASE_URL = 'postgresql://f8:test@localhost:5432/rois?options=-c%20search_path%3Df8'
    process.env.REDIS_URL = 'redis://localhost:6379/1'
    process.env.BULLMQ_REDIS_URL = 'redis://:Pier2026!qwer%23@192.168.199.120:6379/3'

    const { queueBaseOptions } = await import('../../plugins/bullmq.js')

    expect(queueBaseOptions.connection).toMatchObject({
      host: '192.168.199.120',
      port: 6379,
      password: 'Pier2026!qwer#',
      db: 3,
    })
  })

  it('falls back to REDIS_URL when BULLMQ_REDIS_URL is unset', async () => {
    vi.resetModules()
    process.env.DATABASE_URL = 'postgresql://f8:test@localhost:5432/rois?options=-c%20search_path%3Df8'
    process.env.REDIS_URL = 'redis://192.168.199.121:6380/2'
    delete process.env.BULLMQ_REDIS_URL

    const { queueBaseOptions } = await import('../../plugins/bullmq.js')

    expect(queueBaseOptions.connection).toMatchObject({
      host: '192.168.199.121',
      port: 6380,
      db: 2,
    })
  })
})
