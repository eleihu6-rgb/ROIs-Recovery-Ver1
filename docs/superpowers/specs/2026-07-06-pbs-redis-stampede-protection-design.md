# PBS Redis 防击穿与指标完善设计

- 日期：2026-07-06
- 模块：`pbs-server`
- 阶段：Redis 缓存 Phase 3
- 状态：待用户评审
- 相关前置：
  - `docs/superpowers/specs/2026-07-06-pbs-server-redis-cache-design.md`
  - `docs/superpowers/specs/2026-07-06-pbs-pairing-search-redis-cache-design.md`
  - `docs/test-cases/pbs/performance/2026-07-06-pbs-pairing-search-redis-cache.md`

## 背景

Phase 1 已完成 PBS 专用 Redis 基础设施、`PbsCache` cache-aside helper、基础缓存指标和若干 PBS 热数据缓存。

Phase 2 已把 `pairing-search` 主要热路径接入 Redis：

- `actor-context`
- `airport-options`
- `preview`
- `current-rules-counts`
- `current-rules-tier-pools`

实测说明 Redis 命中路径已经有效：

- `preview`：冷请求约 `1092ms`，热请求约 `24ms`
- `current-rules-counts`：冷请求约 `312ms`，热请求约 `17-20ms`
- `tier-pools`：冷请求约 `543ms`，热请求约 `12-17ms`
- `airport-options`：冷请求约 `2690ms`，热请求约 `16-19ms`
- Redis get/set/parse error 指标为 `0`

但冷 key 并发测试暴露了 cache-aside 的典型问题：

- 20 个并发相同 `preview` 冷请求基本同时 miss
- 实测 p50 约 `2524ms`，max 约 `2765ms`
- 说明当前 `PbsCache.getOrSet` miss 后会让每个请求各自执行 `load()`，没有本进程 in-flight 合并，也没有跨实例 Redis 短锁

考虑 PBS 后续可能有上千 crew 在 bid window 同时打开页面或点击相同 base / period / rules 搜索，冷 key、TTL 到期、服务重启、Redis flush、月度切换时会形成缓存击穿风险。Phase 3 目标是把这个风险补齐。

## 目标

- 为 PBS Redis cache-aside 增加可选防击穿能力，折叠同一 cache key 的冷 miss 并发。
- 同时覆盖单实例和多实例部署：
  - 单实例内：同 key 请求 await 同一个 in-flight Promise。
  - 多实例间：通过 Redis 短锁保证同 key 同一时间尽量只有一个实例回源 DB。
- 优先保护 `pairing-search` 已接入 Redis 的重路径，不默认改变所有 PBS 缓存行为。
- 保持 API contract 不变，所有接口仍返回现有 `{ code, data, message }` 包装和现有业务 `data`。
- Redis 异常时必须降级到现有 DB 查询逻辑，不能因为防击穿失败导致业务不可用。
- 增强 Prometheus 指标，让上线后能看到防击穿是否真的在工作。
- 保持 metrics 低基数，不把 crewId、userCode、pairingId、query、period、request hash 放入 label。

## 非目标

- 不改 PBS Portal UI。
- 不新增第三方依赖。
- 不重写 pairing-search SQL。
- 不新增数据库索引或 migration。
- 不扩大 Phase 2 的缓存范围；autocomplete、details、occurrences 暂不纳入。
- 不缓存错误响应、权限失败、登录态、JWT、密码、Token。
- 不在本阶段做主动业务失效事件；后续如有 pairing import / NOC sync / roster publish 事件，再独立补主动 invalidation。
- 不改变现有 `PbsCache.getOrSet` 默认语义，避免影响 line / pairing / days-off / reserve / calendar 等已接入缓存的服务。

## 方案比较

### 方案 A：只做本进程 singleflight

实现方式：

- 在 `PbsCache` 内维护 `Map<cacheKey, Promise<T>>`。
- 同一 Node 进程内第一个 miss 请求执行 `load()`，其它同 key 请求 await 同一个 Promise。

优点：

- 实现简单。
- 不依赖 Redis `SET NX PX` 锁能力。
- 对本地开发和单实例部署有效。

缺点：

- 生产多实例时，每个实例仍会各自回源 DB。
- 与 `pbs-server/CLAUDE.md` 中的 2-4 实例水平扩展目标不匹配。

### 方案 B：只做 Redis 短锁

实现方式：

- miss 后尝试 `SET lockKey token NX PX lockTtlMs`。
- 拿锁者回源 DB 并写缓存。
- 未拿锁者轮询 Redis 等待缓存回填，超时后降级回源 DB。

优点：

- 多实例有效。
- 能直接覆盖 bid window 高并发场景。

缺点：

- 同一进程内仍会有多次 Redis wait / poll 成本。
- 实现和测试复杂度高于方案 A。

### 方案 C：本进程 singleflight + Redis 短锁（推荐）

实现方式：

- `PbsCache.getOrSet` 新增可选 `stampedeProtection` 配置。
- 开启时先走普通 Redis get。
- miss 后先检查本进程 in-flight。
- 本进程没有 in-flight 时，再尝试 Redis 短锁。
- 拿锁者回源 DB；未拿锁者等待缓存回填；等待超时后降级回源 DB。

优点：

- 同时覆盖单实例和多实例。
- 本进程内减少重复 Redis lock / poll。
- 可按资源逐步开启，默认不影响现有缓存调用方。
- 与 PBS 上千用户和未来多实例部署目标匹配。

缺点：

- 实现复杂度最高。
- 需要明确锁 TTL、等待超时、poll 间隔、错误降级和指标。

推荐采用方案 C。

## 推荐设计

### 1. `PbsCache` 新增可选防击穿参数

在 `pbs-server/src/utils/cache.ts` 中扩展 `PbsCacheGetOrSetOptions<TValue>`，新增可选配置，示意：

```ts
type PbsCacheStampedeProtectionOptions = {
  enabled: true;
  lockTtlMs?: number;
  waitTimeoutMs?: number;
  pollIntervalMs?: number;
};

type PbsCacheGetOrSetOptions<TValue> = {
  serialize?: (value: TValue) => unknown;
  deserialize?: (value: unknown) => TValue;
  stampedeProtection?: PbsCacheStampedeProtectionOptions;
};
```

默认不开启 `stampedeProtection`。只有显式传入时才改变 miss 后行为。

建议默认参数：

- `lockTtlMs`: `10_000`
- `waitTimeoutMs`: `3_000`
- `pollIntervalMs`: `75`

理由：

- 当前实测同 key 冷请求 max 约 `2765ms`，`3s` 等待可以覆盖常见冷查询。
- `10s` 锁 TTL 可以覆盖较慢 DB 查询，同时避免锁长时间残留。
- `75ms` poll 在等待 3s 内最多约 40 次 Redis get，可接受；后续可按实测调成 `100ms`。

### 2. 防击穿流程

开启 `stampedeProtection` 后，`getOrSet` 流程如下：

1. 先执行普通 `redis.get(cacheKey)`。
2. 命中时返回缓存值，记录 hit 指标。
3. miss 后检查本进程 `inFlightLoads.get(cacheKey)`：
   - 如果存在，记录 `local_join`，await 该 Promise。
   - Promise 成功则返回同一结果。
   - Promise 失败则按现有错误路径抛出或回到调用方。
4. 本进程无 in-flight 时，创建本进程 in-flight Promise。
5. in-flight Promise 内尝试获取 Redis 短锁：
   - `lockKey = cacheKey + ":lock"`
   - `lockToken = randomUUID()`
   - `SET lockKey lockToken NX PX lockTtlMs`
6. 拿到锁：
   - 再 double-check 一次 `redis.get(cacheKey)`，避免刚拿锁前其它实例已回填。
   - 仍 miss 时执行 `load()`。
   - `load()` 成功后 `redis.set(cacheKey, JSON.stringify(payload), { EX: ttlSeconds })`。
   - 释放锁时必须校验 token，避免误删其它请求的锁；优先使用 Redis Lua compare-and-delete。
7. 未拿到锁：
   - 循环等待缓存回填。
   - 每 `pollIntervalMs` 加少量 jitter 后执行 `redis.get(cacheKey)`。
   - 命中时返回缓存值，记录 `wait_hit`。
   - 超过 `waitTimeoutMs` 仍未命中，记录 `wait_timeout`，降级执行 `load()`。
8. Redis get/set/lock/eval 失败：
   - 记录 cache error / stampede error 指标。
   - 不阻塞业务，降级执行 `load()`。
9. `load()` 抛错：
   - 不缓存错误。
   - 清理本进程 in-flight。
   - 错误保持现有传播语义。

### 3. Redis lock 安全要求

短锁必须满足：

- `lockKey` 不能和业务 cache key 冲突，建议固定后缀 `:lock`。
- 锁值必须是随机 token，例如 `crypto.randomUUID()`。
- 加锁使用 `NX + PX`，避免覆盖别人锁，也避免死锁。
- 释放锁必须只删除自己持有的 token。
- 如果 Redis client 类型支持 `eval`，使用 Lua：

```lua
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
```

如果实现时发现当前 `redis` 类型接入 `eval` 成本过高，可以退化为 TTL-only 不主动删除锁，但必须在 spec 实施说明和最终交付中明确说明权衡。推荐优先做 ownership-safe release。

### 4. 哪些资源开启

Phase 3 只给 `pairing-search` 已缓存热路径开启防击穿：

| Resource | TTL | 防击穿 | 原因 |
| --- | ---: | --- | --- |
| `actor-context` | 60 秒 | 开启 | 所有 pairing-search 结果缓存前置依赖，避免并发先打 actor lookup |
| `preview` | 30 秒 | 开启 | 最重、最容易同时触发的 SEARCH PAIRINGS 路径 |
| `current-rules-counts` | 30 秒 | 开启 | 当前规则计数在多人同规则下重复率高 |
| `current-rules-tier-pools` | 30 秒 | 开启 | T1-Tx pool 计算在 bid window 容易集中触发 |
| `airport-options` | 10 分钟 | 开启 | 冷查询较慢，base + period 重复度高 |

不默认给其它 `PbsCache.getOrSet` 调用开启，原因：

- line / pairing / days-off / reserve / calendar 的缓存调用路径风险不同。
- 改默认行为会扩大回归面。
- 后续如果指标证明其它资源也有 stampede，再逐个开启。

### 5. 指标设计

现有指标保留，不改变 label，避免破坏已有 dashboard：

```text
rois_pbs_server_cache_hit_total{cache_group,mode}
rois_pbs_server_cache_miss_total{cache_group,mode}
rois_pbs_server_cache_error_total{cache_group,operation}
```

新增 resource 级低基数指标，resource 从 cache key 的固定段解析：

```text
rois_pbs_server_cache_resource_hit_total{cache_group,cache_resource,mode}
rois_pbs_server_cache_resource_miss_total{cache_group,cache_resource,mode}
rois_pbs_server_cache_stampede_total{cache_group,cache_resource,outcome}
```

建议 `mode`：

- `single`
- `singleflight`

建议 `outcome`：

- `local_join`
- `lock_acquired`
- `lock_contended`
- `wait_hit`
- `wait_timeout`
- `fallback_load`
- `lock_error`
- `release_error`

低基数约束：

- `cache_group` 只能是代码内 group，例如 `pairing-search`。
- `cache_resource` 只能是代码内 resource，例如 `preview`、`actor-context`。
- `outcome` 是固定枚举。
- 禁止把 crewId、userCode、base、rank、period、request hash、pairingId、query 放进 label。

### 6. 日志设计

默认不为每次 lock/wait 打 info 日志，避免高并发时日志放大。

建议：

- Redis lock / release 失败：`debug` 或 `warn`，包含 `cacheGroup`、`cacheResource`、`operation`，不包含完整 key。
- wait timeout：`debug`，包含 `waitTimeoutMs`。
- 如果同一资源持续 timeout，应通过 Prometheus 指标观察，而不是依赖逐条日志。

### 7. 数据新鲜度

本阶段不改变 Phase 2 TTL：

- `preview` / `current-rules-counts` / `current-rules-tier-pools`: 30 秒
- `actor-context`: 60 秒
- `airport-options`: 10 分钟

原因：

- 当前问题是冷 key 并发 miss，不是普通热命中不够快。
- 贸然拉长 TTL 会扩大 stale window。
- 防击穿后，TTL 到期瞬间也只有一个请求回源，短 TTL 仍可保持数据相对新鲜。

## 影响范围

预计涉及文件：

- `pbs-server/src/utils/cache.ts`
- `pbs-server/src/utils/cache.test.ts`
- `pbs-server/src/services/pairing-search/pairing-search-service.ts`
- `pbs-server/src/services/pairing-search/pairing-search-service.test.ts`
- `gantt/src/version.ts`
- `pbs-portal/src/version.ts`（如项目要求 PBS 版本双文件同步）
- `docs/test-cases/pbs/performance/<date>-pbs-redis-stampede-protection.md`

不预计涉及：

- `pbs-portal` UI 组件
- route contract
- database schema / migration
- SQL query builder
- Redis 部署方式 / `.env`

## 兼容性

- `getOrSet` 默认行为保持不变。
- 已有缓存 key 格式保持不变。
- 已有 metrics 保留。
- API response contract 保持不变。
- Redis 不可用时仍走 DB fallback。
- `skipRedis` / `skipDatabase` 测试模式不受影响。

## 错误处理

| 场景 | 行为 |
| --- | --- |
| Redis get 失败 | 记录 `operation=get`，降级 `load()` |
| cached JSON parse 失败 | 删除坏 key，记录 `operation=parse`，降级 `load()` |
| Redis lock 获取失败 | 记录 `lock_error`，降级 `load()` |
| Redis lock 未获取 | 等待缓存回填 |
| 等待超时 | 记录 `wait_timeout` + `fallback_load`，降级 `load()` |
| lock holder 的 `load()` 失败 | 不写缓存，释放/等待锁过期，错误按现有语义返回 |
| Redis set 失败 | 返回 DB 结果，记录 `operation=set` |
| Redis release 失败 | 记录 `release_error`，依赖 lock TTL 自动释放 |

## 测试计划

### 自动化测试

扩展 `pbs-server/src/utils/cache.test.ts`：

- 默认 `getOrSet` 行为保持现状，未开启防击穿时连续 miss 不被 singleflight 改写。
- 开启 `stampedeProtection` 后，20 个同 key 并发只执行一次 loader。
- 同进程 in-flight join 返回同一结果，loader 失败时不残留 in-flight。
- 两个 `PbsCache` 实例共享同一个 fake Redis 时，同 key 并发只允许一个实例拿锁执行 loader。
- 未拿到锁的请求在缓存回填后返回 cached value。
- 未拿到锁且等待超时后会 fallback load，不死等。
- Redis lock / release 抛错时业务仍返回 loader value。
- parse 失败、get 失败、set 失败的旧 fallback 测试继续通过。
- 新 metrics 能记录 `local_join`、`lock_acquired`、`wait_hit`、`wait_timeout`。

扩展 `pbs-server/src/services/pairing-search/pairing-search-service.test.ts`：

- 20 个并发相同 `preview` 请求只执行一次 actor lookup 和一次 preview SQL。
- 20 个并发相同 `current-rules-counts` 请求只执行一次 count SQL。
- 20 个并发相同 `current-rules-tier-pools` 请求只执行一次 count SQL。
- 20 个并发相同 `airport-options` 请求只执行一次 airport options SQL。
- 改变 page / pageSize / period / actor base / actor rank 仍会 miss，不串数据。
- Redis 防击穿失败时仍返回 DB 结果。

### 构建与单测

必须运行：

```bash
cd pbs-server
npm test
npm run build
```

### 真实运行验证

本地使用当前 `pbs-server:3002` + `pbs-portal:3030` + PBS Redis：

1. 清理 `pbs:<schema>:pairing-search:*` 测试 key。
2. 登录 PBS Portal。
3. 打开 Pairing 页面。
4. 点击 `SEARCH PAIRINGS`。
5. 重复相同搜索，确认热命中仍是几十毫秒级。
6. 跑 20 并发相同 preview 冷 key 脚本：
   - 预期 DB preview loader 只有 1 次或接近 1 次。
   - 其它请求通过 `wait_hit` 或 `local_join` 返回。
   - p50 / max 应显著低于 Phase 2 冷并发基线。
7. 访问 `/metrics`，确认出现：

```text
rois_pbs_server_cache_stampede_total{cache_group="pairing-search",cache_resource="preview",outcome="lock_acquired"}
rois_pbs_server_cache_stampede_total{cache_group="pairing-search",cache_resource="preview",outcome="wait_hit"}
rois_pbs_server_cache_resource_hit_total{cache_group="pairing-search",cache_resource="preview",mode="singleflight"}
```

### Playwright

运行真实 UI 回归：

```bash
cd e2e
GANTT_BASE_URL=https://disabled npx playwright test tests/pbs-portal/pairing-search-perf.spec.ts --config=config/playwright.config.ts --project=pbs-portal --reporter=list --no-deps
```

验收点：

- UI 搜索仍返回 200。
- footer `Total N items` 与接口 `data.summary.totalItems` 一致。
- 页面不因防击穿等待出现明显卡死。

## 验收标准

- 相同 `pairing-search preview` 冷 key 的 20 并发请求不再全部打 DB。
- `PbsCache` 在开启防击穿时能跨 cache 实例折叠同 key 冷 miss。
- Redis 异常或锁异常时业务仍可用，最多回退到 Phase 2 cache-aside 行为。
- 所有旧缓存单测继续通过。
- `pbs-server npm test` PASS。
- `pbs-server npm run build` PASS。
- Playwright pairing-search perf 测试 PASS。
- `/metrics` 能区分 resource 级 hit/miss 和 stampede outcome。
- 不引入新的依赖，不改变 API contract，不改 UI。

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| lock TTL 太短，loader 未完成锁已过期 | 默认 `10s`，并通过并发测试验证；后续可按指标调整 |
| wait timeout 太短，仍出现 fallback stampede | 默认 `3s`，覆盖当前实测 max；指标暴露 `wait_timeout` |
| wait timeout 太长，用户等待过久 | 只用于重路径，且最大等待固定；超时后 fallback |
| 锁释放误删其它请求锁 | 使用随机 token + Lua compare-and-delete |
| Redis 故障导致接口失败 | 所有 Redis 操作失败都降级 DB 查询 |
| metrics label 过多 | label 只使用固定 group/resource/outcome 枚举 |
| 默认行为改变影响其它缓存 | `stampedeProtection` 显式开启，默认保持 Phase 2 行为 |

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在 `PbsCache` 并发控制、pairing-search 调用参数和对应测试。核心 contract 是同一个 helper 的行为，拆开并行容易产生测试假设不一致。
- Suggested split: 不拆分。实施时由主 agent 串行完成 cache helper、pairing-search 开启、防回归测试和真实验证。
- Write boundaries: `pbs-server/src/utils/cache.ts`、`pbs-server/src/utils/cache.test.ts`、`pbs-server/src/services/pairing-search/pairing-search-service.ts`、`pbs-server/src/services/pairing-search/pairing-search-service.test.ts`、版本文件和 QA 文档。
- Conflict risk: 中等。主要风险是 `PbsCache` 被多个 service 共用，必须保持默认行为不变。
- Execution gate: 用户评审并确认本 spec 后再实现。

## 实施步骤建议

1. 扩展 `PbsCacheRedis` 类型，支持 Redis `SET NX PX` 和 ownership-safe release 所需能力。
2. 在 `PbsCache` 内新增本进程 `inFlightLoads` map。
3. 为 `getOrSet` 增加可选 `stampedeProtection` 流程，默认仍走现有 cache-aside。
4. 新增 resource 解析和 resource/stampede metrics。
5. 扩展 `cache.test.ts` 覆盖 local singleflight、distributed lock、wait hit、wait timeout、Redis fallback。
6. 在 `pairing-search-service.ts` 的五个缓存资源开启 `stampedeProtection`。
7. 扩展 pairing-search service 并发测试，证明同 key 并发不会重复打 DB。
8. 更新 PBS backend 版本号。
9. 新增 QA 测试案例文档。
10. 运行自动化测试、build、Playwright 和真实并发指标验证。
