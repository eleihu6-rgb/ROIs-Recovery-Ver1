# PBS 常用业务接口性能优化设计

日期：2026-07-09
状态：待用户 review
范围：优化 `pbs-server` / `pbs-portal` 常用业务接口的服务端耗时与请求组织；本轮不处理 Pairing Search、导入导出、admin 和批处理接口。

## 背景

根规范要求接口性能不能拖慢首屏和常用工作流，`pbs-server` 当前也已有慢接口日志阈值：服务端处理时间超过 `2000ms` 会记录 slow API。PBS Portal 是员工端产品，常用页面会高频访问 current draft、dashboard、calendar、summary、award 等接口；如果单个接口 p99 超过 2 秒，会直接影响用户打开页面、切换模块、查看当前申请状态和保存前后的反馈。

本轮用户明确要求：

- 处理一轮接口速度优化。
- 按“单个接口服务端耗时”验收。
- 验收口径为 `p99 < 2s`。
- 先不做 Pairing 页面搜索环相关优化。
- 只处理常用业务接口；导入、导出、admin 不处理。
- `pbs-server` 和 `pbs-portal` 可以一起调整，因为后端接口耗时和前端请求组织是相辅相成的。
- 如果瓶颈需要索引，则应补 SQL 索引；如果适合 Redis，则整理 Redis cache / key / 失效策略。

## 目标

1. 建立 PBS 常用业务接口的 before / after 性能基线。
2. 将纳入范围的单个接口服务端耗时优化到 `p99 < 2000ms`。
3. 对确认为 SQL 查询瓶颈的接口，补充必要 PostgreSQL index，并同步 migration 与 canonical schema。
4. 对重复读取、稳定 GET、高并发同 key 查询，使用已有 Redis cache / singleflight / ETag 能力，避免重复 DB 工作。
5. 对 Portal 首屏和常用页面请求组织做必要调整，减少重复请求和错误的 cache invalidation。
6. 保持现有 API contract、身份模型、当前周期和草稿并发控制语义不变。

## 非目标

- 不优化 `/api/pairing-search/*`，包括 Search Pairings、Pairing 页面搜索环、pool counts、autocomplete、airport options 等热路径。
- 不处理导入、导出、admin、批量 replay、seed、sync、algorithm export 等天然长任务或管理接口。
- 不改 PBS bid / award / property 的业务语义。
- 不改 `{ code, data, message }` 响应格式。
- 不引入新的通用缓存框架；优先复用 `pbs-server/src/utils/cache.ts`。
- 不为了“体感快”隐藏慢接口；服务端单接口 p99 仍是验收主口径。

## 接口范围

本轮默认纳入以下常用业务接口：

| 类别 | 接口 | 说明 |
|---|---|---|
| Auth | `GET /api/auth/session` | Portal session 恢复 |
| Dashboard | `GET /api/dashboard/profile` | 当前用户 profile |
| Dashboard | `GET /api/dashboard/summary` | Dashboard summary / bid package |
| Calendar | `GET /api/bidding-calendar/current` | 左侧 Bidding Calendar |
| Bootstrap | `GET /api/portal/bootstrap` | profile + calendar + summary 聚合 |
| Pairing Bid | `GET /api/pairing-bids/current` | Pairing current draft，不含 pairing-search |
| Days Off | `GET /api/days-off-bids/current` | Days Off current draft |
| Line | `GET /api/line-bids/current` | Line current draft |
| Reserve | `GET /api/reserve-bids/current` | Reserve current draft |
| Reserve | `GET /api/reserve-bids/current/coverage` | Reserve coverage 常用展示 |
| Summary | `GET /api/lineholder-bids/current/summary` | Lineholder summary |
| Award | `GET /api/award/current` | Award 页面 current award |
| Standing Bid | `GET /api/standing-bids/current` | Standing bid 页面 |

如实现中发现其他 Portal 常用 GET 也在首屏或主导航中稳定触发，可加入基线清单；加入时必须仍满足本轮排除规则。

明确排除：

- `/api/pairing-search/*`
- `/api/admin/*`
- `/api/crew-bid-imports/*`
- `/api/admin/algorithm-export` 和所有导出包生成接口
- 脚本类、sync 类、seed 类、批量 replay 类入口

## 基线设计

复用并改造现有脚本：

- [pbs-performance-baseline-core.ts](/Users/lei/Codehub/rois-ai/pbs-server/src/scripts/pbs-performance-baseline-core.ts)
- [pbs-performance-baseline.ts](/Users/lei/Codehub/rois-ai/pbs-server/src/scripts/pbs-performance-baseline.ts)

现状：

- 已能选取一个 active portal user，生成 JWT，按 endpoint 采样。
- 已输出 avg / p95 / max / bytes。
- 现有默认 endpoint 包含 `/api/pairing-search/preview`，不符合本轮范围。

本轮调整：

1. 默认 endpoint 清单改为“常用业务接口”，删除 pairing-search endpoint。
2. 新增 `p50Ms`、`p99Ms` 字段和报告列。
3. `overBudget` 改为基于 `p99Ms > budgetMs` 判断。
4. 默认 budget 保持 `2000ms`。
5. 建议本轮运行 `--samples=30` 或更高；样本太少时 p99 的统计意义不足。
6. 输出仍必须隐藏 token、数据库连接串、JWT secret。

基线运行环境：

- 本地启动 `pbs-server`。
- `pbs-server` 使用远端真实 PostgreSQL。
- 本地或可访问 Redis 使用当前 `REDIS_PBS_URL`。
- before / after 使用同一环境、同一用户、同一 sample 数。

建议命令形态：

```bash
cd pbs-server
npm run perf:pbs -- --base-url=http://localhost:3002 --samples=30 --budget-ms=2000
```

## 优化策略

### 1. SQL index 策略

当某个接口 p99 超过或接近 2 秒，且慢点来自 PostgreSQL 查询时，必须先拿到 SQL 证据：

- 识别 route -> service -> SQL。
- 对慢 SQL 运行 `EXPLAIN (ANALYZE, BUFFERS)`。
- 判断是否存在顺序扫描、低选择性过滤、排序溢出、聚合扫描大表、join 顺序不佳、缺少组合索引等问题。

允许补索引的典型情况：

- 常用查询按 `crew_id + period_code + bid_context` 定位 current bid。
- 按 `bid_id + bid_type + property_group_key` 或 `bid_id + tier/date` 读取 draft 结构。
- 按 `roster_period.pbs_period_code` / `pbs_bid_open_at` / `pbs_bid_close_at` 查当前周期。
- Dashboard / Calendar / Award / Reserve coverage 读 live 表时使用 base、division、period range、crew_id 等稳定过滤维度。

SQL index 要求：

- migration 放在 `sql/migration/YYYY-MM-DD-*.sql`。
- fresh schema 同步更新：
  - PBS 表索引更新 `sql/schema/pbs/01-pbs.sql`
  - live 表索引更新对应 `sql/schema/live/*.sql`
- migration 必须幂等，使用 `create index if not exists`。
- 对远端已有大表，实际执行建议使用 `CREATE INDEX CONCURRENTLY`，避免长时间锁表。
- 不新增投机性索引；每个索引要对应具体慢 SQL 和查询条件。

### 2. Redis cache / singleflight 策略

Redis 不是 SQL index。本轮使用 Redis 的目标是减少重复 DB 工作、降低并发同 key 抖动和稳定 GET 的尾延迟。

优先复用：

- `createPbsCache`
- `cache.getOrSet`
- `stampedeProtection`
- 现有 metrics：cache hit / miss / error / stampede

适合 Redis 的对象：

- property catalog：稳定配置，已存在 5 分钟级缓存模式。
- current period：短 TTL，避免每个 current draft 重复解析周期。
- dashboard profile / summary 中稳定且用户相关的数据。
- bidding calendar 当前周期数据。
- lineholder summary 等高频读取但写入不频繁的数据。

Cache key 设计原则：

- 必须包含 `schema`、`resource`、`version`。
- 必须包含真实业务维度，例如 `crewId`、`periodCode`、`base`、`division`、`rank`。
- 不得把不同用户、不同 base、不同 period 的数据混到同一个 key。
- 业务语义改变时提升 cache version。

失效策略：

- current draft 写入后，必须失效受影响的 current draft、calendar、tier summary 或 lineholder summary query。
- 后端 Redis cache 不应只依赖长 TTL 掩盖脏数据。
- 如果写路径复杂且无法可靠失效，优先使用短 TTL + ETag，暂不引入长 TTL cache。

### 3. Private ETag 策略

已有 `sendPrivateJsonWithEtag` 适合稳定、用户私有的 GET：

- `Cache-Control: private, no-cache`
- `If-None-Match` 命中返回 `304`

本轮可继续用于 profile、calendar、summary、award、bootstrap 等稳定读接口。注意：

- ETag 降低重复传输和响应体构造成本，但不一定减少服务端 DB 查询。
- 如果接口服务端耗时主要来自 DB，仍需 SQL 或 Redis 优化。

### 4. Portal 请求组织策略

Portal 侧优化只做必要调整：

- 避免同一页面入口重复请求 profile / calendar / summary。
- 检查 shared workbench layout 的 prefetch 是否与页面 hook 重复打同一接口。
- 如 `/portal/bootstrap` 能一次提供 profile、biddingCalendar、lineholderSummary，则让 Portal 在入口消费 bootstrap 并 seed TanStack Query cache。
- 保持服务端状态在 TanStack Query，不迁入 Zustand。
- mutation 后只 invalidate 受影响 query，避免一次写入刷新整块工作台。

不允许：

- 用 mock/placeholder 掩盖真实请求。
- 为了减少请求删掉必要数据刷新。
- 通过前端吞错或延迟显示来制造“接口变快”的假象。

## 数据流设计

### Baseline 流程

```text
本地 pbs-server -> 远端 PostgreSQL / Redis
perf script -> 生成测试 JWT -> 调常用业务接口 N 次
           -> 收集 HTTP status / api code / bytes / duration
           -> 汇总 p50 / p95 / p99 / max
           -> 标记 p99 > 2000ms 的接口
```

### 优化决策流程

```text
慢接口
  -> route/service 定位
  -> 判断耗时来源
    -> SQL 慢：EXPLAIN -> index / SQL rewrite
    -> 重复读：Redis getOrSet / singleflight
    -> 重复请求：Portal query cache / bootstrap seed
    -> 响应体重复传输：Private ETag
  -> focused test
  -> after baseline
```

## 错误处理与安全

- API 响应格式保持 `{ code, data, message }`。
- 认证仍通过 `Bearer JWT` 和现有 auth plugin。
- 性能脚本不得打印 token、数据库连接串、JWT secret。
- Cache key 不得包含 token、密码或完整敏感 payload。
- 指标 label 继续保持低基数：method、route template、status code；不得加入 crewId、userCode、pairingId、query string。

## 测试与验证

### 自动化测试

后端：

```bash
cd pbs-server
npm test
npm run build
```

前端：

```bash
cd pbs-portal
npm test
npm run lint
npm run build
```

跨模块：

```bash
npm run verify:pbs
```

说明：`verify:pbs` 当前包含 `sync:pbs-users -- --dry-run`，如远端环境或账号状态导致失败，需要在交付说明中明确失败原因和已完成的 focused verification。

### 性能验证

必须提供 before / after：

```bash
cd pbs-server
npm run perf:pbs -- --base-url=http://localhost:3002 --samples=30 --budget-ms=2000
```

验收标准：

- 纳入范围内的常用业务接口 `p99Ms < 2000`。
- `/api/pairing-search/*` 不纳入本轮 PASS / FAIL。
- 如果某个接口仍超过 2 秒，必须说明原因、SQL 证据、剩余风险和下一步。

### SQL 验证

如果新增 SQL index：

- 提供慢 SQL 的 `EXPLAIN (ANALYZE, BUFFERS)` before / after 或可复核的结构性证据。
- 确认 row count、返回字段和业务语义未变化。
- migration 与 schema 同步。

### Portal E2E

如果改动 Portal 请求组织或用户入口：

- 需要补或更新 `e2e/tests/pbs-portal/*.spec.ts`。
- Playwright 必须驱动真实 UI，不用直接 API 调用代替用户动作。
- 至少覆盖改动入口的加载完成、关键业务数据可见、错误态不误导用户。

## 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 样本数太少导致 p99 不可信 | 错判接口是否达标 | 默认建议 `--samples=30+`，报告中展示 sample count |
| Redis cache key 漏维度 | 用户看到错误 period/base/crew 数据 | key 必须包含真实业务维度，新增测试覆盖不同 actor/period |
| TTL cache 导致数据短暂陈旧 | 保存后页面不刷新 | 写路径明确 invalidation；复杂场景使用短 TTL + query invalidation |
| SQL index 过多 | 写入变慢、维护成本增加 | 每个 index 绑定具体慢 SQL，不做投机性索引 |
| Portal bootstrap 与现有 query 重复 | 首屏反而多一次请求 | bootstrap 只在能 seed Query Cache 时使用 |
| route tests mock service，不能证明 SQL | 误以为 SQL 已覆盖 | SQL 改动必须用 EXPLAIN / 真实 DB 行为验证 |

## 版本与文档

- 纯 spec 文档不需要 bump version。
- 如果后续改 `pbs-server` runtime code，需要按项目规则 bump backend version。
- 如果后续改 `pbs-portal` runtime code，需要 bump frontend version。
- 如果同时改前后端，需要同时 bump。
- 若新增 QA 测试用例，写入 `docs/test-cases/pbs/performance/`。

## Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: 本任务可拆成基线脚本、后端 SQL/Redis 优化、Portal 请求组织、测试验证四块，边界相对清晰。
- Suggested split:
  - Agent A：扩展 `pbs-performance-baseline`，跑 before baseline，输出慢接口排序。
  - Agent B：只处理 `pbs-server` 和 `sql`，针对慢接口做 SQL / Redis 优化。
  - Agent C：只处理 `pbs-portal` 和必要 E2E，减少重复请求并接入 bootstrap/query cache。
  - Main Agent：统一 contract、version、最终验证和风险报告。
- Write boundaries:
  - 后端 agent：`pbs-server/**`、`sql/**`、必要 `docs/test-cases/pbs/performance/**`
  - 前端 agent：`pbs-portal/**`、`e2e/tests/pbs-portal/**`
  - 主 agent：集成冲突、最终验证、版本号和总结
- Conflict risk: Medium。`packages/contracts`、query key、bootstrap contract 可能同时被前后端触碰，需要主 agent 统一。
- Execution gate: 只有用户确认本 spec 后，才进入实施计划和可能的多 agent 并行执行。

## 开放问题

1. 当前 `pbs-performance-baseline` 选取第一个 active portal user。后续实施时是否需要固定一个代表用户，避免 before/after 因用户不同而波动？
2. 如果本地 Redis 不可用，是否允许先跑 DB-only baseline，再单独补 Redis 环境验证？
3. 对 p99 已达标但 Portal 入口重复请求明显的接口，是否允许作为顺手优化纳入本轮？本 spec 建议允许，但必须保持 diff 小且可验证。
