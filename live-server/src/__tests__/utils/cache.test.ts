import { describe, it, expect, vi, beforeEach } from 'vitest'
import { register } from 'prom-client'
import { getOrSet, getOrSetChunks, invalidate, invalidatePattern, invalidateChunks } from '../../utils/cache.js'

const createMockRedis = () => ({
  get: vi.fn(),
  mGet: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  scan: vi.fn(),
})

/** Read a single labeled value from a prom-client metric (0 if absent). */
const metricVal = async (name: string, labels: Record<string, string>): Promise<number> => {
  const m = register.getSingleMetric(name)
  if (!m) return 0
  const { values } = await (m as unknown as { get: () => Promise<{ values: Array<{ labels: Record<string, string>; value: number }> }> }).get()
  const found = values.find((v) => Object.entries(labels).every(([k, val]) => v.labels[k] === val))
  return found?.value ?? 0
}

describe('cache utils', () => {
  let redis: ReturnType<typeof createMockRedis>

  beforeEach(() => {
    redis = createMockRedis()
  })

  // ---------- getOrSet ----------

  describe('getOrSet', () => {
    it('should return cached value on cache hit', async () => {
      const cached = { id: 1, name: 'test' }
      redis.get.mockResolvedValue(JSON.stringify(cached))
      const fetchFn = vi.fn()

      const result = await getOrSet(redis as any, 'key:1', 300, fetchFn)

      expect(result).toEqual(cached)
      expect(fetchFn).not.toHaveBeenCalled()
      expect(redis.get).toHaveBeenCalledWith('key:1')
    })

    it('should call fetchFn and backfill cache on cache miss', async () => {
      redis.get.mockResolvedValue(null)
      redis.set.mockResolvedValue('OK')
      const data = { id: 2, name: 'fresh' }
      const fetchFn = vi.fn().mockResolvedValue(data)

      const result = await getOrSet(redis as any, 'key:2', 600, fetchFn)

      expect(result).toEqual(data)
      expect(fetchFn).toHaveBeenCalledOnce()
      expect(redis.set).toHaveBeenCalledWith('key:2', JSON.stringify(data), { EX: 600 })
    })

    it('should still return data if redis.set fails during backfill', async () => {
      redis.get.mockResolvedValue(null)
      redis.set.mockRejectedValue(new Error('Redis down'))
      const data = [1, 2, 3]
      const fetchFn = vi.fn().mockResolvedValue(data)

      const result = await getOrSet(redis as any, 'key:3', 60, fetchFn)

      expect(result).toEqual(data)
    })
  })

  // ---------- invalidate ----------

  describe('invalidate', () => {
    it('should delete specified keys', async () => {
      redis.del.mockResolvedValue(2)

      await invalidate(redis as any, 'key:1', 'key:2')

      expect(redis.del).toHaveBeenCalledWith(['key:1', 'key:2'])
    })

    it('should do nothing when no keys provided', async () => {
      await invalidate(redis as any)

      expect(redis.del).not.toHaveBeenCalled()
    })
  })

  // ---------- invalidatePattern ----------

  describe('invalidatePattern', () => {
    it('should scan and delete matching keys', async () => {
      // SCAN returns keys; in production the client layer adds the env prefix,
      // invalidatePattern passes them through to del unchanged.
      redis.scan
        .mockResolvedValueOnce({ cursor: 5, keys: ['a:1', 'a:2'] })
        .mockResolvedValueOnce({ cursor: 0, keys: ['a:3'] })
      redis.del.mockResolvedValue(1)

      await invalidatePattern(redis as any, 'a:*')

      expect(redis.scan).toHaveBeenCalledTimes(2)
      expect(redis.del).toHaveBeenCalledTimes(2)
      expect(redis.del).toHaveBeenCalledWith(['a:1', 'a:2'])
      expect(redis.del).toHaveBeenCalledWith(['a:3'])
    })

    it('should handle no matching keys', async () => {
      redis.scan.mockResolvedValue({ cursor: 0, keys: [] })

      await invalidatePattern(redis as any, 'nonexistent:*')

      expect(redis.del).not.toHaveBeenCalled()
    })
  })

  // ---------- getOrSetChunks（分片缓存）----------

  describe('getOrSetChunks', () => {
    const keyFor = (id: string) => `c:${id}`

    it('returns [] for empty ids without touching redis', async () => {
      const result = await getOrSetChunks(redis as any, [], keyFor, 300, async () => new Map())
      expect(result).toEqual([])
      expect(redis.mGet).not.toHaveBeenCalled()
    })

    it('all-miss: fetches all ids once, backfills each chunk, returns flattened', async () => {
      redis.mGet.mockResolvedValue([null, null])
      redis.set.mockResolvedValue('OK')
      const fetchMiss = vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, [{ id, v: 1 }]])))

      const result = await getOrSetChunks(redis as any, ['A', 'B'], keyFor, 300, fetchMiss)

      expect(fetchMiss).toHaveBeenCalledWith(['A', 'B'])
      expect(redis.set).toHaveBeenCalledWith('c:A', JSON.stringify([{ id: 'A', v: 1 }]), { EX: 300 })
      expect(redis.set).toHaveBeenCalledWith('c:B', JSON.stringify([{ id: 'B', v: 1 }]), { EX: 300 })
      expect(result).toEqual([{ id: 'A', v: 1 }, { id: 'B', v: 1 }])
    })

    it('all-hit: does not call fetchMiss or set, returns parsed chunks', async () => {
      redis.mGet.mockResolvedValue([JSON.stringify([{ id: 'A' }]), JSON.stringify([{ id: 'B' }])])
      const fetchMiss = vi.fn()

      const result = await getOrSetChunks(redis as any, ['A', 'B'], keyFor, 300, fetchMiss)

      expect(fetchMiss).not.toHaveBeenCalled()
      expect(redis.set).not.toHaveBeenCalled()
      expect(result).toEqual([{ id: 'A' }, { id: 'B' }])
    })

    it('partial-miss: fetches only the missing id, merges hit + fetched', async () => {
      redis.mGet.mockResolvedValue([JSON.stringify([{ id: 'A', cached: true }]), null])
      redis.set.mockResolvedValue('OK')
      const fetchMiss = vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, [{ id, fresh: true }]])))

      const result = await getOrSetChunks(redis as any, ['A', 'B'], keyFor, 300, fetchMiss)

      expect(fetchMiss).toHaveBeenCalledWith(['B']) // 只回源未命中的 id
      expect(redis.set).toHaveBeenCalledWith('c:B', JSON.stringify([{ id: 'B', fresh: true }]), { EX: 300 })
      expect(redis.set).not.toHaveBeenCalledWith('c:A', expect.anything(), expect.anything())
      expect(result).toEqual([{ id: 'A', cached: true }, { id: 'B', fresh: true }])
    })

    it('treats mGet failure as a full miss (Redis 故障兜底)', async () => {
      redis.mGet.mockRejectedValue(new Error('redis down'))
      redis.set.mockResolvedValue('OK')
      const fetchMiss = vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, [{ id }]])))

      const result = await getOrSetChunks(redis as any, ['A'], keyFor, 300, fetchMiss)

      expect(fetchMiss).toHaveBeenCalledWith(['A'])
      expect(result).toEqual([{ id: 'A' }])
    })
  })

  // ---------- cache hit/miss metrics (P0) ----------

  describe('cache metrics', () => {
    it('increments single-mode hit then miss counters for getOrSet', async () => {
      const hitBefore = await metricVal('rois_live_server_cache_hit_total', { cache_group: 'roster', mode: 'single' })
      redis.get.mockResolvedValue(JSON.stringify({ x: 1 }))
      await getOrSet(redis as any, 'roster:1', 300, vi.fn())
      expect(await metricVal('rois_live_server_cache_hit_total', { cache_group: 'roster', mode: 'single' })).toBe(hitBefore + 1)

      const missBefore = await metricVal('rois_live_server_cache_miss_total', { cache_group: 'roster', mode: 'single' })
      redis.get.mockResolvedValue(null)
      redis.set.mockResolvedValue('OK')
      await getOrSet(redis as any, 'roster:2', 300, vi.fn().mockResolvedValue({ y: 2 }))
      expect(await metricVal('rois_live_server_cache_miss_total', { cache_group: 'roster', mode: 'single' })).toBe(missBefore + 1)
    })

    it('increments chunk-mode hit + miss counters for getOrSetChunks', async () => {
      const hitBefore = await metricVal('rois_live_server_cache_hit_total', { cache_group: 'c', mode: 'chunk' })
      const missBefore = await metricVal('rois_live_server_cache_miss_total', { cache_group: 'c', mode: 'chunk' })
      redis.mGet.mockResolvedValue([JSON.stringify([{ id: 'A' }]), null]) // A hit, B miss
      redis.set.mockResolvedValue('OK')
      await getOrSetChunks(redis as any, ['A', 'B'], (id) => `c:${id}`, 300, async (ids) => new Map(ids.map((id) => [id, [{ id }]])))
      expect(await metricVal('rois_live_server_cache_hit_total', { cache_group: 'c', mode: 'chunk' })).toBe(hitBefore + 1)
      expect(await metricVal('rois_live_server_cache_miss_total', { cache_group: 'c', mode: 'chunk' })).toBe(missBefore + 1)
    })
  })

  // ---------- invalidateChunks（按 id 精准失效）----------

  describe('invalidateChunks', () => {
    it('invalidates one pattern per unique id, filtering empties', async () => {
      redis.scan.mockResolvedValue({ cursor: 0, keys: [] })

      await invalidateChunks(redis as any, 'roster:chunk', ['C001', 'C001', '', 'C002'])

      expect(redis.scan).toHaveBeenCalledWith(0, { MATCH: 'roster:chunk:C001:*', COUNT: 200 })
      expect(redis.scan).toHaveBeenCalledWith(0, { MATCH: 'roster:chunk:C002:*', COUNT: 200 })
      expect(redis.scan).toHaveBeenCalledTimes(2) // 去重 + 空串过滤后只剩 2 个
    })

    it('does nothing when no valid ids', async () => {
      await invalidateChunks(redis as any, 'roster:chunk', ['', null as any, undefined as any])
      expect(redis.scan).not.toHaveBeenCalled()
    })
  })
})
