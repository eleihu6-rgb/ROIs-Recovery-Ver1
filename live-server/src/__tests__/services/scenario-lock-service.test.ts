import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scenarioLockService } from '../../services/scenario/scenario-lock-service.js'

function mockRedis(store: Record<string, string> = {}): any {
  const ttls: Record<string, number> = {}
  return {
    set: vi.fn(async (key: string, val: string, opts: { NX?: boolean; EX?: number }) => {
      if (opts.NX && key in store) return null
      store[key] = val
      if (opts.EX) ttls[key] = opts.EX
      return 'OK'
    }),
    get: vi.fn(async (key: string) => store[key] ?? null),
    del: vi.fn(async (key: string) => { delete store[key]; delete ttls[key] }),
    ttl: vi.fn(async (key: string) => ttls[key] ?? -2),
    expire: vi.fn(async (key: string, secs: number) => { ttls[key] = secs }),
  }
}

describe('scenarioLockService', () => {
  it('acquire returns true when no existing lock', async () => {
    const redis = mockRedis()
    expect(await scenarioLockService.acquire(redis, 1, 'alice')).toBe(true)
  })

  it('acquire returns false when lock held by another user', async () => {
    const redis = mockRedis()
    await scenarioLockService.acquire(redis, 1, 'alice')
    expect(await scenarioLockService.acquire(redis, 1, 'bob')).toBe(false)
  })

  it('release returns true only for lock owner', async () => {
    const redis = mockRedis()
    await scenarioLockService.acquire(redis, 1, 'alice')
    expect(await scenarioLockService.release(redis, 1, 'bob')).toBe(false)
    expect(await scenarioLockService.release(redis, 1, 'alice')).toBe(true)
    const st = await scenarioLockService.status(redis, 1, 'alice')
    expect(st.locked).toBe(false)
  })

  it('status reports owner and isOwner correctly', async () => {
    const redis = mockRedis()
    await scenarioLockService.acquire(redis, 1, 'alice')
    const forAlice = await scenarioLockService.status(redis, 1, 'alice')
    expect(forAlice.isOwner).toBe(true)
    expect(forAlice.owner).toBe('alice')
    const forBob = await scenarioLockService.status(redis, 1, 'bob')
    expect(forBob.isOwner).toBe(false)
  })

  it('keepalive extends TTL only for owner', async () => {
    const redis = mockRedis()
    await scenarioLockService.acquire(redis, 1, 'alice')
    expect(await scenarioLockService.keepalive(redis, 1, 'bob')).toBe(false)
    expect(await scenarioLockService.keepalive(redis, 1, 'alice')).toBe(true)
    expect(redis.expire).toHaveBeenCalledWith('scenario:edit-lock:1', 900)
  })
})
