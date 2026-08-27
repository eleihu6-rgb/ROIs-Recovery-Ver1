# PBS Dashboard / Bootstrap 性能排查与优化设计

## 背景

本次不是为了“看起来更整洁”而继续拆代码，而是先用现有性能脚本确认 PBS Portal 常用接口是否存在真实性能问题。

已执行基线命令：

```bash
pnpm --dir pbs-server perf:pbs -- --samples=5
```

结果显示所有接口 HTTP 状态都是 200，没有功能错误；但以下接口超过当前 2000ms p99 预算：

| 接口 | P99 / Max | Avg | 现状 |
| --- | ---: | ---: | --- |
| `GET /api/dashboard/summary` | 3065ms | 2725ms | 明确慢 |
| `GET /api/dashboard/profile` | 2321ms | 2075ms | 明确慢 |
| `GET /api/portal/bootstrap` | 2246ms | 2096ms | 组合接口慢 |
| `GET /api/bidding-calendar/current` | 2008ms | 1509ms | 临界慢 |
| `GET /api/pairing-bids/current` | 2571ms | 1003ms | 有尾延迟尖峰 |

返回体最大约 10KB，不像是传输体积问题；主要怀疑方向是后端 SQL、重复查询、服务组合链路或缺少必要索引。

注意：这次基线来自本地 `http://localhost:3002` 后端性能脚本，样本数为 5。样本数较小时 p99 基本接近 max，因此它适合暴露“明显慢点”和“尾延迟尖峰”，不适合作为最终线上 SLA 结论。后续必须补真实 UI 网络瀑布基线，确认 Dashboard / Bid 页面实际触发哪些接口、是否命中 ETag / cache、是否真的调用 `portal/bootstrap`。

## 目标

- 找出 PBS Portal 首屏和 Dashboard 相关慢接口的真实瓶颈。
- 优先优化用户打开 Dashboard / Bid 页面会直接感知的接口；真实首屏范围以 Playwright 网络瀑布为准。
- 保持现有 API contract：响应仍是 `{ code, data, message }` 或当前已存在的 ETag 响应语义。
- 不改变业务含义，不改变 period 选择逻辑，不改变 bid 保存语义。
- 每个性能修改都要有基线、证据、回归测试和前后对比。

## 非目标

- 不做 Dashboard UI 视觉重设计。
- 不继续为了拆文件而拆文件。
- 不直接盲加缓存、索引或并发逻辑。
- 不修改 `rule-engine-rs` 当前工作区已有改动。
- 不为了让脚本通过而放宽 2000ms 性能预算。

## 当前调用链判断

### `GET /api/portal/bootstrap`

入口：`pbs-server/src/routes/portal-bootstrap.ts`

该接口并发组合：

- `dashboardProfileService.getCurrentProfile`
- `biddingCalendarService.getCurrentCalendar`
- `lineholderSummaryService.getCurrentSummary`

因此 `portal/bootstrap` 本身不是单独业务逻辑瓶颈，更像是被某个子服务拖慢。需要拆出子调用耗时，判断是 profile、calendar、lineholder summary，还是它们共享的 current period / actor identity 查询导致重复耗时。

当前代码检查发现 `pbs-portal/src/shared/services/portal-bootstrap-service.ts` 存在，但尚未确认有实际页面调用方。后续 planning 不能把优化 `portal/bootstrap` 等同于优化 Dashboard / Bid 真实首屏；它只能作为后端组合接口性能指标，除非后续明确把前端首屏切到该接口并完成 UI 回归。

### `GET /api/dashboard/summary`

入口：`pbs-server/src/services/dashboard-summary/dashboard-summary-service.ts`

当前会执行：

- current period 解析。
- dashboard profile 再读取一次。
- `loadDashboardContext`：统计 `total_bidder`、fleet/pairing count、base timezone。
- `loadPreAssignments`：读取当前 crew 的预占 duties。

这个接口 Avg 已超过 2.7s，是第一优先级。

### `GET /api/dashboard/profile`

入口：`pbs-server/src/services/dashboard-profile/dashboard-profile-service.ts`

当前会执行：

- PBS user 查询。
- live schema crew identity 查询。
- live profile fields 查询，包括 seniority、fleet、language、existing credit、timezone。

需要重点确认是否存在多次 live schema round trip、current period 重复解析、`now()` 条件导致索引不可用等问题。

### `GET /api/bidding-calendar/current`

入口：`pbs-server/src/services/calendar/bidding-calendar-service.ts`

当前已有 60s current period cache，但接口仍接近 2s。可能成本来自：

- planned absence events。
- days off capacity。
- requested days off count。
- existing bid / prefer off rows。
- pairing occurrence calendar events。

该接口是临界慢，不应先盲改；要拆分内部耗时再决定是否优化。

### `GET /api/pairing-bids/current`

入口：`pbs-server/src/routes/pairing-bids.ts` 与 `pbs-server/src/services/pairing/pairing-bid-service.ts`

该接口平均 1s 左右，但 p99 有 2.5s 尖峰。优先级低于 `dashboard/summary`，但需要确认是否与 current draft 初始化、favorite/reference option 预加载、current period 解析有关。

## 备选方案

### 方案 A：先观测再修复

做法：

- 给上述慢接口加低开销、可开关的内部阶段耗时记录，或用本地临时脚本拆服务调用耗时。
- 对确认慢的 SQL 执行 `EXPLAIN (ANALYZE, BUFFERS)`。
- 只对证据明确的 SQL 或重复调用做修改。

优点：

- 风险最低，不会误伤业务。
- 能解释“为什么慢”和“改完为什么变快”。
- 适合现在这种多个接口都慢、但原因未完全确认的情况。

缺点：

- 第一轮交付不是直接加速，而是先产出证据和最小修复点。

### 方案 B：直接给 Dashboard / Bootstrap 加短 TTL cache

做法：

- 对 profile、summary、calendar 等 GET 加 30-60s 私有缓存。

优点：

- 可能快速压低重复刷新耗时。

缺点：

- 如果根因是 SQL 或重复 period/profile 查询，cache 只是遮住问题。
- Dashboard 包含 last login、business time、bid window remaining、预占 duties，缓存 key 和失效边界要很谨慎。
- 容易让 SIT 看起来好了，但真实并发和数据更新语义留下隐患。

### 方案 C：直接改 SQL / 加索引

做法：

- 根据代码直觉重写 dashboard/profile/calendar SQL 或添加索引。

优点：

- 如果猜中瓶颈，收益最大。

缺点：

- 没有 `EXPLAIN` 证据容易改错方向。
- 索引属于数据库变更，需要 migration、schema mirror、远端库执行窗口和回滚说明。
- 可能对导入、award、live 数据写入造成额外维护成本。

## 推荐方案

采用方案 A：先观测再修复。

第一阶段只做诊断和最小可验证优化，不把“缓存”“索引”“SQL 重写”预设为答案。确认慢点后，如果只是重复调用，例如 `dashboard/summary` 内部重新查 profile，而 `portal/bootstrap` 又同时查 profile，再考虑在请求内复用 profile 结果或拆分 summary 依赖；如果是 live schema SQL 扫描，再做 SQL rewrite 或索引。

## 实施设计

### 阶段 1：拆分耗时证据

目标：知道 2-3 秒花在哪里。

工作内容：

- 用 Playwright 打开真实 PBS Portal 页面并记录网络瀑布：
  - Dashboard 首屏实际触发的 GET 接口、耗时、是否 200 / 304。
  - Bid 首屏实际触发的 GET 接口、耗时、是否 200 / 304。
  - 是否实际调用 `GET /api/portal/bootstrap`。
  - 慢接口是否与性能脚本中相同。
- 对 `dashboard/summary` 内部阶段计时：
  - business clock
  - current period
  - profile
  - dashboard context SQL
  - pre assignments SQL
- 对 `dashboard/profile` 内部阶段计时：
  - PBS user
  - crew identity
  - roster period key
  - live profile fields SQL
- 对 `bidding-calendar/current` 内部阶段计时：
  - current period cache hit/miss
  - existing bid / prefer off config
  - planned absence
  - days off capacity
  - prefer off rows
  - pairing occurrence load
- 对 `portal/bootstrap` 记录三个并发子调用各自耗时。

计时信息只用于开发/诊断日志或测试脚本输出，不能把 SQL、token、crew 敏感数据打到用户可见日志。

### 阶段 2：SQL 证据

对阶段 1 中超过 500ms 的 SQL 路径，使用远端权威 PostgreSQL 执行：

```sql
EXPLAIN (ANALYZE, BUFFERS)
...
```

必须记录：

- 查询条件：base、division、roster period、crew id 是否匿名化。
- 当前 plan 是否 seq scan / nested loop 过大 / sort 过大 / repeated lateral。
- rows examined 与 rows returned。
- shared buffers hit/read。
- 是否存在可用索引但 predicate 不 sargable。

### 阶段 3：最小修复

根据证据选择一种或多种修复：

- 请求内复用：`portal/bootstrap` 或 `dashboard/summary` 避免重复读取同一个 profile/current period。
- 前端接入调整：只有当真实 UI 网络瀑布证明首屏需要组合多个接口、且 `portal/bootstrap` 能减少首屏 round trip 时，才考虑接入；否则不为了使用已有接口而改前端。
- SQL 合并：把同一接口内重复读取 actor scope、base timezone、period context 的查询合并。
- SQL 改写：把不可索引的日期条件改成半开区间，保留 timezone 业务语义。
- 索引：仅当 `EXPLAIN` 证明缺索引时，新增 idempotent migration，并同步 schema。
- 短 TTL cache：仅用于稳定且私有的 GET 数据，key 必须包含 crew、period、base/division 等必要维度。

## 数据库变更原则

默认不做数据库 migration。

只有满足以下条件才允许提出 migration：

- `EXPLAIN` 证明瓶颈是表扫描或排序，且索引能明确降低 rows/buffers。
- 查询语义稳定，索引字段不是临时猜测。
- migration 使用 `CREATE INDEX IF NOT EXISTS` 或线上适配的 concurrent 方案。
- 同步更新 canonical schema，避免新环境初始化缺索引。
- 给出 dev / SIT / UAT 执行顺序和回滚说明。

## 验收标准

- `pnpm --dir pbs-server perf:pbs -- --samples=5` 中上述慢接口不再超过 2000ms p99，或者至少给出不可控外部因素证据。
- `dashboard/summary` 平均耗时目标降到 1500ms 以下，p99 目标降到 2000ms 以下。
- `dashboard/profile` 平均耗时目标降到 1200ms 以下，p99 目标降到 2000ms 以下。
- `portal/bootstrap` p99 目标降到 2000ms 以下；但只有在确认前端使用它后，才把它计入真实首屏验收。
- `bidding-calendar/current` 保持在 2000ms 以下，不能因为优化 dashboard 反而变慢。
- API 响应 JSON 结构保持不变。
- Dashboard 首屏仍能正常显示 user information、bid information、message center、calendar。
- Bid 页面左侧 calendar、existing bids、pairing/days off/standing bid 基础读取不回归。
- Playwright 网络瀑布能说明真实首屏慢接口和性能脚本结论是否一致。

## 测试与验证

后端：

- `pnpm --dir pbs-server build`
- `pnpm --dir pbs-server test`
- `pnpm --dir pbs-server perf:pbs -- --samples=5`
- 对修改过的 SQL 跑远端 PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` 前后对比。

前端 / E2E：

- 如果改动影响 Dashboard 或 Bid 首屏，必须用 Playwright 打开真实页面：
  - Dashboard 页面首屏可见 user information、message center、calendar。
  - Bid 页面左侧 calendar 正常加载，右侧 current bid 数据正常。
  - 不出现接口错误 toast 或空白错位。
  - 记录真实页面网络请求耗时，特别是 `/api/dashboard/summary`、`/api/dashboard/profile`、`/api/bidding-calendar/current`、`/api/pairing-bids/current` 和 `/api/portal/bootstrap` 是否出现。
- 如果只改后端 SQL 且 contract 不变，Playwright 作为 smoke；主要证明仍能通过真实 UI 调用接口。

UI 标准：

- 如果没有改前端样式，不需要跑 `check:ui`。
- 如果改动触及 `pbs-portal` UI 或布局，必须跑对应 UI gate。

## 风险与回滚

- 如果修复采用 cache，最大风险是展示旧数据；必须定义 TTL 和 invalidation，否则不采用。
- 如果修复采用 SQL rewrite，最大风险是统计口径变化；必须做旧新结果 diff。
- 如果修复采用索引，最大风险是线上建索引耗时或影响写入；必须单独确认执行窗口。
- 如果发现慢点来自远端 DB 冷启动或网络抖动，要在报告中明确说明，不用代码掩盖。

## Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: 诊断可以并行拆成后端 SQL/服务耗时、前端真实页面验证、测试基线整理三个互不重叠的方向。
- Suggested split:
  - Agent A：只读分析 `dashboard/summary`、`dashboard/profile`、`portal/bootstrap` 调用链和 SQL。
  - Agent B：只读分析 `bidding-calendar/current`、`pairing-bids/current` 调用链和 SQL。
  - Agent C：用 Playwright 做 Dashboard/Bid 页面真实首屏与接口时序观察。
- Write boundaries: 第一轮全部只读；进入实现后，每个 agent 必须分配明确文件边界。
- Conflict risk: 低。诊断阶段不写代码；实现阶段如果都改共享 current period/profile helper，风险升高，需要主 agent 集成。
- Execution gate: 只有在本 spec 经用户确认后，才进入实现或多 agent 执行。

## 需要用户确认

以上方案的核心是：先用证据定位慢点，再做最小修复；不盲目加缓存、不盲目加索引、不扩大 UI 重构范围。

如果确认这个方向，下一步进入“诊断实施”：先加或运行内部阶段耗时统计，然后输出具体慢 SQL 和优化方案。

## 本轮实施结论

本轮实际落地的是证据明确、风险较低的后端最小优化，没有数据库 migration。

- `dashboard/profile`：把 crew identity 的 base/rank/division/timezone 查询从多次 live schema round trip 合并为一次 SQL，并移除后续重复 timezone 查询。
- `dashboard/summary`：删除当前 Dashboard UI 已不展示的 `totalBidder` / `fleetItems` 统计查询；响应字段仍保留，分别返回 `null` 和空数组。
- `bidding-calendar/current`：把无顺序依赖的 planned absence、day-off capacity、specific pairing event 查询改为并行等待。
- `planned absence` 探针：把“source 可用”检查也加入 60 秒缓存，避免每次 calendar 请求都执行一条空探针 SQL；失败 warning 行为保留。

最新 `perf:pbs -- --samples=5` 结果显示：

- `GET /api/dashboard/profile`：P99 约 1749ms，低于 2000ms。
- `GET /api/dashboard/summary`：P99 约 1825ms，低于 2000ms。
- `GET /api/bidding-calendar/current`：P99 约 1926ms，低于 2000ms。
- `GET /api/portal/bootstrap`：P99 约 1908ms，低于 2000ms；真实 PBS Portal 页面当前未调用该接口。
- `GET /api/pairing-bids/current`：仍有约 2783ms 尾延迟，建议作为下一轮独立优化点，不混入本轮 Dashboard/Calendar 修复。

Playwright 真实页面 smoke 结果：

- `/pbs/dashboard` 可正常显示，关键接口 `dashboard/summary` 与 `bidding-calendar/current` 均返回 200。
- `/pbs/bid` 可正常显示，关键接口 `dashboard/profile`、`pairing-bids/current`、`bidding-calendar/current` 均返回 200。
- 真实页面网络瀑布没有调用 `/api/portal/bootstrap`。
