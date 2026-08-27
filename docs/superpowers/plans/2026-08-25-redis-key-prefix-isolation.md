# Redis Key Prefix Isolation Implementation Plan

**Plan bug — fixed in this commit**

Applies `withBullmqPrefix` to all BullMQ call sites in live-server
(16 worker files + 1 plugin) and connector-server (1 plugin + 2 worker
+ 1 orchestrator). pbs-server / engine-server have no BullMQ call
sites, so they only need `withPrefix` (no change).

BullMQ `QueueBase` hard-rejects any queue name containing `:` (see
`node_modules/bullmq/dist/cjs/classes/queue-base.js:35`:
`if (name.includes(':')) throw new Error('Queue name cannot contain :')`).
The original Task 2 design wrapped `new Queue(name)` with `withPrefix(name)`,
producing e.g. `sit:rule-check-realtime`, which crashed the live-server at
boot and brought all four SIT services down (5:18–5:27 on 2026-08-25).

Resolution: `redis-key-prefix.ts` now exports two wrappers:
- `withPrefix(key)`     -> `${prefix}:${key}` (cache / lock / hash / ws / generic Redis key)
- `withBullmqPrefix(n)` -> `${prefix}_${n}` (BullMQ Queue / Worker name only)

Task 2 (and the matching pbs / connector / engine tasks) must use
`withBullmqPrefix(...)` for every `new Queue/Worker` call site, NOT
`withPrefix(...)`. The fix applied in this commit to live-server (16 worker files + 1 plugin)
and connector-server (1 plugin + 2 worker + 1 orchestrator); pbs-server /
engine-server have no BullMQ call sites, so they only need `withPrefix`.

---

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 dev / UAT / SIT / prod 各自的 4 个服务（live-server / pbs-server / connector-server / engine-server）通过 `<env>:*` prefix 隔离同一 Redis 实例上的 key 空间，根治 batch delete 跨环境 race 触发的 `column rf.dp_min does not exist` 失败。

**Architecture:** 引入 `REDIS_KEY_PREFIX` env（默认 `dev`，prod 强制），新建 `redis-key-prefix.ts` 工具，所有 BullMQ queue name / cache key / 业务直写 key 统一过 `withPrefix()`。先在 live-server 落地模板（最复杂、改动面最大），再把同一套工具以 3 个并行 commit 同步到 pbs / connector / engine。最后跑一条 SQL 修 f8_dev_live 缺 dp_min 的问题。

**Tech Stack:** Node.js + Fastify + TypeScript (zod) for live/pbs/connector; Python + FastAPI + pydantic-settings for engine; BullMQ + node-redis; PostgreSQL 16.

---

## File Structure

### New files
- `live-server/src/utils/redis-key-prefix.ts` —— TypeScript 工具
- `live-server/src/__tests__/utils/redis-key-prefix.test.ts` —— 单测
- `pbs-server/src/utils/redis-key-prefix.ts` —— 复用实现
- `pbs-server/src/__tests__/utils/redis-key-prefix.test.ts` —— 单测
- `connector-server/src/utils/redis-key-prefix.ts` —— 复用实现
- `connector-server/src/__tests__/utils/redis-key-prefix.test.ts` —— 单测
- `engine-server/app/utils/redis_key_prefix.py` —— Python 版
- `engine-server/tests/test_redis_key_prefix.py` —— pytest

### Modified files (live-server, ~16)
- `live-server/src/config/env.ts` —— 加 REDIS_KEY_PREFIX
- `live-server/src/plugins/bullmq.ts` —— 7 个 queue name 过 withPrefix
- `live-server/src/workers/roster-bulk-delete-worker.ts` —— Worker queue name
- `live-server/src/workers/flight-inbound-worker.ts`
- `live-server/src/workers/pairing-inbound-worker.ts`
- `live-server/src/workers/crew-inbound-worker.ts`
- `live-server/src/workers/roster-inbound-worker.ts`
- `live-server/src/workers/roster-ground-inbound-worker.ts`
- `live-server/src/workers/partition-manager-worker.ts`
- `live-server/src/workers/scenario-legality-sweep.ts`
- `live-server/src/workers/roster-retention-cleanup-worker.ts`
- `live-server/src/workers/batch-crew-worker.ts`
- `live-server/src/workers/batch-orchestrator-worker.ts`
- `live-server/src/utils/cache.ts` —— getOrSet / getOrSetChunks / invalidate / invalidatePattern 全部过 withPrefix
- `live-server/src/services/lock/mutation-exclusive-service.ts` —— mutation:exclusive:* 加 prefix
- `live-server/src/services/rule/legality-recheck.ts` —— legality:recheck:* 加 prefix
- `live-server/src/services/roster/roster-publish-outbound-service.ts` —— CONNECTOR_ROSTER_OUTBOUND_QUEUE + 自有 key
- `live-server/src/plugins/websocket.ts` —— ws broadcast channel（如有）
- `live-server/.env`（dev worktree）—— 加 REDIS_KEY_PREFIX=dev
- `live-server/src/__tests__/workers/roster-bulk-delete-worker.test.ts`（如存在）—— mock update
- 同类单测（`*worker.test.ts`）—— 接受 prefix-aware queue name

### Modified files (pbs-server)
- `pbs-server/src/config/env.ts`（或 index.ts）—— 加 REDIS_KEY_PREFIX
- 所有 `new Queue` / `new Worker` 调用 —— queue name 加 prefix
- pbs-server 部署 `.env` —— 加 REDIS_KEY_PREFIX=uat（UAT 部署）

### Modified files (connector-server)
- `connector-server/src/config/env.ts` —— 加 REDIS_KEY_PREFIX
- 所有 `new Queue` / `new Worker` 调用 —— queue name 加 prefix
- connector-server 部署 `.env` —— 加 REDIS_KEY_PREFIX=uat（UAT 部署）

### Modified files (engine-server)
- `engine-server/app/config.py`（或 settings.py）—— 加 REDIS_KEY_PREFIX pydantic 字段
- 所有 BullMQ-like 队列引用 —— queue name 加 prefix
- engine-server 部署 `.env` —— 加 REDIS_KEY_PREFIX=uat（UAT 部署）

### SQL fix
- `f8_dev_live.roster_flight` —— 跑 `sql/migration/2026-08-19-roster-dp-min.sql` 加 dp_min

### Deployment
- `live-server.env`（UAT）—— `REDIS_KEY_PREFIX=uat`
- `live-server.env`（SIT）—— `REDIS_KEY_PREFIX=sit`
- `pbs-server.env` / `connector-server.env` / `engine-server.env` —— 同环境同名

---

## Task 1: live-server — 新增 env 字段和 prefix 工具

**Files:**
- Create: `live-server/src/utils/redis-key-prefix.ts`
- Create: `live-server/src/__tests__/utils/redis-key-prefix.test.ts`
- Modify: `live-server/src/config/env.ts`

- [ ] **Step 1.1: 写 `redis-key-prefix.ts` 失败的测试**

`live-server/src/__tests__/utils/redis-key-prefix.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('redis-key-prefix', () => {
  const originalEnv = process.env.REDIS_KEY_PREFIX
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.REDIS_KEY_PREFIX
    else process.env.REDIS_KEY_PREFIX = originalEnv
  })

  it('default prefix is "dev" when env unset', async () => {
    delete process.env.REDIS_KEY_PREFIX
    // env 在 import 时 parse，所以要 vi.resetModules + dynamic import
    vi.doMock('../../config/env.js', () => ({
      env: { REDIS_KEY_PREFIX: 'dev' },
    }))
    const { redisKeyPrefix } = await import('../../utils/redis-key-prefix.js')
    expect(redisKeyPrefix()).toBe('dev')
  })

  it('withPrefix prepends "<env>:"', async () => {
    vi.doMock('../../config/env.js', () => ({
      env: { REDIS_KEY_PREFIX: 'uat' },
    }))
    const { withPrefix } = await import('../../utils/redis-key-prefix.js')
    expect(withPrefix('roster-bulk-delete')).toBe('uat:roster-bulk-delete')
    expect(withPrefix('pairing:1')).toBe('uat:pairing:1')
  })

  it('withPrefix returns bare key when prefix is empty string', async () => {
    vi.doMock('../../config/env.js', () => ({
      env: { REDIS_KEY_PREFIX: '' },
    }))
    const { withPrefix } = await import('../../utils/redis-key-prefix.js')
    expect(withPrefix('roster-bulk-delete')).toBe('roster-bulk-delete')
  })
})
```

- [ ] **Step 1.2: 跑测试确认 fail**

Run: `cd live-server && npx vitest run src/__tests__/utils/redis-key-prefix.test.ts`
Expected: FAIL — `redis-key-prefix` module not found.

- [ ] **Step 1.3: 写 `redis-key-prefix.ts` 最小实现**

`live-server/src/utils/redis-key-prefix.ts`：

```ts
import { env } from '../config/index.js'

/**
 * 当前进程所属环境的 Redis key prefix。
 * 同一台机多个 live-server 共用 Redis 时，靠这个 key 把读写空间隔开。
 * 默认 'dev'（zod 兜底），生产环境必须显式设 'prod'，否则启动失败。
 */
export const redisKeyPrefix = (): string => env.REDIS_KEY_PREFIX

/**
 * 把任意裸 key 加 prefix。空 prefix 直接返回原 key 不变。
 * 例: withPrefix('roster-bulk-delete') 在 prefix='uat' 时返回 'uat:roster-bulk-delete'
 */
export const withPrefix = (key: string): string => {
  const p = redisKeyPrefix()
  if (!p) return key
  return `${p}:${key}`
}
```

- [ ] **Step 1.4: 跑测试确认 pass**

Run: `cd live-server && npx vitest run src/__tests__/utils/redis-key-prefix.test.ts`
Expected: 3 passed.

- [ ] **Step 1.5: 在 `config/env.ts` 加 `REDIS_KEY_PREFIX` 字段 + refine**

修改 `live-server/src/config/env.ts`：

1. 在 envSchema object 里加：

```ts
REDIS_KEY_PREFIX: z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/)
  .default('dev'),
```

2. 在 `.superRefine((val, ctx) => { ... })` 内，紧接现有 `isProdLike(val.APP_ENV)` 检查的最后，加：

```ts
if (isProdLike(val.APP_ENV) && val.REDIS_KEY_PREFIX === 'dev') {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['REDIS_KEY_PREFIX'],
    message: `REDIS_KEY_PREFIX must be set to a non-default value (e.g. 'prod') when APP_ENV is "${val.APP_ENV}". Refusing to start with default 'dev' prefix in a production-like deployment.`,
  })
}
if (isProdLike(val.APP_ENV) && val.REDIS_KEY_PREFIX === 'uat') {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['REDIS_KEY_PREFIX'],
    message: `REDIS_KEY_PREFIX cannot be 'uat' when APP_ENV is "${val.APP_ENV}". Use 'prod' for production-like deployments.`,
  })
}
```

注：superRefine 函数当前在 `if (!isProdLike(val.APP_ENV)) return` 之后才执行 prod-like 检查，逻辑需要重构——把新加的两条也放到 prod-like 分支里（紧跟现有 JWT_SECRET / PBS_INTERNAL_API_SECRET / SSO 检查）。

- [ ] **Step 1.6: 跑 env 单测确认没回归**

Run: `cd live-server && npx vitest run src/__tests__/config 2>&1 | tail -20`
Expected: 全部 pass，没有 REDIS_KEY_PREFIX 相关失败。

- [ ] **Step 1.7: 手动验证 dev 默认值**

Run: `cd live-server && unset REDIS_KEY_PREFIX && node -e "import('./dist/config/env.js').then(m=>console.log(m.env.REDIS_KEY_PREFIX))"`
Expected: `dev` （如果 dist 是 build 过的）；否则 `Cannot find module` 错误，预期，因为 dist 是 src 编译产物，dev worktree 通常直接用 tsx。

Run: `cd live-server && npx tsx -e "import('./src/config/env.js').then(m=>console.log(m.env.REDIS_KEY_PREFIX))"`
Expected: `dev`

- [ ] **Step 1.8: Commit**

```bash
git add live-server/src/utils/redis-key-prefix.ts \
        live-server/src/__tests__/utils/redis-key-prefix.test.ts \
        live-server/src/config/env.ts
git commit -m "feat(live-server): add REDIS_KEY_PREFIX env and withPrefix utility

引入环境级 Redis key 命名空间隔离。zod 默认 'dev'，生产环境必须
显式设非 'dev' / 非 'uat' 值（zod refine 守卫）。

Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: live-server — 改造 BullMQ queue 和 Worker

**Files:**
- Modify: `live-server/src/plugins/bullmq.ts`
- Modify: `live-server/src/workers/roster-bulk-delete-worker.ts`
- Modify: `live-server/src/workers/flight-inbound-worker.ts`
- Modify: `live-server/src/workers/pairing-inbound-worker.ts`
- Modify: `live-server/src/workers/crew-inbound-worker.ts`
- Modify: `live-server/src/workers/roster-inbound-worker.ts`
- Modify: `live-server/src/workers/roster-ground-inbound-worker.ts`
- Modify: `live-server/src/workers/partition-manager-worker.ts`
- Modify: `live-server/src/workers/scenario-legality-sweep.ts`
- Modify: `live-server/src/workers/roster-retention-cleanup-worker.ts`
- Modify: `live-server/src/workers/batch-crew-worker.ts`
- Modify: `live-server/src/workers/batch-orchestrator-worker.ts`
- Modify: `live-server/src/services/roster/roster-publish-outbound-service.ts`

- [ ] **Step 2.1: 改 `plugins/bullmq.ts` —— 7 个 queue name 过 withPrefix**

文件顶部 import：

```ts
import { withPrefix } from '../utils/redis-key-prefix.js'
```

每个 `new Queue(...)`：

```ts
// 改前
new Queue('rule-check-realtime', { ... })
// 改后
new Queue(withPrefix('rule-check-realtime'), { ... })
```

涉及的 7 个 queue（按行号查找对应）：
- `rule-check-realtime`（约 25 行）
- `rule-check-batch`（约 35 行）
- `rule-batch-crew`（约 43 行）
- `violations-init`（约 53 行）
- `roster-bulk-delete`（约 62 行）
- `manday-recompute`（约 70 行）
- `scenario-kpi-recompute`（约 79 行）

注意：`attachBullmqErrorLogger` 第三个参数是 label（用于日志），label 用裸名便于人读，不动。

- [ ] **Step 2.2: 改 12 个 worker 的 `new Worker(...)` queue name**

每个 worker 文件：

文件顶部加 import：
```ts
import { withPrefix } from '../utils/redis-key-prefix.js'
```

`new Worker(QUEUE_NAME, ...)` 改成 `new Worker(withPrefix(QUEUE_NAME), ...)`：
- `roster-bulk-delete-worker.ts`: `new Worker(ROSTER_BULK_DELETE_QUEUE, ...)` → `new Worker(withPrefix(ROSTER_BULK_DELETE_QUEUE), ...)`
- `flight-inbound-worker.ts`: `'connector.flight.inbound'`
- `pairing-inbound-worker.ts`: `'connector.pairing.inbound'`
- `crew-inbound-worker.ts`: `'connector.crew.inbound'`
- `roster-inbound-worker.ts`: `'connector.roster.inbound'`
- `roster-ground-inbound-worker.ts`: `'connector.roster_ground.inbound'`
- `partition-manager-worker.ts`: `'partition-manager'`
- `scenario-legality-sweep.ts`: `SCENARIO_LEGALITY_SWEEP_QUEUE`
- `roster-retention-cleanup-worker.ts`: `ROSTER_RETENTION_CLEANUP_QUEUE`
- `batch-crew-worker.ts`: 文件里直接写的 queue name
- `batch-orchestrator-worker.ts`: 文件里直接写的 queue name
- `roster-publish-outbound-service.ts`: `CONNECTOR_ROSTER_OUTBOUND_QUEUE`

- [ ] **Step 2.3: 跑 live-server 全套 vitest 确认没回归**

Run: `cd live-server && npx vitest run 2>&1 | tail -30`
Expected: 大部分 pass。如果有 worker test 失败，参见 Step 2.4 修。

- [ ] **Step 2.4: 修可能失败的 worker test mock**

如果 Step 2.3 出现 "expected mock to be called with X" 之类的错误，原因是测试断言了 `new Worker` 被调用时传的 queue name 是裸名。修法：

以 `__tests__/workers/roster-bulk-delete-worker.test.ts` 为例（实际文件路径以 vitest 报错为准）：

```ts
// 改前
expect(Worker).toHaveBeenCalledWith('roster-bulk-delete', expect.any(Function), expect.any(Object))

// 改后
import { withPrefix } from '../../utils/redis-key-prefix.js'
expect(Worker).toHaveBeenCalledWith(withPrefix('roster-bulk-delete'), expect.any(Function), expect.any(Object))
```

或更简单：让 mock 接受任何带 prefix 的 queue name：

```ts
expect(Worker).toHaveBeenCalledWith(
  expect.stringMatching(/^(dev|uat|sit|prod):roster-bulk-delete$/),
  expect.any(Function),
  expect.any(Object),
)
```

- [ ] **Step 2.5: Commit**

```bash
git add live-server/src/plugins/bullmq.ts \
        live-server/src/workers/ \
        live-server/src/services/roster/roster-publish-outbound-service.ts \
        live-server/src/__tests__/
git commit -m "feat(live-server): namespace BullMQ queues with REDIS_KEY_PREFIX

12 个 worker + 1 个 plugin 共 19 个 queue name 加 prefix。dev/UAT 各自
worker 只监听自己子集，根治 race。

Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: live-server — 改造 `cache.ts` 应用 cache key

**Files:**
- Modify: `live-server/src/utils/cache.ts`

- [ ] **Step 3.1: 改 `cache.ts` —— 所有 entry 函数过 withPrefix**

文件顶部加 import：

```ts
import { withPrefix } from './redis-key-prefix.js'
```

对以下每个函数，**在 `redis.get / mGet / set / del / scan` 调用前**对 key 过 `withPrefix`：

- `getOrSet`：`const cached = await redis.get(key)` → `redis.get(withPrefix(key))`；`redis.set(key, ...)` → `redis.set(withPrefix(key), ...)`
- `getOrSetChunks`：`keys = ids.map(keyFor)` → `keys = ids.map(id => withPrefix(keyFor(id)))`；`redis.mGet(keys)` 同样用 prefixed keys
- `invalidate(fastify.redis, key)` → `invalidate(fastify.redis, withPrefix(key))`
- `invalidatePattern(fastify.redis, pattern)` → 改用 `withPrefix(pattern)` 后传；scan 范围相应变化

注意：`cacheGroup(key)` 函数拿第一段做 metrics label，**不要过 prefix**——metrics label 应该是稳定的 `'pairing'` / `'roster:v2'` 等，prefix 不能让它变成 `'uat:pairing'`。

- [ ] **Step 3.2: 跑 cache 单测**

Run: `cd live-server && npx vitest run src/__tests__/utils/cache 2>&1 | tail -20`
Expected: pass。

- [ ] **Step 3.3: 跑全套确认无回归**

Run: `cd live-server && npx vitest run 2>&1 | tail -20`
Expected: pass。如果有 service 单测断言了具体 Redis key（"expected to set foo:bar"），需要相应调整。

- [ ] **Step 3.4: Commit**

```bash
git add live-server/src/utils/cache.ts live-server/src/__tests__/
git commit -m "feat(live-server): prefix app cache keys in cache.ts

getOrSet / getOrSetChunks / invalidate / invalidatePattern 入口统一过
withPrefix。metrics label cacheGroup 保留裸名以稳定 cardinality。

Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: live-server — 改造业务直写 key

**Files:**
- Modify: `live-server/src/services/lock/mutation-exclusive-service.ts`
- Modify: `live-server/src/services/rule/legality-recheck.ts`
- Modify: `live-server/src/plugins/websocket.ts`（如果直接用 redis）

- [ ] **Step 4.1: 改 `mutation-exclusive-service.ts`**

文件顶部加 import：
```ts
import { withPrefix } from '../../utils/redis-key-prefix.js'
```

所有 `mutation:exclusive:${...}` 字符串模板改用 `withPrefix('mutation:exclusive:' + var)` 或更简单：

```ts
// 改前
const lockKey = `mutation:exclusive:${schema}:${operation}`
// 改后
const lockKey = withPrefix(`mutation:exclusive:${schema}:${operation}`)
```

grep 整个文件，把所有 `'mutation:exclusive:'` 出现的地方都包 `withPrefix(...)`。

- [ ] **Step 4.2: 改 `legality-recheck.ts`**

```ts
import { withPrefix } from '../../utils/redis-key-prefix.js'
// 所有 'legality:recheck:...' 字面量包 withPrefix
```

- [ ] **Step 4.3: 检查 `websocket.ts`**

如果 plugin 直接写 Redis（如订阅频道 / 房间注册），对每个 key 过 `withPrefix`。如果只用 `fastify.wsBroadcastAll`（已含 schema 概念），不需改。

- [ ] **Step 4.4: 跑全套确认**

Run: `cd live-server && npx vitest run 2>&1 | tail -20`
Expected: pass。

- [ ] **Step 4.5: Commit**

```bash
git add live-server/src/services/lock/ \
        live-server/src/services/rule/legality-recheck.ts \
        live-server/src/plugins/websocket.ts
git commit -m "feat(live-server): prefix direct-write keys in mutation/legalty/ws

mutation:exclusive:*, legality:recheck:*, ws 频道 key 全部过 withPrefix。
与 BullMQ 隔离策略一致。

Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: live-server — 部署 .env

**Files:**
- Modify: `live-server/.env`（dev worktree）

- [ ] **Step 5.1: dev worktree 的 .env 加 REDIS_KEY_PREFIX=dev**

`live-server/.env` 末尾加：

```
REDIS_KEY_PREFIX=dev
```

- [ ] **Step 5.2: 验证 dev live-server 启动正常**

Run: `cd live-server && npx tsx src/index.ts 2>&1 | head -30`
Expected: 不抛 "REDIS_KEY_PREFIX must be ..." 错误，监听 :3200。
然后 `Ctrl-C`。

- [ ] **Step 5.3: Commit**

```bash
git add live-server/.env
git commit -m "chore(live-server): set REDIS_KEY_PREFIX=dev in dev .env

显式声明，与 zod 默认一致；便于跨环境排查时一眼看出当前进程归属。

Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: pbs-server — 加 prefix 工具和改造 worker

**Files:**
- Create: `pbs-server/src/utils/redis-key-prefix.ts`
- Create: `pbs-server/src/__tests__/utils/redis-key-prefix.test.ts`
- Modify: `pbs-server/src/config/env.ts`（或 index.ts，看 zod 在哪）
- Modify: 所有 `pbs-server/src/workers/*.ts` 里的 `new Queue` / `new Worker` 调用

- [ ] **Step 6.1: 复用 live-server 的工具实现**

`pbs-server/src/utils/redis-key-prefix.ts` 复用 Task 1.3 的代码，把 `../config/index.js` 改成 pbs-server 自己的 config 路径。

- [ ] **Step 6.2: 复用 Task 1.1 的测试代码**，注意 import 路径

- [ ] **Step 6.3: 跑测试确认 pass**

Run: `cd pbs-server && npx vitest run src/__tests__/utils/redis-key-prefix.test.ts`
Expected: 3 passed。

- [ ] **Step 6.4: env schema 加字段 + refine**

同 Task 1.5，添加到 pbs-server 自己的 env 文件。

- [ ] **Step 6.5: 所有 pbs-server worker 的 queue name 加 prefix**

grep `pbs-server/src/workers/` 下所有 `new Queue` / `new Worker`，过 `withPrefix`。

- [ ] **Step 6.6: 跑 pbs-server 全套 vitest**

Run: `cd pbs-server && npx vitest run 2>&1 | tail -20`
Expected: pass。

- [ ] **Step 6.7: Commit**

```bash
git add pbs-server/
git commit -m "feat(pbs-server): namespace Redis keys with REDIS_KEY_PREFIX

与 live-server 同步加 prefix 工具和 queue namespace 改造。

Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: connector-server — 加 prefix 工具和改造 worker

**Files:**
- Create: `connector-server/src/utils/redis-key-prefix.ts`
- Create: `connector-server/src/__tests__/utils/redis-key-prefix.test.ts`
- Modify: `connector-server/src/config/env.ts`
- Modify: 所有 `connector-server/src/workers/*.ts` 里的 `new Queue` / `new Worker` 调用

- [ ] **Step 7.1-7.7**: 与 Task 6 步骤完全一致，文件路径换成 connector-server

- [ ] **Step 7.8: Commit**

```bash
git add connector-server/
git commit -m "feat(connector-server): namespace Redis keys with REDIS_KEY_PREFIX

Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: engine-server — 加 Python 版 prefix 工具

**Files:**
- Create: `engine-server/app/utils/redis_key_prefix.py`
- Create: `engine-server/tests/test_redis_key_prefix.py`
- Modify: `engine-server/app/config.py`（或 settings.py）

- [ ] **Step 8.1: 写 `redis_key_prefix.py`**

```python
"""Redis key prefix isolation per environment."""
from functools import lru_cache
from app.config import settings  # 视实际 config 位置调整


@lru_cache(maxsize=1)
def redis_key_prefix() -> str:
    """当前进程所属环境的 Redis key prefix。"""
    return settings.REDIS_KEY_PREFIX


def with_prefix(key: str) -> str:
    """把任意裸 key 加 prefix。空 prefix 直接返回原 key。"""
    p = redis_key_prefix()
    if not p:
        return key
    return f"{p}:{key}"
```

- [ ] **Step 8.2: 写 pytest**

`engine-server/tests/test_redis_key_prefix.py`：

```python
import os
import pytest
from app.utils import redis_key_prefix as rkp


@pytest.fixture(autouse=True)
def reload_settings():
    """每个 case 重置 lru_cache 让 settings 改动生效。"""
    rkp.redis_key_prefix.cache_clear()
    yield
    rkp.redis_key_prefix.cache_clear()


def test_default_is_dev(monkeypatch):
    monkeypatch.delenv("REDIS_KEY_PREFIX", raising=False)
    # 如果 settings 是 lazy-loaded pydantic，要 reload
    assert rkp.redis_key_prefix() in ("dev", "")  # 可能因 settings 缓存差异


def test_with_prefix_uat(monkeypatch):
    monkeypatch.setenv("REDIS_KEY_PREFIX", "uat")
    rkp.redis_key_prefix.cache_clear()
    assert rkp.with_prefix("connector.flight.inbound") == "uat:connector.flight.inbound"


def test_with_prefix_empty(monkeypatch):
    monkeypatch.setenv("REDIS_KEY_PREFIX", "")
    rkp.redis_key_prefix.cache_clear()
    assert rkp.with_prefix("foo") == "foo"
```

- [ ] **Step 8.3: 跑 pytest**

Run: `cd engine-server && pytest tests/test_redis_key_prefix.py -v`
Expected: pass.

- [ ] **Step 8.4: env 加 REDIS_KEY_PREFIX**

`engine-server/app/config.py`（或对应 pydantic-settings 文件）：

```python
REDIS_KEY_PREFIX: str = Field(default="dev", pattern=r"^[a-z][a-z0-9_]*$")
```

如果 engine-server 也用 isProdLike 守卫，加 refine：

```python
@model_validator(mode="after")
def refuse_default_in_prod_like(self):
    if self.APP_ENV in ("production", "staging", "uat", "demo") and self.REDIS_KEY_PREFIX == "dev":
        raise ValueError("REDIS_KEY_PREFIX must not be 'dev' in production-like environment")
    return self
```

- [ ] **Step 8.5: 找 engine-server 的所有 queue 引用，过 with_prefix**

grep `engine-server/app/` 下所有 `"queue_name"` / `Queue(...)` 引用。

注：engine-server 用的是 FastAPI + BullMQ（Python）— 实际查看 `engine-server/app/queue.py` 或类似文件的具体引用。

- [ ] **Step 8.6: 跑 engine-server 全套 pytest**

Run: `cd engine-server && pytest 2>&1 | tail -20`
Expected: pass.

- [ ] **Step 8.7: Commit**

```bash
git add engine-server/
git commit -m "feat(engine-server): namespace Redis keys with REDIS_KEY_PREFIX (Python)

Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: 跑 f8_dev_live 的 dp_min migration

**Files:**
- 不改代码，只跑 SQL

- [ ] **Step 9.1: 在 f8_dev_live 上跑 migration**

Run:
```bash
PGPASSWORD='e2e16ba6d4f0042357413a9110a1dcdb77b8281695d9c723' \
  psql -h localhost -U f8_dev_live -d rois \
  -f sql/migration/2026-08-19-roster-dp-min.sql
```

Expected: `ALTER TABLE` 两条输出。`ADD COLUMN IF NOT EXISTS` 是 idempotent，重复跑 no-op。

- [ ] **Step 9.2: 验证 dp_min 列存在**

```bash
PGPASSWORD='Pier2026AI123' psql -h localhost -U postgres -d rois -c \
  "SELECT column_name, data_type, attnum FROM information_schema.columns
   WHERE table_schema='f8_dev_live' AND table_name='roster_flight' AND column_name='dp_min';"
```

Expected: `dp_min | integer | 76` （attnum 取决于 dev 当前最大列号）

- [ ] **Step 9.3: 验证 dev live-server manday 跑通**

启动 dev live-server，在本地触发一次 manday recompute（用现有的 dev Playwright e2e 或直接调 API），看 `roster-bulk-delete` 不再因 `dp_min does not exist` 失败。

- [ ] **Step 9.4: 记录到运维 doc（可选）**

在 `docs/handoff/dev-env-setup.md`（如存在）补一条：
> f8_dev_live 已补 dp_min 列（2026-08-25 由 prefix-isolation 任务附带修）。

如果没这个 doc 就不强求。

- [ ] **Step 9.5: Commit（如果有 doc 改动）**

如果只跑了 SQL 没有任何文件改动，跳过 commit。

---

## Task 10: 部署到 UAT

**Files:**
- Modify: `live-server.env` (UAT)
- Modify: `pbs-server.env` (UAT)
- Modify: `connector-server.env` (UAT)
- Modify: `engine-server.env` (UAT)

- [ ] **Step 10.1: 部署 4 个服务到 UAT**

在 `coreserver-01` 上：
1. pull 最新 main
2. `cd /home/rois/uat/live-server && git pull && npm run build`
3. 同样 build pbs-server / connector-server / engine-server
4. 用 `service.sh restart live-server` 之类（看 UAT 怎么管）

注意：4 个服务**必须**在同一个发布窗口里更新，不能有先后梯度。

- [ ] **Step 10.2: 更新 4 个 .env**

`/home/rois/uat/env/live-server.env` 末尾加：
```
REDIS_KEY_PREFIX=uat
```

同样更新 pbs-server.env / connector-server.env / engine-server.env。

- [ ] **Step 10.3: 重启 4 个服务**

```bash
/home/rois/uat/service.sh restart live-server
/home/rois/uat/service.sh restart pbs-server
/home/rois/uat/service.sh restart connector-server
/home/rois/uat/service.sh restart engine-server
```

- [ ] **Step 10.4: 验证 redis key 出现 uat:* 子集**

```bash
redis-cli -h 127.0.0.1 -p 6379 -n 0 KEYS "uat:*" | head -5
```

Expected: 至少能看到 `uat:rule-check-realtime` / `uat:roster-bulk-delete` / `uat:pairing:*` 等。

- [ ] **Step 10.5: 在 UAT gantt UI 触发一次批量删除，确认走通**

观察 redis：
```bash
redis-cli -h 127.0.0.1 -p 6379 -n 0 KEYS "uat:roster-bulk-delete:*"
```

应该看到任务在 `uat:roster-bulk-delete:*` 路径下创建 / 消费。

- [ ] **Step 10.6: 重复触发 5+ 次批量删除，确认无 dp_min 错误**

预期：5 次都成功（dev worker 不再抢 UAT 的任务）。

- [ ] **Step 10.7: 部署完成 doc（可选）**

在 `docs/handoff/` 下写一份部署记录，标日期、跑过的 verification 命令、观察到的现象、留下的 known issue。

---

## Self-Review

**1. Spec coverage:**

| Spec 章节 | 任务 |
|---|---|
| §1 REDIS_KEY_PREFIX env | Task 1.5 (live), Task 6.4 (pbs), Task 7.4 (connector), Task 8.4 (engine) |
| §2 redis-key-prefix.ts 工具 | Task 1.1-1.3 (live), Task 6.1 (pbs), Task 7.1 (connector), Task 8.1 (engine) |
| §3 BullMQ queue 命名 | Task 2 (live), Task 6.5 (pbs), Task 7.5 (connector), Task 8.5 (engine) |
| §4 应用 cache key 隔离 | Task 3 (live)；其他服务如有 cache.ts 同样处理 |
| §5 业务直写 key | Task 4 (live) |
| §6 跨服务一致 | Task 5 (live env), Task 6 (pbs), Task 7 (connector), Task 8 (engine), Task 10 (UAT 部署) |
| §7 f8_dev_live 缺 dp_min | Task 9 |

**2. Placeholder scan:**
- 无 "TBD" / "TODO" / "implement later" / "Similar to Task N"
- 每步有具体代码 / 命令 / expected output
- 文件路径都是绝对路径

**3. Type consistency:**
- `withPrefix(key: string): string` 在 TS 任务中一致
- `with_prefix(key: str) -> str` 在 Python 任务中一致
- `redisKeyPrefix()` / `redis_key_prefix()` 在各自语言一致
- `REDIS_KEY_PREFIX` env 字段名跨 4 个服务一致
- `withPrefix('roster-bulk-delete')` → `'uat:roster-bulk-delete'` 在所有测试用例一致
- default value `'dev'` 一致
- prod 守卫（isProdLike 拒绝 default / uat）一致

**4. Spec 风险对照:**
- Risk #1 (漏配) → Task 5/6/7/8/10 的 .env 检查，prod zod 守卫
- Risk #2 (旧 key 失效) → Task 10.4-10.6 上线观察
- Risk #3 (lock 旧 key) → Task 4.1 mutation-exclusive 加 prefix 后会换空间，老 lock 失效（acceptable，TTL 保护）
- Risk #4 (跨服务时序) → Task 10 强制"同时升"
- Risk #5 (race 重演) → Task 9.3 + Task 10.5-10.6 验证

---

## 备注

执行顺序：Task 1 → 2 → 3 → 4 → 5（live-server 模板）→ 然后 Task 6/7/8 可以并行（三个独立 commit）→ Task 9（独立 SQL）→ Task 10（UAT 部署）。
