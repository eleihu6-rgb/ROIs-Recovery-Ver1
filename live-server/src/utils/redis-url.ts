/**
 * Parse a redis:// URL into connection components for BullMQ.
 * Returns fallback defaults on invalid input.
 */
export function parseRedisUrl(url: string): { host: string; port: number; password?: string; db?: number } {
  try {
    const p = new URL(url)
    const db = Number(p.pathname.replace('/', ''))
    return {
      host: p.hostname || 'localhost',
      port: Number(p.port) || 6379,
      password: p.password ? decodeURIComponent(p.password) : undefined,
      db: Number.isFinite(db) ? db : undefined,
    }
  } catch {
    return { host: 'localhost', port: 6379, password: undefined }
  }
}
