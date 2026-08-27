import { describe, it, expect, vi } from 'vitest'
import { PermissionCache } from '../../services/permission/permission-cache.js'

describe('PermissionCache', () => {
  it('TTL 内只加载一次', async () => {
    const load = vi.fn(async () => ({ version: 1 }))
    const cache = new PermissionCache<{ version: number }>(60_000)
    const a = await cache.get('u1', load)
    const b = await cache.get('u1', load)
    expect(a).toEqual({ version: 1 })
    expect(b).toEqual({ version: 1 })
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('invalidate 后重新加载', async () => {
    const load = vi.fn(async () => ({ version: 1 }))
    const cache = new PermissionCache<{ version: number }>(60_000)
    await cache.get('u1', load)
    cache.invalidate('u1')
    await cache.get('u1', load)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('TTL 过期后重新加载（用短 TTL + 手动推进）', async () => {
    const load = vi.fn(async () => ({ version: 1 }))
    const cache = new PermissionCache<{ version: number }>(-1) // 立即过期
    await cache.get('u1', load)
    await cache.get('u1', load)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('不同 key 相互独立', async () => {
    const cache = new PermissionCache<number>(60_000)
    await cache.get('u1', async () => 1)
    await cache.get('u2', async () => 2)
    expect(await cache.get('u1', async () => 99)).toBe(1)
  })
})
