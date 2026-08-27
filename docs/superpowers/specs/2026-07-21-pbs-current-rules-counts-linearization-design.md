# PBS Current Rules Counts 线性化性能修复设计

- 日期：2026-07-21
- 模块：`pbs-server`、`pbs-portal`、`e2e`
- 接口：`POST /api/pairing-search/current-rules/counts`
- 状态：已批准并完成实现验证
- 设计结论：保持所有业务语义和 API contract 不变，将重复的候选筛选与条件计算改为一次计算、多处复用

## 1. 背景与问题

Bid 页面通过 `POST /api/pairing-search/current-rules/counts` 计算：

- 所有 existing Pairing properties 各自独立匹配的 `rule` count；
- 当前 Tx 中 active properties 按现有顺序逐步叠加后的 `funnel` count；
- 当前 Tx 全部 active properties 的最终 `summary.allRules` count。

当前实现为每一个 count target 生成一个完整 `SELECT count(...)`，再以 `UNION ALL` 拼成一条 SQL。每个分支都会重新执行 actor base、rank、period、本地 origin date 和 property condition 计算。

用户 19（Mary Nasso）的真实 Jun 2026 / T1 请求包含 7 条 existing Pairing properties，其中 6 条属于 T1，因此产生 7 个 row-rule target 和 6 个 funnel target，共 13 个完整计数分支。

真实诊断结果：

- 后端最终返回 HTTP 200；
- 冷请求耗时约 34–35 秒；
- PostgreSQL `pg_stat_activity` 显示查询处于 active 计算状态，不是 lock wait；
- 每个分支重复执行基于 `pairing_segment min(...)` 和基地时区的本地 origin date 计算；
- Portal Axios 全局超时为 10 秒，请求在后端完成前被客户端中止，浏览器显示 `net::ERR_ABORTED`；
- 页面因此进入 `Try refresh again` 状态；
- 5 个并发真实浏览器会话可稳定复现失败。

服务重启不能解决该问题。重启或缓存失效后第一次请求为冷请求，反而最容易超过 10 秒；服务端随后完成计算并写入 30 秒缓存，才可能让后续相同请求快速成功。

## 2. 根因

设：

- `N` = 所有 existing Pairing properties 数量；
- `M` = 当前 Tx active properties 数量。

当前查询生成 `N + M` 个完整分支。单条条件表达式的累计出现次数为：

```text
N + M × (M + 1) / 2
```

当 `N = M = 20` 时：

```text
完整计数分支：40
条件表达式出现次数：230
```

更严重的是，Base、Rank、Period 和本地 origin date 也在每个分支重复计算。本地日期表达式包含对 `pairing_segment` 的相关子查询，并包裹时区与日期转换，无法直接利用 `pairing(base, sch_str_dt_utc)` 的简单范围索引完成整个筛选。

因此现有实现随条件数量增长接近平方级放大，不适合未来十几到二十条条件。

## 3. 目标

- 保持当前页面、请求、响应和业务计数语义不变。
- 候选 Pairing 的 Base、Rank、Period 和本地 origin date 筛选只执行一次。
- 每条 existing Pairing property 的业务条件只计算一次。
- 单条 rule count、当前 Tx funnel count 和 `summary.allRules` 复用已计算结果。
- 支持未来 10–20 条 Pairing conditions，不再随 funnel 前缀产生平方级昂贵条件计算。
- 用户 19 的真实冷请求必须低于 Portal 当前 10 秒超时；目标为 5 秒内。
- 20 条代表性 conditions 的应用冷缓存请求连续 5 个样本 median 必须低于 8 秒、单次最大值必须低于 10 秒。
- 并发相同请求继续由现有 Redis/local single-flight 合并。

## 4. 非目标

- 不修改任何 Pairing property 的业务定义。
- 不修改 Award、Avoid、Any、Every、Specific Dates 或 Date Range 的含义。
- 不修改同类 multi-use property 或 forced-OR 的组合规则。
- 不修改当前 Tx 筛选、property 顺序或 funnel 顺序。
- 不修改 API request/response contract。
- 不修改页面布局、文案或计数展示口径。
- 不修改 Pairing Search 结果集合语义。
- 不新增数据库表、字段或 migration。
- 不用“只延长超时”代替后端性能修复。
- 不重构无关 Pairing Search 查询。

## 5. 必须保持的当前行为

### 5.1 输入与输出范围

当前实现分别构造两组 properties：

- `rowProperties = normalizeCriteriaPreviewProperties(request.properties)`：包含所有 existing Pairing properties，用于每行独立 `rule` count；
- `activeTierProperties = normalizeCurrentRulePreviewProperties(tier, request.properties)`：只包含当前 Tx active properties，用于 funnel 和 `summary.allRules`。

优化后必须保持这个差异，不能误把 `rows` 缩减为仅当前 Tx，也不能把其他 Tx 的 property 放入当前 funnel。

### 5.2 条件组合语义

当前 `buildCurrentRulesCondition()` 的规则必须保持：

- 不同普通 property group 之间使用 `AND`；
- 相同 property code 且 usage 为 `multi` 的 properties 使用 `OR`；
- `getPbsPairingForcedOrRule()` 判定的特殊组合使用 `OR`；
- OR 分组之间使用 `AND`；
- property 在 request 中的顺序决定 funnel 前缀；
- 每一级 funnel 继续使用 `activeTierProperties.slice(0, index + 1)` 的语义；
- conflict detection 和 409 错误语义不变。

### 5.3 单条 property 语义

每个叶子条件继续由现有 `buildPreviewCondition()` 生成，因此以下行为不变：

- Award / Avoid；
- Any / Every；
- 日期、时间和机场本地时区；
- Flight Legs per Duty、Airport Preference、Check-In / Check-Out 等现有条件；
- 不支持的 property 继续返回当前 422；
- 无效组合继续返回当前 400 / 409。

### 5.4 计数口径

- `pairingIdCount = count(distinct pairing id)`；
- `totalItems = count(*)`；
- candidate/evaluated CTE 必须保留当前底层结果行基数，不得提前 `DISTINCT` 或按 pairing 聚合；即使当前 live 数据通常一行对应一个 pairing，也不能让 `totalItems` 被实现细节强制等于 `pairingIdCount`；
- `summary.activePropertyCount` 不变；
- `summary.allRules` 等于最后一级当前 Tx funnel；
- 没有 row properties 时继续返回空 rows 与 `allRules: null`；
- 有 row properties、但当前 Tx 没有 active properties 时，继续返回所有 row rule counts；所有 row 的 funnel 保持当前空计数 fallback，`activePropertyCount` 为 0，`summary.allRules` 为 `null`；
- `computedAt`、cache key 和 30 秒 TTL 语义不变。

## 6. 方案比较

### 方案 A：只增加接口超时

将 counts 请求超时从 10 秒提高到 45–60 秒。

优点：改动小，可以减少当前错误。

缺点：用户仍需等待约 35 秒；20 条条件可能更慢；数据库重复计算和并发压力没有解决。

结论：不采用为主方案。

### 方案 B：拆成多条并行 SQL

把每个 target 作为单独查询并发执行。

优点：单个请求的墙钟时间可能下降。

缺点：会把一个用户的 20–40 个查询同时压入连接池；高并发 bid window 下放大数据库压力；业务复杂度仍接近平方级。

结论：不采用。

### 方案 C：候选集与条件结果线性化（采用）

用一条分阶段 SQL：候选 Pairing 只筛选一次，每条 property condition 只计算一次，再从布尔结果聚合所有 rule/funnel counts。

优点：保持一个一致快照；不增加连接池并发；昂贵计算从平方级降为线性级；API contract 不变。

代价：需要谨慎复用现有 AND/OR 分组函数，并通过旧/新 SQL逐项一致性测试证明语义未变。

## 7. 推荐后端设计

### 7.1 第一阶段：一次性候选集合

在 `executePreviewCountQueries()` 的 counts SQL 中生成 `MATERIALIZED` candidate CTE，只执行一次：

- `p.is_deleted = 0`；
- actor base；
- actor rank 对应的 `pairing_composition exists`；
- periodCode 对应的基地本地 origin date；
- 当前所需的 airport/base timezone join。

候选集合必须继续使用当前 `buildPairingLocalOriginDateExpression()`，不能退回 `p.sch_str_dt_utc` 的 UTC 月份，以免改变月边界和基地时区行为。

### 7.2 第二阶段：每条叶子条件只计算一次

对 candidate rows 生成 `MATERIALIZED evaluated` CTE：

```text
pairing id
match_property_1
match_property_2
...
match_property_N
```

每个 `match_property_N` 仍由现有 `buildPreviewCondition(property, ...)` 生成。不能另写一套 Airport、Check-Time、Flight Legs 等业务 SQL。

如果同一个 `propertyGroupKey` 同时参与 row 与 funnel，只计算一个布尔列并复用。若 key 缺失，继续使用现有 `row-<rowSeq>` fallback。

实际远端压测发现，仅将叶子从平方级降为线性级后，20 条包含 Airport、Check-Time、Flight Legs 的重条件仍需约 22.7 秒。因此最终实现增加了一层仅供 current-rules counts 使用的预计算 facts：候选集的 active segments、机场/城市、本地事件时间、duty legs 和 airport events 一次物化，三个现有条件生成器在专用 context 下读取这些等价 facts。普通 Preview、Tier Pool 和算法导出仍走原 SQL 路径；条件的过滤谓词、Award/Avoid、Any/Every、日期范围和 AND/OR 组合规则均未改变。

### 7.3 第三阶段：复用布尔结果聚合

从 evaluated CTE 计算：

- row target：直接统计对应单个 `match_property_N`；
- funnel target：按照当前前缀顺序组合布尔列；
- allRules：继续取最后一个 active funnel 的结果。

为避免复制并逐渐偏离业务逻辑，应将 `buildCurrentRulesCondition()` 内部的 AND/OR grouping 抽成一个共享表达式组合器：

- 现有路径传入 `property => buildPreviewCondition(property, ...)`；
- 线性化 counts 路径传入 `property => match_property_N`；
- conflict detection、union-find OR group 和 group 间 AND 只保留一份实现。

这样修改的是叶子表达式从哪里读取，不是规则如何组合。

### 7.4 参数化与 SQL 安全

- 所有动态值继续通过 `PairingSearchSqlBuilder.addParam()` 参数化。
- schema 名继续走现有白名单校验。
- 动态布尔列名不能来自用户原始字符串，应由服务端按稳定序号生成，例如 `match_1`、`match_2`。
- `propertyGroupKey` 只作为参数化 `count_key` 和响应映射使用，不拼入 SQL identifier。
- 按 `docs/modules/database/generated-sql-safety-standard.md` 完成结构测试、远端 PostgreSQL `EXPLAIN`/只读执行和 HTTP smoke。

### 7.5 缓存与并发

保留现有：

- actor-scoped cache key；
- stable request hash；
- 30 秒 result TTL；
- 本进程 `inFlightLoads`；
- Redis distributed lock；
- Redis 故障时回源 DB。

不通过修改 cache key 或延长 TTL 隐藏冷查询问题。

### 7.6 前端超时策略

本任务不修改 Portal 当前 10 秒全局 timeout，也不为 counts 接口增加专属 timeout。

原因：

- 用户要求未来支持 10–20 条 conditions；如果依赖 30–60 秒 timeout 才能成功，说明后端性能问题仍未解决；
- 保持 10 秒可以作为明确的端到端性能门禁；
- 不修改 timeout 可避免其他请求行为、失败等待时长和页面交互发生变化。

如果优化后 20 条代表性 conditions 仍无法满足最大值低于 10 秒，本任务不能以延长 timeout 结案，必须继续通过 `EXPLAIN` 优化查询或向用户报告阻塞。

## 8. 数据流对比

### 当前实现

```text
Request
  -> normalize row + active properties
  -> 构造 N 个单条完整 SELECT
  -> 构造 M 个累计完整 SELECT
  -> 每个 SELECT 重做 Base/Rank/Period/local-date/property conditions
  -> UNION ALL
  -> map response
```

### 优化后

```text
Request
  -> normalize row + active properties
  -> candidate CTE：Base/Rank/Period/local-date 一次
  -> evaluated CTE：每条 property condition 一次
  -> 使用相同 AND/OR grouping 聚合 N 个 rule + M 个 funnel
  -> map 完全相同的 response
```

## 9. 错误处理

- Zod payload validation 不变。
- `LineholderBidServiceError` 的状态码和 message 不变。
- SQL/DB 异常继续由 route 记录并返回当前 500 envelope。
- Portal 继续显示当前错误状态，不新增自动重试，避免重复增加数据库负载。
- 若后续增加 counts 专属 timeout，只改变该调用的等待上限，不改变错误文案或其他接口。

## 10. 测试与验证

### 10.1 SQL 结构测试

更新 `pbs-server/src/services/pairing-search/pairing-search-service.test.ts` 或更聚焦的 query test，验证：

- candidate CTE 为 `MATERIALIZED` 且只有一个 period/local-origin filter；
- 每条 property 的昂贵叶子 condition 只生成一次；
- row target 包含所有 existing properties；
- funnel target 只包含当前 Tx active properties；
- 参数仍全部参数化；
- 无属性、单属性和 20 属性请求 SQL 均有效。

### 10.2 业务语义一致性

使用远端 PostgreSQL 对相同 payload 执行优化前与优化后查询，逐项比较：

- `propertyGroupKey`；
- `rowSeq`；
- `propertyCode`；
- `rule.pairingIdCount` / `rule.totalItems`；
- `funnel.pairingIdCount` / `funnel.totalItems`；
- `summary.activePropertyCount`；
- `summary.allRules`。

覆盖：

- 用户 19 当前真实 7 条 properties / T1；
- Award 与 Avoid；
- multi-use 同类 OR；
- forced OR；
- 普通跨组 AND；
- Any / Every；
- Specific Dates / Date Range；
- property 属于其他 Tx；
- 0 结果；
- 10–20 条代表性 conditions。

要求所有 count byte-for-byte 等价；`computedAt` 时间戳除外。

其中“应用冷缓存”定义为：

- 使用新的合法 request hash，确保 Redis result cache miss；
- 仅将每条 property 的 `propertyGroupKey` 替换为新的合法 UUID 来生成 request hash；其他 property 顺序、propertyCode、tiers、action、quantifier 和 bid payload 完全不变，保证被测业务条件与 SQL 工作量可比；
- 确保当前进程 `inFlightLoads` 不存在相同 key；
- 不要求清空 PostgreSQL shared buffers 或操作系统 page cache，因为远端共享数据库不允许破坏其他会话缓存；
- 每次测量记录 cache miss 证据、HTTP 状态和端到端 duration。

### 10.3 EXPLAIN 与性能基线

对用户 19 当前真实 payload 执行 `EXPLAIN (ANALYZE, BUFFERS)`，保留改前/改后：

- 总执行时间；
- candidate rows；
- `pairing_segment` 子查询执行 loops；
- shared buffers；
- 是否存在 lock wait。

验收门槛：

- 真实 7 条 properties 冷请求低于 10 秒，目标低于 5 秒；
- 20 条代表性 properties 连续 5 个应用冷缓存样本全部报告原始 duration；按排序后的第 3 个值计算 median，要求 median 低于 8 秒、最大值低于 10 秒；
- 20 条代表性 properties 不出现平方级叶子 condition 重算；
- 缓存命中不是性能验收依据。

### 10.4 后端测试

- focused pairing-search service/query tests；
- route contract tests；
- cache/single-flight tests；
- `pbs-server` full test；
- `pbs-server` build。

### 10.5 Playwright 真实 UI 回归

更新 `e2e/tests/pbs-portal/pairing-search.spec.ts`：

- 使用真实用户 19 登录；
- 进入真实 Bid 页面；
- 点击 `REFRESH`；
- 捕获真实 `/current-rules/counts` response；
- 断言 HTTP 200；
- 断言页面不显示 `Try refresh again`；
- 断言规则数、pairing matched 文案与 response 一致；
- 冷缓存场景运行；
- 5 个并发会话使用相同合法 payload 同步起跑，验证 existing single-flight；每个请求必须在 10 秒内收到 HTTP 200，页面均不得进入 error 状态；
- 并发测试开始前使用新的合法 request hash，保证第一条底层计算不是 Redis result cache hit。

### 10.6 生成 SQL 安全验证

- fixture/结构完整性测试；
- 远端 PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` 或最小只读执行；
- 真实 HTTP 入口 smoke；
- 不允许静默跳过远端验证失败。

## 11. 验收标准

- [x] 用户 19 的真实请求冷缓存返回 HTTP 200，不再出现 `net::ERR_ABORTED`。
- [x] 真实 7 条 properties 请求低于 10 秒，5 个样本最大 3.947 秒。
- [x] 20 条代表性 properties 连续 5 个应用冷缓存样本为 5.897–6.343 秒，median 5.924 秒。
- [x] 5 个并发相同冷 key 请求全部在 10 秒内成功。
- [x] 20 条代表性 conditions 不产生 230 次昂贵叶子条件计算。
- [x] 用户 19 改前捕获的 rule/funnel/summary counts 与改后完全一致。
- [x] row counts 仍覆盖所有 existing Pairing properties。
- [x] funnel 仍只使用当前 Tx active properties及当前顺序。
- [x] Award/Avoid、Any/Every、AND/OR、日期与时区语义不变。
- [x] request/response contract 不变。
- [x] Portal 全局和 counts 专属 timeout 均未改变。
- [x] 无数据库 migration。
- [x] Redis cache 与 stampede protection 行为不变。
- [x] focused tests、build、远端 PostgreSQL preflight、真实 HTTP smoke、Playwright 均已 PASS。

## 12. 风险与控制

### 风险 1：错误地把所有条件改成 AND

控制：抽取并复用现有 AND/OR grouping，不复制组合规则；增加 multi-use 和 forced-OR 等价测试。

### 风险 2：rows 范围被误改为当前 Tx

控制：分别保留 `rowProperties` 和 `activeTierProperties`，增加其他 Tx property 的回归。

### 风险 3：月份边界或基地时区变化

控制：candidate CTE 继续使用当前本地 origin date 表达式；覆盖月初/月末和 fallback UTC。

### 风险 4：CTE 优化屏障或内存使用不当

控制：只 materialize 当前 actor base/rank/period 的候选集合和必要布尔列；使用真实 `EXPLAIN (ANALYZE, BUFFERS)` 决定最终 CTE 结构。

### 风险 5：用缓存或超时制造“已修复”假象

控制：性能验收必须使用唯一 cache key 的冷请求；timeout 不是通过性能门槛的手段。

## 13. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 动态 SQL、条件组合语义、响应映射和一致性验证高度耦合，拆分实现容易造成两套规则逻辑或写冲突。
- Suggested split: 单人完成 query 线性化、共享组合器、测试和真实 DB 验证；独立 reviewer 只审 spec/最终 diff。
- Write boundaries: `pbs-server` pairing count query/service、后端测试、E2E/QA 文档；`pbs-portal` 只在现有前端回归测试确有缺口时补测试，不修改 timeout 或产品行为。
- Conflict risk: 当前工作区已有日历 popover 未提交改动；本任务不修改这些文件，E2E 文件如重叠只做最小增量并逐块核对。
- Execution gate: spec 与计划经用户批准后才实施。
