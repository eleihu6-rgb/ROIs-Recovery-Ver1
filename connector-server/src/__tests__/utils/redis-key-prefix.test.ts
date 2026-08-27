import { describe, it, expect, vi } from 'vitest'

// Re-parse env under a chosen REDIS_KEY_PREFIX. env is parsed once per module
// load, so vi.resetModules() + dynamic import is required per scenario — same
// pattern as the live-server sibling test.
async function loadEnv(overrides: Record<string, string | undefined>) {
  vi.resetModules()
  for (const k of [
    'APP_ENV', 'REDIS_KEY_PREFIX', 'JWT_SECRET', 'PBS_INTERNAL_API_SECRET',
 'SSO_ENABLED',
  ]) delete process.env[k]
  process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'
  process.env.APP_ENV ??= 'development'
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

  it('accepts "prod" prefix in a production-like env', async () => {
    const { env, isProdLikeEnv } = await loadEnv({ APP_ENV: 'production', REDIS_KEY_PREFIX: 'prod' })
    expect(env.REDIS_KEY_PREFIX).toBe('prod')
    expect(isProdLikeEnv).toBe(true)
  })
})

describe('withPrefix (deprecated no-op)', () => {
  it('is a no-op pass-through — prefix injection moved to client layer', async () => {
    // v2 (2026-08-25): client wrapper createPrefixedRedis injects the
    // prefix at the ioredis boundary. withPrefix is kept as a deprecated
    // passthrough so existing call sites keep working without double
    // prefixing. Verify: it returns the input unchanged regardless of
    // REDIS_KEY_PREFIX.
    vi.resetModules()
    for (const k of ['APP_ENV', 'REDIS_KEY_PREFIX', 'JWT_SECRET']) delete process.env[k]
    process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test'
    process.env.APP_ENV = 'development'
    process.env.REDIS_KEY_PREFIX = 'uat'
    const rkp = await import('../../utils/redis-key-prefix.js')
    expect(rkp.withPrefix('connector.flight.inbound')).toBe('connector.flight.inbound')
    expect(rkp.withPrefix('connector.poll.trigger')).toBe('connector.poll.trigger')
  })
})

describe('redisKeyPrefix (env reader)', () => {
  it('redisKeyPrefix() reads process.env at call time', async () => {
    vi.resetModules()
    process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test'
    process.env.REDIS_KEY_PREFIX = 'sit'
    const rkp = await import('../../utils/redis-key-prefix.js')
    expect(rkp.redisKeyPrefix()).toBe('sit')
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
    for (const k of ['APP_ENV', 'REDIS_KEY_PREFIX', 'JWT_SECRET', 'PBS_INTERNAL_API_SECRET']) delete process.env[k]
    process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test'
    process.env.APP_ENV = 'development'
    process.env.REDIS_KEY_PREFIX = 'uat'
    const rkp = await import('../../utils/redis-key-prefix.js')
    expect(rkp.withBullmqPrefix('connector.flight.inbound')).toBe('uat_connector.flight.inbound')
    expect(rkp.withBullmqPrefix('connector.poll.trigger')).toBe('uat_connector.poll.trigger')
  })

  it('returns the bare name when prefix is empty string', async () => {
    vi.resetModules()
    process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test'
    process.env.REDIS_KEY_PREFIX = ''
    const rkp = await import('../../utils/redis-key-prefix.js')
    expect(rkp.withBullmqPrefix('connector.poll.trigger')).toBe('connector.poll.trigger')
  })
})
