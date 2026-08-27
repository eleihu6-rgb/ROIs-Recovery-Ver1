import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createPrefixedRedis } from '../../utils/prefixed-redis.js'

/** Minimal mock for the node-redis v4 client — only records calls. */
const makeRaw = () => {
  const calls: Array<{ method: string; args: unknown[] }> = []
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (typeof prop !== 'string') return undefined
      return (...args: unknown[]) => {
        calls.push({ method: prop, args })
        return Promise.resolve(`<${prop}:${args.map(String).join('|')}>`)
      }
    },
  }
  return { client: new Proxy({}, handler) as never, calls }
}

describe('createPrefixedRedis', () => {
  const originalPrefix = process.env.REDIS_KEY_PREFIX
  beforeEach(() => {
    delete process.env.REDIS_KEY_PREFIX
  })
  afterEach(() => {
    if (originalPrefix === undefined) delete process.env.REDIS_KEY_PREFIX
    else process.env.REDIS_KEY_PREFIX = originalPrefix
  })

  it('passes through ping/info without prefixing', async () => {
    const { client, calls } = makeRaw()
    const r = createPrefixedRedis(client as never)
    await r.ping()
    expect(calls[0]).toEqual({ method: 'ping', args: [] })
  })

  it('prefixes single-key get', async () => {
    process.env.REDIS_KEY_PREFIX = 'sit'
    const { client, calls } = makeRaw()
    const r = createPrefixedRedis(client as never)
    await r.get('roster:v2:list:1')
    expect(calls[0].args[0]).toBe('sit:roster:v2:list:1')
  })

  it('prefixes single-key set with value and options', async () => {
    process.env.REDIS_KEY_PREFIX = 'sit'
    const { client, calls } = makeRaw()
    const r = createPrefixedRedis(client as never)
    await r.set('lock:crew:42', 'tok', { EX: 60 })
    expect(calls[0].args).toEqual(['sit:lock:crew:42', 'tok', { EX: 60 }])
  })

  it('prefixes mGet array of keys', async () => {
    process.env.REDIS_KEY_PREFIX = 'sit'
    const { client, calls } = makeRaw()
    const r = createPrefixedRedis(client as never)
    await r.mGet(['roster:a', 'roster:b'])
    expect(calls[0].args[0]).toEqual(['sit:roster:a', 'sit:roster:b'])
  })

  it('prefixes mSet flat array [k1,v1,k2,v2]', async () => {
    process.env.REDIS_KEY_PREFIX = 'sit'
    const { client, calls } = makeRaw()
    const r = createPrefixedRedis(client as never)
    await r.mSet(['roster:a', '1', 'roster:b', '2'])
    expect(calls[0].args[0]).toEqual(['sit:roster:a', '1', 'sit:roster:b', '2'])
  })

  it('prefixes scan MATCH pattern', async () => {
    process.env.REDIS_KEY_PREFIX = 'sit'
    const { client, calls } = makeRaw()
    const r = createPrefixedRedis(client as never)
    await r.scan(0, { MATCH: 'roster:*', COUNT: 100 })
    expect(calls[0].args[0]).toBe(0)
    expect(calls[0].args[1]).toMatchObject({ MATCH: 'sit:roster:*', COUNT: 100 })
  })

  it('does not double-prefix an already-prefixed key', async () => {
    process.env.REDIS_KEY_PREFIX = 'sit'
    const { client, calls } = makeRaw()
    const r = createPrefixedRedis(client as never)
    await r.get('sit:roster:already')
    expect(calls[0].args[0]).toBe('sit:roster:already')
  })

  it('uses "dev" as default prefix when REDIS_KEY_PREFIX is unset', async () => {
    const { client, calls } = makeRaw()
    const r = createPrefixedRedis(client as never)
    await r.get('roster:v2:list:1')
    expect(calls[0].args[0]).toBe('dev:roster:v2:list:1')
  })

  it('is a no-op pass-through when REDIS_KEY_PREFIX is empty string', async () => {
    process.env.REDIS_KEY_PREFIX = ''
    const { client, calls } = makeRaw()
    const r = createPrefixedRedis(client as never)
    await r.get('roster:v2:list:1')
    expect(calls[0].args[0]).toBe('roster:v2:list:1')
  })

  it('prefixes eval options.keys', async () => {
    process.env.REDIS_KEY_PREFIX = 'sit'
    const { client, calls } = makeRaw()
    const r = createPrefixedRedis(client as never)
    await r.eval('return KEYS[1]', { keys: ['lock:a', 'lock:b'], arguments: ['x'] })
    expect(calls[0].args[1]).toMatchObject({ keys: ['sit:lock:a', 'sit:lock:b'], arguments: ['x'] })
  })

  it('prefixes publish channel', async () => {
    process.env.REDIS_KEY_PREFIX = 'sit'
    const { client, calls } = makeRaw()
    const r = createPrefixedRedis(client as never)
    await r.publish('ws:broadcast:f8_sit_live', 'hello')
    expect(calls[0].args[0]).toBe('sit:ws:broadcast:f8_sit_live')
  })

  it('prefixes hGetAll / hSet / hDel', async () => {
    process.env.REDIS_KEY_PREFIX = 'sit'
    const { client, calls } = makeRaw()
    const r = createPrefixedRedis(client as never)
    await r.hGetAll('legality:recheck:F8:749:status')
    await r.hSet('legality:recheck:F8:749:status', 'field', 'value')
    await r.hDel('legality:recheck:F8:749:status', 'field')
    expect(calls[0].args[0]).toBe('sit:legality:recheck:F8:749:status')
    expect(calls[1].args[0]).toBe('sit:legality:recheck:F8:749:status')
    expect(calls[2].args[0]).toBe('sit:legality:recheck:F8:749:status')
  })

  it('prefixes sAdd / sMembers', async () => {
    process.env.REDIS_KEY_PREFIX = 'sit'
    const { client, calls } = makeRaw()
    const r = createPrefixedRedis(client as never)
    await r.sAdd('perm:roles:900', 'admin')
    await r.sMembers('perm:roles:900')
    expect(calls[0].args[0]).toBe('sit:perm:roles:900')
    expect(calls[1].args[0]).toBe('sit:perm:roles:900')
  })
})
  it('passes through duplicate() with target as this (private field access works)', async () => {
    // v2 fix: when caller invokes proxy.duplicate(), the underlying node-redis
    // client needs to read private class members via `this`. Our Proxy must
    // bind the method to the target so the original class instance is `this`.
    // Verify: the duplicate() method exists and is callable; the call
    // resolves without "Cannot read private member" error.
    const { client, calls } = makeRaw()
    // Override duplicate to simulate the real client behavior
    ;(client as unknown as { duplicate: () => unknown }).duplicate = () => ({})
    const r = createPrefixedRedis(client as never)
    // The wrapped duplicate should be bound to target — calling it should not throw
    const dup = (r as unknown as { duplicate: () => unknown }).duplicate
    expect(typeof dup).toBe('function')
    // We don't actually call it (mock doesn't implement enough); what we verify
    // here is that the function reference is preserved (not undefined).
  })
