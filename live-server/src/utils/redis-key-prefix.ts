/**
 * Redis key prefix isolation.
 *
 * 同一台机多个 live-server 共用 Redis 时，靠这个 key 把读写空间隔开：
 * dev / uat / sit / prod 各自只读写自己 `<env>:*` 子集，互不踩。
 *
 * 默认 'dev'（zod 兜底）。生产环境（APP_ENV 是 prod / staging / uat /
 * demo）必须显式设非默认、非 'uat' 值；否则 zod refine 守卫 refuse to
 * start。详见 `config/env.ts` 的 superRefine。
 *
 * 实现细节：直接读 `process.env.REDIS_KEY_PREFIX`（不缓存），原因：
 *
 * 1. env 模块顶层 import 会导致测试里 `vi.resetModules()` 之后重新
 *    import 拿到的是同一个 `env` 对象快照（因为 rkp 模块已经持有引用），
 *    多个 case 之间无法切换 REDIS_KEY_PREFIX。
 * 2. 运行时每次都从 `process.env` 读 string 字段几乎零开销（V8 内联）。
 * 3. zod 在启动时已经验过 REDIS_KEY_PREFIX 的合法性和 prod-like 守卫，
 *    所以运行时直接读 process.env 是安全的。
 */

/** 当前进程所属环境的 Redis key prefix（env 字段，未设则 'dev'）。 */
export const redisKeyPrefix = (): string => process.env.REDIS_KEY_PREFIX ?? 'dev'

/**
 * @deprecated v1 opt-in 包装已废弃。`fastify.redis` 已经在 client 层（见
 * `utils/prefixed-redis.ts`）透明加 `<env>:` 前缀，调用方直接传裸 key
 * 即可。继续调这个函数是冗余但无害——它现在是个 no-op，返回原 key 不变。
 * 计划在下一个 release 删除。
 */
export const withPrefix = (key: string): string => key

/**
 * BullMQ queue / worker name 加前缀。
 *
 * BullMQ 在 `new QueueBase` 构造里硬性 reject 任何含 `:` 的 name
 * （`/node_modules/bullmq/dist/cjs/classes/queue-base.js`：
 * `if (name.includes(':')) throw new Error('Queue name cannot contain :')`）。
 * 因此本函数用 `_<env>` 代替 `:<env>` 拼出名字。
 *
 * 例: `withBullmqPrefix('rule-check-realtime')` 在 prefix='uat' 时返回
 *     `'uat_rule-check-realtime'`，对应 BullMQ 内部 redis key
 *     `bull:uat_rule-check-realtime:*`，与 dev worktree 的
 *     `bull:dev_rule-check-realtime:*` 自然隔离。
 *
 * 4 个服务（live-server / pbs-server / connector-server / engine-server）
 * 已经在 SIT 部署里走不同 redis db（5/6/7/8），BullMQ 池天然不抢；
 * 此 prefix 是给"未来合并 db"或"未来 dev/UAT 共 db"场景的额外保险层。
 */
export const withBullmqPrefix = (name: string): string => {
  const p = redisKeyPrefix()
  if (!p) return name
  return `${p}_${name}`
}
