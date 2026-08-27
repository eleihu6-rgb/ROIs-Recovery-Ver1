import { describe, it, expect, vi } from 'vitest'

async function loadEnv(overrides: Record<string, string | undefined>) {
  vi.resetModules()
  for (const k of ['APP_ENV', 'JWT_SECRET']) delete process.env[k]
  process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  return import('../../config/env.js')
}

describe('JWT secret config guard (connector-server)', () => {
  it('rejects the known default secret in a production-like env', async () => {
    await expect(
      loadEnv({ APP_ENV: 'production', JWT_SECRET: 'rois-dev-jwt-secret-2026' }),
    ).rejects.toThrow(/JWT_SECRET/)
  })

  it('rejects a too-short secret in a production-like env', async () => {
    await expect(loadEnv({ APP_ENV: 'demo', JWT_SECRET: 'short' })).rejects.toThrow(/JWT_SECRET/)
  })

  it('accepts a strong secret in a production-like env', async () => {
    const mod = await loadEnv({ APP_ENV: 'production', JWT_SECRET: 'a'.repeat(40) })
    expect(mod.isProdLikeEnv).toBe(true)
  })

  it('allows the default secret in development', async () => {
    const mod = await loadEnv({ APP_ENV: 'development', JWT_SECRET: undefined })
    expect(mod.env.JWT_SECRET).toBe('rois-dev-jwt-secret-2026')
    expect(mod.isProdLikeEnv).toBe(false)
  })
})
