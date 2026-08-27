import { describe, it, expect, vi } from 'vitest'

// Re-parse config/env.ts under a chosen environment. env is parsed once per
// module load, so vi.resetModules() + dynamic import is required per scenario.
async function loadEnv(overrides: Record<string, string | undefined>) {
  vi.resetModules()
  for (const k of [
    'APP_ENV',
    'JWT_SECRET',
    'PBS_INTERNAL_API_SECRET',
    'REDIS_KEY_PREFIX',
  ]) delete process.env[k]
  process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'
  // Pre-populate deployment-specific secrets + non-default REDIS_KEY_PREFIX so
  // the unrelated production-like guards stay quiet. This test is scoped to
  // JWT_SECRET only — the other guards are covered in their own files.
  process.env.PBS_INTERNAL_API_SECRET = 'b'.repeat(40)
  process.env.REDIS_KEY_PREFIX = 'prod'
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  return import('../../config/env.js')
}

describe('JWT secret config guard', () => {
  it('rejects the known default secret in a production-like env', async () => {
    await expect(
      loadEnv({ APP_ENV: 'production', JWT_SECRET: 'rois-dev-jwt-secret-2026' }),
    ).rejects.toThrow(/JWT_SECRET/)
  })

  it('rejects a too-short secret in a production-like env', async () => {
    await expect(loadEnv({ APP_ENV: 'staging', JWT_SECRET: 'short' })).rejects.toThrow(/JWT_SECRET/)
  })

  it('accepts a strong secret in a production-like env', async () => {
    const mod = await loadEnv({ APP_ENV: 'production', JWT_SECRET: 'a'.repeat(40) })
    expect(mod.env.JWT_SECRET).toHaveLength(40)
    expect(mod.isProdLikeEnv).toBe(true)
  })

  it('allows the default secret in development', async () => {
    const mod = await loadEnv({ APP_ENV: 'development', JWT_SECRET: undefined })
    expect(mod.env.JWT_SECRET).toBe('rois-dev-jwt-secret-2026')
  })
})
