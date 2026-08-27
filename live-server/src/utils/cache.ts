import type { RedisClientType } from 'redis'
import { getOrCreateCounter } from './metrics.js'
import { withPrefix } from './redis-key-prefix.js'

// Cache observability (P0): hit/miss by cache_group + mode. Labels are
// low-cardinality — cache_group is the key's first segment (entity name, a bounded
// set: roster/pairing/flight/gantt/...), never an id. mode = single | chunk.
const cacheHitTotal = getOrCreateCounter({
  name: 'rois_live_server_cache_hit_total',
  help: 'Cache hits by cache group and mode (single|chunk).',
  labelNames: ['cache_group', 'mode'],
})
const cacheMissTotal = getOrCreateCounter({
  name: 'rois_live_server_cache_miss_total',
  help: 'Cache misses by cache group and mode (single|chunk).',
  labelNames: ['cache_group', 'mode'],
})

/** Low-cardinality cache group = the key prefix before the first ':' (entity name). */
const cacheGroup = (key: string): string => key.split(':', 1)[0] || 'unknown'

/**
 * Cache-Aside pattern: try cache first, fall back to fetchFn, then backfill cache.
 */
export const getOrSet = async <T>(
  redis: RedisClientType,
  key: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>,
): Promise<T> => {
  const group = cacheGroup(key)
  try {
    const cached = await redis.get(withPrefix(key))
    if (cached !== null) {
      cacheHitTotal.inc({ cache_group: group, mode: 'single' })
      return JSON.parse(cached) as T
    }
  } catch {
    // WRONGTYPE or other Redis error — delete the bad key and fall through to fetchFn
    try { await redis.del(withPrefix(key)) } catch { /* ignore */ }
  }

  // null cache, bad-key error, or parse miss all reach fetchFn → count one miss.
  cacheMissTotal.inc({ cache_group: group, mode: 'single' })
  const data = await fetchFn()
  // Backfill cache; don't let a Redis failure break the response
  try {
    await redis.set(withPrefix(key), JSON.stringify(data), { EX: ttlSeconds })
  } catch {
    // TTL will act as the safety net
  }
  return data
}

/**
 * 分片缓存（chunked cache）：每个 id 一个缓存分片。先用 mGet 批量读各分片，
 * 仅对未命中的 id 调用 `fetchMiss` **一次性**批量取数，再按 id 回填各分片缓存。
 *
 * 相比「整批一个大 key」：
 *  - 不同请求只要包含同一 id 即可复用该 id 的分片（无需整批 key 完全一致）；
 *  - 写操作可按 id 精准失效（见 invalidateChunks），不必整批清空。
 *
 * 返回所有 id（命中+未命中）合并后的扁平结果；分片内部顺序由取数方决定，
 * 跨 id 的全局顺序由调用方按需自行排序。空 id 列表直接返回 []。
 */
export const getOrSetChunks = async <T>(
  redis: RedisClientType,
  ids: string[],
  keyFor: (id: string) => string,
  ttlSeconds: number,
  fetchMiss: (missIds: string[]) => Promise<Map<string, T[]>>,
): Promise<T[]> => {
  if (ids.length === 0) return []
  const keys = ids.map(keyFor)

  let cachedVals: (string | null)[]
  try {
    cachedVals = await redis.mGet(keys.map((k) => withPrefix(k)))
  } catch {
    cachedVals = ids.map(() => null) // Redis 故障 → 全部按未命中走 DB
  }

  const group = cacheGroup(keys[0])
  const result: T[] = []
  const miss: string[] = []
  cachedVals.forEach((val, i) => {
    if (val != null) {
      try {
        result.push(...(JSON.parse(val) as T[]))
        cacheHitTotal.inc({ cache_group: group, mode: 'chunk' })
        return
      } catch {
        /* 坏分片 → 当作未命中重取 */
      }
    }
    miss.push(ids[i])
  })
  if (miss.length > 0) cacheMissTotal.inc({ cache_group: group, mode: 'chunk' }, miss.length)

  if (miss.length > 0) {
    const byId = await fetchMiss(miss)
    // 回填每个未命中分片（空数组也缓存，避免对「确无数据」的 id 反复回源）。
    // Redis 写失败不影响响应——TTL 兜底。
    await Promise.all(
      miss.map((id) =>
        redis
          .set(withPrefix(keyFor(id)), JSON.stringify(byId.get(id) ?? []), { EX: ttlSeconds })
          .catch(() => undefined),
      ),
    )
    for (const id of miss) result.push(...(byId.get(id) ?? []))
  }

  return result
}

/**
 * Delete one or more cache keys.
 */
export const invalidate = async (redis: RedisClientType, ...keys: string[]): Promise<void> => {
  if (keys.length === 0) return
  await redis.del(keys.map((k) => withPrefix(k)))
}

/**
 * 按 id 精准失效分片缓存：删除每个 id 对应的所有分片（跨日期窗口）——
 * 即 `${keyPrefix}:${id}:*`。用于写操作只影响个别实体时的窄范围失效。
 */
export const invalidateChunks = async (
  redis: RedisClientType,
  keyPrefix: string,
  ids: string[],
): Promise<void> => {
  const unique = [...new Set(ids)].filter((id) => id != null && id !== '')
  // keyPrefix is raw (e.g. "roster:chunk"); invalidatePattern applies withPrefix.
  await Promise.all(unique.map((id) => invalidatePattern(redis, `${keyPrefix}:${id}:*`)))
}

/**
 * Delete all keys matching a glob pattern (e.g. "airport:*").
 * Uses SCAN to avoid blocking Redis on large key spaces.
 */
export const invalidatePattern = async (redis: RedisClientType, pattern: string): Promise<void> => {
  // pattern is the caller-supplied raw key glob (e.g. "pairing:list:*"). Apply
  // the env prefix here so every cache.ts entry point has one consistent contract:
  // callers pass raw keys, this module namespaces them via withPrefix().
  const prefixed = withPrefix(pattern)
  let cursor = 0
  do {
    const result = await redis.scan(cursor, { MATCH: prefixed, COUNT: 200 })
    cursor = result.cursor
    if (result.keys.length > 0) {
      await redis.del(result.keys)
    }
  } while (cursor !== 0)
}
