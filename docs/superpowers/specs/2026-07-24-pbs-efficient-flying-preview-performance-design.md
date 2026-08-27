# PBS Efficient Flying Preview 绝对性能优化设计

日期：2026-07-24

## 1. 背景与问题

`Efficient Flying First`（property code `428`）需要先按 Base、Rank、Bid Period
计算所有 FLY Pairing 的 Average Daily Credit，再取 Top/Bottom 百分位。

当前实现把整套 cohort 计算放在：

```sql
p.id in (
  with efficient_flying_cohort as (...)
  ...
)
```

并通过 `cohort_pairing.base = p.base` 引用了外层 Pairing。PostgreSQL 因此把它规划成
关联子查询：外层每检查一个 Pairing，就重新计算一次整个月的 cohort、Daily Credit
和百分位 cutoff。

远端 `f8` 实测：

- YEG Jul 2026：284 个候选 Pairing，cohort 执行 284 次；
- Segment Credit 子查询执行约 80,656 次；
- 命中约 713,000 个 shared buffers；
- 仅核心筛选已耗时约 7.26 秒；
- YYZ Jul 2026：993 个候选 Pairing，15 秒 statement timeout。

因此这是后端 SQL 执行结构问题，不是 Portal 渲染或网络问题。

## 2. 目标

- 保持 Efficient/Inefficient 的业务结果完全不变。
- 冷查询：
  - YEG、YYZ 等任意当前 Base 的 Preview API 不超过 2 秒；
  - Current Rules counts 和 tier pools 中包含 428 时也不超过 2 秒。
- Redis 命中后的重复请求不超过 1 秒。
- cohort、Daily Credit、cutoff 在一次 SQL 中只计算一次。
- 不用扩大超时时间、延长缓存时间或隐藏结果来掩盖慢 SQL。
- 不引入 Crew × Pairing、Property × Pairing 或分页 × cohort 的 N+1。

## 3. 不变的业务语义

- 百分位继续来自：
  `PBS_EFFICIENT_FLYING_CONFIG / PERCENTILE`。
- cohort scope 继续包含：
  - 当前 Bid Period；
  - 当前 Base；
  - 当前 Rank/Division scope；
  - active FLY Pairing；
  - 至少一个 active segment；
  - `duration_days > 0`。
- Daily Credit 继续按每个 Duty 的第一条 active segment
  `duty_act_credited_minutes` 求和，再除以 `duration_days`。
- `k = max(1, round(n * percentile / 100))`。
- cutoff 继续包含与第 k 个值并列的 Pairing。
- Efficient 取高端 cutoff；Inefficient 取低端 cutoff。
- 其他搜索条件、Crew eligibility 和分页仍在 cohort cutoff 之后应用。
- Search Pairings、Current Rules count/page、tier pools、PBS 导出和 Live 导出结果保持一致。

## 4. 方案比较

### 方案 A：只延长 Redis TTL

优点：改动最小，重复请求快。

缺点：首次请求仍可能 15 秒超时；不同条件、分页、Base、Rank 会产生不同 key，
不能解决冷查询；不采用。

### 方案 B：预计算表或永久 cohort 缓存

优点：查询最快。

缺点：需要处理 Pairing/Segment 更新、Period 发布、字典百分位调整后的失效与重建；
增加新的数据一致性责任。当前每 Base 每月不足约 1,000 个 Pairing，不需要先引入；
暂不采用。

### 方案 C：集合化 SQL + 现有 Redis（采用）

冷路径把 cohort 提升为顶层、一次性 materialized CTE；Segment Credit 使用集合聚合；
所有条件引用同一份 matches CTE。热路径继续使用现有 Redis 30 秒结果缓存与防击穿。

该方案同时解决首次查询和重复查询，且不引入新的持久化状态。

## 5. SQL 设计

### 5.1 显式 scope，禁止引用外层 `p`

构建 Efficient Flying context 时必须显式传入：

- `periodStartDate`
- `periodEndDate`
- `percentile`
- 明确的 Base scope 与 Base partition 方式
- `rank/division scope`

删除 `cohort_pairing.base = p.base` fallback。缺少 scope 时返回明确错误，不允许退回
关联子查询。

不同入口必须保留当前真实语义：

- 普通 Preview、Current Rules counts、tier pools：固定使用 `actorBase`，只计算一个
  Base cohort。
- 单属性 Preview：Crew 在 Bid Period 内可能换 Base。先解析该 Crew 在 Period 内可能生效的
  Base 集合，cohort 按 `base` 分区分别计算 cutoff；外层 Pairing 只能关联自己 Base 的结果，
  不能把多个 Base 合并成一个 cutoff。
- PBS Export 的显式 `bases[]`：保留当前实现的合并 cohort 语义，不擅自改成按 Base 分区；
  使用冻结的旧 SQL oracle 验证。
- PBS Export 未提供 `bases[]`：保留当前实现“Period/Rank scope 内所有实际 Base，按 Base
  分区分别计算 cutoff”的语义。该入口必须显式选择 `partitioned_all_bases` scope mode，
  不能通过缺省 fallback 偶然触发。
- 没有 Base、也无法从 Crew Base 历史解析 Base 时阻断，不允许扫描所有 Base。
  唯一例外是上述 PBS Export 显式 `partitioned_all_bases` 模式。

Rank/Division 继续保持现有语义：

- `actorRank` 存在时保留 composition rank eligibility；
- 显式 `divisions` 与 `ranks` 同时存在时继续使用现有
  `division IN (...) OR composition rank IN (...)`；
- 两者均不存在时不额外限制，不因本次性能修复新增业务拒绝。

### 5.2 顶层 CTE 注册机制

扩展 `PairingSearchSqlBuilder`，增加按稳定 key 去重的 CTE 注册能力：

```ts
getOrRegisterCteBundle(key, lazyFactory): cteNames
renderCtes(): string
```

必须先查 key，只有首次注册才执行 `lazyFactory` 和 `addParam()`。重复 Efficient/Inefficient
条件不得留下未使用参数、参数空洞或错位 placeholder。`renderCtes()` 必须纯读、幂等；
所有 CTE 注册必须在复制 `sqlBuilder.params` 或追加 page/offset 参数之前完成。

key 至少包含：

- schema
- period range
- Base scope mode：`fixed` / `partitioned` / `merged` / `partitioned_all_bases`
- base/bases
- rank/division scope
- percentile
- mode 不进入 cohort key；Efficient/Inefficient 可复用同一 credit/cutoff 数据

builder 为每个 bundle 分配合法、不会与执行器现有 CTE 冲突的前缀，例如
`efficient_flying_1_*`。一个 bundle 内按依赖顺序注册 scoped pairings、duty credit、
cohort、stats、matches。

`buildEfficientFlyingCohortCondition` 不再返回内嵌 cohort SQL，只负责：

1. 注册一次 Efficient Flying CTE；
2. 返回对 matches CTE 的轻量条件：

   ```sql
   exists (
     select 1
     from efficient_flying_matches efm
     where efm.pairing_id = p.id
       and efm.mode = 'efficient'
   )
   ```

各执行器采用以下完整骨架：

```sql
-- Preview
with
  <rendered efficient flying CTEs>,
  filtered_pairings as (...),
  summary as (...),
  paged_pairings as (...)
select ...;

-- Current Rules counts
with
  <rendered efficient flying CTEs>,
  candidate_pairings as materialized (...),
  <current_rules facts CTEs>,
  evaluated_pairings as materialized (...)
select ...
union all
select ...;

-- Tier pools / preview counts
with
  <rendered efficient flying CTEs>
select ...
union all
select ...;

-- PBS PAIRING_SCORE export
with
  <rendered efficient flying CTEs>
select ...;
```

无 Efficient Flying 条件时不输出额外 `WITH` 或逗号。所有 CTE 名由 builder 管理，
同一个 statement 中同一 scope 的 matches CTE 只出现一次。

### 5.3 Segment Credit 集合化

先一次性找出每个 Pairing、每个 Duty 的第一条 active segment：

```sql
select distinct on (pairing_id, duty_seq)
  pairing_id,
  duty_seq,
  coalesce(duty_act_credited_minutes, 0) as duty_credit
from pairing_segment
where is_deleted = 0
  and pairing_id in (select pairing_id from scoped_pairings)
order by pairing_id, duty_seq, seg_seq
```

再按 Pairing 聚合：

```sql
sum(duty_credit)::numeric / duration_days::numeric
```

这样 Segment Credit 的读取次数与实际 Segment 数量线性相关，不再乘以外层 Pairing 数量。
现有 scalar `buildPairingCreditMinutesExpression` 继续服务普通 Credit filters，不修改其
调用合同。新增 Efficient Flying 专用集合聚合 builder，避免影响不含 428 的查询。
现有 `(pairing_id, duty_seq, seg_seq)` 索引优先复用；只有远端 EXPLAIN 证明仍需要时，
才新增最小的 partial/include index。

### 5.4 cutoff 一次计算

对集合化 cohort 只执行一次有序数组/cutoff 聚合，并生成：

```text
pairing_id | average_daily_credit | efficient_match | inefficient_match
```

或等价的 `mode` 行集合。并列包含规则保持不变。

### 5.5 日期条件

日期过滤必须与旧逻辑严格等价：

```sql
(
  pairing_dt is not null
  and pairing_dt between start_date and end_date
)
or (
  pairing_dt is null
  and sch_str_dt_utc >= start_timestamp
  and sch_str_dt_utc < end_timestamp_exclusive
)
```

`start_timestamp` / `end_timestamp_exclusive` 使用 UTC wall-clock plain timestamp，
后者由下月 1 日 `00:00:00` 生成。第一分支保留 `pairing_dt` 优先级，第二分支才使用
`sch_str_dt_utc`，不能简单忽略非空 `pairing_dt`。

实施前对所有 active Base、月首/月末和 null 数据运行 symmetric-difference。fixture 必须包含
`pairing_dt` 与 UTC 日期不一致、`pairing_dt is null` 两类数据。若需要索引，优先考虑针对
`pairing_dt` 和 null fallback 的最小 partial index；不得为了速度改变日期集合。

## 6. Redis 设计

继续使用现有缓存：

- Preview：30 秒；
- Current Rules counts：30 秒；
- Tier pools：30 秒；
- stampede protection：开启。

缓存入口矩阵：

| 入口 | 关键 scope |
|---|---|
| 普通 Preview | actor Base、Rank、Period、properties、page、percentile |
| 单属性 Preview | crewId、Rank、Period、properties、page、effective Base scope、percentile |
| Current Rules counts | actor Base、Rank、Period、tier、properties、percentile |
| Tier pools | actor Base、Rank、Period、tiers、properties、percentile |

修正单属性 Preview key，使其包含解析后的 effective Base scope，避免 Crew Base 变化后误命中。

Efficient Flying 字典配置增加同一 Redis 工具下的 30 秒短缓存和防击穿。这样最终响应缓存命中
时不必先跨网络读取 dictionary。外部修改字典、Pairing 或 Segment 后允许的最大陈旧窗口仍为
30 秒；有应用内写入口时主动删除对应 cache group，外部 SQL 修改依赖 TTL 收敛。结果缓存 key
继续包含实际 percentile，配置变化后不会把旧百分位结果长期复用。

本次不新增永久 cohort Redis key。原因：

- 冷 SQL 本身必须达到 2 秒；
- 最终响应缓存已经覆盖重复操作；
- 避免新增 Pairing/Segment/字典更新后的 cohort 失效链。

若集合化 SQL 在最大 Base 上仍无法达到目标，第二阶段才允许增加短 TTL cohort ID 缓存，
并必须同时设计显式失效机制。

## 7. 受影响模块

- `pbs-server/src/services/pairing-search/pairing-search-sql-builder.ts`
- `pbs-server/src/services/pairing-search/efficient-flying-cohort.ts`
- `pbs-server/src/services/pairing-search/pairing-credit-sql.ts`
- `pbs-server/src/services/pairing-search/pairing-search-condition-builder.ts`
- `pbs-server/src/services/pairing-search/pairing-search-preview-query.ts`
- `pbs-server/src/services/pairing-search/pairing-search-service.ts`
- `pbs-server/src/services/algorithm-export/pairing-score-export.ts`
- 相关 generated SQL preflight manifest/cases/audit
- focused tests、真实 SQL smoke、Playwright 性能回归

Portal UI、payload、数据库字典、property catalog 和算法业务规则不变。

## 8. 错误处理

- 缺少 percentile、period、base 或必要 scope：保持稳定 4xx/5xx 配置错误，不执行无界 cohort。
- SQL 超时：继续返回标准错误结构，并记录 query path、Base、Period、mode 和耗时；
  不记录 Crew 敏感信息或完整 payload。
- Redis 不可用：直接执行已经优化的 SQL；功能不能依赖缓存才能工作。

## 9. 验证与验收

### 9.1 结果等价

冻结旧 SQL 为一次性 oracle。在远端 `f8` 对所有 active Base，以及单属性 Crew 月中换 Base、
PBS Export 多 Base scope，分别比较 Efficient/Inefficient 新旧结果：

- Pairing ID symmetric difference = 0；
- cutoff 值一致；
- 并列 Pairing 数量一致；
- Search page/count/tier pools 一致；
- `PAIRING_SCORE.csv` 结果不变。
- 固定 Base、按 Base 分区、显式多 Base 合并三种 scope 均保持原语义。
- 日期 fixture 覆盖月首/月末、`pairing_dt`/UTC 不一致与 null。

### 9.2 EXPLAIN

运行 `EXPLAIN (ANALYZE, BUFFERS)`，必须证明：

- cohort CTE `Actual Loops = 1`；
- cutoff 聚合 `Actual Loops = 1`；
- Segment Credit 不再出现 Pairing 数平方级 loops；
- 所有 active Base 均不超过 2 秒，最大 cohort Base 是强制门禁；
- 不出现全库无 scope 扫描。

### 9.3 自动化

- `efficient-flying-cohort.test.ts`
  - CTE 只注册一次；
  - condition 不引用外层 `p.base`；
  - Efficient/Inefficient 共享 cohort；
  - 重复条件只分配一组参数，placeholder 连续；
  - tie-inclusive；
  - 空 cohort、`n=1`、并列、零 Credit；
  - 固定 Base、月中换 Base 分区、多 Base Export；
  - rank 缺失与 division/rank OR scope；
  - 缺 Base scope 阻断。
- Preview、Current Rules counts、tier pools、PBS Export 四种完整 SQL 都运行 generated SQL
  structure audit 和远端 PostgreSQL `EXPLAIN`；preflight 不能只检查 condition 字符串。
- Pairing Search focused tests。
- `pbs-server npm run build`。
- Portal Playwright：
  - 从真实 UI 点击 `SEARCH PAIRINGS`；
  - 捕获 Preview API；
  - 断言返回结果和摘要；
  - 验证真实 cache-hit 指标，而不是仅把第二次请求视为命中。

性能口径：

- “冷查询”表示 Redis 结果缓存 miss；数据库允许完成一次不计时的连接/plan warm-up；
- 每个 active Base 至少测 5 次，记录 p95；
- 数据库 statement / server processing p95 ≤ 2 秒；
- Redis result-cache 确认命中后的服务端 elapsed p95 ≤ 1 秒；
- UI Playwright 单独记录端到端 response timing；海外网络 RTT 单独报告，不作为数据库
  2 秒门禁，但页面不得触发客户端 timeout。

## 10. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 核心改动集中在同一 SQL builder、condition builder 和 preview query 合约，
  并行编辑冲突与语义偏差风险高于节省的时间。
- Suggested split: 主流程串行完成 SQL 设计、实现和远端验证；必要时只让独立 reviewer
  做只读 spec/code review。
- Write boundaries: 单一实现者修改 `pbs-server`；reviewer 不写业务代码。
- Conflict risk: High if multiple agents edit the query builder and cohort SQL simultaneously.
- Execution gate: 用户批准本 spec 后才实施。

## 11. 完成标准

- 业务结果零差异。
- YEG、YYZ 冷查询 ≤ 2 秒。
- Redis 命中重复请求 ≤ 1 秒。
- cohort、cutoff `Actual Loops = 1`。
- focused tests、generated SQL remote preflight、build、Playwright 全部 PASS。
- GitNexus detect-changes 只包含预期 Pairing Search 流程。
