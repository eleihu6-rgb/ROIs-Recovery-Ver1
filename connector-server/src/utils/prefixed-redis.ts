/**
 * Prefixed Redis client wrapper.
 *
 * 把 node-redis client (`createClient(...)`) 包一层 Proxy，让所有 key /
 * channel 接受/写出的位置透明地加 `<REDIS_KEY_PREFIX>:` 前缀。调用方
 * （route / service / worker）继续写裸 key：
 *
 *   await fastify.redis.get('roster:v2:list:123')    // 实际命中 sit:roster:v2:list:123
 *   await fastify.redis.set('lock:crew:42', token)   // 实际写入 sit:lock:crew:42
 *
 * 这把 v1 设计里"call site 必须自觉 withPrefix(...)"的契约变成不可绕过：
 * 不存在"忘了加 prefix"的漏网之鱼。
 *
 * BullMQ 的 ioredis 客户端**不**走这个 wrapper——它的 queue/worker 名字
 * 由 `withBullmqPrefix` 注入（`_` 分隔符），并且 BullMQ 自己的内部 key
 * 用 `bull:` 前缀，硬性不能被外面再加一层 `:`。BullMQ 的连接由
 * `plugins/bullmq.ts` 单独管。
 *
 * 设计取舍：每次调用都重新 `redisKeyPrefix()` 读 env（不缓存），与
 * `redis-key-prefix.ts` 一致——确保 vitest 在 `vi.resetModules()` 之间切
 * REDIS_KEY_PREFIX 仍然生效。
 */

import type { RedisClientType } from 'redis'
import { redisKeyPrefix } from './redis-key-prefix.js'

/** 当前 env 的 prefix 字符串（含末尾 `:`），空 prefix 退化到 `''`。 */
const pfx = (): string => {
  const p = redisKeyPrefix()
  return p ? `${p}:` : ''
}

/** 给一个 key 加 prefix。已带 prefix（首段 = prefix）的不重复加。 */
const prefixKey = (k: string): string => {
  const p = pfx()
  if (!p) return k
  if (k.startsWith(p)) return k
  return `${p}${k}`
}

/** 把多 key 数组逐个加 prefix。 */
const prefixKeys = (ks: readonly string[]): string[] => ks.map(prefixKey)

/** 列表形式的 eval keys（来自 options.keys）。 */
const prefixEvalKeys = (opts: unknown): unknown => {
  if (!opts || typeof opts !== 'object') return opts
  const o = opts as Record<string, unknown>
  if (Array.isArray(o.keys)) {
    return { ...o, keys: prefixKeys(o.keys as string[]) }
  }
  return opts
}

/** 转换 scan options 的 MATCH 模式。已带 prefix 的不重复加。 */
const prefixScanOpts = (opts: unknown): unknown => {
  if (!opts || typeof opts !== 'object') return opts
  const o = opts as Record<string, unknown>
  if (typeof o.MATCH === 'string') {
    return { ...o, MATCH: prefixKey(o.MATCH) }
  }
  return opts
}

/** 给一个 pubsub channel 加 prefix。 */
const prefixChannel = (ch: string): string => prefixKey(ch)

/**
 * node-redis v4 的 RedisClientType 有 ~100 个方法。这里只列出我们在
 * route / service / worker 里实际用到的 + 一些高危的近邻方法。其它方法
 * 通过 Proxy 透传（不动 key）。
 */
const HANDLED_METHODS = new Set([
  // 单 key
  'get', 'set', 'del', 'unlink', 'incr', 'decr', 'expire', 'pexpire',
  'ttl', 'pttl', 'persist', 'exists', 'type', 'rename', 'renameNX',
  'getDel', 'getSet', 'getEx', 'setEx', 'pSetEx', 'setNX', 'setXX',
  // 多 key
  'mGet', 'mSet', 'mSetNX',
  // hash
  'hGet', 'hSet', 'hDel', 'hGetAll', 'hIncrBy', 'hLen', 'hKeys', 'hVals',
  'hExists', 'hSetNX',
  // set
  'sAdd', 'sRem', 'sMembers', 'sIsMember', 'sCard', 'sPop', 'sInter',
  'sUnion', 'sDiff', 'sMove',
  // 模式
  'scan', 'scanStream',
  // 脚本
  'eval', 'evalSha',
  // pub-sub
  'publish', 'subscribe', 'pSubscribe', 'unsubscribe', 'pUnsubscribe',
])

/**
 * 创建一个透明加 prefix 的 Redis client proxy。
 *
 * 用法：
 *   const raw = createClient({ url: env.REDIS_URL })
 *   await raw.connect()
 *   const redis = createPrefixedRedis(raw)
 *   fastify.decorate('redis', redis)
 */
export const createPrefixedRedis = (raw: RedisClientType): RedisClientType => {
  return new Proxy(raw, {
    get(target, prop, receiver) {
      if (typeof prop !== 'string') {
        return Reflect.get(target, prop, receiver)
      }
      const value = Reflect.get(target, prop, receiver)
      if (typeof value !== 'function') {
        return value
      }
      // Non-handled methods (e.g. `duplicate`, `connect`, `on`, `quit`,
      // `sendCommand`) must run with the raw client as `this` so internal
      // private-field reads work. `duplicate()` in particular returns a fresh
      // client that internally reads from the original class — wrapping the
      // return value in our proxy would break that.
      if (!HANDLED_METHODS.has(prop)) {
        return value.bind(target)
      }
      // 关键方法：拦截，重写 key 位置
      return (...args: unknown[]) => {
        switch (prop) {
          // 单 key
          case 'get':
          case 'getDel':
          case 'getSet':
          case 'getEx':
          case 'incr':
          case 'decr':
          case 'expire':
          case 'pexpire':
          case 'ttl':
          case 'pttl':
          case 'persist':
          case 'exists':
          case 'type':
          case 'rename':
          case 'renameNX':
          case 'setEx':
          case 'pSetEx':
          case 'setNX':
          case 'setXX':
            return (value as (...a: unknown[]) => unknown).apply(target, [prefixKey(args[0] as string), ...args.slice(1)])

          // set: key + value + opts
          case 'set':
            return (value as (...a: unknown[]) => unknown).apply(target, [prefixKey(args[0] as string), args[1], ...args.slice(2)])

          // del / unlink: 多 key 形式
          case 'del':
          case 'unlink': {
            if (args.length === 1 && Array.isArray(args[0])) {
              return (value as (...a: unknown[]) => unknown).apply(target, [prefixKeys(args[0] as string[])])
            }
            return (value as (...a: unknown[]) => unknown).apply(target, [prefixKey(args[0] as string), ...args.slice(1)])
          }

          // mGet: 数组
          case 'mGet':
            return (value as (...a: unknown[]) => unknown).apply(target, [prefixKeys(args[0] as string[])])

          // mSet / mSetNX: [['k','v','k','v']] 或 [k1, v1, k2, v2]
          case 'mSet':
          case 'mSetNX': {
            if (args.length === 1 && Array.isArray(args[0])) {
              const flat = args[0] as string[]
              const out: string[] = []
              for (let i = 0; i < flat.length; i += 2) {
                out.push(prefixKey(flat[i] as string))
                out.push(flat[i + 1] as string)
              }
              return (value as (...a: unknown[]) => unknown).apply(target, [out])
            }
            const out: unknown[] = []
            for (let i = 0; i < args.length; i += 2) {
              out.push(prefixKey(args[i] as string))
              out.push(args[i + 1])
            }
            return (value as (...a: unknown[]) => unknown).apply(target, out)
          }

          // hash: [key, field, ...]
          case 'hGet':
          case 'hExists':
          case 'hDel':
          case 'hIncrBy':
          case 'hSet':
          case 'hSetNX':
          case 'hGetAll':
          case 'hKeys':
          case 'hVals':
          case 'hLen':
            return (value as (...a: unknown[]) => unknown).apply(target, [prefixKey(args[0] as string), ...args.slice(1)])

          // set 类型
          case 'sAdd':
          case 'sRem':
          case 'sMembers':
          case 'sIsMember':
          case 'sCard':
          case 'sPop':
          case 'sMove':
            return (value as (...a: unknown[]) => unknown).apply(target, [prefixKey(args[0] as string), ...args.slice(1)])
          case 'sInter':
          case 'sUnion':
          case 'sDiff':
            return (value as (...a: unknown[]) => unknown).apply(target, [prefixKeys(args[0] as string[])])

          // scan / scanStream
          case 'scan': {
            if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
              return (value as (...a: unknown[]) => unknown).apply(target, [prefixScanOpts(args[0])])
            }
            if (args.length >= 2) {
              return (value as (...a: unknown[]) => unknown).apply(target, [args[0], prefixScanOpts(args[1]), ...args.slice(2)])
            }
            return (value as (...a: unknown[]) => unknown).apply(target, args)
          }
          case 'scanStream': {
            if (args.length >= 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
              return (value as (...a: unknown[]) => unknown).apply(target, [prefixScanOpts(args[0]), ...args.slice(1)])
            }
            return (value as (...a: unknown[]) => unknown).apply(target, args)
          }

          // eval / evalSha: (script, options, ...args)
          case 'eval':
          case 'evalSha': {
            if (args.length >= 2 && args[1] && typeof args[1] === 'object' && !Array.isArray(args[1])) {
              return (value as (...a: unknown[]) => unknown).apply(target, [args[0], prefixEvalKeys(args[1]), ...args.slice(2)])
            }
            return (value as (...a: unknown[]) => unknown).apply(target, args)
          }

          // pub-sub
          case 'publish':
            return (value as (...a: unknown[]) => unknown).apply(target, [prefixChannel(args[0] as string), ...args.slice(1)])
          case 'subscribe':
          case 'pSubscribe':
          case 'unsubscribe':
          case 'pUnsubscribe': {
            if (args.length === 1 && Array.isArray(args[0])) {
              return (value as (...a: unknown[]) => unknown).apply(target, [(args[0] as string[]).map(prefixChannel)])
            }
            return (value as (...a: unknown[]) => unknown).apply(target, args.map((a) => typeof a === 'string' ? prefixChannel(a) : a))
          }

          default:
            return (value as (...a: unknown[]) => unknown).apply(target, args)
        }
      }
    },
  })
}
