import { describe, it, expect, vi } from 'vitest'

// Re-parse env under a chosen REDIS_KEY_PREFIX. env is parsed once per module
// load, so vi.resetModules() + dynamic import is required per scenario — same
// pattern as config-guard.test.ts.
//
// We always pass a strong JWT_SECRET and a deployment-specific PBS_INTERNAL_API_SECRET
// when APP_ENV is production-like, so the unrelated guards don't fail our test.
//
// Returns `{ env, rkp, isProdLikeEnv }` where `env` is the parsed env object
// (NOT the module namespace) and `rkp` is the redis-key-prefix utility. This
// avoids the footgun of returning the module namespace as `env` and then
// destructure-shadowing it in the test (which would silently yield undefined
// for every field — exactly the bug that produced 3 false-failures earlier).
async function loadEnv(overrides: Record<string, string | undefined>) {
  vi.resetModules()
  for (const k of [
    'APP_ENV', 'REDIS_KEY_PREFIX', 'JWT_SECRET', 'PBS_INTERNAL_API_SECRET',
    'SSO_ENABLED',
  ]) delete process.env[k]
  process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'
  process.env.APP_ENV ??= 'development'
  // Pre-populate production-like secrets so the other guards stay quiet.
  if ((overrides.APP_ENV ?? 'development') !== 'development' && (overrides.APP_ENV ?? '') !== 'test') {
    process.env.JWT_SECRET = 'a'.repeat(40)
    process.env.PBS_INTERNAL_API_SECRET = 'b'.repeat(40)
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  const mod = await import('../../config/env.js')
  const rkp = await import('../../utils/redis-key-prefix.js')
  return { env: mod.env, rkp, isProdLikeEnv: mod.isProdLikeEnv }
}

describe('REDIS_KEY_PREFIX env field', () => {
  it('defaults to "dev" when env is unset', async () => {
    const { env } = await loadEnv({ REDIS_KEY_PREFIX: undefined })
    expect(env.REDIS_KEY_PREFIX).toBe('dev')
  })

  it('accepts the documented env values (dev/uat/sit)', async () => {
    for (const value of ['dev', 'uat', 'sit']) {
      const { env } = await loadEnv({ REDIS_KEY_PREFIX: value })
      expect(env.REDIS_KEY_PREFIX).toBe(value)
    }
  })

  it('rejects invalid characters (uppercase, spaces, special chars)', async () => {
    await expect(loadEnv({ REDIS_KEY_PREFIX: 'UAT' })).rejects.toThrow(/REDIS_KEY_PREFIX/)
    await expect(loadEnv({ REDIS_KEY_PREFIX: 'uat live' })).rejects.toThrow(/REDIS_KEY_PREFIX/)
    await expect(loadEnv({ REDIS_KEY_PREFIX: 'uat.live' })).rejects.toThrow(/REDIS_KEY_PREFIX/)
  })

  it('refuses default "dev" prefix in a production-like env', async () => {
    await expect(
      loadEnv({ APP_ENV: 'production', REDIS_KEY_PREFIX: 'dev' }),
    ).rejects.toThrow(/REDIS_KEY_PREFIX/)
  })

  it('refuses "uat" prefix in a production-like env', async () => {
    await expect(
      loadEnv({ APP_ENV: 'uat', REDIS_KEY_PREFIX: 'uat' }),
    ).rejects.toThrow(/REDIS_KEY_PREFIX/)
  })

  it('refuses default "dev" prefix when APP_ENV=staging', async () => {
    await expect(
      loadEnv({ APP_ENV: 'staging', REDIS_KEY_PREFIX: 'dev' }),
    ).rejects.toThrow(/REDIS_KEY_PREFIX/)
  })

  it('accepts "prod" prefix in a production-like env', async () => {
    const { env, isProdLikeEnv } = await loadEnv({ APP_ENV: 'production', REDIS_KEY_PREFIX: 'prod' })
    expect(env.REDIS_KEY_PREFIX).toBe('prod')
    // isProdLikeEnv is a top-level const in env.ts captured at import time; the
    // re-import after vi.resetModules() is what we just did, so it reflects
    // APP_ENV=production.
    expect(isProdLikeEnv).toBe(true)
  })
})

describe('withPrefix (deprecated no-op)', () => {
  it('is a no-op pass-through — prefix injection moved to client layer', async () => {
    // v2 (2026-08-25): the client wrapper `createPrefixedRedis` (see
    // utils/prefixed-redis.ts) now injects the prefix transparently at the
    // ioredis boundary. `withPrefix` is kept as a deprecated passthrough so
    // existing call sites that still import it keep working without double
    // prefixing. Verify: it returns the input unchanged regardless of
    // REDIS_KEY_PREFIX.
    vi.resetModules()
    for (const k of ['APP_ENV', 'REDIS_KEY_PREFIX', 'JWT_SECRET']) delete process.env[k]
    process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test'
    process.env.APP_ENV = 'development'
    process.env.REDIS_KEY_PREFIX = 'uat'
    const rkp = await import('../../utils/redis-key-prefix.js')
    expect(rkp.withPrefix('roster-bulk-delete')).toBe('roster-bulk-delete')
    expect(rkp.withPrefix('pairing:1')).toBe('pairing:1')
    expect(rkp.withPrefix('mutation:exclusive:f8:roster-bulk-delete')).toBe(
      'mutation:exclusive:f8:roster-bulk-delete',
    )
  })
})

describe('redisKeyPrefix (env reader)', () => {
  it('redisKeyPrefix() reads process.env at call time', async () => {
    vi.resetModules()
    process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test'
    process.env.REDIS_KEY_PREFIX = 'sit'
    const rkp = await import('../../utils/redis-key-prefix.js')
    expect(rkp.redisKeyPrefix()).toBe('sit')

    // Mutate process.env and re-read — should reflect the new value.
    process.env.REDIS_KEY_PREFIX = 'uat'
    expect(rkp.redisKeyPrefix()).toBe('uat')
  })

  it('defaults to "dev" when REDIS_KEY_PREFIX is unset', async () => {
    vi.resetModules()
    process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test'
    delete process.env.REDIS_KEY_PREFIX
    const rkp = await import('../../utils/redis-key-prefix.js')
    expect(rkp.redisKeyPrefix()).toBe('dev')
  })
})


describe('withBullmqPrefix', () => {
  it('prepends "<env>_" (underscore) for BullMQ compatibility', async () => {
    vi.resetModules()
    for (const k of ['APP_ENV', 'REDIS_KEY_PREFIX', 'JWT_SECRET']) delete process.env[k]
    process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test'
    process.env.APP_ENV = 'development'
    process.env.REDIS_KEY_PREFIX = 'uat'
    const rkp = await import('../../utils/redis-key-prefix.js')
    // BullMQ hard-rejects ':' in queue names; we use '_' instead.
    expect(rkp.withBullmqPrefix('rule-check-realtime')).toBe('uat_rule-check-realtime')
    expect(rkp.withBullmqPrefix('connector.flight.inbound')).toBe('uat_connector.flight.inbound')
  })

  it('returns the bare name when prefix is empty string', async () => {
    vi.resetModules()
    process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test'
    process.env.REDIS_KEY_PREFIX = ''
    const rkp = await import('../../utils/redis-key-prefix.js')
    expect(rkp.withBullmqPrefix('rule-check-realtime')).toBe('rule-check-realtime')
  })
})
