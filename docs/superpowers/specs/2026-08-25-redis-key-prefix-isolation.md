# 2026-08-25 Redis Key Prefix Isolation

## Problem

UAT 上跑批量删除时，dev worktree 里残留的 live-server 进程
（`/home/yuan.z/rois/rois-ai/live-server`, PID 3515691）也会消费同一个
BullMQ 队列 `roster-bulk-delete`，因为 dev 跟 UAT 共用
`redis://localhost:6379/0` 且 queue 名是裸名。

2026-08-24 17:51:42 的 task 2 失败就是这个 race 触发的：dev worker 抢到
任务，用 `LIVE_SCHEMA=f8_dev_live` 跑 manday recompute，命中
`f8_dev_live.roster_flight`，该表没有 `dp_min` 列（migration 没在 dev 上
跑），gnd query 抛 `column rf.dp_min does not exist`。

同类共享还有：rule-check-realtime / rule-check-batch / rule-batch-crew /
violations-init / manday-recompute / scenario-kpi-recompute /
partition-manager / scenario-legality-sweep / roster-retention-cleanup /
connector.* 等 19 个 BullMQ queue，以及应用 cache key（`pairing:*` /
`roster:v2:*` / `crew:*` / `scenario*` / `rule:check:*` 等约 18 类），
锁（`mutation:exclusive:*` / `lock:*`），加上 `redis://localhost:6379/1`
上的 ws broadcast 等。dev 跟 UAT 任何时候重启都会重新拉满这些共享 key。

一次性 `kill 3515691` 不能根治——dev worktree 还会再起，race 必然回来。
需要从代码层做 key 空间隔离。

## Goal

让 dev / UAT / SIT / prod 各自的 4 个服务（live-server / pbs-server /
connector-server / engine-server）在同一台机的同一 Redis 实例上读写各自
的 key 子集，互不感知：

- dev worktree 启的服务只读 / 写 `REDIS_KEY_PREFIX=dev:*` 的 key
- UAT 部署的服务只读 / 写 `REDIS_KEY_PREFIX=uat:*` 的 key
- SIT 部署的服务只读 / 写 `REDIS_KEY_PREFIX=sit:*` 的 key
- Prod 部署的服务只读 / 写 `REDIS_KEY_PREFIX=prod:*` 的 key（强制）
- 任何一方起 / 停 / 重启不影响另一方已有的数据

pbs-server / connector-server / engine-server 即使已经用不同 Redis db
（db 2/3/4），也接同一套 prefix——加 prefix 后从 key 上能一眼看出环境，
将来如果某天合并 db 也不会出乱，4 个服务的发布顺序也只需一次协调。

附带修复 f8_dev_live 缺 `dp_min` 的问题（防止 dev worker 即使抢到也
不会再 500）。

## Non-Goals

- 不动 PostgreSQL schema 隔离策略（已经用 schema 名 `f8_*_live` 隔离了）
- 不动 JWT / SSO / SSO redirect（已经按 APP_ENV 区分）
- 不动 BullMQ 之外的 client 库选择
- 不引入新的 Redis 实例或多 db 切换（保持现有连接字符串）

## Design

### 1. 新增 env：`REDIS_KEY_PREFIX`

在 `live-server/src/config/env.ts`：

```ts
REDIS_KEY_PREFIX: z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/)
  .default('dev'),
```

默认值 `dev` 是有意为之：未设的本地启动 = dev，符合"未设就是最安全"
原则。UAT / SIT / prod 部署时显式设。

部署侧：
- `live-server.env` (UAT) 增加 `REDIS_KEY_PREFIX=uat`
- `live-server.env` (SIT) 增加 `REDIS_KEY_PREFIX=sit`
- dev worktree `.env` 增加 `REDIS_KEY_PREFIX=dev`（与默认一致，显式
  便于识别）
- pbs-server / connector-server / engine-server 各自的 `.env` 同理

### 2. 新增工具：`src/utils/redis-key-prefix.ts`

```ts
import { env } from '../config/index.js'

/**
 * 当前进程所属环境的 Redis key prefix。
 * 同一台机多个 live-server 共用 Redis 时，靠这个 key 把读写空间隔开。
 */
export const redisKeyPrefix = (): string => env.REDIS_KEY_PREFIX

/**
 * 把任意裸 key 加 prefix。空 prefix 直接返回原 key 不变。
 * 例: withPrefix('roster-bulk-delete') 在 prefix='uat' 时返回
 *     'uat:roster-bulk-delete'
 */
export const withPrefix = (key: string): string => {
  const p = redisKeyPrefix()
  if (!p) return key
  return `${p}:${key}`
}
```

### 3. BullMQ queue 命名

所有 `new Queue(name, ...)` 和 `new Worker(name, ...)` 把 `name` 从
裸名包成 `` `${redisKeyPrefix()}:${name}` ``。

这样 BullMQ 内部所有 hash key（`bull:<queue>:*`）会变成
`bull:<prefix>:<queue>:*`，自然把 worker 池也隔开。

涉及文件清单（约 11 个 worker + 1 个 plugin）：

- `src/plugins/bullmq.ts` —— 7 个 queue：`rule-check-realtime` /
  `rule-check-batch` / `rule-batch-crew` / `violations-init` /
  `roster-bulk-delete` / `manday-recompute` / `scenario-kpi-recompute`
- `src/workers/flight-inbound-worker.ts` —— `connector.flight.inbound`
- `src/workers/pairing-inbound-worker.ts` —— `connector.pairing.inbound`
- `src/workers/crew-inbound-worker.ts` —— `connector.crew.inbound`
- `src/workers/roster-inbound-worker.ts` —— `connector.roster.inbound`
- `src/workers/roster-ground-inbound-worker.ts` —— `connector.roster_ground.inbound`
- `src/workers/manday-inbound-worker.ts` —— `connector.manday.inbound`
- `src/workers/partition-manager-worker.ts` —— `partition-manager`
- `src/workers/scenario-legality-sweep.ts` —— `scenario-legality-sweep`
- `src/workers/roster-retention-cleanup-worker.ts` —— `roster-retention-cleanup`
- `src/workers/batch-crew-worker.ts` —— `batch-crew`
- `src/workers/batch-orchestrator-worker.ts` —— `batch-orchestrator`

> 命名导出常量（`ROSTER_BULK_DELETE_QUEUE` 等）保留裸名作为内部值，
> 但在 `new Queue` / `new Worker` 处统一过 `withPrefix()`。
> 这避免了重命名常量导致单测需要追改多处。

### 4. 应用 cache key 隔离

`src/utils/cache.ts` 是所有 cache 入口（`getOrSet` / `getOrSetChunks` /
`invalidate` / `invalidatePattern`）。在这些函数内部对 `key` / `keys` /
`pattern` 加 prefix。

> 现有 18 个服务的 `CACHE_PREFIX` 常量（`'pairing'` / `'roster:v2'` /
> `'crew'` / `'scenario'` 等）保留作 cache group 标签（用于 metrics 的
> `cache_group` label），实际 Redis key 仍由 `cache.ts` 统一加 prefix。

对 mget / scan / del 等批量调用同样过 `withPrefix`。

### 5. 业务直写的 key

以下位置直接调用 `redis.set / get / del / hset` 等，跳过了 `cache.ts`：
需要逐个补 `withPrefix`：

- `src/services/lock/mutation-exclusive-service.ts` —— `mutation:exclusive:*` 加 prefix
- `src/services/rule/legality-recheck.ts` —— `legality:recheck:*` 加 prefix
- `src/services/scenario/scenario-kpi-store.ts`（如有）—— `kpi:*` 加 prefix
- `src/plugins/websocket.ts` —— ws broadcast 用的 schema 频道（如有）加 prefix
- `src/services/roster/roster-publish-outbound-service.ts` —— BullMQ queue 已加，
  自有 key（如有）也过 prefix

### 6. 跨服务一致（4 个服务一起加）

> **用户决定：4 个服务一起加，命名 `<env>:*` 风格，最终支持 `dev` / `uat` /
> `sit` / `prod`。** 任何服务漏配 prefix 都会和同 redis db 的另一个 process
> 互踩，所以发布顺序必须**四个服务同时**升到带 prefix 的版本，release
> runbook 要写明"四个服务一起升"。

同一份 `redis-key-prefix.ts` 工具同步到：

- `live-server/src/utils/redis-key-prefix.ts`（TypeScript，zod 校验 env）
- `pbs-server/src/utils/redis-key-prefix.ts`（TypeScript，zod 校验 env）
- `connector-server/src/utils/redis-key-prefix.ts`（TypeScript，zod 校验 env）
- `engine-server/app/utils/redis_key_prefix.py`（Python，pydantic-settings
  校验 env）

每个服务的 env schema 都加 `REDIS_KEY_PREFIX`，正则 `^[a-z][a-z0-9_]*$`，
默认 `dev`，allowed 值（生产硬约束）：`dev` / `uat` / `sit` / `prod`。
`prod` 在生产环境强制设置（zod refine 同现有 `isProdLike` 守卫一致——若
APP_ENV 是 prod-like 而 REDIS_KEY_PREFIX 仍是默认 `dev` 或 `uat`，refuse
to start）。

部署侧统一要求（release runbook 写一条 checklist）：
- `dev` worktree 的 `.env`：`REDIS_KEY_PREFIX=dev`
- SIT 部署 `.env`：`REDIS_KEY_PREFIX=sit`
- UAT 部署 `.env`：`REDIS_KEY_PREFIX=uat`
- Prod 部署 `.env`：`REDIS_KEY_PREFIX=prod`（强制）

### 7. `f8_dev_live` 缺 `dp_min` 的修复

独立 fix，与 prefix 一起 commit：

```bash
PGPASSWORD='e2e16ba6d4f0042357413a9110a1dcdb77b8281695d9c723' \
  psql -h localhost -U f8_dev_live -d rois \
  -f sql/migration/2026-08-19-roster-dp-min.sql
```

完成后：

```sql
SELECT attname FROM information_schema.columns
 WHERE table_schema='f8_dev_live' AND table_name='roster_flight' AND attname='dp_min';
-- 期望: dp_min
```

注：prefix 隔离修完后，dev worker 不会再消费 UAT 的 job，这条
migration 退化
为防御性——但仍然要跑，因为 dev 上跑场景 / 单测 / Playwright 还会命中。

## Risks

1. **新部署 .env 漏配 `REDIS_KEY_PREFIX`**：未设则默认 `dev`，UAT 部署后
   所有 key 落在 `dev:*` 子集，会和真正的 dev 互踩。需要在 release
   checklist 加一条"REDIS_KEY_PREFIX 必须设"，4 个服务（live-server /
   pbs-server / connector-server / engine-server）一起检查。Prod 部署
   必须在 zod refine 里硬约束：APP_ENV 是 prod-like 时，REDIS_KEY_PREFIX
   必须是 `prod`（不接受默认 `dev`），否则 refuse to start。
2. **旧 key 的迁移**：UAT 当前在 `redis://localhost:6379/0` 上的所有
   key 升级后会失效（找不到）。可以接受：缓存本来就是 derived data，
   失效后自动重建。如果用户感知到首屏慢几秒，是可接受的副作用。
3. **mutation exclusive lock 旧 key**：升级瞬间如果有进行中的
   bulk-delete，它的 lock 在新 key 空间里找不到，会被另一个 process 重
   新拿。lock 本身有 TTL 保护，最坏情况是单次重试，acceptable。
4. **跨服务时序**：live-server 升级后用 `uat:*`，但如果 pbs-server 还在
   用裸名，它写入的 `connector.roster.outbound` queue 仍然落在
   `bull:connector.roster.outbound`，live-server 那边消费的是
   `bull:uat:connector.roster.outbound`，对不上。所以四个服务必须**同时**
   升到带 prefix 的版本。发布 runbook：先把所有服务 build 好，依次
   （或同时）部署 UAT，验证 redis 里 `uat:*` 子集在涨、旧的裸名 key
   不再被任何 worker 消费，再切下一个环境。
5. **BullMQ worker race 重演可能性**：prefix 隔离后，dev worker 只监听
   `bull:dev:roster-bulk-delete`，UAT worker 只监听
   `bull:uat:roster-bulk-delete`，互不抢。但要保证 dev 进程的
   `REDIS_KEY_PREFIX` 真设成 `dev` 而非默认；默认值 `dev` 让未设时的
   风险是落到 dev 空间（与真正的 dev 互踩），而不是落到 uat 空间（污
   染 UAT）——后者才是更严重的故障。同样，UAT 漏配会落到 `dev:*`，会
   互踩真正的 dev；SIT 漏配也会落到 `dev:*`。Prod 强制 `prod`，漏配
   会被 zod 启动拒绝，不会无声运行。

## Verification

1. **单测**：
   - 新增 `__tests__/utils/redis-key-prefix.test.ts`：
     - 默认值 = `'dev'`
     - 设过 env 后返回值变
     - `withPrefix('foo')` 在 prefix='dev' 时 = `'dev:foo'`
     - `withPrefix('foo')` 在 prefix='' 时 = `'foo'`
   - 更新 `__tests__/workers/roster-bulk-delete-worker.test.ts` 类的
     mock：`new Worker` mock 接受 prefix-aware queue name，断言 add
     worker 时传的 name 含 prefix。

2. **集成（手工）**：
   - 启动 dev worktree 的 live-server（REDIS_KEY_PREFIX=dev）
   - 启动 UAT 的 live-server（REDIS_KEY_PREFIX=uat）
   - 在 UAT 上发起一次 POST `/api/roster/bulk-delete`（少量 ids）
   - 观察 redis：
     - `redis-cli KEYS "bull:dev:*"` —— 不应有 `roster-bulk-delete:*` 出现
     - `redis-cli KEYS "bull:uat:*"` —— 应有 `roster-bulk-delete:*`
     - 任务被 UAT worker 消费（看 `bull:uat:roster-bulk-delete:active`）
   - 同样从 dev worktree 的 gantt UI 触发一次，确认 dev worker 消费
     `bull:dev:roster-bulk-delete`，UAT 那边不消费。

3. **回归**：
   - `live-server` Vitest 全套 pass
   - `pbs-server` / `connector-server` Vitest 全套 pass
   - `npm run check:ui` 在 `gantt`（如果触到 cache 改）pass
   - `npm audit --omit=dev` 在改动服务内 0 vulnerabilities

4. **UAT 上线观察清单**：
   - 上线后前 5 分钟，UAT 的 roster page 首屏可能比平时慢 1-2 秒
     （cache miss 重建）
   - 观察 `redis-cli -n 0 KEYS "uat:*"` 数量随流量上升
   - 观察 mutation exclusive lock 没有被错误抢占
   - 观察批量删除不再随机失败

## Out of Scope

- 把 `redis://localhost:6379/1` 切到独立 Redis（multi-tenant 化需要新
  设计）
- 把 BullMQ `prefix` 选项（BullMQ 内部 prefix）独立配置——本设计用 queue
  name 带 prefix 自然实现，没引入新配置
- 给 Redis key 加 TTL 收尾 / 自动清理——不属于本次 fix 范围
