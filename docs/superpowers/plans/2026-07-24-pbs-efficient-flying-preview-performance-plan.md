# PBS Efficient Flying Preview 性能优化实施计划

日期：2026-07-24

依据：

- `docs/superpowers/specs/2026-07-24-pbs-efficient-flying-preview-performance-design.md`

## 目标

- 将 property 428 cohort 从关联子查询改为一次性集合 CTE。
- 保持 Preview、Counts、Tier Pools、PBS Export 结果完全一致。
- Redis miss 的服务端/数据库 p95 ≤ 2 秒。
- Redis result-cache hit 的服务端 p95 ≤ 1 秒。

## Task 1：影响分析与失败基线

修改前对以下 symbols 执行 GitNexus upstream impact：

- `PairingSearchSqlBuilder`
- `createPairingSearchSqlBuilder`
- `buildEfficientFlyingCohortCondition`
- `buildPreviewCondition`
- `executePreviewQuery`
- `executeCurrentRulesCountQuery`
- `executePreviewCountQueries`
- `loadPairingScoreCsv`

冻结远端旧 SQL oracle：

- 所有 active Base；
- Efficient / Inefficient；
- 单属性 Crew 月中换 Base；
- Export 固定 Base、显式多 Base、无 Base；
- Pairing IDs、cutoff、counts、tier pools、CSV。

保留当前失败基线：

- YEG 核心查询约 7.26 秒；
- YYZ 15 秒 timeout；
- cohort loops 与外层 Pairing 数量相同。

## Task 2：先写失败测试

扩展 focused tests：

- lazy CTE bundle 只在首次注册时分配参数；
- 重复注册不产生 placeholder 空洞；
- `renderCtes()` 幂等；
- fixed / partitioned / merged / partitioned_all_bases key 不冲突；
- Efficient 与 Inefficient 共享一个 cohort bundle；
- condition 不再包含 `cohort_pairing.base = p.base`；
- scalar Credit helper 不受影响；
- Preview、Current Counts、Tier Pools、PBS Export 完整 SQL 都渲染 CTE；
- 空 cohort、n=1、零 Credit、cutoff ties；
- 月中换 Base 按 Base 分区；
- Export 多 Base 语义保持不变；
- 日期 null/不一致/月边界保持旧集合。

先运行测试并记录预期 FAIL。

## Task 3：实现集合化 SQL

### 3.1 SQL builder

- 新增 `getOrRegisterCteBundle(key, lazyFactory)`。
- CTE 名使用 builder 分配的安全前缀。
- lazy factory 首次调用才执行 `addParam()`。
- 所有查询在追加分页参数前完成 CTE 注册。

### 3.2 Efficient Flying 专用 CTE

- 显式 scope mode：
  - `fixed`
  - `partitioned`
  - `merged`
  - `partitioned_all_bases`
- scoped Pairings 一次建立。
- 每 Pairing/Duty 第一条 active segment 一次读取。
- Daily Credit 按 Pairing 一次聚合。
- cutoff 一次聚合并保留 ties。
- matches 同时提供 Efficient/Inefficient 结果。
- condition 只按 Pairing ID 和 mode 查询 matches。

### 3.3 日期

使用等价分支：

```sql
(pairing_dt is not null and pairing_dt between start_date and end_date)
or
(pairing_dt is null and sch_str_dt_utc >= start_ts and sch_str_dt_utc < end_ts)
```

不改变 `pairing_dt` 优先级。

## Task 4：接入全部执行入口

- Preview：在 `filtered_pairings` 前渲染 bundle。
- Current Rules counts：在 `candidate_pairings` 前渲染 bundle。
- Tier Pools/Preview Counts：给 UNION statement 增加顶层 CTE。
- PBS `PAIRING_SCORE.csv` Export：在主 SELECT 前渲染 bundle。
- generated SQL preflight 改为验证完整 statement。
- 没有 428 时生成 SQL 与现状保持一致。

## Task 5：Redis 热路径

- 继续使用 Preview/Counts/Tier Pools 30 秒 result cache。
- 单属性 Preview key 加入 effective Base scope。
- Efficient Flying dictionary config 使用 30 秒 Redis 缓存和防击穿。
- 缓存不可用时回退到集合化 SQL。
- 测试确认真实 cache-hit，不以“第二次请求”代替命中证据。

## Task 6：远端等价与性能验证

对远端 `f8`：

1. 新旧 Pairing ID symmetric difference = 0。
2. cutoff、ties、counts、tier pools、CSV 一致。
3. 四类完整 SQL 执行：
   `EXPLAIN (ANALYZE, BUFFERS)`。
4. 断言：
   - cohort loops = 1；
   - cutoff loops = 1；
   - Segment Credit 不再平方级执行；
   - 所有 active Base 各运行至少 5 次；
   - Redis miss 服务端/statement p95 ≤ 2 秒；
   - Redis hit 服务端 p95 ≤ 1 秒。
5. 仅当 EXPLAIN 证明现有索引不足时，新增最小 migration 与 verifier。

## Task 7：自动化与交付

- focused node tests。
- `pbs-server npm run build`。
- `LIVE_SCHEMA=f8 PBS_SCHEMA=f8_pbs npm run verify:generated-sql`。
- Portal Playwright 从真实 UI 点击 `SEARCH PAIRINGS`：
  - response 成功；
  - summary/result 正确；
  - 页面不 timeout；
  - 分别记录 API、服务端和 RTT。
- `git diff --check`。
- `npm run check:ui`（若未改 UI 应保持 0 hard violations）。
- GitNexus `detect-changes --scope compare --base-ref main`。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 修改集中在同一个 SQL builder、condition builder 和四类执行入口，合同紧密。
- Suggested split: 单一实现者串行修改；独立 reviewer 只读审查结果。
- Write boundaries: 仅主实现者写 `pbs-server` 与测试。
- Conflict risk: 多 Agent 并行写查询构造器会导致参数顺序和 CTE 注入冲突。
- Execution gate: spec 已获用户确认，可以开始实施。
