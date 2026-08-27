# PBS Pairing Search Redis 缓存设计

- 日期：2026-07-06
- 模块：`pbs-server`
- 阶段：Redis 缓存 Phase 2
- 状态：待用户评审

## 背景

Phase 1 已经完成 `pbs-server` 的 PBS 专用 Redis 基础设施、`PbsCache` cache-aside helper、current period / property catalog Redis 缓存，以及 `/metrics` cache hit/miss 可观测性。

Phase 2 的目标是继续利用同一套 `PbsCache`，覆盖 PBS Portal 中真正重的 pairing-search 交互路径。现有 pairing-search 热点主要集中在 `pbs-server/src/services/pairing-search/pairing-search-service.ts`：

- `POST /api/pairing-search/preview`
- `POST /api/pairing-search/current-rules/counts`
- `POST /api/pairing-search/current-rules/tier-pools`
- `GET /api/pairing-search/airport-options`

这些接口会读取 live schema 的 `pairing` / `pairing_segment` / `pairing_composition` / `airport` 等表，并按 actor base、rank、period、rules、filters、page 组合查询。之前已完成 SQL 层优化；Phase 2 不重写 SQL，而是在高并发 bid window 下折叠重复请求。

这些路径还会先解析 actor base / rank。这个前置 lookup 比 pairing live-table 查询轻，但仍是跨网络 DB round trip。Phase 2 应加一个 60 秒短 TTL 的 actor context 支撑缓存，让真正命中 Redis 的 pairing-search 请求不必先打 actor context DB 查询。

## 目标

- 在 `pairing-search` service 层接入 Redis cache-aside，复用 Phase 1 的 `PbsCache`。
- 缓存短时间内高度重复的 pairing-search 结果，减少同 base / same period / same rules 下的重复 live-table 查询。
- 保持 API contract 不变：仍返回 `{ code, data, message }` 包装，业务 `data` 结构不变。
- 保持现有权限边界：缓存 key 必须包含 actor base / rank / schema / period / request 内容，不能跨 base、rank 或航司串数据。
- 保持故障降级：Redis get/set/parse 失败时回源 live DB，不让搜索 API 因缓存失败返回 500。
- 保持 metrics 低基数：只使用 `cache_group` / `mode`，不把 crewId、query、period、pairingId 放进 label。

## 非目标

- 不改 PBS Portal UI。
- 不改 pairing-search API contract。
- 不新增 Redis 服务或新依赖。
- 不缓存登录、JWT、密码、用户会话或个人敏感信息。
- 不在本阶段做新的 SQL rewrite、索引 migration 或 EXPLAIN 优化；这些属于已完成的 pairing-search SQL 性能任务或后续独立任务。
- 不引入复杂主动失效机制；Phase 2 先采用短 TTL。后续如果有 pairing import / NOC sync 事件可用，再补 `invalidatePattern`。
- 不缓存错误响应或权限失败。

## 推荐方案

### 方案 A：只缓存 airport options

只覆盖 `getAirportOptions`。

优点：

- 风险最低。
- 响应稳定，key 维度简单。

缺点：

- 对 SEARCH PAIRINGS / current rules pools 的核心压力帮助有限。

### 方案 B：缓存 airport options + preview + counts + tier pools（推荐）

覆盖：

- `getAirportOptions`
- `previewPairings`
- `countCurrentRules`
- `countCurrentRuleTierPools`

优点：

- 覆盖 PBS Portal Pairing 页面最重的互动路径。
- 所有缓存点都在 `createPbsPairingSearchService` 内部，路由和 contract 不变。
- 可直接复用 Phase 1 `PbsCache` 的 key、TTL、metrics、异常回源。

缺点：

- 需要稳定 request hash，避免对象字段顺序导致 cache miss 或 key 不一致。
- 响应里有 `computedAt` 字段的 counts / tier pools 命中缓存后会复用缓存生成时间，需要接受“短 TTL 内 computedAt 表示缓存计算时间”。

### 方案 C：缓存所有 pairing-search 读取，包括 autocomplete、details、occurrence

额外覆盖：

- `searchPairingIds`
- `searchFlightNumbers`
- `searchCrewIds`
- `searchPairingOccurrences`
- `searchPairingOccurrencesByDate`
- `getPairingDetails`

优点：

- 覆盖面最全。

缺点：

- key 维度更多，收益不一定比核心 preview / counts 高。
- `getPairingDetails` 与用户点击具体 pairing 相关，重复率未必高。
- `crewIds` 查询不依赖 actor base，属于管理/搜索辅助路径，和 pairing hot path 不完全一致。

推荐先做方案 B。方案 C 可以等 Phase 2 指标上线后，根据命中率和慢请求日志决定是否继续扩展。

## 缓存范围

### Phase 2 必做

| Service 方法 | API | 建议 TTL | cache group | 说明 |
| --- | --- | ---: | --- | --- |
| `resolveActorContext` | service 内部 | 60 秒 | `pairing-search` | 支撑缓存，避免每次先查 actor base/rank |
| `getAirportOptions` | `GET /pairing-search/airport-options` | 10 分钟 | `pairing-search` | base + period 维度，稳定度高 |
| `previewPairings` | `POST /pairing-search/preview` | 30 秒 | `pairing-search` | 搜索结果受 rules / filters / page 影响，短 TTL |
| `countCurrentRules` | `POST /pairing-search/current-rules/counts` | 30 秒 | `pairing-search` | pool counts 在多人同规则下重复率高 |
| `countCurrentRuleTierPools` | `POST /pairing-search/current-rules/tier-pools` | 30 秒 | `pairing-search` | T1-Tx cumulative pools 高并发时重复率高 |

### Phase 2 暂不做

| Service 方法 | 原因 |
| --- | --- |
| `searchPairingIds` | autocomplete 较轻；空 query 已不查 DB；后续根据 hit/miss 决定 |
| `searchFlightNumbers` | autocomplete 较轻；短 query 重复率需指标验证 |
| `searchCrewIds` | 不属于 pairing live-table hot path |
| `searchPairingOccurrences` / `searchPairingOccurrencesByDate` | 点击具体 pairing/date，重复率不确定 |
| `getPairingDetails` | 详情请求跟具体 results 展开相关，收益不确定且响应较大 |

## Key 设计

复用 Phase 1 key 格式：

```text
pbs:<schema>:<group>:<resource>:<version>:<dimensions>
```

`schema` 使用 Phase 1 `PbsCache` 已绑定的 PBS schema，例如 `f8_pbs`。因为 pairing-search 实际读取 live schema，还需要把 `liveSchema` 放进 key dimensions，避免未来一个 PBS 服务实例需要区分不同 live schema 时串缓存。`group` 固定为 `pairing-search`。

建议 key：

```text
pbs:f8_pbs:pairing-search:airport-options:v1:<liveSchema>:<actorBase>:<periodCode>
pbs:f8_pbs:pairing-search:actor-context:v1:<liveSchema>:<actorHash>
pbs:f8_pbs:pairing-search:preview:v1:<liveSchema>:<actorBase>:<actorRank|->:<requestHash>
pbs:f8_pbs:pairing-search:current-rules-counts:v1:<liveSchema>:<actorBase>:<actorRank|->:<requestHash>
pbs:f8_pbs:pairing-search:current-rules-tier-pools:v1:<liveSchema>:<actorBase>:<actorRank|->:<requestHash>
```

要求：

- `liveSchema` 必须进入 key dimension。
- `actorBase` 必须进入结果类 key，避免跨 base 串数据。
- `actorRank` 必须进入 `preview` / counts / tier pools key，避免 rank-filtered 结果串数据。
- `airport-options` key 使用解析后的 period range 或规范化 periodCode；当请求未传 period 时，先按现有逻辑解析默认当前 UTC 月，再进入 key。
- `periodCode` 和完整 request payload 必须进入 request hash。
- page / pageSize / filters / properties / tiers / action / quantifier / bid value 都必须参与 request hash。
- hash 前需要 canonical JSON：对象 key 排序，数组保持顺序。
- `computedAt` 不参与 key；它是结果的一部分。
- key 里不得包含用户 JWT、密码、token 或原始敏感 header。
- `actor-context` key 使用 `crewId + userCode` 的 stable hash，不把 crewId / userCode 明文写进 key；这些值也不能进入 metrics label。

## Canonical hash

需要新增一个小工具，例如 `pbs-server/src/utils/stable-json.ts` 或放在 pairing-search 内部：

- 对普通对象递归按 key 排序。
- 数组保持原顺序，因为 rules / tiers 顺序有业务含义。
- `undefined` 字段统一忽略；`null` 保留为显式值。
- 对 canonical JSON 做 SHA-256，取 hex 前 32 位即可作为 key 维度。

不建议直接 `JSON.stringify(request)`，因为对象 key 顺序会造成不必要的 miss。

## Service 接入方式

扩展 `CreatePbsPairingSearchServiceOptions`：

```ts
export type CreatePbsPairingSearchServiceOptions = {
  pgPool: Pool;
  liveSchema: string;
  pbsSchema: string;
  cache?: PbsCache;
};
```

在 `pbs-server/src/app.ts` 创建 pairing-search service 时注入 Phase 1 已创建的 `pbsCache`。

Service 内部包装方式：

- 先解析 actor context/base，得到 `actorBase` / `actorRank`。
- 构造 cache key。
- `cache.getOrSet(key, ttl, () => executeLiveQuery())`。
- 如果没有 `cache`，保持当前逻辑直接查询 DB，方便 tests / skipDatabase mock。

不要在 route 层做缓存，理由：

- route 层没有 actor base / rank，不适合构造安全 key。
- service 层更接近 SQL 调用，可以避免缓存错误请求或校验失败。

## 数据新鲜度与失效

Phase 2 使用短 TTL，不做主动失效：

- `preview` / counts / tier pools：30 秒。
- `airport-options`：10 分钟。
- `actor-context`：60 秒。

原因：

- pairing-search 读 live pairing 数据；当前没有稳定的 pairing import / NOC sync 事件可直接触发 PBS cache invalidation。
- bid window 中重复读压力更重要，30 秒足够折叠并发请求，同时把 stale window 控制在可接受范围。
- 如果后续引入 pairing import 或 roster publish 事件，再按 `pbs:<schema>:pairing-search:*` 做 `invalidatePattern`。

## 安全与隐私

- 不缓存认证 token、密码、用户 session。
- key 只包含 base、rank、period、request hash，不把完整 query 作为明文 key 维度。
- Redis value 只缓存接口业务 data，不缓存 HTTP headers。
- metrics label 仍只允许低基数：`cache_group="pairing-search"`，`mode="single"`。
- 任何 Redis 失败都不能扩大权限；失败时回到当前 DB 查询逻辑。

## 错误处理

- 校验失败、`LineholderBidServiceError` 等错误不缓存。
- Redis get 失败：记录 `cache_error_total{operation="get"}`，回源 DB。
- Redis set 失败：返回 DB 结果，记录 `operation="set"`。
- JSON parse 失败：删除坏 key，回源 DB。
- DB 查询失败：保持现有错误路径，不写入缓存。

## 测试计划

### 自动化测试

新增或扩展 `pbs-server/src/services/pairing-search/pairing-search-service.test.ts`：

- `previewPairings` 同 actor/context/request 连续调用两次，第二次不再执行 preview SQL / segment SQL。
- 改变 `page` 或 `pageSize` 后必须 miss。
- 改变 `periodCode` 后必须 miss。
- 改变 `actorRank` 或 actor base 后必须 miss。
- actor context 第二次命中缓存时不再执行 actor lookup SQL。
- `countCurrentRules` 第二次命中缓存，不再执行 count SQL。
- `countCurrentRuleTierPools` 第二次命中缓存，不再执行 count SQL。
- `getAirportOptions` 第二次命中缓存，不再执行 airport options SQL。
- Redis get/set 失败时仍返回 DB 结果。
- canonical hash 对对象 key 顺序稳定；数组顺序变化会生成不同 hash。

保留现有 SQL builder 断言，避免缓存测试掩盖 SQL 结构回归。

### 构建与单测

必须运行：

```bash
cd pbs-server
npm test
npm run build
```

### 真实运行验证

在本地使用当前 `pbs-server:3002` + 远端 Redis：

- 登录 PBS Portal。
- 打开 Pairing 页面。
- 点击 `SEARCH PAIRINGS`。
- 重复同样搜索一次。
- 访问 `/metrics`，确认出现：

```text
rois_pbs_server_cache_miss_total{cache_group="pairing-search",mode="single"}
rois_pbs_server_cache_hit_total{cache_group="pairing-search",mode="single"}
```

### Playwright

运行现有真实 UI 测试：

```bash
cd e2e
GANTT_BASE_URL=https://disabled npx playwright test tests/pbs-portal/pairing-search-perf.spec.ts --config=config/playwright.config.ts --project=pbs-portal --reporter=list --no-deps
GANTT_BASE_URL=https://disabled npx playwright test tests/pbs-portal/portal-navigation.spec.ts --config=config/playwright.config.ts --project=pbs-portal --reporter=list --no-deps
```

验收点：

- 搜索接口返回 200。
- UI footer 的 `Total N items` 仍与接口 `data.summary.totalItems` 一致。
- 第二次同搜索能产生 `pairing-search` cache hit。

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| cache key 少维度导致跨 base/rank/period 串数据 | key 强制包含 live schema、actor base、actor rank、request hash |
| request hash 不稳定导致命中率低 | 使用 canonical JSON + SHA-256 |
| 短 TTL 内 live 数据更新后结果暂时旧 | 首批使用 30 秒 TTL；后续补 import 事件主动失效 |
| counts / tier pools 的 `computedAt` 被缓存 | 明确 `computedAt` 表示缓存计算时间；TTL 30 秒可接受 |
| 响应对象被调用方 mutate 污染缓存 | `PbsCache` 当前从 Redis JSON parse 返回新对象；DB 返回写入后不复用同一对象跨请求 |
| Redis 大 value | 只缓存 page 结果，pageSize 最大 100；不缓存无限列表 |

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在 `pairing-search-service.ts`、service tests、`app.ts` 注入和少量工具函数。拆分会增加 cache key contract 协调成本。
- Suggested split: 不拆分。若后续扩展到 autocomplete/details，可单独拆第三阶段。
- Write boundaries: `pbs-server/src/services/pairing-search/**`、`pbs-server/src/utils/**`、`pbs-server/src/app.ts`、`gantt/src/version.ts`、对应测试文档。
- Conflict risk: 中低。主要风险是同一 service 文件内多方法共享 hash/key 工具。
- Execution gate: 用户评审并确认本 spec 后再实现。

## 实施步骤建议

1. 新增 stable hash 工具和单测。
2. 扩展 `CreatePbsPairingSearchServiceOptions`，支持可选 `cache?: PbsCache`。
3. 在 `app.ts` 向 `createPbsPairingSearchService` 注入 `pbsCache`。
4. 为 `resolveActorContext` / actor base lookup 加 60 秒 Redis cache。
5. 为 `getAirportOptions` 加 Redis cache。
6. 为 `previewPairings` 加 Redis cache。
7. 为 `countCurrentRules` / `countCurrentRuleTierPools` 加 Redis cache。
8. 补 service-level cache hit/miss 测试。
9. 跑 `npm test` / `npm run build` / Playwright / metrics 验证。
