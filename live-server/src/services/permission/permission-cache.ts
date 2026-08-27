interface Entry<V> {
  value: V
  expiresAt: number
}

/**
 * 进程内 TTL 缓存：权限校验热路径的主缓存。
 * 权限变更时通过 invalidate(key) 立即失效，避免依赖 TTL 等待。
 */
export class PermissionCache<V> {
  private map = new Map<string, Entry<V>>()

  constructor(private readonly ttlMs: number) {}

  async get(key: string, load: () => Promise<V>): Promise<V> {
    const now = Date.now()
    const hit = this.map.get(key)
    if (hit && hit.expiresAt > now) return hit.value
    const value = await load()
    this.map.set(key, { value, expiresAt: now + this.ttlMs })
    return value
  }

  invalidate(key: string): void {
    this.map.delete(key)
  }

  clear(): void {
    this.map.clear()
  }
}
