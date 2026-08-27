# PBS Server Redis 缓存设计

- 日期：2026-07-06
- 范围：`pbs-server`
- 状态：待用户评审
- 目标方案：方案 B，先补齐 PBS Redis 基础设施，并把现有进程内 TTL 缓存迁移为 Redis cache-aside；pairing search 热点缓存作为 Phase 2。

## 背景

用户关注 PBS 后续用户量变大后的性能风险，明确本次讨论范围是 `pbs-server`。

项目现状不是完全没有 Redis：

- `live-server` 已有 Redis plugin、`getOrSet` / `getOrSetChunks` / `invalidatePattern`、cache metrics，并在 roster、flight、base、crew、scenario 等路径使用。
- `connector-server` 已用 Redis 缓存 connector config 和外部 token。
- `engine-server` 已有 Redis task manager。
- 根目录 `.env.example` 和 `docker-compose.yml` 已经预留 PBS 专用 Redis：`REDIS_PBS_URL` / `redis-pbs`。

`pbs-server` 的缺口更明确：

- `pbs-server/CLAUDE.md` 规定 `pbs-server` 应使用独立 Redis 实例，并缓存高频查询。
- `pbs-server/package.json` 已有 `redis` / `bullmq` 依赖。
- `pbs-server/src/app.ts` 当前只注册 database、auth、metrics、security headers、compression、routes，没有注册 Redis plugin。
- `pbs-server/src/config/env.ts` 当前没有 `REDIS_PBS_URL` / `REDIS_URL` 校验。
- 多处 service 现在使用进程内 TTL cache，单实例有效，但不能跨实例共享，也无法覆盖进程重启或并发冷启动。

## 目标

首批目标是把 `pbs-server` 的缓存能力从“局部进程内缓存”推进到“可跨实例复用的 Redis cache-aside”，并保持业务行为不变。

具体目标：

- 增加 PBS 专用 Redis 连接配置和 Fastify plugin。
- 增加 `pbs-server` 统一 cache helper，复用 `live-server` 已验证的 cache-aside 策略，但命名和指标使用 PBS 前缀。
- 把现有低风险、稳定读取的进程内 TTL cache 接入 Redis。
- 运行中 Redis 短暂错误不得导致 PBS 读 API 失败；读路径必须回源 DB，写缓存失败只记录指标或日志。
- 所有缓存必须有 TTL，避免永久脏数据。
- 不在 Phase 1 缓存用户提交结果、草稿写入结果、权限判断结果或复杂 search 结果。

## 非目标

本 spec 不包含以下内容：

- 不改 `live-server` / `connector-server` / `engine-server`。
- 不引入新缓存依赖，继续使用已有 `redis` 包。
- 不改变 API contract：响应仍保持 `{ code, data, message }`。
- 不改变 PBS 页面 UI。
- 不缓存登录、JWT 校验、密码、token、用户敏感会话数据。
- 不在 Phase 1 缓存 pairing search preview / pool counts 的复杂结果。
- 不修改 SQL schema 或业务表结构。
- 不解决已有 pairing search SQL/index 性能问题；那部分已有历史 handoff，可作为 Phase 2 或独立性能任务处理。

## 现有缓存点

首批候选来自代码中已经存在的进程内 TTL cache，优先迁移这些已经被业务代码证明“可短期缓存”的读取。

| 模块 | 当前缓存 | 现状 | Phase 1 建议 |
| --- | --- | --- | --- |
| `pairing-bid-service.ts` | property catalog，5 分钟 | 进程内 | 迁移 Redis |
| `pairing-bid-service.ts` | current period，60 秒，按 crew | 进程内 | 迁移 Redis |
| `days-off-bid-service.ts` | property catalog，5 分钟 | 进程内 | 迁移 Redis |
| `days-off-bid-service.ts` | current period，60 秒，按 crew | 进程内 | 迁移 Redis |
| `line-bid-service.ts` | property catalog，5 分钟 | `createLineholderTtlCache` | 迁移 Redis |
| `line-bid-service.ts` | current period，60 秒，按 crew | 进程内 | 迁移 Redis |
| `reserve-bid-service.ts` | property catalog，5 分钟 | `createLineholderTtlCache` | 迁移 Redis |
| `reserve-bid-service.ts` | current period，60 秒，按 crew | 进程内 | 迁移 Redis |
| `lineholder-summary-service.ts` | current period，60 秒，按 crew | 进程内 | 迁移 Redis |
| `bidding-calendar-service.ts` | current period，60 秒，按 crew | 进程内 | 迁移 Redis |
| `business-clock.ts` | business time config，60 秒 | 进程内 | 可迁移 Redis |
| `pairing-reference-options.ts` | airport/city options，10 分钟 | 进程内 | 可迁移 Redis |

Phase 1 不要求一次迁完所有点。推荐按风险和收益排序：

1. `propertyCatalog` 系列：跨用户共享、低频变更、风险最低。
2. `currentPeriod` 系列：按 crew/user 维度，TTL 短，收益来自跨 route 复用。
3. `businessClock` config：TTL 短，影响 current period 解析，需要保守处理。
4. `pairingReferenceOptions`：读 live schema 的机场/城市选项，稳定度高，适合作为 Phase 1 后半段。

## 推荐方案

### 方案 A：只接 Redis 基础设施

内容：

- `env.ts` 增加 Redis URL 配置。
- 新增 `plugins/redis.ts`。
- 在 `app.ts` 注册 Redis plugin。
- 新增 cache helper 和 cache metrics。
- 暂不迁移业务 cache。

优点：

- 风险最低。
- 为后续缓存打基础。

缺点：

- 对用户可感知性能改善有限。
- 不能解决已有进程内 cache 多实例不共享的问题。

### 方案 B：Redis 基础设施 + 迁移现有进程内 TTL cache（推荐）

内容：

- 完成方案 A。
- 新增 PBS cache helper，例如 `src/utils/cache.ts`。
- 给 service factory 增加可选 `cache` 或 `redis` 依赖。
- 把已有 property catalog、current period、reference options 等读路径改成 Redis cache-aside。
- 保留或封装本地 clone 行为，避免调用方修改缓存对象。
- 增加 cache hit/miss/error metrics。

优点：

- 改动边界清晰，主要替换现有 cache 实现，不改变业务逻辑。
- 直接解决多实例缓存不共享。
- 风险可控，TTL 已经由现有代码证明可接受。
- 符合 `pbs-server/CLAUDE.md` 的独立 Redis 设计。

缺点：

- 对最重的 pairing search preview/count 查询不会立刻产生最大收益。
- 需要逐个 service 梳理序列化、clone、key 维度。

### 方案 C：再加 pairing search 热点缓存

内容：

- 在方案 B 基础上，对 autocomplete、airport options、current rules counts、tier pools、preview 等加短 TTL Redis cache。
- key 包含 schema、base、rank、period、query、page、filters、规则 hash 等维度。
- 配合 pairing import 或 live data refresh 做失效。

优点：

- 并发 bid window 下收益最大。
- 可减少大量重复 live-schema 查询。

缺点：

- key 设计复杂。
- 数据新鲜度和失效策略更敏感。
- 需要先用 perf baseline 和 E2E 确认热点，避免缓存错误路径。

推荐：Phase 1 实施方案 B；方案 C 写入 Phase 2，不和 Phase 1 混做。

## Phase 1 设计

### 配置

`pbs-server/src/config/env.ts` 增加：

- `REDIS_PBS_URL`：首选 PBS 专用 Redis URL。
- 可选兼容：如果 `REDIS_PBS_URL` 未配置，可 fallback 到 `REDIS_URL` 或默认 `redis://localhost:6380`。是否 fallback 需要实现时确认；更保守做法是只认 `REDIS_PBS_URL`，并在 `.env.example` 明确配置。
- 可选 `PBS_CACHE_ENABLED`：默认 `true`。如果实现复杂度不高，可以保留开关用于紧急降级；如果为保持最小改动，也可以不加开关，仅通过 Redis 连接失败回源。

推荐配置策略：

- 本地默认 `REDIS_PBS_URL=redis://localhost:6380`。
- 生产/uat 必须使用 PBS 独立 Redis，不与 live-server 的 `REDIS_URL` 混用。
- 不在代码或文档中写真实密码。

### Redis plugin

新增 `pbs-server/src/plugins/redis.ts`，参考 `live-server/src/plugins/redis.ts` 和 `connector-server/src/plugins/redis.ts`。

行为：

- 使用 `redis.createClient({ url: env.REDIS_PBS_URL })`。
- `connect()` 成功后 `fastify.decorate("redis", redis)`。
- `onClose` 调用 `quit()`。
- Redis error 只记录日志。
- 启动时 Redis 连接失败的策略需要保守设计：
  - 推荐：非测试环境启动失败直接失败，暴露基础设施问题。
  - 如果需要高可用降级，则 plugin 可 decorate 一个 disabled cache adapter，但实现复杂度更高。

考虑到 PBS 已被设计为独立 Redis 架构，Phase 1 推荐启动时 Redis 必须可用；读写过程中的临时 Redis 错误由 cache helper 降级。

### Cache helper

新增 `pbs-server/src/utils/cache.ts`，提供最小 API：

- `getOrSet(redis, key, ttlSeconds, fetchFn, options?)`
- `invalidate(redis, ...keys)`
- `invalidatePattern(redis, pattern)`，如 Phase 1 暂不做主动失效，可先不暴露 pattern API。

helper 行为：

- `GET` 命中：JSON parse 后返回。
- `GET` 未命中：执行 `fetchFn()`，再 `SET EX` 回填。
- JSON parse 失败：删除坏 key，回源。
- Redis 读失败：回源。
- Redis 写失败：返回 DB 结果，不让 API 失败。
- 所有 key 必须设置 TTL。
- 指标 label 只能使用低基数 `cache_group` 和 `mode`，不能包含 crewId、userCode、pairingId、query。

### Metrics

在 PBS metrics 中增加：

- `rois_pbs_server_cache_hit_total{cache_group,mode}`
- `rois_pbs_server_cache_miss_total{cache_group,mode}`
- 可选：`rois_pbs_server_cache_error_total{cache_group,operation}`

`cache_group` 取 key 第一个 segment，例如：

- `lineholder`
- `pairing`
- `daysoff`
- `line`
- `reserve`
- `business`
- `reference`

不得把用户、航司、period、query 放进 metrics label。

### Key 设计

Redis key 需要包含 PBS 命名空间、schema 和业务维度，避免与其他服务冲突。

建议格式：

```text
pbs:<schema>:<group>:<resource>:<version>:<dimensions>
```

示例：

```text
pbs:f8_pbs:pairing:property-catalog:v1
pbs:f8_pbs:days-off:property-catalog:v1
pbs:f8_pbs:line:property-catalog:v1
pbs:f8_pbs:reserve:property-catalog:v1
pbs:f8_pbs:period:current:v1:<crewId>
pbs:f8_pbs:business:clock-config:v1
pbs:f8:reference:pairing-options:v1
```

注意：

- `schema` 用于隔离航司或 PBS schema。
- live schema 数据使用 live schema 名，例如 `f8`；PBS schema 数据使用 `f8_pbs`。
- key 中允许包含 crewId 作为 Redis key 维度，但不能出现在 metrics label。
- 复杂对象版本变化时通过 `v2` 换 key，避免旧 JSON 解析风险。

### TTL

沿用现有进程内 TTL 起步：

| 缓存对象 | TTL |
| --- | --- |
| property catalog | 5 分钟 |
| current period | 60 秒 |
| business time config | 60 秒 |
| pairing reference options | 10 分钟 |

这些 TTL 是 Phase 1 的保守值。后续如果有监控数据证明命中率低或 DB 压力仍高，再单独调整。

### Service 注入方式

推荐不让 service 直接依赖全局 Fastify，而是在 `app.ts` 创建 service 时注入 cache 依赖：

```text
createPbsPairingBidService({
  db,
  pgPool,
  liveSchema,
  cache,
})
```

这样测试可以注入 fake cache 或不注入 cache，保持 route test 的 mock service 模式不变。

可选封装：

- `createPbsCache({ redis, schema, logger })`
- service 调用 `cache.getOrSet(...)`

这种方式比在每个 service 里直接传 `redis` 更利于测试和统一 key 规范。

### 失效策略

Phase 1 主要依赖 TTL，原因是首批缓存对象本身低频变化，且现有实现也是 TTL。

主动失效只在明确写路径发生时加入：

- 修改 PBS period / business time config 后，清 `business:clock-config` 和相关 current period。
- 修改 `pbs_bid_property` 或 property seed 后，清对应 property catalog。当前常驻服务内是否有这些写入口需要实现前再确认。

如果没有明确写入口，Phase 1 不新增复杂失效链路，避免把缓存和业务写路径耦合过深。

## Phase 2 设计方向

Phase 2 面向 pairing search 高并发热点，必须先测量再做。

候选缓存：

- `GET /api/pairing-search/pairing-ids`
- `GET /api/pairing-search/flight-numbers`
- `GET /api/pairing-search/airport-options`
- `POST /api/pairing-search/current-rules/counts`
- `POST /api/pairing-search/current-rules/tier-pools`
- 部分 `POST /api/pairing-search/preview`

要求：

- key 必须包含 live schema、actor base、actor rank、period、query、limit、page、filters、规则 hash。
- TTL 建议 15-60 秒起步，counts 可更短，reference options 可更长。
- 缓存前必须确认响应不包含不该跨用户共享的私有字段。
- 对 preview/page 结果需要谨慎，不能缓存会随用户草稿版本变化但 key 未包含版本的信息。
- 必须先运行 `pbs-server` perf baseline 和真实 UI E2E，证明缓存的是热点路径。

Phase 2 不应该在 Phase 1 同时实施，避免把基础设施、低风险缓存和复杂 search 缓存混在一个不可回归的变更里。

## 数据安全

- Redis key 不写密码、JWT、Bearer token、RSA private key。
- Redis value 不缓存登录响应、用户 token 或密码相关数据。
- 可以缓存 crew scoped 的 current period，但 TTL 短，并且 key 不进入 metrics label。
- 日志不输出完整 Redis URL；尤其不能输出带密码的 URL。
- 指标标签不得包含 crewId、userCode、query、pairingId 等高基数或敏感数据。

## 错误处理与降级

读路径：

1. 查询 Redis。
2. 命中则返回缓存值。
3. 未命中、Redis 错误或 JSON 解析错误，则回源 DB。
4. DB 返回后尝试写 Redis。
5. Redis 写失败不影响响应。

写路径：

1. 先写 DB。
2. DB 成功后删除相关缓存。
3. 删除失败只记录日志/指标，依赖 TTL 兜底。

启动路径：

- 推荐 Redis 启动连接失败时让 `pbs-server` 启动失败，避免生产环境以“无 Redis”状态悄悄运行；这属于启动阶段基础设施策略，和运行中读路径降级不冲突。
- 如果后续运维要求 Redis 故障时仍可启动，再单独设计 `PBS_CACHE_ENABLED=false` 或 disabled adapter。

## 测试策略

自动化测试：

- `pbs-server/src/plugins/redis.test.ts` 或同等测试：验证 plugin 读取 env、连接/关闭流程可 mock。
- `pbs-server/src/utils/cache.test.ts`：验证 hit、miss、JSON parse fail、Redis get fail、Redis set fail、TTL 参数、clone/返回隔离。
- service 单测：至少覆盖一个 property catalog 和一个 current period 迁移点，证明第一次回源、第二次命中 cache。
- route 测试保持现有 mock service 模式，不把 Redis 引入 route test 复杂度。
- metrics 测试：验证新增 cache metrics 名称存在，label 低基数。

验证命令：

```bash
cd pbs-server && npm test
cd pbs-server && npm run build
```

如果 Phase 1 触及 portal 可见流程，还应跑：

```bash
cd e2e && npx playwright test tests/pbs-portal/portal-navigation.spec.ts --config=config/playwright.config.ts --project=pbs-portal --reporter=list
```

如果 Phase 2 做 pairing search 缓存，还必须跑：

```bash
cd pbs-server && npm run perf:pbs -- --samples 5 --budget-ms 2000
cd e2e && npx playwright test tests/pbs-portal/pairing-search-perf.spec.ts --config=config/playwright.config.ts --project=pbs-portal --reporter=list
```

手工 QA 文档：

- 新增 `docs/test-cases/pbs/performance/<YYYY-MM-DD>-pbs-server-redis-cache.md`。
- 内容包含本地 Redis 正常、Redis 短暂不可用、重复刷新页面、跨实例预期、缓存过期后回源、业务时间/period 修改后的过期行为。

## 版本与发布

这是 `pbs-server` 后端运行时代码变更，实施时需要 bump：

- `gantt/src/version.ts` 中 `PBS_BACKEND_VERSION` +1。

如果只写本文档，不 bump 版本。

发布前需要确认部署环境：

- UAT/生产提供 PBS 专用 Redis URL。
- 不与 live-server 共享 Redis DB 或至少使用不同 DB index 和 key namespace。
- Prometheus 能采集新增 cache metrics。

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| Redis 缓存旧数据 | 所有 key 设置 TTL，低风险对象先行，写路径只在明确时主动失效 |
| JSON 结构变化导致 parse/字段不兼容 | key 加版本号 `v1`，结构变化升版本 |
| Redis 运行中短暂故障影响 API | cache helper 读写错误回源/忽略，启动失败策略单独明确 |
| metrics 高基数 | label 只允许 `cache_group` / `mode` / `operation` |
| service 测试变复杂 | 使用 cache adapter 注入，而不是 service 直接访问 Fastify |
| 误缓存私有数据 | Phase 1 只缓存元数据和短 TTL period，不缓存 token、登录、提交结果 |
| 过早缓存 search 复杂结果 | Phase 2 单独做，先测量和 E2E |

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: Phase 1 虽然涉及多个 service，但核心是同一套 Redis plugin/cache helper 和少量现有 TTL cache 迁移，拆给多个 agent 容易同时修改 `app.ts`、cache helper 和 service factory，协调成本高。
- Suggested split: 如后续任务扩大，可拆为“Redis 基础设施 + helper”“service cache 迁移”“测试/QA 文档”三个串行或半并行工作包。
- Write boundaries: Phase 1 建议主 agent 单线修改 `pbs-server/src/config`、`pbs-server/src/plugins`、`pbs-server/src/utils`、相关 service、测试、`gantt/src/version.ts` 和 QA 文档。
- Conflict risk: Medium。多个 service factory 都从 `app.ts` 注入，多个 agent 并行会产生冲突。
- Execution gate: 用户批准本文 spec 并确认进入 implementation plan 后再实施；不在 spec 阶段改业务代码。

## 验收标准

Phase 1 完成后应满足：

- `pbs-server` 启动时注册 PBS Redis，并使用 `REDIS_PBS_URL`。
- 至少 property catalog 与 current period 两类现有进程内缓存迁移到 Redis cache-aside。
- Redis key 带 `pbs:<schema>:` 命名空间和版本。
- Redis 读写错误不会导致业务 GET API 失败。
- cache hit/miss 指标可在 `/metrics` 中看到。
- `npm test` 和 `npm run build` 通过。
- QA 测试文档已新增。
- `PBS_BACKEND_VERSION` 已按项目规范 bump。

## 待确认问题

1. Phase 1 是否需要启动失败强依赖 Redis？推荐“是”，因为 PBS 架构已明确独立 Redis；但如果运维希望 Redis 故障时 PBS 仍可启动，需要加 disabled adapter。
2. `REDIS_PBS_URL` 未配置时是否 fallback 到 `REDIS_URL`？推荐“不 fallback”，避免误用 live-server Redis。
3. Phase 1 是否一次迁移所有现有 TTL cache，还是先迁 property catalog + current period 两类？推荐先迁两类，降低首批变更面。
