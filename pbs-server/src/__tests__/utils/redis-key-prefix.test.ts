import assert from 'node:assert/strict'
import test from 'node:test'
import { spawn } from 'node:child_process'

async function runScenario(overrides: Record<string, string | undefined>): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DATABASE_URL: 'postgres://test:test@localhost:5432/test',
      APP_ENV: 'development',
      ...overrides,
    }
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete env[k]
    }
    if ((env.APP_ENV ?? 'development') !== 'development' && env.APP_ENV !== 'test') {
      env.JWT_SECRET ??= 'a'.repeat(40)
      env.PBS_INTERNAL_API_SECRET ??= 'b'.repeat(40)
      env.PBS_AUTH_RSA_PRIVATE_KEY ??= 'a'.repeat(40)
      env.PBS_AUTH_RSA_KEY_ID ??= 'test-key'
    }
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e',
        'const envMod = await import("./src/config/env.ts"); const mod = envMod.default ?? envMod;' +
        'const rkpMod = await import("./src/utils/redis-key-prefix.ts"); const rkp = rkpMod.default ?? rkpMod;' +
        'const out = { REDIS_KEY_PREFIX: mod.env.REDIS_KEY_PREFIX, isProdLikeEnv: mod.isProdLikeEnv, withPrefix: rkp.withPrefix("x"), redisKeyPrefix: rkp.redisKeyPrefix() };' +
        'process.stdout.write(JSON.stringify(out));'
      ],
      { cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code: stdout ? code! : code!, stdout, stderr }))
  })
}

test('REDIS_KEY_PREFIX defaults to dev when unset', async () => {
  const { code, stdout, stderr } = await runScenario({ REDIS_KEY_PREFIX: undefined })
  assert.equal(code, 0, 'expected success, got stderr=' + stderr)
  const out = JSON.parse(stdout)
  assert.equal(out.REDIS_KEY_PREFIX, 'dev')
})

test('REDIS_KEY_PREFIX accepts dev/uat/sit', async () => {
  for (const value of ['dev', 'uat', 'sit']) {
    const { code, stdout, stderr } = await runScenario({ REDIS_KEY_PREFIX: value })
    assert.equal(code, 0, 'value=' + value + ' stderr=' + stderr)
    const out = JSON.parse(stdout)
    assert.equal(out.REDIS_KEY_PREFIX, value)
  }
})

test('REDIS_KEY_PREFIX rejects invalid characters', async () => {
  for (const bad of ['UAT', 'uat live', 'uat.live']) {
    const { code } = await runScenario({ REDIS_KEY_PREFIX: bad })
    assert.notEqual(code, 0, 'expected failure for ' + bad)
  }
})

test('REDIS_KEY_PREFIX refuses dev in production-like env', async () => {
  const { code } = await runScenario({ APP_ENV: 'production', REDIS_KEY_PREFIX: 'dev' })
  assert.notEqual(code, 0, 'expected refusal')
})

test('REDIS_KEY_PREFIX refuses uat in production-like env', async () => {
  const { code } = await runScenario({ APP_ENV: 'uat', REDIS_KEY_PREFIX: 'uat' })
  assert.notEqual(code, 0, 'expected refusal')
})

test('REDIS_KEY_PREFIX accepts prod in production-like env', async () => {
  const { code, stdout, stderr } = await runScenario({ APP_ENV: 'production', REDIS_KEY_PREFIX: 'prod' })
  assert.equal(code, 0, 'stderr=' + stderr)
  const out = JSON.parse(stdout)
  assert.equal(out.REDIS_KEY_PREFIX, 'prod')
  assert.equal(out.isProdLikeEnv, true)
})

test('withPrefix is a no-op pass-through (v2 client-level injection)', async () => {
  // v2 (2026-08-25): the client wrapper createPrefixedRedis injects the
  // prefix at the ioredis boundary. withPrefix is kept as a deprecated
  // passthrough so existing call sites keep working without double
  // prefixing. Verify: it returns the input unchanged regardless of
  // REDIS_KEY_PREFIX.
  const { code, stdout, stderr } = await runScenario({ REDIS_KEY_PREFIX: 'uat' })
  assert.equal(code, 0, 'stderr=' + stderr)
  const out = JSON.parse(stdout)
  assert.equal(out.withPrefix, 'x')
})

test('REDIS_KEY_PREFIX rejects empty string (zod regex requires non-empty)', async () => {
  const { code } = await runScenario({ REDIS_KEY_PREFIX: '' })
  assert.notEqual(code, 0, 'expected refusal of empty string')
})

test('redisKeyPrefix reads process.env at call time', async () => {
  const { code, stdout, stderr } = await runScenario({ REDIS_KEY_PREFIX: 'sit' })
  assert.equal(code, 0, 'stderr=' + stderr)
  const out = JSON.parse(stdout)
  assert.equal(out.redisKeyPrefix, 'sit')
})
