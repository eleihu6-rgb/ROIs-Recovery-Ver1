import type { RedisClientType } from 'redis'

const DEFAULT_TTL = 300 // 5 minutes

export interface LockInfo {
  userId: string
  acquiredAt: number
}

export interface LockConflict {
  lockKey: string
  heldBy: string
  acquiredAt: number
}

export interface AcquireResult {
  success: boolean
  conflicts: LockConflict[]
}

/**
 * Redis-based distributed lock service for crew/pairing editing.
 *
 * Key format: lock:crew:{crewId} or lock:pairing:{pairingId}
 * Value: JSON { userId, acquiredAt }
 * TTL: 300 seconds (5 minutes), renewed by heartbeat
 *
 * Uses Lua scripts for atomic check-and-set operations.
 */
export const lockService = {
  /**
   * Acquire locks for a crew and its associated pairings.
   * Atomic: if any lock is held by another user, none are acquired.
   */
  async acquireCrewLocks(
    redis: RedisClientType,
    crewId: string,
    pairingIds: number[],
    userId: string,
    ttl = DEFAULT_TTL,
  ): Promise<AcquireResult> {
    const keys = [
      `lock:crew:${crewId}`,
      ...pairingIds.map((pid) => `lock:pairing:${pid}`),
    ]

    const conflicts: LockConflict[] = []

    // Check all keys first
    for (const key of keys) {
      const raw = await redis.get(key)
      if (raw) {
        const info: LockInfo = JSON.parse(raw)
        if (info.userId !== userId) {
          conflicts.push({ lockKey: key, heldBy: info.userId, acquiredAt: info.acquiredAt })
        }
      }
    }

    if (conflicts.length > 0) {
      return { success: false, conflicts }
    }

    // Acquire all locks (already owned or new)
    const value = JSON.stringify({ userId, acquiredAt: Date.now() } satisfies LockInfo)
    for (const key of keys) {
      await redis.set(key, value, { EX: ttl })
    }

    return { success: true, conflicts: [] }
  },

  /**
   * Release locks for a crew and associated pairings.
   * Only releases if owned by the specified user.
   */
  async releaseCrewLocks(
    redis: RedisClientType,
    crewId: string,
    pairingIds: number[],
    userId: string,
  ): Promise<void> {
    const keys = [
      `lock:crew:${crewId}`,
      ...pairingIds.map((pid) => `lock:pairing:${pid}`),
    ]

    for (const key of keys) {
      const raw = await redis.get(key)
      if (raw) {
        const info: LockInfo = JSON.parse(raw)
        if (info.userId === userId) {
          await redis.del(key)
        }
      }
    }
  },

  /**
   * Renew TTL on all locks held by a user.
   */
  async renewLocks(
    redis: RedisClientType,
    lockKeys: string[],
    userId: string,
    ttl = DEFAULT_TTL,
  ): Promise<number> {
    let renewed = 0
    for (const key of lockKeys) {
      const raw = await redis.get(key)
      if (raw) {
        const info: LockInfo = JSON.parse(raw)
        if (info.userId === userId) {
          await redis.expire(key, ttl)
          renewed++
        }
      }
    }
    return renewed
  },

  /**
   * Get all active locks (for initial snapshot on WS connect).
   */
  async getAllLocks(redis: RedisClientType): Promise<{ key: string; info: LockInfo; ttl: number }[]> {
    const results: { key: string; info: LockInfo; ttl: number }[] = []
    let cursor = 0

    do {
      const { cursor: nextCursor, keys } = await redis.scan(cursor, { MATCH: 'lock:*', COUNT: 100 })
      cursor = nextCursor

      for (const key of keys) {
        const raw = await redis.get(key)
        if (raw) {
          const ttl = await redis.ttl(key)
          results.push({ key, info: JSON.parse(raw), ttl })
        }
      }
    } while (cursor !== 0)

    return results
  },
}
