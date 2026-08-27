import type { RedisClientType } from 'redis'

const LOCK_TTL = 15 * 60  // 15 minutes in seconds

export const scenarioLockService = {
  key: (scenarioId: number) => `scenario:edit-lock:${scenarioId}`,

  /** Attempt to acquire the lock. Returns true if acquired. */
  async acquire(redis: RedisClientType, scenarioId: number, userCode: string): Promise<boolean> {
    const result = await redis.set(
      scenarioLockService.key(scenarioId),
      userCode,
      { NX: true, EX: LOCK_TTL },
    )
    return result === 'OK'
  },

  /** Release the lock. Returns true if the lock belonged to userCode and was deleted. */
  async release(redis: RedisClientType, scenarioId: number, userCode: string): Promise<boolean> {
    const current = await redis.get(scenarioLockService.key(scenarioId))
    if (current !== userCode) return false
    await redis.del(scenarioLockService.key(scenarioId))
    return true
  },

  /** Return current lock state: owner and TTL in seconds. */
  async status(redis: RedisClientType, scenarioId: number, requestUserCode: string): Promise<{
    locked: boolean
    owner: string | null
    ttl: number | null
    isOwner: boolean
  }> {
    const owner = await redis.get(scenarioLockService.key(scenarioId))
    if (!owner) return { locked: false, owner: null, ttl: null, isOwner: false }
    const ttl = await redis.ttl(scenarioLockService.key(scenarioId))
    return { locked: true, owner, ttl: ttl > 0 ? ttl : null, isOwner: owner === requestUserCode }
  },

  /** Reset TTL for the current owner. Returns true if renewed. */
  async keepalive(redis: RedisClientType, scenarioId: number, userCode: string): Promise<boolean> {
    const current = await redis.get(scenarioLockService.key(scenarioId))
    if (current !== userCode) return false
    await redis.expire(scenarioLockService.key(scenarioId), LOCK_TTL)
    return true
  },
}
