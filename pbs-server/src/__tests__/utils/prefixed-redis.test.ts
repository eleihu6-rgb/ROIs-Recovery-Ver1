import test from 'node:test'
import assert from 'node:assert/strict'
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

const originalPrefix = process.env.REDIS_KEY_PREFIX

test('createPrefixedRedis: prefix set in env is applied to all key calls', async (t) => {
  t.after(() => {
    if (originalPrefix === undefined) delete process.env.REDIS_KEY_PREFIX
    else process.env.REDIS_KEY_PREFIX = originalPrefix
  })
  process.env.REDIS_KEY_PREFIX = 'sit'

  const { client, calls } = makeRaw()
  const r = createPrefixedRedis(client as never)

  await r.get('roster:v2:list:1')
  assert.equal(calls[0].args[0], 'sit:roster:v2:list:1')

  await r.set('lock:crew:42', 'tok', { EX: 60 })
  assert.deepEqual(calls[1].args, ['sit:lock:crew:42', 'tok', { EX: 60 }])

  await r.mGet(['roster:a', 'roster:b'])
  assert.deepEqual(calls[2].args[0], ['sit:roster:a', 'sit:roster:b'])

  await r.scan(0, { MATCH: 'roster:*', COUNT: 100 })
  assert.equal(calls[3].args[0], 0)
  assert.match(JSON.stringify(calls[3].args[1]), /sit:roster:\*/)

  await r.eval('return KEYS[1]', { keys: ['lock:a', 'lock:b'], arguments: ['x'] })
  assert.deepEqual(calls[4].args[1], { keys: ['sit:lock:a', 'sit:lock:b'], arguments: ['x'] })

  await r.publish('ws:broadcast:f8_sit_live', 'hello')
  assert.equal(calls[5].args[0], 'sit:ws:broadcast:f8_sit_live')
})

test('createPrefixedRedis: no double-prefixing when key already has prefix', async (t) => {
  t.after(() => {
    if (originalPrefix === undefined) delete process.env.REDIS_KEY_PREFIX
    else process.env.REDIS_KEY_PREFIX = originalPrefix
  })
  process.env.REDIS_KEY_PREFIX = 'sit'

  const { client, calls } = makeRaw()
  const r = createPrefixedRedis(client as never)

  await r.get('sit:roster:already')
  assert.equal(calls[0].args[0], 'sit:roster:already')
})

test('createPrefixedRedis: pass-through when REDIS_KEY_PREFIX is unset (default "dev")', async (t) => {
  t.after(() => {
    if (originalPrefix === undefined) delete process.env.REDIS_KEY_PREFIX
    else process.env.REDIS_KEY_PREFIX = originalPrefix
  })
  delete process.env.REDIS_KEY_PREFIX

  const { client, calls } = makeRaw()
  const r = createPrefixedRedis(client as never)

  await r.get('roster:v2:list:1')
  assert.equal(calls[0].args[0], 'dev:roster:v2:list:1')
})

test('createPrefixedRedis: pass-through when REDIS_KEY_PREFIX is empty string', async (t) => {
  t.after(() => {
    if (originalPrefix === undefined) delete process.env.REDIS_KEY_PREFIX
    else process.env.REDIS_KEY_PREFIX = originalPrefix
  })
  process.env.REDIS_KEY_PREFIX = ''

  const { client, calls } = makeRaw()
  const r = createPrefixedRedis(client as never)

  await r.get('roster:v2:list:1')
  assert.equal(calls[0].args[0], 'roster:v2:list:1')
})

test('createPrefixedRedis: pass-through for non-key methods like ping', async () => {
  const { client, calls } = makeRaw()
  const r = createPrefixedRedis(client as never)
  await r.ping()
  assert.deepEqual(calls[0], { method: 'ping', args: [] })
})
test('createPrefixedRedis: duplicate() is bound to target (private field access works)', () => {
  // v2 fix: when caller invokes proxy.duplicate(), the underlying node-redis
  // client needs to read private class members via `this`. Our Proxy must
  // bind the method to the target so the original class instance is `this`.
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (typeof prop !== 'string') return undefined
      if (prop === 'duplicate') {
        return (..._args: unknown[]) => ({})
      }
      return undefined
    },
  }
  const raw = new Proxy({}, handler) as never
  const r = createPrefixedRedis(raw)
  const dup = (r as never as { duplicate: () => unknown }).duplicate
  assert.equal(typeof dup, 'function')
})
